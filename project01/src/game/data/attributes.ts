import { BASE_STATS, type PlayerStats } from './content'

/**
 * The six primaries every derived number is computed from.
 *
 * The arena already had a flat block of nineteen derived stats -- melee power,
 * attack speed, dodge, armour and the rest -- and everything downstream is
 * written against it: the simulation, the shop, every weapon, the HUD and both
 * screens that show a stat. This layer sits *above* that block rather than
 * replacing it. Six numbers go in, a partial stat block comes out, and there is
 * exactly one place in the codebase that says what a point of STR is worth.
 *
 * Data only. No Phaser, no simulation -- the same rule the rest of `data/`
 * keeps -- which is what lets the character select screen read it without
 * pulling the arena in with it.
 */

export type AttributeId = 'str' | 'agi' | 'dex' | 'sta' | 'int' | 'luk'

/**
 * The ceiling on every attribute.
 *
 * Chosen rather than derived, and the scale below is built backwards from it:
 * a point is worth what it is worth so that 255 is somewhere worth arriving at.
 */
export const ATTRIBUTE_CAP = 255

export type Attributes = Record<AttributeId, number>

export const ZERO_ATTRIBUTES: Readonly<Attributes> = {
  str: 0,
  agi: 0,
  dex: 0,
  sta: 0,
  int: 0,
  luk: 0,
}

/**
 * What each attribute is called and what it does, for the screens.
 *
 * `feeds` is prose rather than a list of stat ids on purpose: two of the ten
 * things these drive -- accuracy and the shop's shelf -- are not entries in the
 * stat block at all, and a table that could only describe the eight that are
 * would need a second table beside it for the other two.
 */
export const ATTRIBUTES: readonly { id: AttributeId; label: string; feeds: string }[] = [
  { id: 'str', label: 'STR', feeds: '近戰攻擊力' },
  { id: 'agi', label: 'AGI', feeds: '攻速 · 閃避' },
  { id: 'dex', label: 'DEX', feeds: '命中 · 遠程攻擊力' },
  { id: 'sta', label: 'STA', feeds: '生命 · 防禦' },
  { id: 'int', label: 'INT', feeds: '魔法攻擊力' },
  { id: 'luk', label: 'LUK', feeds: '暴擊 · 金幣 · 品階' },
]

/**
 * What one point is worth.
 *
 * Linear, not curved. A curve would make the last hundred points worthless and
 * the cap decorative; linear makes 255 a real place to get to and keeps the
 * arithmetic something a player can do in their head. Every value here is
 * simply what the ceiling should be, divided by 255.
 *
 * Sized for a game that opens at ten health and a two-point hit. Maxed, STA is
 * worth +127 health and +20 armour, and each of the three power attributes is
 * worth +12.8 flat damage -- which on a nine-damage railgun at tier IV, with a
 * shelf of items and a crit, comes to about 350 a hit. The ceiling the whole
 * scale is built under is 1000, and the difference is deliberate: it is the
 * room left for weapons, tiers and skills that do not exist yet.
 *
 * `accuracy` and `shopLuck` are not stat-block entries -- see `PlayerStats`,
 * which has neither. They are returned separately by `deriveAttributes`.
 */
export const PER_POINT = {
  /** STR. Flat damage on melee weapons only. */
  meleePower: 0.05,
  /** AGI. Divides weapon cooldown. */
  attackSpeed: 0.004,
  /** AGI. Chance a contact hit is ignored. Runs into DODGE_CAP well before
   *  the attribute cap does, which is deliberate -- dodge is capped for a
   *  reason and AGI should hit that ceiling rather than raise it. */
  dodge: 0.0016,
  /** DEX. Flat damage on ranged weapons only. */
  rangedPower: 0.05,
  /** DEX. Against an enemy's evasion. See `hitChance`. */
  accuracy: 1,
  /** STA. Flat, on a base of 10. */
  maxHp: 0.5,
  /** STA. Points, run through `armourReduction` -- not a percentage. */
  armour: 0.08,
  /** INT. Flat damage on elemental weapons only. */
  elementalPower: 0.05,
  /** LUK. Chance a hit crits, on a base of 0.05. */
  critChance: 0.0012,
  /** LUK. Raises what the shop is willing to put on the shelf. */
  shopLuck: 1,
  /**
   * LUK. Added to the chance a kill drops anything at all.
   *
   * A kill is no longer guaranteed to pay, and this is the stat that buys the
   * guarantee back: at 0 it is BASE_COIN_CHANCE, and 255 points take it to
   * within a few percent of certain. Which makes LUK the only attribute that
   * changes how often something happens rather than how large it is.
   */
  coinChance: 0.002,
} as const

/** Everything the six produce: the stat-block half, and the two that are not
 *  in the stat block. */
export interface DerivedAttributes {
  stats: Partial<PlayerStats>
  /** Against an enemy's evasion, per `hitChance`. */
  accuracy: number
  /** Handed to the shop's roll. */
  shopLuck: number
  /** Added to the base chance a kill drops coins. Clamped with the base, not
   *  here -- the base is content and this is only what the attribute adds. */
  coinChance: number
}

export function deriveAttributes(attributes: Attributes): DerivedAttributes {
  const { str, agi, dex, sta, int: intel, luk } = attributes
  return {
    stats: {
      meleePower: str * PER_POINT.meleePower,
      rangedPower: dex * PER_POINT.rangedPower,
      elementalPower: intel * PER_POINT.elementalPower,
      attackSpeed: agi * PER_POINT.attackSpeed,
      dodge: agi * PER_POINT.dodge,
      maxHp: sta * PER_POINT.maxHp,
      armour: sta * PER_POINT.armour,
      critChance: luk * PER_POINT.critChance,
    },
    accuracy: dex * PER_POINT.accuracy,
    shopLuck: luk * PER_POINT.shopLuck,
    coinChance: luk * PER_POINT.coinChance,
  }
}

/**
 * Chance a shot lands.
 *
 * `acc / (acc + evasion)`, which is the shape worth having: it never reaches
 * zero, it never quite reaches one, and doubling accuracy against a fixed
 * evasion is a real improvement at every value rather than a wall.
 *
 * Nothing in the game evades yet -- every `EnemyKind.evasion` is 0, so this
 * returns 1 for all of them and the stat changes nothing today. That is the
 * reason to build it now: the rule, the stat, the readout and the checks all
 * land while nothing depends on them, and the first evasive enemy is then one
 * number on one kind rather than a combat change shipped alongside the enemy
 * that needs it.
 */
export function hitChance(accuracy: number, evasion: number): number {
  if (evasion <= 0) {
    return 1
  }
  return Math.max(0, accuracy) / (Math.max(0, accuracy) + evasion)
}

export function clampAttribute(value: number): number {
  return Math.max(0, Math.min(ATTRIBUTE_CAP, value))
}

export function clampAttributes(attributes: Attributes): Attributes {
  return {
    str: clampAttribute(attributes.str),
    agi: clampAttribute(attributes.agi),
    dex: clampAttribute(attributes.dex),
    sta: clampAttribute(attributes.sta),
    int: clampAttribute(attributes.int),
    luk: clampAttribute(attributes.luk),
  }
}

/**
 * The stat block a set of attributes alone produces.
 *
 * A *fresh* copy of the base every time, which is the whole discipline here.
 * The run's own purchases are added on top of this by the world; folding
 * attributes into the live block instead would add every point already spent a
 * second time on the next recompute, and the symptom -- stats that grow when
 * nothing bought anything -- is a long way from the cause.
 */
export function statsFrom(attributes: Attributes): PlayerStats {
  const derived = deriveAttributes(attributes).stats
  const stats = { ...BASE_STATS } as PlayerStats
  for (const [key, value] of Object.entries(derived)) {
    stats[key as keyof PlayerStats] += value as number
  }
  return stats
}
