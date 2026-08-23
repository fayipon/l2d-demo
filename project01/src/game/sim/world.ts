import {
  ZERO_ATTRIBUTES,
  clampAttributes,
  deriveAttributes,
  hitChance,
  type Attributes,
} from '../data/attributes'
import { Pool, type Pooled } from './pool'
import { SpatialGrid } from './grid'
import {
  BASE_LOOT_RANGE,
  BASE_MOVE_SPEED,
  BASE_STATS,
  DODGE_CAP,
  ENEMY_KINDS,
  MAX_WEAPON_SLOTS,
  MAX_WEAPON_TIER,
  MERGE_COUNT,
  SPREAD_PER_EXTRA_SHOT,
  WEAPONS,
  armourReduction,
  attackPowerFor,
  canMerge,
  findWeapon,
  damageScale,
  healthScale,
  pickEnemyKind,
  spawnInterval,
  speedScale,
  tierDamageScale,
  tierRateScale,
  visionRadius,
  waveDuration,
  xpForLevel,
  type PlayerStats,
} from '../data/content'
import {
  SHOP_ITEMS,
  rerollPrice,
  rollShop,
  weaponSellValue,
  type MergeTarget,
  type ShopOffer,
} from '../data/shop'
import { DEFAULT_LOADOUT, type ArenaLoadout } from '../data/loadouts'

export type { PlayerStats }

/**
 * The arena simulation.
 *
 * Deliberately knows nothing about Phaser. It owns positions, health and
 * timers; the scene reads them once a frame and moves sprites to match. That
 * split is what makes it possible to run the simulation at a fixed rate while
 * the renderer runs at whatever the display gives us, and it is what would
 * make the whole thing testable without a canvas.
 */

/**
 * The size of the simulated world.
 *
 * This used to be the canvas size as well, because the two were the same
 * number: one screen, no camera, nothing off it. They are separate concerns
 * and now they are separate constants -- the window onto this is VIEW_WIDTH /
 * VIEW_HEIGHT in the scene, which is all Phaser is told about.
 *
 * Two and a half windows across and four screens of area. Big enough that the
 * camera and the minimap earn their keep, small enough that a wave still finds
 * you.
 */
export const WORLD_WIDTH = 3200
export const WORLD_HEIGHT = 1800

/**
 * The simulation runs at a fixed 60Hz whatever the display does.
 *
 * With a variable step, a frame that takes 100ms moves an enemy six times as
 * far as usual -- straight through the player's hitbox without ever
 * overlapping it. Collision here is a distance test between two circles at one
 * instant, so the step has to be small and, more importantly, always the same.
 */
export const STEP_SECONDS = 1 / 60

/** One cell comfortably wider than the largest thing that queries it. */
const CELL_SIZE = 64

/** Slack kept between the world's edge and anything placed against it. */
const SPAWN_MARGIN = 46

/**
 * The band around the player an enemy arrives in.
 *
 * Inside what the player can see, deliberately, and that is the whole point of
 * the arrival state below: an enemy that materialises out of sight is not
 * being announced, it is just walking in from off screen the way it always
 * did.
 *
 * Two ceilings, and the lower one wins:
 *
 * Sight. At vision 1.0 the lit radius is 560, and an arrival at 0.62 of it
 * lands well inside the clear centre rather than in the fading band where it
 * would be a smudge. Take vision away and the ring closes in with it, which is
 * what makes low vision feel claustrophobic rather than merely dim -- things
 * appear near you because that is as far as "near you" now reaches.
 *
 * The window. The largest circle inside a 1280x720 view has a radius of 360,
 * and 340 leaves twenty pixels of clearance so an arrival directly above the
 * player is not half under the HUD.
 *
 * The floor is the shortest weapon in the game (150) with room to spare, so an
 * arrival is always something to shoot rather than something already touching
 * you, however blind the run has become.
 */
const SPAWN_SIGHT_FRACTION = 0.62
const SPAWN_WINDOW_LIMIT = 340
const SPAWN_FLOOR = 170
/** How much nearer than the far edge the band's inner rim sits. */
const SPAWN_BAND = 0.82

/**
 * How long an enemy spends arriving.
 *
 * During it the enemy does not move, does not collide, cannot be hit, cannot
 * be targeted, and cannot hurt the player -- all five, or the warning is not
 * one. Damageable while arriving and every spawn point becomes a farm;
 * harmful while arriving and it is an ambush rather than a telegraph.
 *
 * Long enough to read as a warning at a glance, short enough that a wave does
 * not spend its time waiting to begin.
 */
export const ARRIVAL_SECONDS = 0.6

/**
 * How far an enemy may fall behind before it is recycled.
 *
 * Not an optimisation -- without it a wave goes empty. The player moves at
 * 232px/s and the fastest enemy in the game manages 191 at the top of its
 * speed curve, so a player running in a straight line outruns everything. On
 * one screen that ended at a wall after 2.8 seconds; across 3200x1800 it runs
 * for sixteen, and the stragglers neither catch up nor ever disappear. They
 * accumulate to the pool's capacity, and from there every new spawn is dropped
 * for want of a slot: a full pool of enemies trailing a player who is never
 * touched, and nothing at all in front of them.
 *
 * Set well outside the longest reach in the game -- a railgun at 620 with the
 * range stat doubled is 1240 -- so nothing is ever recycled out of a fight the
 * player is still in.
 */
const CULL_DISTANCE = 1700

/** Seconds between waves. */
const BREAK_SECONDS = 3

const PLAYER_INVULN = 0.55

/**
 * How often regeneration actually arrives, in seconds.
 *
 * The stat is still health per second and every label that quotes it still
 * means it -- what changed is the delivery. Trickled in sixty times a second it
 * was a bar that crept, and the readout above it was a "+1" every second or so
 * that never stopped: a number that is always on screen has stopped being an
 * event and become part of the background.
 *
 * Five seconds is long enough that a tick is something you notice and wait for,
 * and short enough that it still arrives inside a fight rather than only
 * between them. It also gives the number something to say: at Haru's opening
 * rate a tick is most of a point rather than a sixtieth of one.
 *
 * Lifesteal is deliberately not on this clock. It is a reward for hitting
 * something and it has to land when the hit does.
 */
const REGEN_INTERVAL = 5

/**
 * How many of each may be alive at once.
 *
 * The enemy figure is the real ceiling on how big a wave can get: once the
 * pool is full every further spawn is dropped, so this and not the spawn rate
 * is what a late wave runs into. It was 700, which the curve reached at wave
 * 20 -- and a wave that cannot grow is a wave that only gets tougher, not
 * bigger.
 *
 * 1200 is where it sits now, and that is a measured number rather than a
 * hopeful one. With 1200 alive and all of them packed into the window, which
 * is the worst case the arena can produce: 60fps, a 3.04ms simulation step
 * against a 16.67ms budget, 3445 of 4759 display objects actually rendered.
 * Spread across the world it is 1.80ms and 962 rendered. There is room above
 * this; what there may not be room for is a screen anyone can read.
 */
const CAPACITY = { enemies: 1200, projectiles: 500, pickups: 600 }

/** How far past the player's own edge a drop counts as collected. */
const PICKUP_REACH = 12

/** How long a drop flies its death burst before the magnet may take it. */
const PICKUP_SCATTER = 0.18

/** Homing speed at the edge of the magnet, and right on top of the player. */
const HOMING_MIN = 190
const HOMING_MAX = 1020

/**
 * The magnet during the gap between waves.
 *
 * Surviving the clock is the win condition, so anything still lying on the
 * floor when the wave ends was earned -- making the player walk a lap to pick
 * it up is busywork, and forgetting to is a silent loss.
 *
 * Ten times the radius is 1080, which used to cover most of the arena. Across
 * 3200x1800 it covers a fifth of it, and widening it would not help: homing
 * runs from 190px/s at the edge of the magnet to 1020 on top of the player, so
 * even at full speed a drop in the far corner needs 3.6s against a 3s break.
 * What runs out is the speed, not the reach. So this is now the radius inside
 * which a drop is worth watching fly in, and everything past it is credited
 * where it lies -- see stepPickups.
 */
const BREAK_LOOT_MULTIPLIER = 10

/**
 * Hits the scene may be told about between frames.
 *
 * Fixed, and the excess is dropped rather than queued: a frame with more than
 * this many hits is already showing more damage numbers than anyone can read,
 * and an unbounded queue would be an allocation on the busiest frames.
 */
const HIT_EVENT_CAPACITY = 64

/**
 * Healing events between frames.
 *
 * Far smaller than the hit pool: healing is pooled into whole points before it
 * is reported, so even a lifesteal build cannot produce more than a handful of
 * these in a frame.
 */
const HEAL_EVENT_CAPACITY = 8

/**
 * 'break' is the few seconds after a wave while the floor is being hoovered
 * up; 'shop' is the pause after it, which waits for the player rather than a
 * clock. Splitting them is what lets the coins arrive before there is
 * anything to spend them on.
 */
export type RunStatus = 'fighting' | 'break' | 'shop' | 'dead'

export interface Enemy extends Pooled {
  x: number
  y: number
  hp: number
  maxHp: number
  radius: number
  speed: number
  contactDamage: number
  drop: number
  /** Higher mass is shoved less by knockback and by its neighbours. */
  mass: number
  /** Counts down; while above zero the sprite is drawn white. */
  flash: number
  /** Whether the current flash is a crit, which the scene draws differently. */
  flashCrit: boolean
  /**
   * Seconds left of the arrival telegraph; zero once it is a real enemy.
   *
   * While above zero this one is inert in every direction -- see
   * ARRIVAL_SECONDS. The scene reads it to blink and fade the sprite up.
   */
  arriving: number
  kind: number
}

export interface Projectile extends Pooled {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  damage: number
  knockback: number
  pierce: number
  life: number
  /** Slot index of the last enemy hit, so a piercing shot cannot hit the same
   *  one again on the next step while it is still inside it. */
  lastHit: number
  kind: number
}

export interface Pickup extends Pooled {
  x: number
  y: number
  vx: number
  vy: number
  value: number
  /** Counts up. Used for the little bob, and to stop the magnet grabbing a
   *  drop before it has visibly left the corpse. */
  age: number
}

export interface WeaponSlot {
  kind: number
  /** 1..MAX_WEAPON_TIER. Three of a kind at one tier fuse into the next. */
  tier: number
  cooldown: number
}

/**
 * One damage instance, for the floating numbers.
 *
 * Simulation output rather than a view concern: the amount actually dealt is
 * something only the simulation knows, after crit and before the renderer sees
 * anything. The scene decides how to draw it; the world only reports it.
 */
export interface HitEvent {
  x: number
  y: number
  amount: number
  crit: boolean
}

/** Whole points of health restored, at the player. No crit flag: nothing
 *  criticals a heal, and a field that is always false is a field to delete. */
export interface HealEvent {
  x: number
  y: number
  amount: number
}

export interface PlayerState {
  x: number
  y: number
  radius: number
  /** Live health. Its ceiling is stats.maxHp, and nothing else. */
  hp: number
  invuln: number
  /** Counts down after a dodge, purely so the player can see one happen. */
  dodgeFlash: number
  coins: number
  level: number
  xp: number
  xpToLevel: number
  weapons: WeaponSlot[]
  stats: PlayerStats
}

export interface InputState {
  /** Already normalised to a unit vector, or zero. */
  x: number
  y: number
}

export class World {
  readonly enemies: Pool<Enemy>
  readonly projectiles: Pool<Projectile>
  readonly pickups: Pool<Pickup>
  readonly player: PlayerState

  status: RunStatus = 'fighting'
  wave = 1
  waveTimeLeft = waveDuration(1)
  kills = 0
  elapsed = 0
  /** Contact hits taken, for the flawless-run record. */
  hitsTaken = 0
  /**
   * Volleys fired this run.
   *
   * Output for the view rather than state the simulation uses: the scene plays
   * an attack pose when this moves. A counter and not an event, because the
   * scene looks once a frame while the world fires up to sixty times a second
   * -- what a pose needs to know is "since I last looked", which is exactly
   * what comparing a number gives.
   */
  volleys = 0
  /**
   * Runs finished. The HUD banks a result when this changes, which is what
   * stops a rerender from paying the same run twice.
   */
  deaths = 0

  /**
   * The six primaries. Everything in `player.stats` is computed from these
   * plus the base block plus whatever the run has bought -- see
   * `recomputeStats`, which is the only thing allowed to write the block
   * wholesale.
   *
   * Stored as floats. Growth of +1.4 STA a level is a rate, and rounding it to
   * 1 at every level would quietly turn it into +1.
   */
  attributes: Attributes = { ...ZERO_ATTRIBUTES }
  /** From DEX, against an enemy's evasion. See `hitChance`. */
  accuracy = 0
  /** From LUK, handed to the shop's roll. */
  shopLuck = 0

  /** Shots that missed, for the HUD -- a hit that does nothing and says
   *  nothing is a bug report. */
  misses = 0

  /** The class's passives. Exposed because the equipment sheet lists them; the
   *  loadout they come from stays private, since nothing outside it has any
   *  business with the rest of a loadout mid-run. */
  get skills() {
    return this.loadout.skills
  }

  /** The shop laid out for this break. Empty while fighting. */
  shopOffers: ShopOffer[] = []
  /** Rerolls bought this visit, which is what makes the next one cost more. */
  rerolls = 0
  /** Items taken this run, by id, for the HUD to list. */
  readonly ownedItems: string[] = []

  /**
   * Shake the scene should apply, in pixels, accumulated since it last looked.
   * The scene zeroes it. A queue of typed events would be tidier, but this is
   * the only thing the renderer needs to be told about and a number does not
   * allocate.
   */
  shake = 0

  /**
   * Hits since the scene last drained them.
   *
   * Preallocated and reused -- the scene reads the first `hitCount` entries
   * and zeroes the count. A step can add to this several times before the
   * renderer looks, because a slow frame runs several steps.
   */
  readonly hits: HitEvent[] = Array.from({ length: HIT_EVENT_CAPACITY }, () => ({
    x: 0,
    y: 0,
    amount: 0,
    crit: false,
  }))
  hitCount = 0

  /**
   * Healing since the scene last drained it, in the same shape and for the
   * same reason as the hits above.
   *
   * Accumulated rather than reported per tick. Regeneration is a fraction of a
   * point sixty times a second; a number per step would be sixty "+0" a second
   * over the player's head, which is not a readout, it is a smear. So healing
   * pools and an event is emitted only when a whole point has arrived --
   * lifesteal, regeneration and the heal a level brings, all through the same
   * pool, because they are all the same thing happening to the player and
   * three separate streams of numbers would be three answers to one question.
   */
  readonly heals: HealEvent[] = Array.from({ length: HEAL_EVENT_CAPACITY }, () => ({
    x: 0,
    y: 0,
    amount: 0,
  }))
  healCount = 0
  /** Fractions of a point healed but not yet worth showing. */
  private healPool = 0
  /** Seconds since regeneration last paid out. See REGEN_INTERVAL. */
  regenTimer = 0

  /** Public so the HUD can count the gap between waves down, same as it counts
   *  the wave itself. */
  breakTimeLeft = 0
  private spawnTimer = 0
  private readonly grid = new SpatialGrid(WORLD_WIDTH, WORLD_HEIGHT, CELL_SIZE)
  /** Reused across every query, so the broadphase never allocates. */
  private readonly neighbours: number[] = []
  /**
   * The nearest few enemies, for aiming a volley that has more shots than the
   * weapon was written with. Preallocated and overwritten -- findTargets runs
   * only when a weapon actually fires, but it still runs several times a
   * second and has no business allocating.
   */
  private readonly targets = Array.from({ length: 16 }, () => ({ x: 0, y: 0, d2: 0 }))
  private random = mulberry32(0x9e3779b9)
  private readonly loadout: ArenaLoadout

  constructor(loadout: ArenaLoadout = DEFAULT_LOADOUT) {
    this.loadout = loadout
    this.enemies = new Pool<Enemy>(CAPACITY.enemies, (index) => ({
      index,
      active: false,
      x: 0,
      y: 0,
      hp: 0,
      maxHp: 0,
      radius: 12,
      speed: 0,
      contactDamage: 0,
      drop: 0,
      mass: 1,
      flash: 0,
      flashCrit: false,
      arriving: 0,
      kind: 0,
    }))

    this.projectiles = new Pool<Projectile>(CAPACITY.projectiles, (index) => ({
      index,
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 4,
      damage: 0,
      knockback: 0,
      pierce: 0,
      life: 0,
      lastHit: -1,
      kind: 0,
    }))

    this.pickups = new Pool<Pickup>(CAPACITY.pickups, (index) => ({
      index,
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      value: 1,
      age: 0,
    }))

    this.player = {
      x: WORLD_WIDTH / 2,
      y: WORLD_HEIGHT / 2,
      radius: 15,
      hp: BASE_STATS.maxHp,
      invuln: 0,
      dodgeFlash: 0,
      coins: 0,
      level: 1,
      xp: 0,
      xpToLevel: xpForLevel(1),
      weapons: [],
      stats: { ...BASE_STATS },
    }

    this.applyLoadout()
  }

  /**
   * Stamps the chosen character onto a fresh run.
   *
   * A class is its attributes now. What is left in `mods` is the handful of
   * things no attribute says -- movement speed, pickup radius -- and those are
   * added the same way an item's are, which is to say by `recomputeStats`
   * along with everything else.
   */
  private applyLoadout(): void {
    const player = this.player
    this.attributes = clampAttributes({ ...ZERO_ATTRIBUTES, ...this.loadout.start })
    this.recomputeStats()
    player.hp = player.stats.maxHp

    const kind = findWeapon(this.loadout.weapon)
    player.weapons.push({ kind: kind >= 0 ? kind : 0, tier: 1, cooldown: 0 })
  }

  /**
   * Rebuilds the whole stat block from scratch.
   *
   * Base, then the class's leftover modifiers, then the attributes, then every
   * item the run has bought -- in that order, into a *fresh* copy of the base
   * every time.
   *
   * Folding the attributes into the live block instead would be shorter and
   * wrong: every point already spent would be added again on the next
   * recompute, and the symptom -- stats that grow when nothing bought anything
   * -- is a long way from the cause. Rebuilding is why `ownedItems` holds ids
   * rather than being a bare counter.
   *
   * Called on load, on level and on purchase. Never per step.
   */
  private recomputeStats(): void {
    const stats = { ...BASE_STATS } as PlayerStats
    const add = (mods: Partial<PlayerStats>) => {
      for (const [key, value] of Object.entries(mods)) {
        stats[key as keyof PlayerStats] += value as number
      }
    }

    add(this.loadout.mods)
    const derived = deriveAttributes(this.attributes)
    add(derived.stats)

    /*
     * Items, through whatever the class does to them.
     *
     * An `itemBonus` skill scales the named stats here and nowhere else, which
     * is the whole meaning of "from items": the same armour arriving from an
     * attribute or from the base block goes in untouched a few lines above.
     * This is only a small change because the recompute already knew which
     * source each number came from.
     */
    for (const id of this.ownedItems) {
      const item = SHOP_ITEMS.find((entry) => entry.id === id)
      if (!item) {
        continue
      }
      let mods = item.mods
      for (const skill of this.loadout.skills) {
        if (skill.effect.sort !== 'itemBonus') {
          continue
        }
        const scaled: Partial<PlayerStats> = { ...mods }
        for (const key of skill.effect.stats) {
          if (scaled[key] !== undefined) {
            scaled[key] = (scaled[key] as number) * skill.effect.multiplier
          }
        }
        mods = scaled
      }
      add(mods)
    }

    /*
     * And last, the skills that read the finished block.
     *
     * Last is not a detail. `regenFrom` reads the armour and health that the
     * loop above has just doubled, which is what makes Haru's two skills
     * compound rather than merely coexist -- defence buys defence. Run before
     * the items, this would still work, still look right, and quietly not be
     * the class.
     *
     * Added to `regen` rather than replacing it, because an item sells the
     * same stat and a skill that silently cancelled a purchase is a skill that
     * makes an item worthless without saying so.
     */
    for (const skill of this.loadout.skills) {
      if (skill.effect.sort === 'regenFrom') {
        stats.regen +=
          skill.effect.base +
          stats.armour * skill.effect.fromArmour +
          stats.maxHp * skill.effect.fromMaxHp
      }
    }

    Object.assign(this.player.stats, stats)
    this.accuracy = derived.accuracy
    this.shopLuck = derived.shopLuck
    this.player.hp = Math.min(this.player.hp, stats.maxHp)
  }

  /**
   * Advances one fixed step.
   *
   * Order matters, and this one is chosen so that the grid is built exactly
   * once, after everything has moved:
   *
   *   player -> spawns -> enemy movement -> [grid] -> separation -> weapons
   *   -> projectiles -> pickups -> contact damage
   *
   * Separation nudges enemies by a few pixels after the grid is built, so the
   * projectile pass reads positions that are stale by that much. At these
   * radii that is well inside the margin of a circle test, and the alternative
   * is building the grid twice.
   */
  step(input: InputState): void {
    if (this.status === 'dead') {
      return
    }

    const dt = STEP_SECONDS
    this.elapsed += dt

    this.stepPlayer(input, dt)
    this.stepDirector(dt)
    this.stepEnemyMovement(dt)

    this.rebuildGrid()
    this.separateEnemies()

    this.stepWeapons(dt)
    this.stepProjectiles(dt)
    this.stepPickups(dt)
    this.stepContactDamage()
  }

  restart(): void {
    this.enemies.releaseAll()
    this.projectiles.releaseAll()
    this.pickups.releaseAll()

    const player = this.player
    player.x = WORLD_WIDTH / 2
    player.y = WORLD_HEIGHT / 2
    player.weapons.length = 0
    this.ownedItems.length = 0
    player.invuln = 0
    player.dodgeFlash = 0
    player.coins = 0
    player.level = 1
    player.xp = 0
    player.xpToLevel = xpForLevel(1)


    this.status = 'fighting'
    this.wave = 1
    this.waveTimeLeft = waveDuration(1)
    this.breakTimeLeft = 0
    this.spawnTimer = 0
    this.kills = 0
    this.elapsed = 0
    this.hitsTaken = 0
    this.shake = 0
    this.hitCount = 0
    this.healCount = 0
    this.healPool = 0
    this.regenTimer = 0
    this.misses = 0
    this.shopOffers = []
    this.rerolls = 0
    this.random = mulberry32(0x9e3779b9)

    this.applyLoadout()
  }

  /* ---------- player ---------- */

  private stepPlayer(input: InputState, dt: number): void {
    const player = this.player
    const stats = player.stats
    const speed = BASE_MOVE_SPEED * stats.moveSpeed

    player.x = clamp(player.x + input.x * speed * dt, player.radius, WORLD_WIDTH - player.radius)
    player.y = clamp(player.y + input.y * speed * dt, player.radius, WORLD_HEIGHT - player.radius)

    if (player.invuln > 0) {
      player.invuln -= dt
    }
    if (player.dodgeFlash > 0) {
      player.dodgeFlash -= dt
    }
    /* Banked and paid out on the interval, not per step. The rate is unchanged
       -- a tick is worth REGEN_INTERVAL seconds of it -- so nothing that quotes
       the stat has to be re-worded. */
    if (stats.regen > 0) {
      this.regenTimer += dt
      if (this.regenTimer >= REGEN_INTERVAL) {
        this.regenTimer -= REGEN_INTERVAL
        this.heal(stats.regen * REGEN_INTERVAL)
      }
    } else {
      /* Held at zero while there is nothing to give, so a run that buys
         regeneration halfway through a wave does not get a tick it did not
         wait for. */
      this.regenTimer = 0
    }
  }

  /**
   * Restores health and reports it, which is the only way health should ever
   * go up.
   *
   * Everything that heals comes through here -- regeneration, lifesteal, the
   * ceiling a level raises -- so there is one clamp, one pool and one place
   * that decides what the player is shown. Writing `player.hp` directly still
   * works and is still wrong: it heals silently, and healing the player
   * without telling them is indistinguishable from not healing them.
   *
   * Returns what was actually restored, which is less than what was asked for
   * at full health and nothing at all when dead.
   */
  private heal(amount: number): number {
    const player = this.player
    if (amount <= 0 || this.status === 'dead') {
      return 0
    }
    const before = player.hp
    player.hp = Math.min(player.stats.maxHp, player.hp + amount)
    const given = player.hp - before
    if (given <= 0) {
      return 0
    }

    /* Pooled to whole points. A fraction of a point is real healing and is
       kept -- it is only the *reporting* that waits for it to add up to
       something worth a number. */
    this.healPool += given
    if (this.healPool >= 1 && this.healCount < this.heals.length) {
      const whole = Math.floor(this.healPool)
      this.healPool -= whole
      const event = this.heals[this.healCount++]
      event.x = player.x
      event.y = player.y
      event.amount = whole
    }
    return given
  }

  /* ---------- the director ---------- */

  private stepDirector(dt: number): void {
    if (this.status === 'shop') {
      // Waits for the player, not for a clock.
      return
    }

    if (this.status === 'break') {
      this.breakTimeLeft -= dt
      if (this.breakTimeLeft <= 0) {
        this.openShop()
      }
      return
    }

    this.waveTimeLeft -= dt
    if (this.waveTimeLeft <= 0) {
      this.endWave()
      return
    }

    const interval = spawnInterval(this.wave)
    this.spawnTimer -= dt
    // A while loop rather than an if: at a late wave the interval drops below
    // one step, and spawning at most one per step would silently cap the wave.
    while (this.spawnTimer <= 0) {
      this.spawnEnemy()
      this.spawnTimer += interval
    }
  }

  private startWave(wave: number): void {
    this.wave = wave
    this.waveTimeLeft = waveDuration(wave)
    this.spawnTimer = 0.4
    this.shopOffers = []
    this.rerolls = 0
    this.status = 'fighting'
  }

  /* ---------- the shop ---------- */

  private openShop(): void {
    this.rerolls = 0
    this.shopOffers = this.layOutShop()
    this.status = 'shop'
  }

  private layOutShop(): ShopOffer[] {
    return rollShop(
      {
        wave: this.wave,
        weaponCount: this.player.weapons.length,
        mergeable: this.mergeTargets(),
        families: [...new Set(this.player.weapons.map((slot) => WEAPONS[slot.kind].family))],
        luck: this.shopLuck,
      },
      this.random,
    )
  }

  /** Kind-and-tier pairs a further copy would be able to fuse with. Used to
   *  bias the shelf towards weapons the rack can actually do something with,
   *  not to decide whether a weapon may be offered at all. */
  private mergeTargets(): MergeTarget[] {
    const counts = new Map<string, number>()
    for (const slot of this.player.weapons) {
      const key = `${slot.kind}:${slot.tier}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const targets: MergeTarget[] = []
    for (const [key, count] of counts) {
      const [kind, tier] = key.split(':').map(Number)
      if (count >= MERGE_COUNT - 1 && tier < MAX_WEAPON_TIER) {
        targets.push({ kind, tier })
      }
    }
    return targets
  }

  /** Buys the offer in that slot, or does nothing if it cannot be afforded. */
  buy(slot: number): boolean {
    const offer = this.shopOffers[slot]
    if (this.status !== 'shop' || !offer || this.player.coins < offer.price) {
      return false
    }

    if (offer.sort === 'weapon') {
      if (!this.addWeapon(offer.index, offer.tier)) {
        return false
      }
    } else {
      const item = SHOP_ITEMS[offer.index]
      // Recorded, then recomputed. An item does not write into the block any
      // more -- `recomputeStats` reads this list back, which is what makes a
      // rebuild reproduce the run exactly.
      this.ownedItems.push(item.id)
      this.recomputeStats()
      // A maximum-health item that raises the ceiling should raise the water
      // with it, the same as a level does.
      if (item.mods.maxHp && item.mods.maxHp > 0) {
        this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + item.mods.maxHp)
      }
    }

    this.player.coins -= offer.price
    // Sold, not replaced: leaving a bought card on the shelf invites a second
    // click on something that is already gone.
    this.shopOffers = this.shopOffers.filter((_, i) => i !== slot)
    return true
  }

  reroll(): boolean {
    if (this.status !== 'shop') {
      return false
    }
    const price = rerollPrice(this.wave, this.rerolls)
    if (this.player.coins < price) {
      return false
    }
    this.player.coins -= price
    this.rerolls += 1
    this.shopOffers = this.layOutShop()
    return true
  }

  /** Leaves the shop and starts the next wave. */
  leaveShop(): void {
    if (this.status === 'shop') {
      this.startWave(this.wave + 1)
    }
  }

  /**
   * Adds a weapon to the rack, or refuses when there is no room.
   *
   * It used to fuse whatever the new copy completed, which is what made room
   * on a full rack. Merging is the player's move now -- see MERGE_COUNT -- so
   * a full rack is simply full, and the shop stops offering weapons until
   * something is fused to clear a slot.
   */
  addWeapon(kind: number, tier = 1): boolean {
    const weapons = this.player.weapons
    if (weapons.length >= MAX_WEAPON_SLOTS) {
      return false
    }
    weapons.push({ kind, tier, cooldown: 0 })
    return true
  }

  /**
   * Sells the weapon in a slot back for coins.
   *
   * The last one cannot be sold. A run with an empty rack cannot kill
   * anything, so the only thing on the far side of that drop is a wave spent
   * watching -- and it is one slip of the hand away, which is not a decision,
   * it is an accident waiting for somewhere to happen.
   */
  sellWeapon(slot: number): boolean {
    const weapons = this.player.weapons
    const held = weapons[slot]
    if (!held || weapons.length <= 1) {
      return false
    }
    this.player.coins += weaponSellValue(held.kind, held.tier, this.wave)
    weapons.splice(slot, 1)
    return true
  }

  /**
   * Fuses one slot into another.
   *
   * The rule, and every part of it is a refusal the interface has to be able
   * to show: same weapon, same tier, not itself, and not already at the
   * ceiling. A blade and a lance do not fuse however many you hold; nor do a
   * tier I and a tier II of the same blade, which is the case players expect
   * to work and is exactly why it returns a flag rather than failing quietly.
   *
   * The survivor keeps the destination slot's position, so the rack does not
   * reshuffle under the hand that just dropped something on it.
   */
  mergeWeapons(from: number, to: number): boolean {
    const weapons = this.player.weapons
    const source = weapons[from]
    const target = weapons[to]
    if (from === to || !canMerge(source, target)) {
      return false
    }

    target.tier += 1
    // The cooldown restarts with the new weapon rather than carrying over a
    // timer that belonged to a slower version of it.
    target.cooldown = 0
    weapons.splice(from, 1)
    return true
  }

  private endWave(): void {
    // Everything still standing is cleared, as the genre does -- surviving the
    // clock is the win condition, not clearing the field.
    this.enemies.releaseAll()
    this.projectiles.releaseAll()
    this.waveTimeLeft = 0
    this.breakTimeLeft = BREAK_SECONDS
    this.status = 'break'
  }

  private spawnEnemy(): void {
    const enemy = this.enemies.spawn()
    if (!enemy) {
      // Pool full. Dropping the spawn is the right failure: the screen is
      // already past what the player can read.
      return
    }

    const kindIndex = pickEnemyKind(this.wave, this.random())
    const kind = ENEMY_KINDS[kindIndex]
    const spot = this.spawnPoint()

    enemy.x = spot.x
    enemy.y = spot.y
    enemy.kind = kindIndex
    enemy.maxHp = Math.round(kind.hp * healthScale(this.wave))
    enemy.hp = enemy.maxHp
    enemy.speed = kind.speed * speedScale(this.wave)
    enemy.radius = kind.radius
    /* Scaled at spawn, like the health beside it, so a hit is worth what the
       wave it came from says rather than what the kind was written at. */
    enemy.contactDamage = kind.contactDamage * damageScale(this.wave)
    enemy.drop = kind.drop
    enemy.mass = kind.mass
    enemy.flash = 0
    enemy.flashCrit = false
    enemy.arriving = ARRIVAL_SECONDS
  }

  /**
   * A point on the ring around the player, inside the world.
   *
   * This was the arena's own perimeter, which meant something only while the
   * arena was one screen: released at the far edge of a 3200x1800 map, a grunt
   * at 62px/s spends the better part of a minute walking, and the wave it
   * belongs to is over before it arrives. The ring travels with the player
   * instead, so what a wave costs no longer depends on which corner of the
   * world it is fought in.
   *
   * Rejection rather than clamping. A clamped ring point slides along the wall
   * and comes to rest beside a player who is already cornered, which is the
   * one place an enemy must not simply appear. A quarter of the ring is still
   * open even in a corner, so twelve tries is generous; the clamp is only
   * there so this always returns.
   */
  private spawnPoint(): { x: number; y: number } {
    const player = this.player
    /* The floor is on the near rim, not the far one -- it is the nearest an
       arrival may land, and applying it to the far edge would still let the
       inner rim slide under it. */
    const far = Math.max(
      SPAWN_FLOOR / SPAWN_BAND,
      Math.min(visionRadius(player.stats) * SPAWN_SIGHT_FRACTION, SPAWN_WINDOW_LIMIT),
    )
    const near = far * SPAWN_BAND

    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = this.random() * Math.PI * 2
      const distance = near + this.random() * (far - near)
      const x = player.x + Math.cos(angle) * distance
      const y = player.y + Math.sin(angle) * distance
      if (
        x >= SPAWN_MARGIN &&
        x <= WORLD_WIDTH - SPAWN_MARGIN &&
        y >= SPAWN_MARGIN &&
        y <= WORLD_HEIGHT - SPAWN_MARGIN
      ) {
        return { x, y }
      }
    }
    return {
      x: clamp(player.x + far, SPAWN_MARGIN, WORLD_WIDTH - SPAWN_MARGIN),
      y: clamp(player.y, SPAWN_MARGIN, WORLD_HEIGHT - SPAWN_MARGIN),
    }
  }

  /* ---------- enemies ---------- */

  private stepEnemyMovement(dt: number): void {
    const { x: px, y: py } = this.player
    const items = this.enemies.items

    for (let i = 0; i < items.length; i++) {
      const enemy = items[i]
      // Arriving enemies are emphatically not skipped here: this is the pass
      // that runs their countdown down, further below.
      if (!enemy.active) {
        continue
      }

      if (enemy.flash > 0) {
        enemy.flash -= dt
      }

      const dx = px - enemy.x
      const dy = py - enemy.y
      const distance = Math.hypot(dx, dy)

      // Left too far behind to matter. Released here rather than in a pass of
      // its own, because the distance this decides on has just been measured
      // for the chase.
      if (distance > CULL_DISTANCE) {
        this.enemies.release(enemy)
        continue
      }

      // Still arriving: it holds its position and does nothing at all. The
      // countdown is the only thing about it that moves.
      if (enemy.arriving > 0) {
        enemy.arriving -= dt
        continue
      }

      if (distance > 0.001) {
        const step = (enemy.speed * dt) / distance
        enemy.x += dx * step
        enemy.y += dy * step
      }

      // Everything spawns inside the world now, so this is the world itself
      // rather than a margin around it.
      enemy.x = clamp(enemy.x, 0, WORLD_WIDTH)
      enemy.y = clamp(enemy.y, 0, WORLD_HEIGHT)
    }
  }

  /**
   * Rebuilt from scratch every step -- see SpatialGrid.
   *
   * An enemy still arriving is left out of it, which is most of the arrival
   * state in one line: the grid is what separation and the projectiles both
   * query, so a body that is not in it cannot be pushed, cannot push, and
   * cannot be hit. Only contact damage tests positions directly, and it checks
   * the countdown itself.
   */
  private rebuildGrid(): void {
    this.grid.clear()
    const items = this.enemies.items
    for (let i = 0; i < items.length; i++) {
      const enemy = items[i]
      if (enemy.active && enemy.arriving <= 0) {
        this.grid.insert(i, enemy.x, enemy.y)
      }
    }
  }

  /**
   * Pushes overlapping enemies apart.
   *
   * Without this a crowd converges onto the player's exact position and
   * collapses into what looks like a single enemy -- every one of them is
   * chasing the same point, so nothing keeps them apart on its own.
   *
   * Each pair is handled once, by only looking at neighbours with a higher
   * slot index, and both are moved by the share of the overlap their masses
   * say they should take.
   */
  private separateEnemies(): void {
    const items = this.enemies.items
    const neighbours = this.neighbours

    for (let i = 0; i < items.length; i++) {
      const a = items[i]
      if (!a.active) {
        continue
      }

      neighbours.length = 0
      this.grid.queryNeighbourhood(a.x, a.y, neighbours)

      for (let n = 0; n < neighbours.length; n++) {
        const j = neighbours[n]
        if (j <= i) {
          continue
        }
        const b = items[j]

        const dx = b.x - a.x
        const dy = b.y - a.y
        const minimum = a.radius + b.radius
        const squared = dx * dx + dy * dy
        if (squared >= minimum * minimum) {
          continue
        }

        // Two enemies spawned on the same pixel have no direction to separate
        // along, so give them one rather than dividing by zero.
        const distance = Math.sqrt(squared) || 0.001
        const overlap = (minimum - distance) * 0.5
        const nx = (dx / distance) * overlap
        const ny = (dy / distance) * overlap
        const total = a.mass + b.mass
        const aShare = b.mass / total
        const bShare = a.mass / total

        a.x -= nx * aShare * 2
        a.y -= ny * aShare * 2
        b.x += nx * bShare * 2
        b.y += ny * bShare * 2
      }
    }
  }

  private stepContactDamage(): void {
    const player = this.player
    const stats = player.stats
    if (player.invuln > 0) {
      return
    }

    const items = this.enemies.items
    for (let i = 0; i < items.length; i++) {
      const enemy = items[i]
      // Arriving enemies are checked here rather than through the grid,
      // because this is the one pass that reads positions directly.
      if (!enemy.active || enemy.arriving > 0) {
        continue
      }
      const dx = player.x - enemy.x
      const dy = player.y - enemy.y
      const reach = enemy.radius + player.radius
      if (dx * dx + dy * dy > reach * reach) {
        continue
      }

      // One hit per window whatever the crowd size. Per-enemy cooldowns are
      // more faithful, but with a hundred bodies touching at once they add up
      // to instant death faster than any amount of armour could pay for.
      player.invuln = PLAYER_INVULN

      /*
       * A dodge takes the invulnerability window too. Without it, dodging the
       * enemy in front simply hands the hit to the one behind, and in a crowd
       * the stat would be worth almost nothing at any value.
       */
      if (stats.dodge > 0 && this.random() < Math.min(stats.dodge, DODGE_CAP)) {
        player.dodgeFlash = 0.22
        return
      }

      player.hp -= enemy.contactDamage * (1 - armourReduction(stats.armour))
      this.hitsTaken += 1
      this.shake += 6
      if (player.hp <= 0) {
        player.hp = 0
        this.status = 'dead'
        this.deaths += 1
      }
      return
    }
  }

  /* ---------- weapons ---------- */

  private stepWeapons(dt: number): void {
    const player = this.player

    /*
     * One nearest-enemy search serves every slot. It looks like each weapon
     * should find its own nearest target inside its own range, but if the
     * closest enemy in the arena is out of a weapon's range then so is every
     * other one -- so the search is shared and each slot only compares the
     * distance against its own reach.
     */
    const target = this.nearestEnemy(player.x, player.y)

    for (const slot of player.weapons) {
      if (slot.cooldown > 0) {
        slot.cooldown -= dt
      }
      if (!target || slot.cooldown > 0 || this.status !== 'fighting') {
        continue
      }
      const weapon = WEAPONS[slot.kind]
      if (target.distance > weapon.range * player.stats.range) {
        continue
      }
      this.fire(slot, Math.atan2(target.y - player.y, target.x - player.x))
      this.volleys += 1
      slot.cooldown =
        weapon.cooldown / (player.stats.attackSpeed * tierRateScale(slot.tier))
    }
  }

  private nearestEnemy(x: number, y: number): { x: number; y: number; distance: number } | null {
    const items = this.enemies.items
    let bestSquared = Infinity
    let best: Enemy | null = null

    for (let i = 0; i < items.length; i++) {
      const enemy = items[i]
      // Not yet a target: an arriving enemy cannot be hit, so aiming a volley
      // at one would be a volley thrown away.
      if (!enemy.active || enemy.arriving > 0) {
        continue
      }
      const dx = enemy.x - x
      const dy = enemy.y - y
      const squared = dx * dx + dy * dy
      if (squared < bestSquared) {
        bestSquared = squared
        best = enemy
      }
    }

    return best ? { x: best.x, y: best.y, distance: Math.sqrt(bestSquared) } : null
  }

  /**
   * One volley.
   *
   * Two parts, which behave differently on purpose:
   *
   * The weapon's own shots are its identity -- the shotgun sprays, the reaper
   * throws a ring -- so they fan by the weapon's own spread about the primary
   * target and nothing changes that.
   *
   * The shots the bonus-projectile stat adds are AIMED. Fanning them was the
   * obvious thing and it was wrong: every extra shot widened the arc, so at
   * four bonus projectiles a pistol sprayed thirty degrees and only the middle
   * one could hit a distant enemy. Each extra shot now takes the next-nearest
   * enemy of its own, which is what "auto-fire aims at the nearest target"
   * should mean once there is more than one shot to aim.
   *
   * Everything the stats touch is applied here and baked into the projectile,
   * so a shot in flight is unaffected by an upgrade taken while it travels.
   */
  private fire(slot: WeaponSlot, angle: number): void {
    const weapon = WEAPONS[slot.kind]
    const stats = this.player.stats
    const damage =
      (weapon.damage + attackPowerFor(stats, weapon.family)) *
      stats.damage *
      tierDamageScale(slot.tier)
    const life = weapon.life * stats.range

    /*
     * A full-circle weapon divides by count, not by count - 1. Spacing a ring
     * the way a fan is spaced puts the first and last shot on the same bearing
     * -- the reaper was throwing eight blades in seven directions.
     */
    const ring = weapon.spread >= Math.PI * 2 - 0.01
    const gap = ring
      ? (Math.PI * 2) / weapon.count
      : weapon.count > 1
        ? weapon.spread / (weapon.count - 1)
        : 0
    const first = ring ? angle : angle - weapon.spread / 2

    for (let i = 0; i < weapon.count; i++) {
      if (!this.spawnShot(slot, weapon.count > 1 ? first + gap * i : angle, damage, life)) {
        return
      }
    }

    const extra = stats.bonusCount
    if (extra <= 0) {
      return
    }

    const player = this.player
    // One more than needed: index 0 is the primary, already shot at above.
    const found = this.findTargets(player.x, player.y, extra + 1, weapon.range * stats.range)

    for (let i = 0; i < extra; i++) {
      let theta: number
      if (i + 1 < found) {
        const other = this.targets[i + 1]
        theta = Math.atan2(other.y - player.y, other.x - player.x)
      } else {
        // Fewer enemies than shots. The leftovers go either side of the
        // primary, close enough that they still land on it at normal range.
        const step = Math.ceil((i + 1 - Math.max(0, found - 1)) / 2)
        theta = angle + (i % 2 === 0 ? 1 : -1) * SPREAD_PER_EXTRA_SHOT * step
      }
      if (!this.spawnShot(slot, theta, damage, life)) {
        return
      }
    }
  }

  /** Returns false when the pool is empty, which stops the rest of a volley. */
  private spawnShot(slot: WeaponSlot, theta: number, damage: number, life: number): boolean {
    const shot = this.projectiles.spawn()
    if (!shot) {
      return false
    }
    const weapon = WEAPONS[slot.kind]
    shot.x = this.player.x
    shot.y = this.player.y
    shot.vx = Math.cos(theta) * weapon.projectileSpeed
    shot.vy = Math.sin(theta) * weapon.projectileSpeed
    shot.radius = weapon.projectileRadius
    shot.damage = damage
    shot.knockback = weapon.knockback
    shot.pierce = weapon.pierce
    shot.life = life
    shot.lastHit = -1
    shot.kind = slot.kind
    return true
  }

  /**
   * Fills `targets` with the k nearest enemies inside a radius, closest first.
   *
   * An insertion sort into a fixed buffer rather than sorting the whole crowd:
   * k is single digits and the crowd is hundreds, so this is one pass with a
   * comparison against the worst kept candidate and almost nothing else.
   */
  private findTargets(x: number, y: number, k: number, maxRange: number): number {
    const targets = this.targets
    const limit = Math.min(k, targets.length)
    const maxD2 = maxRange * maxRange
    const items = this.enemies.items
    let count = 0

    for (let i = 0; i < items.length; i++) {
      const enemy = items[i]
      // Not yet a target: an arriving enemy cannot be hit, so aiming a volley
      // at one would be a volley thrown away.
      if (!enemy.active || enemy.arriving > 0) {
        continue
      }
      const dx = enemy.x - x
      const dy = enemy.y - y
      const d2 = dx * dx + dy * dy
      if (d2 > maxD2) {
        continue
      }

      let pos: number
      if (count < limit) {
        pos = count
        count += 1
      } else if (d2 < targets[limit - 1].d2) {
        pos = limit - 1
      } else {
        continue
      }

      while (pos > 0 && targets[pos - 1].d2 > d2) {
        const into = targets[pos]
        const from = targets[pos - 1]
        into.x = from.x
        into.y = from.y
        into.d2 = from.d2
        pos -= 1
      }
      const slot = targets[pos]
      slot.x = enemy.x
      slot.y = enemy.y
      slot.d2 = d2
    }

    return count
  }

  private stepProjectiles(dt: number): void {
    const shots = this.projectiles.items
    const enemies = this.enemies.items
    const neighbours = this.neighbours

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i]
      if (!shot.active) {
        continue
      }

      shot.x += shot.vx * dt
      shot.y += shot.vy * dt
      shot.life -= dt

      if (
        shot.life <= 0 ||
        shot.x < -SPAWN_MARGIN ||
        shot.x > WORLD_WIDTH + SPAWN_MARGIN ||
        shot.y < -SPAWN_MARGIN ||
        shot.y > WORLD_HEIGHT + SPAWN_MARGIN
      ) {
        this.projectiles.release(shot)
        continue
      }

      neighbours.length = 0
      this.grid.queryNeighbourhood(shot.x, shot.y, neighbours)

      for (let n = 0; n < neighbours.length; n++) {
        const slot = neighbours[n]
        if (slot === shot.lastHit) {
          continue
        }
        const enemy = enemies[slot]
        if (!enemy.active) {
          continue
        }

        const dx = enemy.x - shot.x
        const dy = enemy.y - shot.y
        const reach = enemy.radius + shot.radius
        if (dx * dx + dy * dy > reach * reach) {
          continue
        }

        this.hit(enemy, shot)
        if (!shot.active) {
          break
        }
      }
    }
  }

  private hit(enemy: Enemy, shot: Projectile): void {
    const player = this.player
    const stats = player.stats

    /*
     * Accuracy against the enemy's evasion, before anything else. Every kind
     * in the game evades zero, so this passes for all of them today and the
     * stat changes nothing -- which is the point of landing the rule while
     * nothing depends on it. The first evasive enemy is then one number on one
     * kind, not a combat change shipped with the enemy that needs it.
     *
     * A miss is counted rather than silent. A shot that lands and does nothing
     * with no feedback is a bug report.
     */
    const kind = ENEMY_KINDS[enemy.kind]
    if (kind.evasion > 0 && this.random() >= hitChance(this.accuracy, kind.evasion)) {
      this.misses += 1
      return
    }

    /*
     * Crit is rolled per hit rather than per volley, so a piercing shot can
     * crit on its second target and not its first. Rolling once at fire time
     * would make a lucky volley uniformly lucky, which shows a bigger number
     * far less often for the same average.
     */
    const crit = stats.critChance > 0 && this.random() < stats.critChance
    const dealt = crit ? shot.damage * stats.critDamage : shot.damage
    enemy.hp -= dealt
    enemy.flash = crit ? 0.12 : 0.07
    enemy.flashCrit = crit

    if (this.hitCount < this.hits.length) {
      const event = this.hits[this.hitCount++]
      event.x = enemy.x
      event.y = enemy.y
      event.amount = dealt
      event.crit = crit
    }

    if (stats.lifesteal > 0) {
      this.heal(stats.lifesteal)
    }

    // Positional knockback rather than velocity: enemies here have no velocity
    // of their own -- they walk straight at the player every step -- so a
    // shove has to be a displacement or it would be overwritten immediately.
    const push = shot.knockback / enemy.mass
    const speed = Math.hypot(shot.vx, shot.vy) || 1
    enemy.x += (shot.vx / speed) * push
    enemy.y += (shot.vy / speed) * push

    shot.lastHit = enemy.index

    if (enemy.hp <= 0) {
      this.kill(enemy)
    }

    if (shot.pierce > 0) {
      shot.pierce -= 1
    } else {
      this.projectiles.release(shot)
    }
  }

  private kill(enemy: Enemy): void {
    this.kills += 1
    // Experience for the kill itself, separate from anything it drops. Killing
    // and collecting are different actions and both should count -- otherwise
    // a wave spent clearing a crowd out of reach pays nothing.
    this.grantXp(ENEMY_KINDS[enemy.kind].xp)

    /*
     * How many times the kill pays, from one number that means two things.
     *
     * Below one, `coinRate` is the chance of being paid at all; above one it
     * is a multiplier. The whole part is paid every time and the fraction is
     * rolled once -- so 0.45 pays 45% of the time, 1.0 always pays, 1.5 pays
     * once and then again half the time, and 2.0 always pays double. The stat
     * never crosses a boundary where it changes meaning, which is the point of
     * it being one number rather than a chance with a bonus bolted on.
     *
     * Rolled once for the kill, not once per coin. Per coin would turn a
     * four-coin brute into an average of two, which is a quieter version of the
     * same payout and not what a chance is for: a brute pays properly or it
     * pays nothing, and the run feels the difference.
     */
    const rate = Math.max(0, this.player.stats.coinRate)
    let payouts = Math.floor(rate)
    if (this.random() < rate - payouts) {
      payouts += 1
    }

    const coins = enemy.drop * payouts
    for (let i = 0; i < coins; i++) {
      const drop = this.pickups.spawn()
      if (!drop) {
        break
      }
      const angle = this.random() * Math.PI * 2
      const speed = 60 + this.random() * 90
      drop.x = enemy.x
      drop.y = enemy.y
      drop.vx = Math.cos(angle) * speed
      drop.vy = Math.sin(angle) * speed
      drop.value = 1
      drop.age = 0
    }
    this.enemies.release(enemy)
  }

  /* ---------- pickups ---------- */

  /**
   * Drops: burst, then home, then collect.
   *
   * The magnet steers the velocity rather than adding a force to it. A force
   * leaves the sideways part of the death-burst velocity untouched, so a drop
   * arrives with momentum across the player rather than into them, sails past,
   * gets pulled back, and orbits -- which is what made collection feel
   * approximate. Steering discards that component every step, so a drop moves
   * at the player and only at the player.
   *
   * The arrival test is swept, not a radius check. Near the player the homing
   * speed is over 1000px/s, which is 17px in a step -- comparable to the reach
   * itself, so a plain "is it close enough now" test can be straddled by a
   * single step and miss.
   */
  private stepPickups(dt: number): void {
    const player = this.player
    const breaking = this.status === 'break'
    const magnet =
      BASE_LOOT_RANGE * player.stats.lootRange * (breaking ? BREAK_LOOT_MULTIPLIER : 1)
    const reach = player.radius + PICKUP_REACH
    const items = this.pickups.items

    // Everything here is measured against one point, so there is nothing for a
    // broadphase to do -- one pass over the pool is the whole job.
    for (let i = 0; i < items.length; i++) {
      const drop = items[i]
      if (!drop.active) {
        continue
      }

      drop.age += dt

      const dx = player.x - drop.x
      const dy = player.y - drop.y
      const distance = Math.hypot(dx, dy) || 0.001

      if (distance <= reach) {
        this.collect(drop)
        continue
      }

      /* Everything the break cannot reach is credited where it lies.
         Flying it in is not an option -- see BREAK_LOOT_MULTIPLIER, the homing
         speed runs out long before the break does -- and losing it silently is
         exactly what the break exists to prevent. Nothing is skipped visually
         either: past the magnet a drop is 1080 away, which is well outside a
         640-wide half-window, so there was never anything to watch. */
      if (breaking && distance > magnet) {
        this.collect(drop)
        continue
      }

      if (drop.age > PICKUP_SCATTER && distance < magnet) {
        const closeness = 1 - distance / magnet
        const speed = HOMING_MIN + (HOMING_MAX - HOMING_MIN) * closeness * closeness
        if (speed * dt >= distance - reach) {
          this.collect(drop)
          continue
        }
        drop.vx = (dx / distance) * speed
        drop.vy = (dy / distance) * speed
      } else {
        // Scatter velocity from the corpse burst, bleeding off.
        drop.vx *= 0.92
        drop.vy *= 0.92
      }

      drop.x = clamp(drop.x + drop.vx * dt, 6, WORLD_WIDTH - 6)
      drop.y = clamp(drop.y + drop.vy * dt, 6, WORLD_HEIGHT - 6)
    }
  }

  private collect(drop: Pickup): void {
    const player = this.player
    player.coins += drop.value
    this.pickups.release(drop)
    this.grantXp(drop.value)
  }

  /**
   * The single door experience comes in through.
   *
   * Both sources -- the kill and the coin it drops -- funnel here, so the
   * level-up rule exists once. A while loop rather than an if, because a brute
   * paying four at a time can cross two thresholds in one call.
   */
  private grantXp(amount: number): void {
    if (amount <= 0) {
      return
    }
    const player = this.player
    player.xp += amount * player.stats.xpGain

    while (player.xp >= player.xpToLevel) {
      player.xp -= player.xpToLevel
      player.level += 1
      player.xpToLevel = xpForLevel(player.level)

      /*
       * A level is the class's growth and nothing else. There is no card and
       * no pause: two runs of the same character are the same curve, and two
       * characters are visibly different ones, which is what a class is for.
       *
       * Health is healed by exactly what the ceiling gained, so a level taken
       * on a nearly empty tank is worth what it says. Measured across the
       * recompute rather than assumed, because STA is not the only thing that
       * can move maxHp.
       */
      const ceilingBefore = player.stats.maxHp
      const growth = this.loadout.growth
      {
        this.attributes = clampAttributes({
          str: this.attributes.str + (growth.str ?? 0),
          agi: this.attributes.agi + (growth.agi ?? 0),
          dex: this.attributes.dex + (growth.dex ?? 0),
          sta: this.attributes.sta + (growth.sta ?? 0),
          int: this.attributes.int + (growth.int ?? 0),
          luk: this.attributes.luk + (growth.luk ?? 0),
        })
      }
      this.recomputeStats()
      this.heal(Math.max(0, player.stats.maxHp - ceilingBefore))
    }
  }
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value
}

/**
 * Small seeded generator, so a run is reproducible.
 *
 * Not for fairness -- nothing here is competitive -- but because a bug that
 * only shows up on wave seven is far easier to chase when wave seven is the
 * same every time.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
