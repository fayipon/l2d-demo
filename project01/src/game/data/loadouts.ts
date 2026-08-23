import type { PlayerStats } from './content'
import type { Attributes } from './attributes'
import { HARU_SKILLS, NO_SKILLS, type ClassSkill } from './skills'

/**
 * What each lobby character brings into the arena.
 *
 * Keyed by the roster id rather than stored on the roster entry, so
 * features/character.ts stays lobby data and the game keeps its own numbers.
 * Adding a character to the roster without a loadout here is not an error --
 * they simply start neutral.
 *
 * A class is its attributes now. `start` is where the six begin and `growth`
 * is what a level adds to them, and between them they are the whole character:
 * two runs of the same one are the same curve, and two characters are visibly
 * different ones. That is what levelling buys since the card that used to be
 * chosen at each level stopped being a choice.
 *
 * A trait is still a real trade rather than a bonus, and the sums below say so
 * -- every start totals the same and every growth totals the same, so a
 * character is a shape and never a rank. Haru wants to be in the crowd, Hiyori
 * wants never to be touched, Mao wants the run to be long, Rice wants it over
 * quickly.
 */
export interface ArenaLoadout {
  /** Where the six primaries begin. Anything unnamed starts at zero. */
  start: Partial<Attributes>
  /**
   * Added to the primaries by every level.
   *
   * Fractional on purpose, and accumulated as floats: +1.4 STA a level is a
   * rate, and rounding it at each level would quietly make it +1.
   */
  growth: Partial<Attributes>
  /**
   * The handful of things no attribute says.
   *
   * Movement speed, pickup radius, vision -- there are six attributes and
   * nineteen stats, and the leftovers are not worth inventing a seventh
   * attribute for. Added to the block the same way an item's modifiers are.
   */
  mods: Partial<PlayerStats>
  /**
   * The class's passives, which the recompute reads.
   *
   * Held here rather than in a second table keyed by character id, because a
   * second table is a second place a character can be described and the two
   * can disagree. The skills themselves are declared in data/skills.ts; this
   * says which character has which.
   */
  skills: readonly ClassSkill[]
  /** Weapon id the run opens with. */
  weapon: string
  /** Shown on the character screen and on the arena's own start. */
  trait: string
}

export const ARENA_LOADOUTS: Record<string, ArenaLoadout> = {
  haru: {
    // Strength and stamina: made to stand in the crowd and cut through it.
    start: { str: 34, agi: 12, dex: 14, sta: 32, int: 8, luk: 10 },
    growth: { str: 1.6, agi: 0.4, dex: 0.5, sta: 1.5, int: 0.2, luk: 0.3 },
    mods: { moveSpeed: -0.1 },
    skills: HARU_SKILLS,
    weapon: 'shredder',
    trait: '緋月劍士：近身作戰能力強，但腳步沉重。',
  },
  hiyori: {
    // Never gets hit, cannot take one either.
    start: { str: 10, agi: 36, dex: 30, sta: 10, int: 8, luk: 16 },
    growth: { str: 0.3, agi: 1.8, dex: 1.4, sta: 0.4, int: 0.2, luk: 0.4 },
    mods: { moveSpeed: 0.22, lootRange: 0.35 },
    skills: NO_SKILLS,
    weapon: 'dart',
    trait: '晨風信使：極快且難以命中，但相當脆弱。',
  },
  mao: {
    // Scales instead of starting strong, and the scaling is INT.
    start: { str: 8, agi: 14, dex: 16, sta: 20, int: 34, luk: 18 },
    growth: { str: 0.2, agi: 0.5, dex: 0.6, sta: 0.9, int: 1.9, luk: 0.4 },
    mods: { xpGain: 0.3, regen: 0.5, range: 0.15 },
    skills: NO_SKILLS,
    weapon: 'pistol',
    trait: '書庫看守：成長最快，起手最弱。',
  },
  rice: {
    // A glass cannon that gets its damage up front, out of DEX and LUK.
    start: { str: 12, agi: 18, dex: 32, sta: 8, int: 10, luk: 30 },
    growth: { str: 0.3, agi: 0.6, dex: 1.7, sta: 0.2, int: 0.3, luk: 1.4 },
    mods: { critDamage: 0.5 },
    skills: NO_SKILLS,
    weapon: 'railgun',
    trait: '銀鈴守望：暴擊為主，防禦幾乎沒有。',
  },
}

/**
 * Neutral, for a character with no loadout written yet.
 *
 * Not all zeroes: a run with no attributes at all is a run with ten health and
 * no damage beyond the weapon's own, which reads as broken rather than as
 * unwritten. This is the average of the four above, flat.
 */
export const DEFAULT_LOADOUT: ArenaLoadout = {
  start: { str: 16, agi: 20, dex: 23, sta: 17, int: 15, luk: 19 },
  growth: { str: 0.6, agi: 0.8, dex: 1, sta: 0.7, int: 0.6, luk: 0.6 },
  mods: {},
  skills: NO_SKILLS,
  weapon: 'pistol',
  trait: '',
}

export function loadoutFor(characterId: string): ArenaLoadout {
  return ARENA_LOADOUTS[characterId] ?? DEFAULT_LOADOUT
}
