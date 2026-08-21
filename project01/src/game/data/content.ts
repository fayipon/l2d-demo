/**
 * Arena content: what the enemies are, what the weapons do, how a wave ramps,
 * and what a run can change about the player.
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

/* ---------- the stat block ---------- */

/**
 * Everything a run can change about the player.
 *
 * One flat block, read by the systems at the moment they need it rather than
 * cached as derived values anywhere. That is what lets a single upgrade touch
 * every weapon slot without naming any of them, and it is where character
 * traits and shop items will write when they exist -- they need another
 * writer, not another mechanism.
 *
 * Additive fields start at 0 and multipliers at 1, so "no upgrades" is the
 * identity of the whole block.
 */
export interface PlayerStats {
  /** Flat. Also the ceiling live hp is clamped to. */
  maxHp: number
  /** HP per second. */
  regen: number
  /** HP per projectile hit. */
  lifesteal: number
  /** Points, run through armourReduction -- not a percentage. */
  armour: number
  /** 0..DODGE_CAP. Chance a contact hit is ignored outright. */
  dodge: number
  /** Multiplies weapon damage. */
  damage: number
  /** 0..1. */
  critChance: number
  /** Multiplies damage on a crit. */
  critDamage: number
  /** Divides weapon cooldown. */
  attackSpeed: number
  /** Extra projectiles per volley. */
  bonusCount: number
  /** Multiplies weapon range AND projectile lifetime -- see the note below. */
  range: number
  /** Multiplies movement speed. */
  moveSpeed: number
  /** Multiplies the pickup magnet radius. */
  lootRange: number
}

export const BASE_STATS: Readonly<PlayerStats> = {
  maxHp: 100,
  regen: 0,
  lifesteal: 0,
  armour: 0,
  dodge: 0,
  damage: 1,
  // A little crit from the start, so the first crit upgrade improves something
  // the player has already seen happen rather than introducing a new rule.
  critChance: 0.05,
  critDamage: 2,
  attackSpeed: 1,
  bonusCount: 0,
  range: 1,
  moveSpeed: 1,
  lootRange: 1,
}

export const BASE_MOVE_SPEED = 232
export const BASE_LOOT_RANGE = 108

/**
 * Dodge has to be capped or it stacks to invulnerability.
 *
 * A dodged hit still starts the invulnerability window. Without that, dodging
 * one enemy in a crowd hands the hit straight to the one behind it, and the
 * stat is worth almost nothing at any value.
 */
export const DODGE_CAP = 0.6

/**
 * Armour is points on a diminishing curve, not a flat percentage.
 *
 * Flat subtraction makes weak enemies harmless the moment armour passes their
 * damage; a flat percentage stacks to immunity. This form gives 50% at 20
 * points, 67% at 40, and never reaches 100.
 */
const ARMOUR_HALF_POINT = 20

export function armourReduction(armour: number): number {
  return armour <= 0 ? 0 : armour / (armour + ARMOUR_HALF_POINT)
}

/**
 * Extra shots need somewhere to go: a weapon with no spread of its own would
 * stack them all on the same line and the upgrade would look like it did
 * nothing. Each shot past the weapon's own count widens the fan by this much.
 */
export const SPREAD_PER_EXTRA_SHOT = 0.13

/* ---------- level-up upgrades ---------- */

export type UpgradeId = keyof PlayerStats

/** Grouping. All it decides is the card's colour. */
export type UpgradeGroup = 'offence' | 'defence' | 'utility'

export interface Upgrade {
  id: UpgradeId
  group: UpgradeGroup
  label: string
  /** Added to the stat on each pick. */
  step: number
  /** Shown on the card. Written out rather than derived, because "+15%",
   *  "+1 發" and "+0.6 /秒" have nothing in common to derive from. */
  effect: string
  detail: string
  /** Relative draw weight. The strongest upgrades are the rarest. */
  weight: number
  /** At or above this the upgrade stops being offered. */
  cap?: number
}

export const UPGRADES: Upgrade[] = [
  /* --- offence --- */
  {
    id: 'damage',
    group: 'offence',
    label: '攻擊力',
    step: 0.15,
    effect: '+15%',
    detail: '所有武器的傷害提升。',
    weight: 10,
  },
  {
    id: 'attackSpeed',
    group: 'offence',
    label: '攻擊速度',
    step: 0.15,
    effect: '+15%',
    detail: '所有武器的冷卻時間縮短。',
    weight: 10,
  },
  {
    id: 'bonusCount',
    group: 'offence',
    label: '彈數',
    step: 1,
    effect: '+1 發',
    detail: '每次射擊多一發，並自動散開。',
    // The strongest single pick in the pool, so the rarest.
    weight: 4,
  },
  {
    id: 'critChance',
    group: 'offence',
    label: '暴擊率',
    step: 0.06,
    effect: '+6%',
    detail: '命中時觸發暴擊的機率。',
    weight: 8,
  },
  {
    id: 'critDamage',
    group: 'offence',
    label: '暴擊傷害',
    step: 0.25,
    effect: '+25%',
    detail: '暴擊時的傷害倍率。',
    weight: 7,
  },

  /* --- defence --- */
  {
    id: 'maxHp',
    group: 'defence',
    label: '生命上限',
    step: 20,
    effect: '+20',
    detail: '上限提高，並立刻回復等量生命。',
    weight: 9,
  },
  {
    id: 'regen',
    group: 'defence',
    label: '生命回復',
    step: 0.6,
    effect: '+0.6 /秒',
    detail: '持續回復生命。',
    weight: 7,
  },
  {
    id: 'lifesteal',
    group: 'defence',
    label: '吸血',
    step: 0.4,
    effect: '+0.4 /命中',
    detail: '每次命中回復生命。',
    weight: 6,
  },
  {
    id: 'armour',
    group: 'defence',
    label: '護甲',
    step: 6,
    effect: '+6',
    detail: '減少受到的傷害，效果遞減。',
    weight: 8,
  },
  {
    id: 'dodge',
    group: 'defence',
    label: '閃避',
    step: 0.06,
    effect: '+6%',
    detail: '機率完全免疫一次傷害。',
    weight: 7,
    cap: DODGE_CAP,
  },

  /* --- utility --- */
  {
    id: 'range',
    group: 'utility',
    label: '射程',
    step: 0.12,
    effect: '+12%',
    detail: '武器射程與子彈飛行距離。',
    weight: 7,
  },
  {
    id: 'moveSpeed',
    group: 'utility',
    label: '移動速度',
    step: 0.08,
    effect: '+8%',
    detail: '移動更快。',
    weight: 8,
  },
  {
    id: 'lootRange',
    group: 'utility',
    label: '拾取範圍',
    step: 0.25,
    effect: '+25%',
    detail: '材料從更遠的地方被吸過來。',
    weight: 6,
  },
]

const UPGRADE_BY_ID = new Map(UPGRADES.map((upgrade) => [upgrade.id, upgrade]))

export function getUpgrade(id: UpgradeId): Upgrade | undefined {
  return UPGRADE_BY_ID.get(id)
}

/** How many cards a level offers. */
export const OFFER_COUNT = 3

/**
 * Draws the choices for one level.
 *
 * Weighted, without repeats, and skipping anything already at its cap -- a
 * card the player cannot benefit from is worse than one card fewer. Returns a
 * short list rather than padding with duplicates if the pool ever runs dry.
 */
export function rollUpgradeOffers(
  stats: PlayerStats,
  random: () => number,
  count = OFFER_COUNT,
): UpgradeId[] {
  const pool = UPGRADES.filter(
    (upgrade) => upgrade.cap === undefined || stats[upgrade.id] < upgrade.cap,
  )
  const picked: UpgradeId[] = []

  for (let n = 0; n < count && pool.length > 0; n++) {
    let total = 0
    for (const upgrade of pool) {
      total += upgrade.weight
    }
    let cursor = random() * total
    let index = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      cursor -= pool[i].weight
      if (cursor <= 0) {
        index = i
        break
      }
    }
    picked.push(pool[index].id)
    // Removed rather than re-rolled, so one level never offers the same card
    // twice and the draw cannot loop.
    pool.splice(index, 1)
  }

  return picked
}
