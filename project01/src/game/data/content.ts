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
  | 'pellet'
  | 'beam'
  | 'fireball'
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

/**
 * What kind of attack a weapon makes, and therefore which attack power adds
 * to it.
 *
 * Melee is anything whose reach is arm's length dressed up -- the blades that
 * fan out of the player and the ring the reaper throws. Ranged is anything
 * fired down a line. Elemental is neither: damage that arrives as heat or
 * charge rather than as an object, and it exists as a family before it exists
 * as a weapon, because the stat that feeds it does.
 */
export type WeaponFamily = 'melee' | 'ranged' | 'elemental'

export const FAMILY_LABEL: Record<WeaponFamily, string> = {
  melee: '近戰',
  ranged: '遠程',
  elemental: '元素',
}

/** Which attack-power stat a family reads, beyond the universal one. */
export const FAMILY_POWER: Record<WeaponFamily, keyof PlayerStats> = {
  melee: 'meleePower',
  ranged: 'rangedPower',
  elemental: 'elementalPower',
}

export interface WeaponKind {
  id: string
  label: string
  family: WeaponFamily
  frame: SpriteFrame
  tint: number
  /** Base shop price at wave 1, before the wave markup. */
  price: number
  /** One line for the shop card. */
  detail: string
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
    family: 'ranged',
    label: '手槍',
    frame: 'bullet',
    tint: 0xfff0f6,
    price: 14,
    detail: '穩定的單發武器，射程中等。',
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
    family: 'melee',
    label: '碎裂刃',
    frame: 'blade',
    tint: 0x4fe6c0,
    price: 26,
    detail: '三片扇形飛刃，會穿透。近距離最強。',
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
  {
    id: 'shotgun',
    family: 'ranged',
    label: '散彈槍',
    frame: 'pellet',
    tint: 0xffb267,
    price: 32,
    detail: '五發散射，貼臉時全部命中。',
    cooldown: 1.25,
    damage: 4,
    range: 200,
    projectileSpeed: 520,
    projectileRadius: 5,
    pierce: 0,
    knockback: 14,
    count: 5,
    spread: 0.72,
    life: 0.42,
  },
  {
    id: 'railgun',
    family: 'ranged',
    label: '貫穿槍',
    frame: 'beam',
    tint: 0x8ad6ff,
    price: 48,
    detail: '射程極遠的穿透彈，冷卻很長。',
    cooldown: 1.9,
    damage: 26,
    range: 620,
    projectileSpeed: 940,
    projectileRadius: 6,
    pierce: 8,
    knockback: 4,
    count: 1,
    spread: 0,
    life: 0.95,
  },
  {
    id: 'dart',
    family: 'ranged',
    label: '飛針',
    frame: 'bullet',
    tint: 0xd0ff8a,
    price: 22,
    detail: '射速極快，單發傷害很低。',
    cooldown: 0.17,
    damage: 2,
    range: 380,
    projectileSpeed: 780,
    projectileRadius: 3,
    pierce: 0,
    knockback: 2,
    count: 1,
    spread: 0.06,
    life: 0.7,
  },
  {
    /*
     * The elemental weapon, and the reason that family exists on the stat
     * block. Slow, heavy and visible in flight: a fireball you can watch cross
     * the gap is a different thing from a bullet that is simply already there,
     * and it is what makes the family read as elemental rather than as another
     * gun with a warm tint.
     *
     * Single-target damage lands where the rest of the rack sits -- 14 over
     * 0.95s is 14.7 a second against the pistol's 14.3 -- with one pierce for
     * the crowd it is meant to be fired into.
     */
    id: 'firestaff',
    family: 'elemental',
    label: '魔導杖',
    frame: 'fireball',
    tint: 0xff8a3c,
    price: 38,
    detail: '射出緩慢的火球，體積大且會穿透一次。',
    cooldown: 0.95,
    damage: 14,
    range: 380,
    projectileSpeed: 340,
    projectileRadius: 11,
    pierce: 1,
    knockback: 12,
    count: 1,
    spread: 0,
    life: 1.3,
  },
  {
    id: 'reaper',
    family: 'melee',
    label: '收割鐮',
    frame: 'blade',
    tint: 0xd18aff,
    price: 44,
    detail: '朝八方甩出短刃，只打身邊。',
    cooldown: 1.5,
    damage: 7,
    range: 150,
    projectileSpeed: 300,
    projectileRadius: 9,
    pierce: 4,
    knockback: 16,
    count: 8,
    spread: 6.28,
    life: 0.5,
  },
]

/** Weapon slots a run may hold. */
export const MAX_WEAPON_SLOTS = 6

/** Tiers a weapon can reach by merging. */
export const MAX_WEAPON_TIER = 4

/**
 * Copies of one weapon at one tier that fuse into the next.
 *
 * Two, and the fusion is something the player does rather than something that
 * happens to them -- they drag one slot onto another on the equipment sheet.
 * It was three, and automatic, on the argument that three of a kind at one
 * tier are strictly worse than one of the next so asking would only be asking
 * whether the player wants to be stronger.
 *
 * That argument holds for the fusion itself and misses what the rack is for.
 * Six slots are a budget: whether to spend two of them on a pair that becomes
 * one stronger slot, or keep the pair and fire twice, is the decision -- and
 * an automatic merge takes it away before it can be made. At two the pair is
 * common enough for the choice to come up most waves.
 */
export const MERGE_COUNT = 2

/** One slot of the rack, as far as the merge rule is concerned. */
export interface MergeCandidate {
  kind: number
  tier: number
}

/**
 * Whether two rack slots may be fused.
 *
 * Lives here rather than in the simulation because both need it and they need
 * the same answer: the simulation to decide, and the equipment sheet to light
 * up the slots a dragged weapon could land on -- which it has to know before
 * the drop, not after. Two copies of a rule this fiddly would disagree the
 * first time either moved.
 *
 * Every clause is a refusal a player will meet. Same weapon, same tier, not
 * itself, and not already at the ceiling: a blade and a lance never fuse, and
 * neither do a tier I and a tier II of the same blade, which is the case that
 * looks like it ought to work.
 */
export function canMerge(a: MergeCandidate | undefined, b: MergeCandidate | undefined): boolean {
  return (
    a !== undefined &&
    b !== undefined &&
    a !== b &&
    a.kind === b.kind &&
    a.tier === b.tier &&
    a.tier < MAX_WEAPON_TIER
  )
}

/**
 * What a tier is worth.
 *
 * One curve for every weapon rather than four hand-written stat blocks each:
 * a tier is strictly "the same weapon, more of it", and writing that out six
 * times over would be six places to get inconsistent. Damage carries most of
 * it because that is what the merge is for -- the rate bump is small so a
 * high-tier weapon does not also drain the projectile pool.
 */
export function tierDamageScale(tier: number): number {
  return 1 + 0.7 * (tier - 1)
}

export function tierRateScale(tier: number): number {
  return 1 + 0.12 * (tier - 1)
}

/** Shop price of a weapon at a tier, before the wave markup. */
/**
 * The flat attack power that reaches one weapon.
 *
 * The universal stat plus the one for its family, and never any other -- a
 * melee build's points do nothing for the railgun on the same rack, which is
 * the entire point of splitting the stat up.
 */
export function attackPowerFor(stats: PlayerStats, family: WeaponFamily): number {
  return stats.attackPower + stats[FAMILY_POWER[family]]
}

export function weaponPrice(kind: number, tier: number): number {
  return Math.round(WEAPONS[kind].price * Math.pow(1.9, tier - 1))
}

export function findWeapon(id: string): number {
  return WEAPONS.findIndex((weapon) => weapon.id === id)
}

/* ---------- the wave curve ---------- */

/**
 * Waves get longer for the first while and then stop, so a late wave is harder
 * because more arrives, not because it takes longer to sit through.
 */
export function waveDuration(wave: number): number {
  return Math.min(20 + wave * 2, 46)
}

/**
 * Seconds between spawns.
 *
 * The floor used to be 0.1, which is ten a second, which against a wave
 * capped at 46 seconds is 460 -- and the curve reaches that floor at wave 16.
 * Every wave from the sixteenth onwards sent exactly the same 460 enemies, and
 * the only thing that grew after that was their health. A wave is meant to get
 * bigger as well as tougher.
 *
 * 0.035 is roughly two spawns per simulation step, which the director's while
 * loop already handles -- its own comment says so. The real ceiling is now the
 * enemy pool: spawns past capacity are dropped, which is the honest place for
 * a limit and the number the frame budget was measured against.
 */
export function spawnInterval(wave: number): number {
  return Math.max(0.035, 0.9 * Math.pow(0.86, wave - 1))
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
   * percentage on top of it. Order is (weapon + attack power) * damage, so a
   * percentage upgrade scales what levelling has already added rather than
   * ignoring it.
   *
   * This one is the universal half. The three below add on top of it for the
   * family they name, and a weapon reads exactly two of the four: this, and
   * its own. Splitting it this way rather than replacing it keeps a build that
   * mixes families viable -- the alternative is that every point of attack
   * power is dead weight on half the rack.
   */
  attackPower: number
  /** Flat damage, melee weapons only. */
  meleePower: number
  /** Flat damage, ranged weapons only. */
  rangedPower: number
  /** Flat damage, elemental weapons only. */
  elementalPower: number
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
   * Multiplies how far the player can see.
   *
   * Costs information, not reach: weapons fire past the dark and hit what is
   * there. What it takes away is knowing what is coming, which is why it is
   * worth trading away for something that shoots harder.
   */
  vision: number
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
  meleePower: 0,
  rangedPower: 0,
  elementalPower: 0,
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
  vision: 1,
  xpGain: 1,
}

export const BASE_MOVE_SPEED = 232
export const BASE_LOOT_RANGE = 108

/**
 * How far the player sees at vision 1.0.
 *
 * A look-and-feel number rather than a balance one, because weapons are not
 * capped by it: the window is 1280x720, so half its height is 360, half its
 * width 640 and the corner 734. At 560 the dark reaches in at the corners and
 * along the sides and the baseline feels like the game always did, with an
 * atmosphere. Below that it takes ground the player can feel losing: 0.7 is
 * 392, just past half the window's height, and 0.5 is 280, which is genuine
 * blindness.
 */
export const BASE_VISION = 560

/** How wide the edge of sight fades over, at vision 1.0. Scales with it, so
 *  low vision gets a proportionally tighter edge rather than a softer one. */
export const VISION_FADE = 0.22

export function visionRadius(stats: PlayerStats): number {
  return BASE_VISION * Math.max(0.15, stats.vision)
}

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
 *
 * It runs below zero as well, and has to. Base armour is nothing, so every
 * design in the game that charges armour was charging nothing: Rice's -3 and
 * the glass lens's -4 both read as a price on the screen and cost the player
 * exactly zero, because this used to clamp at the first point. Negative armour
 * now takes more damage on the mirrored curve -- -4 is 17% more, -20 is 50%
 * more -- which is what makes armour a currency a trade can spend.
 */
const ARMOUR_HALF_POINT = 20

export function armourReduction(armour: number): number {
  return armour / (Math.abs(armour) + ARMOUR_HALF_POINT)
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
  attackPower: { label: '所有攻擊力', group: 'offence' },
  meleePower: { label: '近戰攻擊力', group: 'offence' },
  rangedPower: { label: '遠程攻擊力', group: 'offence' },
  elementalPower: { label: '元素攻擊力', group: 'offence' },
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
  vision: { label: '視野', group: 'utility' },
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
  /*
   * The family cards give more per pick than the universal one does, and they
   * have to: a point that only counts on half the rack is worth less than a
   * point that counts everywhere, so at equal steps nobody would ever take
   * one. Drawn more often as well, since a run that has committed to a family
   * is the run they are for.
   */
  {
    id: 'meleePower',
    step: 1.6,
    effect: '+1.6',
    detail: '近戰武器的基礎傷害。',
    weight: 7,
  },
  {
    id: 'rangedPower',
    step: 1.6,
    effect: '+1.6',
    detail: '遠程武器的基礎傷害。',
    weight: 7,
  },
  {
    id: 'elementalPower',
    step: 1.6,
    effect: '+1.6',
    detail: '元素武器的基礎傷害。',
    weight: 7,
  },
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
    id: 'vision',
    step: 0.15,
    effect: '+15%',
    detail: '看得更遠，來的東西更早出現。',
    /* Rarer than the other utility cards. It buys information rather than a
       number, so it is worth most to a run that has already traded some away
       -- and a run that never did should not keep being offered it. */
    weight: 5,
    cap: 1.6,
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
 * Whether a card is worth offering to this rack at all.
 *
 * A family's attack power is dead weight to a run holding nothing of that
 * family, and a card that does nothing is worse than one card fewer -- the
 * same rule the cap already applies to a stat that has topped out. It also
 * settles the elemental family: there is no elemental weapon in the game yet,
 * so the card for it simply never comes up, and the day one exists it starts
 * appearing on its own.
 */
function offerableFor(id: UpgradeId, held: readonly { kind: number }[]): boolean {
  for (const family of Object.keys(FAMILY_POWER) as WeaponFamily[]) {
    if (id === FAMILY_POWER[family]) {
      return held.some((slot) => WEAPONS[slot.kind].family === family)
    }
  }
  return true
}

/**
 * Draws the choices for one level.
 *
 * Weighted, without repeats, and skipping anything already at its cap -- a
 * card the player cannot benefit from is worse than one card fewer. Returns a
 * short list rather than padding with duplicates if the pool ever runs dry.
 */
export function rollUpgradeOffers(
  stats: PlayerStats,
  held: readonly { kind: number }[],
  random: () => number,
  count = OFFER_COUNT,
): UpgradeId[] {
  const pool = UPGRADES.filter(
    (upgrade) =>
      (upgrade.cap === undefined || stats[upgrade.id] < upgrade.cap) &&
      offerableFor(upgrade.id, held),
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
