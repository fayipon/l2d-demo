import type { EmblemTone } from '../components/Emblem'
import type { IconName } from '../components/icons'
import type { AttributeId } from '../game/data/attributes'
import type { UpgradeId } from '../game/data/content'
import type { ItemGrade, ShopItem } from '../game/data/shop'

/**
 * How a shop item looks, wherever it is drawn.
 *
 * A module of its own rather than two constants beside the sheet, because both
 * screens that draw an item need the same answer: the shop's card and the
 * equipment sheet's row are the same item and must not disagree about its rank
 * or its glyph. Exporting them from `Inventory.tsx` worked and cost React's
 * fast refresh, which stops working for any file that exports something that is
 * not a component.
 *
 * View-side, so `data/shop.ts` stays free of it -- the data file says what an
 * item does and how rare it is, and this says what that should look like.
 */

/**
 * How rare an item looks.
 *
 * Reads the grade rather than the price, because the grade is what rarity now
 * means -- see `ItemGrade`. The two were one axis until LUK started rolling a
 * grade, and the item that proves they should not be is 分裂彈: 68 coins and
 * the rarest thing on the shelf. Price-based rank drew it as merely expensive.
 */
export const TONE_BY_GRADE: Record<ItemGrade, EmblemTone> = {
  1: 'common',
  2: 'epic',
  3: 'legend',
}

/**
 * Which primary a stone raises, as a glyph.
 *
 * Each borrows the glyph of the derived stat it feeds -- STR wears the axe that
 * 近戰攻擊力 wears -- so a stone and the flat item that moves the same number
 * are recognisably about the same thing.
 */
const ATTR_ICON: Record<AttributeId, IconName> = {
  str: 'axe',
  agi: 'bolt',
  dex: 'bow',
  sta: 'heart',
  int: 'flame',
  luk: 'star',
}

/**
 * An item's medallion glyph: the first stat it moves, or the primary it raises.
 *
 * The first key of the literal, which is the order the detail string lists them
 * in -- so a new shop entry gets a sensible medallion for free and there is no
 * second table to forget to update. A stone has no `mods` at all and falls
 * through to its column.
 */
export const itemGlyph = (item: ShopItem, icon: Record<UpgradeId, IconName>): IconName => {
  const stat = item.mods && (Object.keys(item.mods)[0] as UpgradeId | undefined)
  if (stat) {
    return icon[stat]
  }
  const attr = item.attrs && (Object.keys(item.attrs)[0] as AttributeId | undefined)
  return attr ? ATTR_ICON[attr] : 'sigil'
}
