/**
 * Arena content: what the enemies are, what the weapons do, how a wave ramps.
 *
 * Same arrangement as features/story.ts and features/achievements.ts -- the
 * numbers live in one file that the systems read, so tuning is an edit here
 * rather than a hunt through the simulation. Nothing in this file imports
 * Phaser or the world; it is data.
 */

/** Frame names in the procedurally baked atlas. See view/atlas.ts. */
export type SpriteFrame =
  | 'player'
  | 'grunt'
  | 'runner'
  | 'brute'
  | 'bullet'
  | 'blade'
  | 'material'

export interface EnemyKind {
  id: string
  label: string
  frame: SpriteFrame
  /** Multiply-tinted onto the white atlas shape. */
  tint: number
  hp: number
  /** Pixels per second. */
  speed: number
  radius: number
  contactDamage: number
  /** Material pickups dropped on death. */
  drop: number
  /** How much this one resists being shoved by a hit. */
  mass: number
  /** First wave this kind can appear on. */
  fromWave: number
  /** Relative spawn weight once it is available. */
  weight: number
}

export const ENEMY_KINDS: EnemyKind[] = [
  {
    id: 'grunt',
    label: '爬行者',
    frame: 'grunt',
    tint: 0xf4436c,
    hp: 12,
    speed: 62,
    radius: 13,
    contactDamage: 6,
    drop: 1,
    mass: 1,
    fromWave: 1,
    weight: 10,
  },
  {
    id: 'runner',
    label: '疾走者',
    frame: 'runner',
    tint: 0xffc74a,
    hp: 7,
    speed: 132,
    radius: 11,
    contactDamage: 5,
    drop: 1,
    mass: 0.7,
    fromWave: 2,
    weight: 7,
  },
  {
    id: 'brute',
    label: '重甲者',
    frame: 'brute',
    tint: 0x7f2ce4,
    hp: 58,
    speed: 38,
    radius: 22,
    contactDamage: 14,
    drop: 4,
    mass: 3.2,
    fromWave: 4,
    weight: 3,
  },
]

export interface WeaponKind {
  id: string
  label: string
  frame: SpriteFrame
  tint: number
  /** Seconds between volleys. */
  cooldown: number
  damage: number
  /** Beyond this the weapon holds fire. */
  range: number
  projectileSpeed: number
  projectileRadius: number
  /** Enemies a shot passes through before it is spent. 0 = stops at the first. */
  pierce: number
  /** Pixels the target is shoved on hit. */
  knockback: number
  /** Projectiles per volley. */
  count: number
  /** Total arc of a volley, in radians. */
  spread: number
  /** Seconds a shot lives, which is what actually bounds its reach. */
  life: number
}

export const WEAPONS: WeaponKind[] = [
  {
    id: 'pistol',
    label: '手槍',
    frame: 'bullet',
    tint: 0xfff0f6,
    cooldown: 0.42,
    damage: 6,
    range: 420,
    projectileSpeed: 620,
    projectileRadius: 4,
    pierce: 0,
    knockback: 6,
    count: 1,
    spread: 0,
    life: 0.9,
  },
  {
    id: 'shredder',
    label: '碎裂刃',
    frame: 'blade',
    tint: 0x4fe6c0,
    cooldown: 1.05,
    damage: 5,
    range: 240,
    projectileSpeed: 400,
    projectileRadius: 8,
    pierce: 3,
    knockback: 10,
    count: 3,
    spread: 0.55,
    life: 0.75,
  },
]

/* ---------- the wave curve ---------- */

/**
 * Waves get longer for the first while and then stop, so a late wave is harder
 * because more arrives, not because it takes longer to sit through.
 */
export function waveDuration(wave: number): number {
  return Math.min(20 + wave * 2, 46)
}

/** Seconds between spawns. Falls off fast early, then flattens. */
export function spawnInterval(wave: number): number {
  return Math.max(0.1, 0.9 * Math.pow(0.86, wave - 1))
}

/** Enemy health multiplier for the wave. */
export function healthScale(wave: number): number {
  return 1 + 0.24 * (wave - 1)
}

/** Enemy speed multiplier. Deliberately much flatter than health -- speed is
 *  what makes a wave unfair, health is what makes it long. */
export function speedScale(wave: number): number {
  return Math.min(1.45, 1 + 0.028 * (wave - 1))
}

/** Experience needed to reach the next level. */
export function xpForLevel(level: number): number {
  return Math.round(4 + level * 3.2 + level * level * 0.35)
}

/** Picks a kind for the wave, weighted. `roll` is 0..1. */
export function pickEnemyKind(wave: number, roll: number): number {
  let total = 0
  for (const kind of ENEMY_KINDS) {
    if (wave >= kind.fromWave) {
      total += kind.weight
    }
  }
  let cursor = roll * total
  for (let i = 0; i < ENEMY_KINDS.length; i++) {
    const kind = ENEMY_KINDS[i]
    if (wave < kind.fromWave) {
      continue
    }
    cursor -= kind.weight
    if (cursor <= 0) {
      return i
    }
  }
  return 0
}

/* ---------- level-up upgrades ---------- */

/**
 * What a level is worth.
 *
 * Weapons are described above as base numbers; the player's stats multiply
 * them at the moment of firing. That indirection is the point -- a weapon
 * never has to know an upgrade exists, and an upgrade never has to know which
 * weapons are equipped.
 */
export type UpgradeId = 'count' | 'attackSpeed' | 'damage'

export interface Upgrade {
  id: UpgradeId
  label: string
  detail: string
  /** Rendered by the overlay; see GamePage for the id-to-glyph mapping. */
  effect: string
}

export const UPGRADES: Upgrade[] = [
  {
    id: 'count',
    label: '增加彈數',
    detail: '每次射擊多一發，並自動散開。',
    effect: '+1 發',
  },
  {
    id: 'attackSpeed',
    label: '增加射速',
    detail: '所有武器的冷卻時間縮短。',
    effect: '+15% 射速',
  },
  {
    id: 'damage',
    label: '增加攻擊力',
    detail: '所有武器的傷害提升。',
    effect: '+15% 傷害',
  },
]

/** How much one pick of each moves the stat. */
export const UPGRADE_STEP = {
  count: 1,
  attackSpeed: 0.15,
  damage: 0.15,
} as const

/**
 * Extra shots need somewhere to go: a weapon with no spread would stack them
 * all on the same line and the upgrade would look like it did nothing. Each
 * shot past the weapon's own count widens the fan by this much.
 */
export const SPREAD_PER_EXTRA_SHOT = 0.13

/**
 * The choices offered for one level.
 *
 * Every upgrade, every time, because there are only three -- which still makes
 * a real decision (specialise or spread) without pretending to be a draw. When
 * the pool grows this is where it becomes a weighted sample, and nothing that
 * calls it has to change.
 */
export function rollUpgradeOffers(): UpgradeId[] {
  return UPGRADES.map((upgrade) => upgrade.id)
}
