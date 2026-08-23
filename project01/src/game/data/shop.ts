import {
  FAMILY_POWER,
  MAX_WEAPON_SLOTS,
  MAX_WEAPON_TIER,
  WEAPONS,
  weaponPrice,
  type PlayerStats,
  type WeaponFamily,
} from './content'
import { ATTRIBUTE_CAP } from './attributes'

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
export interface ShopItem {
  id: string
  label: string
  detail: string
  /** Base price at wave 1, before the wave markup. */
  price: number
  /** Added to the run's stats. Every field is additive, including the ones
   *  that read as multipliers -- they are multipliers over a base of 1. */
  mods: Partial<PlayerStats>
}

export const SHOP_ITEMS: ShopItem[] = [
  /* --- offence --- */
  { id: 'whetstone', label: '磨刀石', detail: '所有攻擊力 +1', price: 24, mods: { attackPower: 1 } },
  { id: 'gauntlet', label: '鐵手甲', detail: '近戰攻擊力 +1', price: 26, mods: { meleePower: 1 } },
  { id: 'sight', label: '瞄具', detail: '遠程攻擊力 +1', price: 26, mods: { rangedPower: 1 } },
  { id: 'emberstone', label: '燼石', detail: '元素攻擊力 +1', price: 26, mods: { elementalPower: 1 } },
  { id: 'fury', label: '狂怒符', detail: '攻擊力 +12%', price: 30, mods: { damage: 0.12 } },
  { id: 'trigger', label: '輕扳機', detail: '攻擊速度 +12%', price: 30, mods: { attackSpeed: 0.12 } },
  { id: 'splitter', label: '分裂彈', detail: '彈數 +1', price: 68, mods: { bonusCount: 1 } },
  { id: 'hawkeye', label: '鷹眼鏡', detail: '暴擊率 +8%', price: 32, mods: { critChance: 0.08 } },
  { id: 'killshot', label: '致命標記', detail: '暴擊傷害 +30%', price: 28, mods: { critDamage: 0.3 } },
  { id: 'longbarrel', label: '長槍管', detail: '射程 +15%', price: 22, mods: { range: 0.15 } },

  /* --- defence --- */
  { id: 'ironheart', label: '鐵心', detail: '生命上限 +4', price: 24, mods: { maxHp: 4 } },
  { id: 'ward', label: '護符', detail: '護甲 +3', price: 22, mods: { armour: 3 } },
  { id: 'salve', label: '再生藥膏', detail: '生命回復 +0.25/秒', price: 28, mods: { regen: 0.25 } },
  { id: 'bloodstone', label: '血晶', detail: '吸血 +0.15/命中', price: 34, mods: { lifesteal: 0.15 } },
  { id: 'shadowstep', label: '影步', detail: '閃避 +6%', price: 30, mods: { dodge: 0.06 } },

  /* --- utility --- */
  { id: 'lightboots', label: '輕靴', detail: '移動速度 +10%', price: 20, mods: { moveSpeed: 0.1 } },
  { id: 'lodestone', label: '磁石', detail: '拾取範圍 +40%', price: 18, mods: { lootRange: 0.4 } },
  { id: 'lantern', label: '提燈', detail: '視野 +25%', price: 24, mods: { vision: 0.25 } },
  { id: 'tome', label: '智慧之書', detail: '經驗加成 +25%', price: 42, mods: { xpGain: 0.25 } },

  /* --- trades --- */
  {
    id: 'recklessblade',
    label: '亡命之刃',
    detail: '所有攻擊力 +2，生命上限 -3',
    price: 26,
    mods: { attackPower: 2, maxHp: -3 },
  },
  {
    id: 'heavyplate',
    label: '重甲板',
    detail: '護甲 +5，移動速度 -8%',
    price: 34,
    mods: { armour: 5, moveSpeed: -0.08 },
  },
  {
    id: 'glasslens',
    label: '琉璃鏡',
    detail: '暴擊率 +14%，護甲 -2',
    price: 36,
    mods: { critChance: 0.14, armour: -2 },
  },
  {
    id: 'siphon',
    label: '抽取器',
    detail: '吸血 +0.25/命中，攻擊速度 -10%',
    price: 38,
    mods: { lifesteal: 0.25, attackSpeed: -0.1 },
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
    mods: { damage: 0.2, vision: -0.3 },
  },
]

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
  /**
   * From LUK, and coarse on purpose.
   *
   * It buys the shelf, not the price: a stat that made things cheaper would be
   * a coin stat, and coins already exist. Two effects, both blunt --
   * `LUCK_PER_TIER` points raise the tier the roll is willing to reach, and
   * the item pick leans towards the expensive end rather than being uniform.
   * The fine version of this is a later pass.
   */
  luck: number
}

/** Points of luck per extra tier the shelf will reach. At the attribute cap
 *  that is the whole tier range, which is what a maxed LUK should mean. */
const LUCK_PER_TIER = 85
/** How hard luck leans the item pick towards the expensive end, at the cap. */
const LUCK_ITEM_BIAS = 0.7

/** Whether an item does anything for this rack. Only the family attack powers
 *  can fail this; everything else applies to any run. */
function itemSuits(item: ShopItem, families: WeaponFamily[]): boolean {
  for (const family of Object.keys(FAMILY_POWER) as WeaponFamily[]) {
    if (item.mods[FAMILY_POWER[family]] !== undefined && !families.includes(family)) {
      return false
    }
  }
  return true
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
  const hasRoom = context.weaponCount < MAX_WEAPON_SLOTS
  const canTakeWeapon = hasRoom
  const offers: ShopOffer[] = []
  const usedItems = new Set<number>()
  /* Indices into SHOP_ITEMS, so the walk below that avoids repeats still walks
     a list where every entry is worth buying. */
  const shelf = SHOP_ITEMS.map((_, index) => index).filter((index) =>
    itemSuits(SHOP_ITEMS[index], context.families),
  )
  // Sorted cheap to expensive, so "further along the shelf" means "rarer".
  shelf.sort((a, b) => SHOP_ITEMS[a].price - SHOP_ITEMS[b].price)

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
        // Higher tiers show up later, luck reaches further, and neither goes
        // above the merge ceiling.
        const ceiling = Math.min(
          MAX_WEAPON_TIER,
          1 + Math.floor((context.wave - 1) / 5) + Math.floor(context.luck / LUCK_PER_TIER),
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
       twice reads as a bug whatever the odds say.

       Luck skews where the walk starts, over a shelf sorted by price: at zero
       it is uniform and rolls exactly what it rolled before this stat existed,
       and at the cap it starts most of the way up the expensive end. Skewing
       the start rather than filtering the shelf keeps every item reachable at
       every value, which is the difference between luck and a gate. */
    const bias = Math.min(1, context.luck / ATTRIBUTE_CAP) * LUCK_ITEM_BIAS
    const roll = random()
    let cursor = Math.floor((bias + (1 - bias) * roll) * shelf.length) % shelf.length
    for (let guard = 0; guard < shelf.length && usedItems.has(shelf[cursor]); guard++) {
      cursor = (cursor + 1) % shelf.length
    }
    const index = shelf[cursor]
    usedItems.add(index)
    offers.push({
      sort: 'item',
      index,
      price: priceAtWave(SHOP_ITEMS[index].price, context.wave),
    })
  }

  return offers
}
