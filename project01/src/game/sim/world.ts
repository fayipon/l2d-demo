import { Pool, type Pooled } from './pool'
import { SpatialGrid } from './grid'
import {
  ENEMY_KINDS,
  SPREAD_PER_EXTRA_SHOT,
  UPGRADE_STEP,
  WEAPONS,
  healthScale,
  pickEnemyKind,
  rollUpgradeOffers,
  spawnInterval,
  speedScale,
  waveDuration,
  xpForLevel,
  type UpgradeId,
} from '../data/content'

/**
 * The arena simulation.
 *
 * Deliberately knows nothing about Phaser. It owns positions, health and
 * timers; the scene reads them once a frame and moves sprites to match. That
 * split is what makes it possible to run the simulation at a fixed rate while
 * the renderer runs at whatever the display gives us, and it is what would
 * make the whole thing testable without a canvas.
 */

/** Design resolution. The canvas is scaled to fit; the world stays this size. */
export const ARENA_WIDTH = 1280
export const ARENA_HEIGHT = 720

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

/** How far outside the arena an enemy appears. */
const SPAWN_MARGIN = 46

/** Seconds between waves. */
const BREAK_SECONDS = 3

const PLAYER_INVULN = 0.55
const PICKUP_MAGNET = 108
const CAPACITY = { enemies: 700, projectiles: 500, pickups: 600 }

export type RunStatus = 'fighting' | 'break' | 'dead'

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
  cooldown: number
}

/**
 * Multipliers the weapons are read through.
 *
 * Kept apart from the weapons themselves so that a weapon is a fixed
 * description and a run is what happens to it -- which is also what lets one
 * upgrade affect every slot without naming any of them.
 */
export interface PlayerStats {
  /** Multiplies weapon damage. */
  damage: number
  /** Divides weapon cooldown. */
  attackSpeed: number
  /** Extra projectiles per volley, on top of the weapon's own count. */
  bonusCount: number
}

export interface PlayerState {
  x: number
  y: number
  radius: number
  hp: number
  maxHp: number
  speed: number
  invuln: number
  materials: number
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

  /**
   * Shake the scene should apply, in pixels, accumulated since it last looked.
   * The scene zeroes it. A queue of typed events would be tidier, but this is
   * the only thing the renderer needs to be told about and a number does not
   * allocate.
   */
  shake = 0

  /** Public so the HUD can count the gap between waves down, same as it counts
   *  the wave itself. */
  breakTimeLeft = 0
  private spawnTimer = 0
  private readonly grid = new SpatialGrid(ARENA_WIDTH, ARENA_HEIGHT, CELL_SIZE)
  /** Reused across every query, so the broadphase never allocates. */
  private readonly neighbours: number[] = []
  private random = mulberry32(0x9e3779b9)

  constructor() {
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
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT / 2,
      radius: 15,
      hp: 100,
      maxHp: 100,
      speed: 232,
      invuln: 0,
      materials: 0,
      level: 1,
      xp: 0,
      xpToLevel: xpForLevel(1),
      weapons: [
        { kind: 0, cooldown: 0 },
        { kind: 1, cooldown: 0.5 },
      ],
      stats: { damage: 1, attackSpeed: 1, bonusCount: 0 },
    }
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
    player.x = ARENA_WIDTH / 2
    player.y = ARENA_HEIGHT / 2
    player.maxHp = 100
    player.hp = 100
    player.speed = 232
    player.invuln = 0
    player.materials = 0
    player.level = 1
    player.xp = 0
    player.xpToLevel = xpForLevel(1)
    player.weapons[0].cooldown = 0
    player.weapons[1].cooldown = 0.5
    player.stats.damage = 1
    player.stats.attackSpeed = 1
    player.stats.bonusCount = 0

    this.status = 'fighting'
    this.wave = 1
    this.waveTimeLeft = waveDuration(1)
    this.breakTimeLeft = 0
    this.spawnTimer = 0
    this.kills = 0
    this.elapsed = 0
    this.shake = 0
    this.pendingLevels = 0
    this.offers = []
    this.random = mulberry32(0x9e3779b9)
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

    const stats = this.player.stats
    switch (id) {
      case 'count':
        stats.bonusCount += UPGRADE_STEP.count
        break
      case 'attackSpeed':
        stats.attackSpeed += UPGRADE_STEP.attackSpeed
        break
      case 'damage':
        stats.damage += UPGRADE_STEP.damage
        break
    }

    this.pendingLevels -= 1
    // Rolled fresh for the next level in the queue, so two levels taken back
    // to back are two separate decisions rather than one repeated.
    this.offers = this.pendingLevels > 0 ? rollUpgradeOffers() : []
  }

  /* ---------- player ---------- */

  private stepPlayer(input: InputState, dt: number): void {
    const player = this.player
    player.x = clamp(player.x + input.x * player.speed * dt, player.radius, ARENA_WIDTH - player.radius)
    player.y = clamp(player.y + input.y * player.speed * dt, player.radius, ARENA_HEIGHT - player.radius)
    if (player.invuln > 0) {
      player.invuln -= dt
    }
  }

  /* ---------- the director ---------- */

  private stepDirector(dt: number): void {
    if (this.status === 'break') {
      this.breakTimeLeft -= dt
      if (this.breakTimeLeft <= 0) {
        this.startWave(this.wave + 1)
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
    this.status = 'fighting'
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
    const spot = this.perimeterPoint()

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
  }

  /** A point just outside the arena, anywhere on its perimeter. */
  private perimeterPoint(): { x: number; y: number } {
    const perimeter = 2 * (ARENA_WIDTH + ARENA_HEIGHT)
    let t = this.random() * perimeter
    if (t < ARENA_WIDTH) {
      return { x: t, y: -SPAWN_MARGIN }
    }
    t -= ARENA_WIDTH
    if (t < ARENA_HEIGHT) {
      return { x: ARENA_WIDTH + SPAWN_MARGIN, y: t }
    }
    t -= ARENA_HEIGHT
    if (t < ARENA_WIDTH) {
      return { x: ARENA_WIDTH - t, y: ARENA_HEIGHT + SPAWN_MARGIN }
    }
    t -= ARENA_WIDTH
    return { x: -SPAWN_MARGIN, y: ARENA_HEIGHT - t }
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
      if (distance > 0.001) {
        const step = (enemy.speed * dt) / distance
        enemy.x += dx * step
        enemy.y += dy * step
      }

      // Held inside a margin rather than the arena itself, so one that has
      // just spawned can still walk in.
      enemy.x = clamp(enemy.x, -SPAWN_MARGIN, ARENA_WIDTH + SPAWN_MARGIN)
      enemy.y = clamp(enemy.y, -SPAWN_MARGIN, ARENA_HEIGHT + SPAWN_MARGIN)
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
      // to instant death and there is no armour system here yet to pay for it.
      player.hp -= enemy.contactDamage
      player.invuln = PLAYER_INVULN
      this.shake += 6
      if (player.hp <= 0) {
        player.hp = 0
        this.status = 'dead'
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
      if (target.distance > weapon.range) {
        continue
      }
      this.fire(slot.kind, Math.atan2(target.y - player.y, target.x - player.x))
      slot.cooldown = weapon.cooldown / player.stats.attackSpeed
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
   * Everything the player's stats touch is applied here, at the moment the
   * shot is created, and then baked into the projectile. A shot in flight is
   * therefore unaffected by an upgrade taken while it is still travelling --
   * which is both simpler and what you would want anyway.
   */
  private fire(kindIndex: number, angle: number): void {
    const weapon = WEAPONS[kindIndex]
    const player = this.player
    const stats = player.stats

    const count = weapon.count + stats.bonusCount
    const extra = count - weapon.count
    // A weapon with no spread of its own would stack every extra shot on the
    // same line, so the fan widens with each one it did not ask for.
    const spread = weapon.spread + extra * SPREAD_PER_EXTRA_SHOT
    const damage = weapon.damage * stats.damage

    const first = angle - spread / 2
    const gap = count > 1 ? spread / (count - 1) : 0

    for (let i = 0; i < count; i++) {
      const shot = this.projectiles.spawn()
      if (!shot) {
        return
      }
      const theta = count > 1 ? first + gap * i : angle
      shot.x = player.x
      shot.y = player.y
      shot.vx = Math.cos(theta) * weapon.projectileSpeed
      shot.vy = Math.sin(theta) * weapon.projectileSpeed
      shot.radius = weapon.projectileRadius
      shot.damage = damage
      shot.knockback = weapon.knockback
      shot.pierce = weapon.pierce
      shot.life = weapon.life
      shot.lastHit = -1
      shot.kind = kindIndex
    }
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
        shot.x > ARENA_WIDTH + SPAWN_MARGIN ||
        shot.y < -SPAWN_MARGIN ||
        shot.y > ARENA_HEIGHT + SPAWN_MARGIN
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
    enemy.hp -= shot.damage
    enemy.flash = 0.07

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

  private stepPickups(dt: number): void {
    const player = this.player
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

      if (distance < player.radius + 8) {
        this.collect(drop)
        continue
      }

      if (drop.age > 0.18 && distance < PICKUP_MAGNET) {
        // Pulls harder the closer it gets, so a drop that is nearly home snaps
        // in rather than trailing the player around.
        const pull = 520 * (1 - distance / PICKUP_MAGNET) + 160
        drop.vx += (dx / distance) * pull * dt
        drop.vy += (dy / distance) * pull * dt
      } else {
        // Scatter velocity from the corpse burst, bleeding off.
        drop.vx *= 0.92
        drop.vy *= 0.92
      }

      drop.x = clamp(drop.x + drop.vx * dt, 6, ARENA_WIDTH - 6)
      drop.y = clamp(drop.y + drop.vy * dt, 6, ARENA_HEIGHT - 6)
    }
  }

  private collect(drop: Pickup): void {
    const player = this.player
    player.materials += drop.value
    player.xp += drop.value
    this.pickups.release(drop)

    while (player.xp >= player.xpToLevel) {
      player.xp -= player.xpToLevel
      player.level += 1
      player.xpToLevel = xpForLevel(player.level)
      this.pendingLevels += 1
      if (this.offers.length === 0) {
        this.offers = rollUpgradeOffers()
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
