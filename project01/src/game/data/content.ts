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
  | 'coin'
  | 'bar'

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
  /** Coins dropped on death. Each is also worth one experience when collected. */
  drop: number
  /** Experience for the kill itself, before anything is picked up. */
  xp: number
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
    xp: 1,
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
    xp: 1,
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
    xp: 4,
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

/**
 * Experience needed to reach the next level.
 *
 * Raised when kills started paying experience of their own, but deliberately
 * by less than the income went up. The first attempt at this curve cancelled
 * the new source exactly -- level 10 by wave 7 either way -- which would have
 * made the whole change invisible. This one lands around level 12 by wave 7
 * against the same bot, so killing something out of reach is worth doing
 * without turning a wave into a queue of upgrade screens.
 */
export function xpForLevel(level: number): number {
  return Math.round(5 + level * 4.2 + level * level * 0.45)
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
  /**
   * Flat damage every weapon gains, added to its own before any multiplier.
   *
   * Separate from `damage` on purpose: this is attack power in the ordinary
   * sense -- a number the weapon carries into the fight -- while `damage` is a
   * percentage on top of it. Order is (weapon + attackPower) * damage, so a
   * percentage upgrade scales what levelling has already added rather than
   * ignoring it.
   */
  attackPower: number
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
  /**
   * Multiplies all experience, from both kills and coins.
   *
   * The one stat that compounds: it buys levels, and levels buy every other
   * stat. Taken early it is worth more than anything else on the card; taken
   * late it is nearly worthless, which is a real decision rather than a number
   * to add up.
   */
  xpGain: number
}

export const BASE_STATS: Readonly<PlayerStats> = {
  attackPower: 0,
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
  xpGain: 1,
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

/**
 * Name and grouping for every stat, including the ones no card offers.
 *
 * Kept apart from UPGRADES because attack power is granted by levelling and
 * never drawn, and it still has to be labelled on the HUD -- a stat that only
 * has a name when a card exists for it is a stat the player cannot read.
 */
export const STAT_INFO: Record<UpgradeId, { label: string; group: UpgradeGroup }> = {
  attackPower: { label: '基礎攻擊', group: 'offence' },
  damage: { label: '攻擊力', group: 'offence' },
  attackSpeed: { label: '攻擊速度', group: 'offence' },
  bonusCount: { label: '彈數', group: 'offence' },
  critChance: { label: '暴擊率', group: 'offence' },
  critDamage: { label: '暴擊傷害', group: 'offence' },
  maxHp: { label: '生命上限', group: 'defence' },
  regen: { label: '生命回復', group: 'defence' },
  lifesteal: { label: '吸血', group: 'defence' },
  armour: { label: '護甲', group: 'defence' },
  dodge: { label: '閃避', group: 'defence' },
  range: { label: '射程', group: 'utility' },
  moveSpeed: { label: '移動速度', group: 'utility' },
  lootRange: { label: '拾取範圍', group: 'utility' },
  xpGain: { label: '經驗加成', group: 'utility' },
}

export interface Upgrade {
  id: UpgradeId
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
    step: 0.15,
    effect: '+15%',
    detail: '所有武器的傷害提升。',
    weight: 10,
  },
  {
    id: 'attackSpeed',
    step: 0.15,
    effect: '+15%',
    detail: '所有武器的冷卻時間縮短。',
    weight: 10,
  },
  {
    id: 'bonusCount',
    step: 1,
    effect: '+1 發',
    detail: '每次射擊多一發，並自動散開。',
    // The strongest single pick in the pool, so the rarest.
    weight: 4,
  },
  {
    id: 'critChance',
    step: 0.06,
    effect: '+6%',
    detail: '命中時觸發暴擊的機率。',
    weight: 8,
  },
  {
    id: 'critDamage',
    step: 0.25,
    effect: '+25%',
    detail: '暴擊時的傷害倍率。',
    weight: 7,
  },

  /* --- defence --- */
  {
    id: 'maxHp',
    step: 20,
    effect: '+20',
    detail: '上限提高，並立刻回復等量生命。',
    weight: 9,
  },
  {
    id: 'regen',
    step: 0.6,
    effect: '+0.6 /秒',
    detail: '持續回復生命。',
    weight: 7,
  },
  {
    id: 'lifesteal',
    step: 0.4,
    effect: '+0.4 /命中',
    detail: '每次命中回復生命。',
    weight: 6,
  },
  {
    id: 'armour',
    step: 6,
    effect: '+6',
    detail: '減少受到的傷害，效果遞減。',
    weight: 8,
  },
  {
    id: 'dodge',
    step: 0.06,
    effect: '+6%',
    detail: '機率完全免疫一次傷害。',
    weight: 7,
    cap: DODGE_CAP,
  },

  /* --- utility --- */
  {
    id: 'range',
    step: 0.12,
    effect: '+12%',
    detail: '武器射程與子彈飛行距離。',
    weight: 7,
  },
  {
    id: 'moveSpeed',
    step: 0.08,
    effect: '+8%',
    detail: '移動更快。',
    weight: 8,
  },
  {
    id: 'lootRange',
    step: 0.25,
    effect: '+25%',
    detail: '金幣從更遠的地方被吸過來。',
    weight: 6,
  },
  {
    id: 'xpGain',
    step: 0.2,
    effect: '+20%',
    detail: '擊殺與金幣獲得的經驗都提升。',
    // Rare, because compounding into every other stat is the strongest thing
    // an upgrade can do -- and the earlier it is drawn the stronger it gets.
    weight: 5,
  },
]

const UPGRADE_BY_ID = new Map(UPGRADES.map((upgrade) => [upgrade.id, upgrade]))

export function getUpgrade(id: UpgradeId): Upgrade | undefined {
  return UPGRADE_BY_ID.get(id)
}

/**
 * Granted by every level on top of whatever card is chosen.
 *
 * The card is the decision; this is the floor under it. Without something
 * automatic, a run that keeps drawing utility cards gets no sturdier as the
 * waves scale, and levelling stops feeling like progress in the two numbers
 * that matter most.
 *
 * Deliberately small. It is a floor, not the reward -- if it were large the
 * card would stop mattering.
 */
export const LEVEL_BONUS = {
  /** Flat, and healed by the same amount. */
  maxHp: 4,
  /**
   * Flat attack power.
   *
   * This was a +4% multiplier, which at level 20 was worth +4.8 damage to the
   * pistol -- real, but invisible next to a weapon's own number. Flat is the
   * readable form: at level 20 it is +8, so the pistol goes from 6 to 14 and
   * the figure on the strip means something on its own.
   *
   * Slightly above what the multiplier gave, deliberately. Tune here.
   */
  attackPower: 0.4,
} as const

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
