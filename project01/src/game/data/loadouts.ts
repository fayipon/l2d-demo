import type { PlayerStats } from './content'

/**
 * What each lobby character brings into the arena.
 *
 * Keyed by the roster id rather than stored on the roster entry, so
 * features/character.ts stays lobby data and the game keeps its own numbers.
 * Adding a character to the roster without a loadout here is not an error --
 * they simply start neutral.
 *
 * A trait is a real trade, not a bonus. Two characters both worth playing is
 * more interesting than one that is strictly better, so every plus here is
 * paid for by a minus, and the pairs are chosen to push different builds:
 * Haru wants to be in the crowd, Hiyori wants to never be touched, Mao wants
 * the run to be long, Rice wants it to be over quickly.
 */
export interface ArenaLoadout {
  /** Added to the base stat block at the start of a run. */
  mods: Partial<PlayerStats>
  /** Weapon id the run opens with. */
  weapon: string
  /** Shown on the character screen and on the arena's own start. */
  trait: string
}

export const ARENA_LOADOUTS: Record<string, ArenaLoadout> = {
  haru: {
    // Heavy and slow: made to stand in the crowd and cut through it.
    mods: { attackPower: 3, maxHp: 25, armour: 4, moveSpeed: -0.1 },
    weapon: 'shredder',
    trait: '緋月劍士：近身作戰能力強，但腳步沉重。',
  },
  hiyori: {
    // Never gets hit, cannot take one either.
    mods: { moveSpeed: 0.22, dodge: 0.12, lootRange: 0.35, maxHp: -20 },
    weapon: 'dart',
    trait: '晨風信使：極快且難以命中，但相當脆弱。',
  },
  mao: {
    // Scales instead of starting strong.
    mods: { xpGain: 0.3, regen: 0.5, range: 0.15, attackSpeed: -0.1 },
    weapon: 'pistol',
    trait: '書庫看守：成長最快，起手最弱。',
  },
  rice: {
    // A glass cannon that gets its damage up front.
    mods: { attackPower: 2, critChance: 0.12, critDamage: 0.5, armour: -3, maxHp: -10 },
    weapon: 'railgun',
    trait: '銀鈴守望：暴擊為主，防禦幾乎沒有。',
  },
}

/** Neutral, for a character with no loadout written yet. */
export const DEFAULT_LOADOUT: ArenaLoadout = {
  mods: {},
  weapon: 'pistol',
  trait: '',
}

export function loadoutFor(characterId: string): ArenaLoadout {
  return ARENA_LOADOUTS[characterId] ?? DEFAULT_LOADOUT
}
