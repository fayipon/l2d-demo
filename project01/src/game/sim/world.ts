import { Pool, type Pooled } from './pool'
import { SpatialGrid } from './grid'
import {
  BASE_LOOT_RANGE,
  BASE_MOVE_SPEED,
  BASE_STATS,
  DODGE_CAP,
  ENEMY_KINDS,
  LEVEL_BONUS,
  MAX_WEAPON_SLOTS,
  MAX_WEAPON_TIER,
  MERGE_COUNT,
  SPREAD_PER_EXTRA_SHOT,
  WEAPONS,
  armourReduction,
  findWeapon,
  getUpgrade,
  healthScale,
  pickEnemyKind,
  rollUpgradeOffers,
  spawnInterval,
  speedScale,
  tierDamageScale,
  tierRateScale,
  waveDuration,
  xpForLevel,
  type PlayerStats,
  type UpgradeId,
} from '../data/content'
import {
  SHOP_ITEMS,
  rerollPrice,
  rollShop,
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
 * How far from the player an enemy arrives.
 *
 * Past the corner of a 1280x720 window, which is 734 away, so nothing is
 * watched appearing. The simulation has no business knowing the viewport --
 * what it needs is "far enough that the player does not see it happen", and
 * the window is only where the number came from.
 */
const SPAWN_DISTANCE = 780

/**
 * How far an enemy may fall behind before it is recycled.
 *
 * Not an optimisation -- without it a wave goes empty. The player moves at
 * 232px/s and the fastest enemy in the game manages 191 at the top of its
 * speed curve, so a player running in a straight line outruns everything. On
 * one screen that ended at a wall after 2.8 seconds; across 3200x1800 it runs
 * for sixteen, and the stragglers neither catch up nor ever disappear. They
 * accumulate to the pool's capacity, and from there every new spawn is dropped
 * for want of a slot: seven hundred enemies trailing a player who is never
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
const CAPACITY = { enemies: 700, projectiles: 500, pickups: 600 }

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
   * Runs finished. The HUD banks a result when this changes, which is what
   * stops a rerender from paying the same run twice.
   */
  deaths = 0

  /**
   * Levels gained but not yet spent.
   *
   * The scene stops stepping while this is above zero, which is the whole
   * pause mechanism -- there is no separate paused flag to keep in sync with
   * anything. Levels queue rather than overwrite, because one fat pickup burst
   * can cross two thresholds at once and the second choice must not be eaten.
   */
  pendingLevels = 0
  /** What to offer for the level at the front of that queue. */
  offers: UpgradeId[] = []

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
   * Modifiers are added to the block the same way an item or an upgrade card
   * adds to it -- a trait is not a special case, it is just the first writer.
   */
  private applyLoadout(): void {
    const player = this.player
    for (const [key, value] of Object.entries(this.loadout.mods)) {
      player.stats[key as keyof PlayerStats] += value as number
    }
    player.hp = player.stats.maxHp

    const kind = findWeapon(this.loadout.weapon)
    player.weapons.push({ kind: kind >= 0 ? kind : 0, tier: 1, cooldown: 0 })
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
    Object.assign(player.stats, BASE_STATS)
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
    this.pendingLevels = 0
    this.offers = []
    this.shopOffers = []
    this.rerolls = 0
    this.random = mulberry32(0x9e3779b9)

    this.applyLoadout()
  }

  /* ---------- upgrades ---------- */

  /**
   * Spends the level at the front of the queue.
   *
   * Ignored when nothing is pending, because the command comes in from a
   * button that React may still be showing for a frame after the choice was
   * made -- a second click must not spend a level that was never earned.
   */
  applyUpgrade(id: UpgradeId): void {
    if (this.pendingLevels <= 0) {
      return
    }

    const upgrade = getUpgrade(id)
    if (!upgrade) {
      return
    }

    const player = this.player
    const stats = player.stats

    // Every upgrade is the same operation on a different field, which is the
    // whole reason the stats are one flat block rather than named properties
    // scattered across the player.
    stats[id] += upgrade.step
    if (upgrade.cap !== undefined) {
      stats[id] = Math.min(stats[id], upgrade.cap)
    }

    // Raising the ceiling has to raise the water with it, or taking it at low
    // health is nearly worthless -- which is not what the card says.
    if (id === 'maxHp') {
      player.hp = Math.min(stats.maxHp, player.hp + upgrade.step)
    }

    this.pendingLevels -= 1
    // Rolled fresh for the next level in the queue, so two levels taken back
    // to back are two separate decisions rather than one repeated.
    this.offers = this.pendingLevels > 0 ? rollUpgradeOffers(stats, this.random) : []
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
    if (stats.regen > 0 && player.hp < stats.maxHp) {
      player.hp = Math.min(stats.maxHp, player.hp + stats.regen * dt)
    }
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
      },
      this.random,
    )
  }

/** Kind-and-tier pairs the player is one copy short of fusing. */
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
      for (const [key, value] of Object.entries(item.mods)) {
        this.player.stats[key as keyof PlayerStats] += value as number
      }
      // A maximum-health item that raises the ceiling should raise the water
      // with it, the same as a level does.
      if (item.mods.maxHp && item.mods.maxHp > 0) {
        this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + item.mods.maxHp)
      }
      this.player.hp = Math.min(this.player.hp, this.player.stats.maxHp)
      this.ownedItems.push(item.id)
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
   * Adds a weapon, then fuses whatever that made possible.
   *
   * Merging happens here rather than in a screen of its own because it has no
   * decision in it: three of a kind at one tier are strictly worse than one of
   * the next, so asking would only be asking whether the player wants to be
   * stronger.
   */
  addWeapon(kind: number, tier = 1): boolean {
    const weapons = this.player.weapons
    weapons.push({ kind, tier, cooldown: 0 })
    this.mergeWeapons()

    // The merge is what makes room when the rack is full, so the check has to
    // come after it. If nothing fused, the copy goes back rather than leaving
    // a seventh slot the rest of the code does not expect.
    if (weapons.length > MAX_WEAPON_SLOTS) {
      const added = weapons.findIndex((slot) => slot.kind === kind && slot.tier === tier)
      weapons.splice(added >= 0 ? added : weapons.length - 1, 1)
      return false
    }
    return true
  }

  private mergeWeapons(): void {
    const weapons = this.player.weapons
    let merged = true

    // Repeats, because one fusion can complete another: three tier-1 make a
    // tier-2, which may be the third tier-2 waiting to become a tier-3.
    while (merged) {
      merged = false
      const counts = new Map<string, number[]>()
      for (let i = 0; i < weapons.length; i++) {
        const key = `${weapons[i].kind}:${weapons[i].tier}`
        const list = counts.get(key)
        if (list) {
          list.push(i)
        } else {
          counts.set(key, [i])
        }
      }

      for (const [key, indices] of counts) {
        const [kind, tier] = key.split(':').map(Number)
        if (indices.length < MERGE_COUNT || tier >= MAX_WEAPON_TIER) {
          continue
        }
        // Removed from the back so the earlier indices stay valid.
        for (let n = MERGE_COUNT - 1; n >= 0; n--) {
          weapons.splice(indices[n], 1)
        }
        weapons.push({ kind, tier: tier + 1, cooldown: 0 })
        merged = true
        break
      }
    }
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
    enemy.contactDamage = kind.contactDamage
    enemy.drop = kind.drop
    enemy.mass = kind.mass
    enemy.flash = 0
    enemy.flashCrit = false
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
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = this.random() * Math.PI * 2
      const x = player.x + Math.cos(angle) * SPAWN_DISTANCE
      const y = player.y + Math.sin(angle) * SPAWN_DISTANCE
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
      x: clamp(player.x + SPAWN_DISTANCE, SPAWN_MARGIN, WORLD_WIDTH - SPAWN_MARGIN),
      y: clamp(player.y, SPAWN_MARGIN, WORLD_HEIGHT - SPAWN_MARGIN),
    }
  }

  /* ---------- enemies ---------- */

  private stepEnemyMovement(dt: number): void {
    const { x: px, y: py } = this.player
    const items = this.enemies.items

    for (let i = 0; i < items.length; i++) {
      const enemy = items[i]
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

  private rebuildGrid(): void {
    this.grid.clear()
    const items = this.enemies.items
    for (let i = 0; i < items.length; i++) {
      const enemy = items[i]
      if (enemy.active) {
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
      if (!enemy.active) {
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
      if (!enemy.active) {
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
      (weapon.damage + stats.attackPower) * stats.damage * tierDamageScale(slot.tier)
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
      if (!enemy.active) {
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

    if (stats.lifesteal > 0 && player.hp < stats.maxHp) {
      player.hp = Math.min(stats.maxHp, player.hp + stats.lifesteal)
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

    for (let i = 0; i < enemy.drop; i++) {
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

      // The automatic half of a level, before the card is even offered. Health
      // is healed by what it gained, for the same reason the card does it:
      // a ceiling raised over an empty tank is not a reward.
      player.stats.maxHp += LEVEL_BONUS.maxHp
      player.hp = Math.min(player.stats.maxHp, player.hp + LEVEL_BONUS.maxHp)
      player.stats.attackPower += LEVEL_BONUS.attackPower

      this.pendingLevels += 1
      if (this.offers.length === 0) {
        this.offers = rollUpgradeOffers(player.stats, this.random)
      }
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
