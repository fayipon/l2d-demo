import {
  BASE_LOOT_RANGE,
  BASE_MOVE_SPEED,
  BASE_VISION,
  FAMILY_LABEL,
  STAT_INFO,
  WEAPONS,
  attackPowerFor,
  findWeapon,
  type PlayerStats,
  type UpgradeId,
} from '../game/data/content'
import { ARENA_LOADOUTS, DEFAULT_LOADOUT, loadoutFor } from '../game/data/loadouts'
import type { ClassSkill } from '../game/data/skills'
import {
  ATTRIBUTES,
  ATTRIBUTE_CAP,
  ZERO_ATTRIBUTES,
  clampAttributes,
  statsFrom,
  type AttributeId,
} from '../game/data/attributes'

/**
 * What a character actually brings into the arena, derived rather than written.
 *
 * The roster used to carry a hand-written stat block -- 攻擊 1842, 防禦 1216 --
 * which was invented, on a scale nothing else in the game uses, and unrelated
 * to what the character does when you press start. Two sets of numbers for one
 * character is one set of numbers and one piece of fiction, and the fiction is
 * the one people read before choosing.
 *
 * So this computes the roster screen from the same loadout the run is built
 * from. Tune a mod in loadouts.ts and the selection screen follows; there is
 * nothing left to keep in sync because there is only one number.
 */

export interface ProfileRow {
  id: string
  label: string
  /** Already formatted -- these are four different kinds of number. */
  text: string
  /** Bar fill, normalised across the roster so the bars compare characters
   *  against each other rather than against an invented ceiling. */
  ratio: number
}

export interface ProfileMod {
  id: UpgradeId
  label: string
  text: string
  /** Whether this one is the price rather than the point. */
  penalty: boolean
}

/** One of the six primaries, as a character card shows it. */
export interface ProfileAttribute {
  id: AttributeId
  label: string
  /** What it feeds, so the card can say why the number matters. */
  feeds: string
  /** Where it starts. */
  value: number
  /** What a level adds to it. The shape of a class is as much this as it is
   *  the starting numbers -- Mao starts weak and out-grows everyone. */
  growth: number
  /** Against ATTRIBUTE_CAP, for a bar. */
  ratio: number
}

export interface ArenaProfile {
  /** The class's real passives, straight off the loadout. Not to be confused
   *  with `Character.skills`, which is the fictional list this screen has
   *  shown since before the arena had any. */
  skills: readonly ClassSkill[]
  attributes: ProfileAttribute[]
  rows: ProfileRow[]
  mods: ProfileMod[]
  weapon: {
    label: string
    family: string
    detail: string
    damage: number
    cooldown: number
    range: number
    count: number
  } | null
  trait: string
}

/** The six a run opens with. */
function openingAttributes(characterId: string) {
  return clampAttributes({ ...ZERO_ATTRIBUTES, ...loadoutFor(characterId).start })
}

/**
 * The stat block a run opens with: the base, the character's attributes, and
 * whatever their loadout adds on top.
 *
 * The same order the world's own recompute uses, and for the same reason -- if
 * this screen and the arena disagreed about what a character opens with, the
 * screen would be the one lying.
 */
function openingStats(characterId: string): PlayerStats {
  const stats = statsFrom(openingAttributes(characterId))
  for (const [key, value] of Object.entries(loadoutFor(characterId).mods)) {
    stats[key as keyof PlayerStats] += value as number
  }
  return stats
}

/**
 * Opening damage per second against a single target.
 *
 * One number for "攻擊" has to come from somewhere, and the honest source is
 * the weapon they start with run through their own stats -- a character whose
 * trait is attack power and a character whose trait is attack speed both show
 * up here, which is what the row is for. Volley count is in it because a
 * three-blade fan really does put three blades in the air.
 */
function openingDps(characterId: string): number {
  const stats = openingStats(characterId)
  const index = findWeapon(loadoutFor(characterId).weapon)
  const weapon = WEAPONS[index >= 0 ? index : 0]
  const perShot = (weapon.damage + attackPowerFor(stats, weapon.family)) * stats.damage
  const shots = weapon.count + stats.bonusCount
  return (perShot * shots) / (weapon.cooldown / stats.attackSpeed)
}

/**
 * How each stat reads on a character card.
 *
 * Deliberately not the HUD's formatter: this screen shows what a stat is worth
 * before a run rather than what it currently multiplies, so a move speed of
 * x1.22 is better read as the 283 pixels a second it actually becomes.
 */
const MOD_TEXT: Partial<Record<UpgradeId, (value: number) => string>> = {
  moveSpeed: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`,
  attackSpeed: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`,
  damage: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`,
  range: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`,
  lootRange: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`,
  vision: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`,
  xpGain: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`,
  coinRate: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`,
  critChance: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`,
  critDamage: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`,
  dodge: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`,
  regen: (v) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%/秒`,
  lifesteal: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}/命中`,
}

const modText = (id: UpgradeId, value: number): string =>
  MOD_TEXT[id]?.(value) ?? `${value > 0 ? '+' : ''}${Math.round(value)}`

export function arenaProfile(characterId: string): ArenaProfile {
  const loadout = loadoutFor(characterId)
  const stats = openingStats(characterId)

  /* Normalised against the roster rather than against a constant, so the bars
     say "compared to the others" -- which is the only question being asked on
     a selection screen. A character with no loadout of their own sits at the
     neutral values and their bars say so. */
  const everyone = Object.keys(ARENA_LOADOUTS)
  const peak = (read: (id: string) => number) =>
    Math.max(read(characterId), ...everyone.map(read))

  const hp = (id: string) => openingStats(id).maxHp
  const armour = (id: string) => openingStats(id).armour
  const speed = (id: string) => BASE_MOVE_SPEED * openingStats(id).moveSpeed

  const rows: ProfileRow[] = [
    {
      id: 'dps',
      label: '起手輸出',
      text: openingDps(characterId).toFixed(1),
      ratio: openingDps(characterId) / peak(openingDps),
    },
    { id: 'hp', label: '生命', text: String(Math.round(stats.maxHp)), ratio: stats.maxHp / peak(hp) },
    {
      id: 'armour',
      label: '護甲',
      text: String(Math.round(stats.armour)),
      /* Armour starts at zero for most of the roster, so a ratio against the
         peak would be a row of empty bars. Against the peak plus a floor it is
         at least legible as "some, or none". */
      ratio: stats.armour / Math.max(1, peak(armour)),
    },
    {
      id: 'speed',
      label: '移動',
      text: String(Math.round(BASE_MOVE_SPEED * stats.moveSpeed)),
      ratio: (BASE_MOVE_SPEED * stats.moveSpeed) / peak(speed),
    },
  ]

  const mods: ProfileMod[] = Object.entries(loadout.mods).map(([key, value]) => {
    const id = key as UpgradeId
    return {
      id,
      label: STAT_INFO[id].label,
      text: modText(id, value as number),
      penalty: (value as number) < 0,
    }
  })

  const index = findWeapon(loadout.weapon)
  const weapon = index >= 0 ? WEAPONS[index] : null

  const start = openingAttributes(characterId)
  const growth = loadout.growth
  const attributes: ProfileAttribute[] = ATTRIBUTES.map((entry) => ({
    id: entry.id,
    label: entry.label,
    feeds: entry.feeds,
    value: Math.round(start[entry.id]),
    growth: growth[entry.id] ?? 0,
    ratio: start[entry.id] / ATTRIBUTE_CAP,
  }))

  return {
    skills: loadout.skills,
    attributes,
    rows,
    mods,
    weapon: weapon && {
      label: weapon.label,
      family: FAMILY_LABEL[weapon.family],
      detail: weapon.detail,
      damage: weapon.damage,
      cooldown: weapon.cooldown,
      range: weapon.range,
      count: weapon.count,
    },
    trait: loadout.trait || DEFAULT_LOADOUT.trait,
  }
}

/* Kept for the screens that quote the magnet and the sight radius in pixels
   rather than as multipliers. */
export const BASE_RADII = { loot: BASE_LOOT_RANGE, vision: BASE_VISION }
