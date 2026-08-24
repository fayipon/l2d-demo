import type { PlayerStats } from './content'

/**
 * Class skills: the passives a character brings into a run, and the only
 * skills the simulation has ever heard of.
 *
 * Declared, not written as functions. `data/` in this project is data -- no
 * Phaser, no simulation -- so a skill is a record with an effect of a known
 * shape, and `World.recomputeStats` knows how to apply each shape. A skill that
 * was an arbitrary callback would put simulation logic in the data layer and
 * make the recompute impossible to follow in one read; this way every skill in
 * the game is visible in one table.
 *
 * The cost is that a genuinely new kind of skill needs a new shape here and a
 * branch in the recompute. That is the right cost. Two shapes cover Haru, and
 * the third one should have to justify itself.
 *
 * Not to be confused with `features/character.ts`'s skill list, which is
 * fiction with levels and cooldowns that nothing reads. These are the real
 * ones; both are on screen, labelled apart, until there is enough of this to
 * replace all of that.
 */

/** Stats a skill is allowed to scale from an item. Armour and health are the
 *  two a defensive class is about, and widening it is a decision rather than a
 *  convenience. */
export type ItemBonusStat = Extract<keyof PlayerStats, 'armour' | 'maxHp'>

export type SkillEffect =
  /**
   * Multiplies the named stats where they come from a bought item, and only
   * there. Attributes, the class's own modifiers and the base block are all
   * untouched: the skill is about what the shop sold you.
   */
  | { sort: 'itemBonus'; stats: readonly ItemBonusStat[]; multiplier: number }
  /**
   * Adds to regeneration from the finished block.
   *
   * Read after everything else is summed, which is what makes it compound with
   * an `itemBonus` on the same character -- the armour it reads is the doubled
   * armour. That ordering is the whole of Haru: defence buys defence.
   *
   * Both numbers are *rates*, because `regen` is a fraction of maximum health
   * per second and not a number of points -- see `PlayerStats.regen`. There is
   * deliberately no term reading maximum health: the payout already multiplies
   * by it, so a `fromMaxHp` would be squared, and the health half of an
   * `itemBonus` reaches regeneration through that multiplication instead.
   */
  | { sort: 'regenFrom'; base: number; fromArmour: number }

export interface ClassSkill {
  id: string
  name: string
  /** Badge text. Everything here is passive so far; the field exists so the
   *  screens do not have to assume it. */
  kind: string
  description: string
  effect: SkillEffect
}

/**
 * Haru: defence buys defence.
 *
 * The two are chosen to compound rather than to add. Mastery makes an armour
 * charm worth twice what the shop charged for it, and regeneration turns that
 * armour into health per second -- so a coin spent on defence pays twice, which
 * is what makes the class a build rather than a stat line.
 *
 * The regeneration numbers are the ones to turn, and they are a compromise
 * rather than a conversion. `regen` is multiplied by a bar that grows about
 * five times over a run, so an armour term matched to the opening is five times
 * too strong at the top and one matched to the top is a fifth of what it should
 * be at wave one -- both ends cannot be held at once. These give up a little of
 * the opening for a ceiling short of immortality:
 *
 *   opening, 2.6 armour                    0.45%/s   0.12 HP/s on a 26 bar
 *   STA 255, no items, 20 armour           1.5 %/s   2.1  HP/s on a 137 bar
 *   STA 255, three 護符 and a 重甲板         3.2 %/s   4.4  HP/s
 *
 * The last row is the one to watch: it is roughly four times what the same
 * build regenerated when the stat was flat, which is what the change was for
 * and the first place to look if it plays too strong.
 *
 * Whether that is irrelevant or decisive is not knowable without playing it,
 * which is why they are two numbers in one place.
 */
export const HARU_SKILLS: readonly ClassSkill[] = [
  {
    id: 'bulwark',
    name: '防禦專精',
    kind: '被動',
    description: '道具提供的護甲與生命上限加倍。',
    effect: { sort: 'itemBonus', stats: ['armour', 'maxHp'], multiplier: 2 },
  },
  {
    id: 'mending',
    name: '自然回復',
    kind: '被動',
    description: '持續回復生命，回復比例隨護甲提升。',
    effect: { sort: 'regenFrom', base: 0.003, fromArmour: 0.0006 },
  },
]

/** What a character with no skills written yet has. Shared rather than a fresh
 *  literal per loadout, so "no skills" is one object and identity comparisons
 *  hold. */
export const NO_SKILLS: readonly ClassSkill[] = []
