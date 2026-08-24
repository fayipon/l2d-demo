import {
  FAMILY_POWER,
  MAX_WEAPON_SLOTS,
  MAX_WEAPON_TIER,
  WEAPONS,
  weaponPrice,
  type PlayerStats,
  type WeaponFamily,
} from './content'
import type { AttributeId, Attributes } from './attributes'

/**
 * The shop between waves.
 *
 * Items write into the same stat block the level-up cards do -- that is the
 * whole reason the block is one flat object. An item does not need a system;
 * it needs a set of numbers and somewhere to add them.
 *
 * Several carry a drawback. A shop where every card is a straight gain is
 * arithmetic, not a decision: the interesting question is whether ten armour
 * is worth eight percent of your speed, and that question only exists if the
 * minus is real.
 */

/**
 * How transformative an entry is, and therefore how often LUK lets it appear.
 *
 * Deliberately not the price. Until this existed the shelf was sorted by cost
 * and luck moved a cursor along it, which made price and rarity the same axis
 * and meant a cheap item could never be rare. 分裂彈 is the case that broke it:
 * 68 coins, and +1 projectile changes every weapon on the rack at once. It
 * should be hard to find because of what it does, not because of what it costs.
 *
 * Price is what you pay. This is how often you are asked.
 */
export type ItemGrade = 1 | 2 | 3

export interface ShopItem {
  id: string
  label: string
  detail: string
  /** Base price at wave 1, before the wave markup. */
  price: number
  /** Which band of LUK is likely to be offered this. See `LUCK_BANDS`. */
  grade: ItemGrade
  /**
   * Added to the run's stats. Every field is additive, including the ones
   * that read as multipliers -- they are multipliers over a base of 1.
   *
   * Optional, because a stone has none: it moves a primary and lets the
   * derivation decide what that is worth.
   */
  mods?: Partial<PlayerStats>
  /**
   * Added to the run's primaries, before anything is derived from them.
   *
   * The other half of the shelf, and a different shape on purpose. Everything
   * above writes a finished number into the stat block; this writes into the
   * layer the block is computed *from*, so one stone moves every derived value
   * its column feeds and keeps moving them as the rest of the build changes.
   *
   * Summed into a working copy by `World.recomputeStats` and never into the
   * run's own attributes -- those are earned, by levelling, and an item that
   * wrote into them would be counted again on every rebuild.
   */
  attrs?: Partial<Attributes>
}

const BASE_ITEMS: ShopItem[] = [
  /* --- offence --- */
  { id: 'whetstone', label: '磨刀石', detail: '所有攻擊力 +1', price: 24, grade: 1, mods: { attackPower: 1 } },
  { id: 'gauntlet', label: '鐵手甲', detail: '近戰攻擊力 +1', price: 26, grade: 1, mods: { meleePower: 1 } },
  { id: 'sight', label: '瞄具', detail: '遠程攻擊力 +1', price: 26, grade: 1, mods: { rangedPower: 1 } },
  { id: 'emberstone', label: '燼石', detail: '元素攻擊力 +1', price: 26, grade: 1, mods: { elementalPower: 1 } },
  { id: 'fury', label: '狂怒符', detail: '攻擊力 +12%', price: 30, grade: 1, mods: { damage: 0.12 } },
  { id: 'trigger', label: '輕扳機', detail: '攻擊速度 +12%', price: 30, grade: 1, mods: { attackSpeed: 0.12 } },
  /* The only 3階 on the shelf that is not a stone, and the item the grade axis
     was invented for: cheap for what it does, and what it does is change every
     weapon slot at once rather than improving one number. */
  { id: 'splitter', label: '分裂彈', detail: '彈數 +1', price: 68, grade: 3, mods: { bonusCount: 1 } },
  { id: 'hawkeye', label: '鷹眼鏡', detail: '暴擊率 +8%', price: 32, grade: 1, mods: { critChance: 0.08 } },
  { id: 'killshot', label: '致命標記', detail: '暴擊傷害 +30%', price: 28, grade: 1, mods: { critDamage: 0.3 } },
  { id: 'longbarrel', label: '長槍管', detail: '射程 +15%', price: 22, grade: 1, mods: { range: 0.15 } },

  /* --- defence --- */
  { id: 'ironheart', label: '鐵心', detail: '生命上限 +4', price: 24, grade: 1, mods: { maxHp: 4 } },
  { id: 'ward', label: '護符', detail: '護甲 +3', price: 22, grade: 1, mods: { armour: 3 } },
  { id: 'salve', label: '再生藥膏', detail: '生命回復 +1%/秒', price: 28, grade: 1, mods: { regen: 0.01 } },
  { id: 'bloodstone', label: '血晶', detail: '吸血 +0.15/命中', price: 34, grade: 1, mods: { lifesteal: 0.15 } },
  { id: 'shadowstep', label: '影步', detail: '閃避 +6%', price: 30, grade: 1, mods: { dodge: 0.06 } },

  /* --- utility --- */
  { id: 'lightboots', label: '輕靴', detail: '移動速度 +10%', price: 20, grade: 1, mods: { moveSpeed: 0.1 } },
  { id: 'lodestone', label: '磁石', detail: '拾取範圍 +40%', price: 18, grade: 1, mods: { lootRange: 0.4 } },
  { id: 'lantern', label: '提燈', detail: '視野 +25%', price: 24, grade: 1, mods: { vision: 0.25 } },
  /* 2階, with the coin items below and for the same reason: it does not improve
     a fight, it improves every purchase after it. */
  { id: 'tome', label: '智慧之書', detail: '經驗加成 +25%', price: 42, grade: 2, mods: { xpGain: 0.25 } },
  /*
   * Coin rate, which is the one stat on the shelf that changes meaning as it
   * grows. Under 100% these buy the chance of being paid; over it they buy a
   * second and a third payout -- see PlayerStats.coinRate, and COIN_RATE_CAP,
   * which is where the stacking stops.
   *
   * Priced above their apparent worth on purpose. Coins are experience as well
   * as money, so a rate item pays for itself twice and compounds into every
   * other purchase, which is the one thing on this shelf that does.
   */
  { id: 'charm', label: '幸運符', detail: '金幣掉落 +25%', price: 30, grade: 1, mods: { coinRate: 0.25 } },
  { id: 'pouch', label: '賞金袋', detail: '金幣掉落 +55%', price: 62, grade: 2, mods: { coinRate: 0.55 } },

  /* --- trades --- */
  {
    id: 'recklessblade',
    label: '亡命之刃',
    detail: '所有攻擊力 +2，生命上限 -3',
    price: 26,
    grade: 1,
    mods: { attackPower: 2, maxHp: -3 },
  },
  {
    id: 'heavyplate',
    label: '重甲板',
    detail: '護甲 +5，移動速度 -8%',
    price: 34,
    grade: 1,
    mods: { armour: 5, moveSpeed: -0.08 },
  },
  /* The trades with a drawback big enough to build around are 2階. A real price
     is a decision about the shape of a run; a small one is a discount. */
  {
    id: 'glasslens',
    label: '琉璃鏡',
    detail: '暴擊率 +14%，護甲 -2',
    price: 36,
    grade: 2,
    mods: { critChance: 0.14, armour: -2 },
  },
  {
    id: 'siphon',
    label: '抽取器',
    detail: '吸血 +0.25/命中，攻擊速度 -10%',
    price: 38,
    grade: 2,
    mods: { lifesteal: 0.25, attackSpeed: -0.1 },
  },
  /*
   * Greed, and the price is health rather than coins.
   *
   * The straight coin items are cheap enough to be an easy yes, so the trade
   * has to charge something the shelf cannot sell back. Three of a maximum
   * health of twenty-six is more than a tenth of the bar at the point in a run
   * where anybody is buying this.
   */
  {
    id: 'greedseal',
    label: '貪婪之印',
    detail: '金幣掉落 +80%，生命上限 -3',
    price: 46,
    grade: 2,
    mods: { coinRate: 0.8, maxHp: -3 },
  },
  /*
   * The one thing in the game that takes vision away, and the reason the stat
   * can move downward at all: every card only ever adds, so without a trade
   * like this "lower value, smaller visible area" would never happen to
   * anybody. Priced as a bargain, because what it costs is not on the strip --
   * you find out what 30% less sight is worth by playing the next wave in it.
   */
  {
    id: 'bloodgoggles',
    label: '血色鏡片',
    detail: '攻擊力 +20%，視野 -30%',
    price: 30,
    grade: 1,
    mods: { damage: 0.2, vision: -0.3 },
  },
]

/* ---------- the stones ---------- */

/** The three grades a stone comes in. Points and prices are per column. */
const STONE_GRADES: readonly { grade: ItemGrade; name: string }[] = [
  { grade: 1, name: '原石' },
  { grade: 2, name: '結晶' },
  { grade: 3, name: '神髓' },
]

/**
 * One column per attribute: what its three stones give, and what they cost.
 *
 * Generated from this rather than written out eighteen times, because what
 * matters is the shape of the ladder and eighteen literals would bury it.
 *
 * **Prices differ by column** because a point is not worth the same in each.
 * Against what the shelf already charges for the same effect: a point of STA is
 * about 3.6 coins (鐵心 and 護符), AGI about 1.8 (輕扳機 and 影步), LUK about
 * 0.7 plus a premium for the shelf it buys, and STR, DEX and INT about 1.3 each
 * -- they feed exactly one derived number apiece. Priced alike, one stone would
 * be strictly the best buy at every grade.
 *
 * **STA carries fewer points** for the same reason from the other direction. At
 * three times the value of a STR point, an equal-point 體魄神髓 would cost 430
 * and be the only stone anybody saves for. Halving its points is the one
 * exception in the table and it is here rather than in six different numbers.
 *
 * **The ladder is priced against measured income, not against the cap.** A bot
 * that cannot die and buys nothing earns about 130 coins a wave from wave 12 on
 * -- income plateaus there while `priceAtWave` keeps climbing -- and banks
 * roughly 1200 by wave 15. So the top row is set so that the card reads 400-600
 * in the window a run would actually buy one, which is waves 12 to 18. An
 * earlier draft put the 神髓 base at 400-500, which the same markup turned into
 * 1300-2000 on the card: more than the entire run had earned, for the 體魄 one.
 *
 * What a grade III buys at that price is not efficiency -- six 鐵手甲 is the
 * same attack power for less -- it is a **shop slot**. Four offers a visit, no
 * repeats in a layout, and a rolled shelf mean six 鐵手甲 is six separate
 * visits that each have to offer one. Coins are something a good run has;
 * bandwidth is not.
 */
const STONE_COLUMNS: readonly {
  id: AttributeId
  label: string
  points: readonly [number, number, number]
  prices: readonly [number, number, number]
}[] = [
  { id: 'str', label: '力量', points: [12, 45, 120], prices: [16, 58, 155] },
  { id: 'dex', label: '技巧', points: [12, 45, 120], prices: [16, 58, 155] },
  { id: 'int', label: '智慧', points: [12, 45, 120], prices: [16, 58, 155] },
  { id: 'agi', label: '敏捷', points: [12, 45, 120], prices: [22, 80, 215] },
  { id: 'luk', label: '幸運', points: [12, 45, 120], prices: [18, 68, 180] },
  { id: 'sta', label: '體魄', points: [6, 22, 58], prices: [22, 79, 209] },
]

const STONES: ShopItem[] = STONE_COLUMNS.flatMap((column) =>
  STONE_GRADES.map((tier, i) => ({
    id: `${column.id}-${tier.grade}`,
    label: `${column.label}${tier.name}`,
    detail: `${column.id.toUpperCase()} +${column.points[i]}`,
    price: column.prices[i],
    grade: tier.grade,
    attrs: { [column.id]: column.points[i] } as Partial<Attributes>,
  })),
)

export const SHOP_ITEMS: ShopItem[] = [...BASE_ITEMS, ...STONES]

/** How many cards the shop lays out. */
export const SHOP_SLOTS = 4

/**
 * Prices climb with the wave.
 *
 * Coin income grows with the crowd, so a flat price list means the shop is
 * unaffordable at wave one and free by wave ten. This keeps roughly the same
 * number of purchases per visit throughout.
 */
export function priceAtWave(base: number, wave: number): number {
  return Math.max(1, Math.round(base * (1 + 0.16 * (wave - 1))))
}

/**
 * What a weapon fetches when sold.
 *
 * The base is what the shop would charge for that exact weapon right now, so
 * the number on a rack slot is on the same scale as the numbers on the cards
 * beside it -- a resale value quoted against a list price nobody is being
 * shown would be a number to nowhere.
 *
 * The tier rate is a tax on merging: full price at tier I, ten points off for
 * every tier above it. Two tier-I blades sell for 52 apiece-and-apiece; fused
 * and sold they fetch 44. Fusing is for fighting with, not for resale.
 */
export function sellRate(tier: number): number {
  return Math.max(0.1, 1 - 0.1 * (tier - 1))
}

export function weaponSellValue(kind: number, tier: number, wave: number): number {
  return Math.max(1, Math.round(priceAtWave(weaponPrice(kind, tier), wave) * sellRate(tier)))
}

/** What a reroll costs, given how many have already been bought this visit. */
export function rerollPrice(wave: number, used: number): number {
  return Math.round((3 + wave) * Math.pow(1.6, used))
}

export type ShopOffer =
  | { sort: 'item'; index: number; price: number }
  | { sort: 'weapon'; index: number; tier: number; price: number }

/** A kind and tier the player already holds two of, so a third would fuse. */
export interface MergeTarget {
  kind: number
  tier: number
}

interface RollContext {
  wave: number
  /** Slots in use, so a full inventory stops being offered weapons it has
   *  nowhere to put. */
  weaponCount: number
  /** Kinds and tiers the rack could pair a further copy with. A bias, not a
   *  gate -- see below. */
  mergeable: MergeTarget[]
  /** Which weapon families the rack actually holds. An item that raises a
   *  family's attack power is worth nothing to a run holding none of it, and
   *  an item is worse than a card here: the card is one wasted pick, the item
   *  is coins. */
  families: WeaponFamily[]
  /** From LUK. Selects a band, and nothing finer -- see `LUCK_BANDS`. */
  luck: number
}

/* ---------- what luck buys ---------- */

interface LuckBand {
  /** Lowest LUK that falls in this band. */
  from: number
  /** Chance of rolling each grade, in grade order. Each row sums to 1. */
  weights: readonly [number, number, number]
}

/**
 * The whole of LUK's effect on the shelf, in one table.
 *
 * What this replaces was a cursor: the shelf was sorted by price and luck moved
 * where a walk along it started, from uniform at zero to 70% of the way up at
 * the attribute cap. Two things were wrong with it. Price and rarity were one
 * axis, so nothing could be cheap and rare. And what a given LUK was worth was
 * not a thing anybody could state -- it had to be simulated to be known, which
 * is a poor property for the one number a whole stat feeds.
 *
 * A player can read this table. So can a designer changing it, which is the
 * point: the table *is* the design, and `verify` asserts the rolls agree with
 * it rather than merely being plausible.
 *
 * The bands are placed against what a run can actually reach. Every class opens
 * between 8 and 30 LUK and grows a fraction of a point a level, so band I is
 * where the game is played until something is bought: Rice grows into band II
 * around level 21 and nobody else ever does. One 幸運結晶 is +45 and moves any
 * character into it immediately -- a single purchase visibly changing what the
 * shop offers for the rest of the run, which is the loop the stat has never had.
 *
 * Note the empty cell. At band I a 3階 item is not rare, it is unavailable:
 * 神髓 and 分裂彈 cannot be offered at all until LUK is bought or grown into.
 * That is a harder gate than the cursor ever applied, and it is why band I's
 * 25% matters -- without a route to the middle grade there would be nothing to
 * climb with.
 */
const LUCK_BANDS: readonly LuckBand[] = [
  { from: 0, weights: [0.75, 0.25, 0] },
  { from: 60, weights: [0.5, 0.35, 0.15] },
  { from: 140, weights: [0.25, 0.45, 0.3] },
]

/** Which band a run's LUK falls in, as an index. Also the number of extra
 *  weapon tiers it reaches -- see `rollShop`. */
export function luckBand(luck: number): number {
  let band = 0
  for (let i = 1; i < LUCK_BANDS.length; i++) {
    if (luck >= LUCK_BANDS[i].from) {
      band = i
    }
  }
  return band
}

/** Rolls a grade from a band's row. `roll` is 0..1. */
function rollGrade(band: number, roll: number): ItemGrade {
  const weights = LUCK_BANDS[band].weights
  let cursor = roll
  for (let g = 0; g < weights.length; g++) {
    cursor -= weights[g]
    if (cursor < 0) {
      return (g + 1) as ItemGrade
    }
  }
  /* Only reachable if a row sums below 1, which is a table that needs fixing
     rather than a case that needs handling. The cheap grade is the safe
     failure: it is the one every band can already roll. */
  return 1
}

/**
 * Which weapon family a primary's attack power belongs to.
 *
 * Only three columns have one. STA, AGI and LUK feed health, speed, dodge and
 * luck, which every rack in the game has a use for.
 *
 * DEX is in here despite also feeding accuracy, on the same grounds 瞄具 is
 * filtered: nothing in the game evades yet, so on a melee-only rack the
 * accuracy half is worth exactly nothing and the ranged half is worth nothing
 * either.
 */
const ATTR_FAMILY: Partial<Record<AttributeId, WeaponFamily>> = {
  str: 'melee',
  dex: 'ranged',
  int: 'elemental',
}

/**
 * Whether an item does anything for this rack. Only the family attack powers
 * can fail this; everything else applies to any run.
 *
 * Both routes to a family's attack power are checked, and the second one is new
 * with the stones. A 力量神髓 raises 近戰攻擊力 without naming it -- it moves
 * STR, and the derivation does the rest -- so a check that only read `mods`
 * let a ranged-only rack be sold 400 coins of melee damage it cannot use. That
 * is precisely the trap this function exists to close, and the stones made it
 * an order of magnitude more expensive to fall into.
 */
function itemSuits(item: ShopItem, families: WeaponFamily[]): boolean {
  const mods = item.mods
  if (mods) {
    for (const family of Object.keys(FAMILY_POWER) as WeaponFamily[]) {
      if (mods[FAMILY_POWER[family]] !== undefined && !families.includes(family)) {
        return false
      }
    }
  }

  const attrs = item.attrs
  if (attrs) {
    for (const key of Object.keys(attrs) as AttributeId[]) {
      const family = ATTR_FAMILY[key]
      if (family !== undefined && !families.includes(family)) {
        return false
      }
    }
  }

  return true
}

/**
 * Takes one item of the rolled grade, or the best one below it.
 *
 * Falling **downward** only, and that direction is the rule rather than an
 * implementation detail: 3階 is seven items and four slots can exhaust it, so a
 * grade coming up empty is ordinary. Falling upward instead would hand a band-I
 * run the rare shelf it has not earned, which is the one thing the table exists
 * to prevent.
 *
 * Allocates a candidate list per slot. Four of those per wave transition, and
 * never while the simulation is stepping.
 */
function takeFromGrade(
  grade: ItemGrade,
  shelf: number[],
  used: Set<number>,
  random: () => number,
): number {
  for (let g = grade; g >= 1; g--) {
    const pool = shelf.filter((index) => SHOP_ITEMS[index].grade === g && !used.has(index))
    if (pool.length > 0) {
      return pool[Math.floor(random() * pool.length) % pool.length]
    }
  }
  return -1
}

/**
 * Lays out one shop.
 *
 * Weapons only appear while there is a free slot. This used to also offer them
 * to a full rack whenever a copy would have fused on arrival, which was right
 * while merging was automatic and is a trap now that it is not: the purchase
 * would find no room, and the player would be looking at a card that does
 * nothing when clicked.
 *
 * With room, half the weapon cards are drawn from what the rack can already
 * pair with. Merging is the player's move now, and a shelf that never offers
 * the second half of a pair is a rule with nothing to use it on.
 */
export function rollShop(context: RollContext, random: () => number): ShopOffer[] {
  const canTakeWeapon = context.weaponCount < MAX_WEAPON_SLOTS
  const offers: ShopOffer[] = []
  const usedItems = new Set<number>()
  const band = luckBand(context.luck)
  /* Indices into SHOP_ITEMS, so the pick below walks a list where every entry
     is worth buying. No longer sorted: the grade decides what is reachable and
     price has stopped being the rarity axis. */
  const shelf = SHOP_ITEMS.map((_, index) => index).filter((index) =>
    itemSuits(SHOP_ITEMS[index], context.families),
  )

  for (let slot = 0; slot < SHOP_SLOTS; slot++) {
    const wantsWeapon = canTakeWeapon && random() < 0.34
    if (wantsWeapon) {
      let index: number
      let tier: number
      if (context.mergeable.length > 0 && random() < 0.5) {
        // The other half of a pair the rack is already holding.
        const target =
          context.mergeable[Math.floor(random() * context.mergeable.length) % context.mergeable.length]
        index = target.kind
        tier = target.tier
      } else {
        index = Math.floor(random() * WEAPONS.length) % WEAPONS.length
        /* Higher tiers show up later, and each band of luck reaches one
           further. The band is the same one the item grades come from, so
           there is one definition of what a step of LUK is worth rather than
           a second constant that can drift away from it. */
        const ceiling = Math.min(
          MAX_WEAPON_TIER,
          1 + Math.floor((context.wave - 1) / 5) + band,
        )
        tier = 1 + Math.floor(random() * ceiling)
      }
      offers.push({
        sort: 'weapon',
        index,
        tier,
        price: priceAtWave(weaponPrice(index, tier), context.wave),
      })
      continue
    }

    /* Items do not repeat within one layout; a shop showing the same charm
       twice reads as a bug whatever the odds say. */
    const index = takeFromGrade(rollGrade(band, random()), shelf, usedItems, random)
    if (index < 0) {
      // Every item that suits this rack is already on the shelf. Rare, and a
      // short shelf is the honest answer -- there is nothing left to offer.
      continue
    }
    usedItems.add(index)
    offers.push({
      sort: 'item',
      index,
      price: priceAtWave(SHOP_ITEMS[index].price, context.wave),
    })
  }

  return offers
}
