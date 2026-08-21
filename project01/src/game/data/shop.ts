import {
  MAX_WEAPON_SLOTS,
  MAX_WEAPON_TIER,
  WEAPONS,
  weaponPrice,
  type PlayerStats,
} from './content'

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
  { id: 'whetstone', label: '磨刀石', detail: '基礎攻擊 +2', price: 24, mods: { attackPower: 2 } },
  { id: 'fury', label: '狂怒符', detail: '攻擊力 +12%', price: 30, mods: { damage: 0.12 } },
  { id: 'trigger', label: '輕扳機', detail: '攻擊速度 +12%', price: 30, mods: { attackSpeed: 0.12 } },
  { id: 'splitter', label: '分裂彈', detail: '彈數 +1', price: 68, mods: { bonusCount: 1 } },
  { id: 'hawkeye', label: '鷹眼鏡', detail: '暴擊率 +8%', price: 32, mods: { critChance: 0.08 } },
  { id: 'killshot', label: '致命標記', detail: '暴擊傷害 +30%', price: 28, mods: { critDamage: 0.3 } },
  { id: 'longbarrel', label: '長槍管', detail: '射程 +15%', price: 22, mods: { range: 0.15 } },

  /* --- defence --- */
  { id: 'ironheart', label: '鐵心', detail: '生命上限 +25', price: 24, mods: { maxHp: 25 } },
  { id: 'ward', label: '護符', detail: '護甲 +6', price: 22, mods: { armour: 6 } },
  { id: 'salve', label: '再生藥膏', detail: '生命回復 +0.8/秒', price: 28, mods: { regen: 0.8 } },
  { id: 'bloodstone', label: '血晶', detail: '吸血 +0.5/命中', price: 34, mods: { lifesteal: 0.5 } },
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
    detail: '基礎攻擊 +5，生命上限 -15',
    price: 26,
    mods: { attackPower: 5, maxHp: -15 },
  },
  {
    id: 'heavyplate',
    label: '重甲板',
    detail: '護甲 +12，移動速度 -8%',
    price: 34,
    mods: { armour: 12, moveSpeed: -0.08 },
  },
  {
    id: 'glasslens',
    label: '琉璃鏡',
    detail: '暴擊率 +14%，護甲 -4',
    price: 36,
    mods: { critChance: 0.14, armour: -4 },
  },
  {
    id: 'siphon',
    label: '抽取器',
    detail: '吸血 +0.8/命中，攻擊速度 -10%',
    price: 38,
    mods: { lifesteal: 0.8, attackSpeed: -0.1 },
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
  /** Exactly what a full inventory can still absorb. Kind alone is not
   *  enough: offering a tier-3 copy to someone holding two tier-1s is a card
   *  that cannot be bought, which is worse than no card. */
  mergeable: MergeTarget[]
}

/**
 * Lays out one shop.
 *
 * Weapons only appear while there is somewhere for them to go: a free slot, or
 * a kind already held that a copy would fuse with. Otherwise the card would be
 * a purchase the player cannot make, which is worse than one card fewer.
 */
export function rollShop(context: RollContext, random: () => number): ShopOffer[] {
  const hasRoom = context.weaponCount < MAX_WEAPON_SLOTS
  const canTakeWeapon = hasRoom || context.mergeable.length > 0
  const offers: ShopOffer[] = []
  const usedItems = new Set<number>()

  for (let slot = 0; slot < SHOP_SLOTS; slot++) {
    const wantsWeapon = canTakeWeapon && random() < 0.34
    if (wantsWeapon) {
      let index: number
      let tier: number
      if (hasRoom) {
        index = Math.floor(random() * WEAPONS.length) % WEAPONS.length
        // Higher tiers show up later, and never above the merge ceiling.
        const ceiling = Math.min(MAX_WEAPON_TIER, 1 + Math.floor((context.wave - 1) / 5))
        tier = 1 + Math.floor(random() * ceiling)
      } else {
        const target = context.mergeable[Math.floor(random() * context.mergeable.length) % context.mergeable.length]
        index = target.kind
        tier = target.tier
      }
      offers.push({
        sort: 'weapon',
        index,
        tier,
        price: priceAtWave(weaponPrice(index, tier), context.wave),
      })
      continue
    }

    // Items do not repeat within one layout; a shop showing the same charm
    // twice reads as a bug whatever the odds say.
    let index = Math.floor(random() * SHOP_ITEMS.length)
    for (let guard = 0; guard < SHOP_ITEMS.length && usedItems.has(index); guard++) {
      index = (index + 1) % SHOP_ITEMS.length
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
