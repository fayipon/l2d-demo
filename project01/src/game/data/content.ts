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
  /**
   * Against the player's accuracy, per `hitChance` in data/attributes.
   *
   * Zero on every kind that exists, and that is not an oversight: the rule,
   * the DEX that feeds it and the checks that cover it were all built before
   * anything evades, so an evasive enemy is one number here rather than a
   * combat change arriving with the enemy that needs it.
   */
  evasion: number
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
    hp: 4,
    speed: 62,
    radius: 13,
    contactDamage: 2,
    drop: 1,
    xp: 1,
    mass: 1,
    evasion: 0,
    fromWave: 1,
    weight: 10,
  },
  {
    id: 'runner',
    label: '疾走者',
    frame: 'runner',
    tint: 0xffc74a,
    hp: 2,
    speed: 132,
    radius: 11,
    contactDamage: 1,
    drop: 1,
    xp: 1,
    mass: 0.7,
    evasion: 0,
    fromWave: 2,
    weight: 7,
  },
  {
    id: 'brute',
    label: '重甲者',
    frame: 'brute',
    tint: 0x7f2ce4,
    hp: 18,
    speed: 38,
    radius: 22,
    contactDamage: 4,
    drop: 4,
    xp: 4,
    mass: 3.2,
    evasion: 0,
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
    damage: 2,
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
    damage: 2,
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
    damage: 1.5,
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
    damage: 9,
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
    damage: 0.8,
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
    damage: 5,
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
    damage: 2.5,
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
/**
 * What a contact hit is multiplied by, by wave.
 *
 * New with the small-number scale, and forced by it. Contact damage was flat:
 * a brute hit for 14 whatever the wave, which was survivable against 151 health
 * and fine. Against the ten health a run opens with now -- and the hundred and
 * something a maxed STA build ends with -- a flat four would make the late game
 * unable to kill anyone at all.
 *
 * Gentler than the health curve and capped, because this one is measured
 * against a bar the player has been growing all run and the other is measured
 * against damage that grew faster. Past the cap the crowd gets bigger rather
 * than harder, which is the pressure this genre is supposed to apply.
 */
export function damageScale(wave: number): number {
  return Math.min(3.5, 1 + 0.055 * (wave - 1))
}

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
   * How much a kill pays, as a rate rather than a chance.
   *
   * Below one it is the chance of being paid at all: at 0.45 most kills drop
   * their coins and some drop nothing. At one every kill pays. *Above* one it
   * stops being a chance and starts being a multiplier -- 2.0 drops twice the
   * coins every time, and 1.5 drops the usual amount and then again half the
   * time.
   *
   * One number across the whole range rather than a chance and a bonus bolted
   * together, so a run that stacks it never crosses a boundary where the stat
   * changes meaning. See `World.kill`.
   */
  coinRate: number
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

/**
 * Where the coin rate starts.
 *
 * A kill used to pay every time, which made the drop a tax on walking over
 * there rather than a thing that happened. Below one it becomes an event: most
 * kills pay, some do not, and a run notices when a long stretch of them does
 * not.
 *
 * It is also the only place LUK reaches that is a *frequency* rather than a
 * size -- see PER_POINT.coinChance, which takes this to within a few percent of
 * certain at the attribute cap. That is what makes the stat worth buying for a
 * player who is already critting: it stops asking how big and starts asking how
 * often.
 *
 * Coins are experience as well as money, so this slows levelling by roughly
 * what it slows earning. Deliberate, and the curve to watch if a run starts
 * feeling flat.
 */
export const BASE_COIN_CHANCE = 0.45

export const BASE_STATS: Readonly<PlayerStats> = {
  attackPower: 0,
  meleePower: 0,
  rangedPower: 0,
  elementalPower: 0,
  maxHp: 10,
  regen: 0,
  lifesteal: 0,
  armour: 0,
  dodge: 0,
  damage: 1,
  // A little crit from the start, so the first point of LUK improves something
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
  coinRate: BASE_COIN_CHANCE,
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
 * The half point stayed at 20 through the small-number rescale, deliberately.
 * Armour did not shrink the way health did -- STA still carries it to 20 at the
 * attribute cap -- so the curve it is read against is still the right one, and
 * moving both would have been moving nothing.
 *
 * It runs below zero as well, and has to. Base armour is nothing, so every
 * design in the game that charges armour was charging nothing: the glass
 * lens's -2 read as a price on the screen and cost the player exactly zero,
 * because this used to clamp at the first point. Negative armour
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

/* ---------- the stat vocabulary ---------- */

/**
 * A derived stat, by name.
 *
 * Still called an upgrade id, because that is what the shop calls the things
 * it sells and what the equipment sheet is written against. What is gone is
 * the level-up card that used to draw from a list of these: a level applies
 * the class's growth now, and the attributes in data/attributes.ts are where
 * the numbers below come from.
 */
export type UpgradeId = keyof PlayerStats

/** Grouping. All it decides is the colour a stat is shown in. */
export type UpgradeGroup = 'offence' | 'defence' | 'utility'

/**
 * Name and grouping for every stat.
 *
 * Every one of them, whether anything sells it or not: a stat the player can
 * see on the sheet is a stat that needs a name, and several are only ever
 * moved by an attribute.
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
  coinRate: { label: '金幣掉落', group: 'utility' },
  xpGain: { label: '經驗加成', group: 'utility' },
}
