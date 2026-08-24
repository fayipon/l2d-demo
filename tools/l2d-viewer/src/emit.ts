import type { SettingsReport } from './inspect'
import type { Framing } from './stage'

/**
 * The block to paste into project01/src/pixi/live2dConfig.ts.
 *
 * The point of the whole bench. Everything it emits is something the tool has
 * just read off the model or something the sliders have just been used to
 * decide, so the config that arrives in the game is the one that was
 * demonstrably working on this screen a moment ago -- rather than four numbers
 * transcribed by hand from a file listing and a guess.
 *
 * Two things it deliberately does not emit:
 *
 * Captions. `tapLines` carries the line of dialogue a tap plays, and those are
 * writing rather than data. A tool that invented them would be a tool that
 * feeds placeholder Chinese into the game, and placeholder text ships.
 *
 * The framing constants by name. project01 shares `HOME_FRAMING` and
 * `DETAIL_FRAMING` across every model precisely so one pair of numbers means
 * the same thing for all of them, and a per-model literal would quietly break
 * that. What comes out is the *measured* framing plus a note saying whether it
 * matches the shared one -- so the answer "this model needs nothing special"
 * is visible, and that is the answer most of the time.
 */

/** The two framings project01 uses, so the bench can say "same as HOME". */
export const SHARED_FRAMINGS: { name: string; framing: Framing }[] = [
  { name: 'HOME_FRAMING', framing: { heightRatio: 1.82, x: 0.3, y: 1.065 } },
  { name: 'DETAIL_FRAMING', framing: { heightRatio: 1.85, x: 0.43, y: 0.955 } },
]

/** How close counts as "the same". A hundredth of the stage is under a pixel of
 *  visible difference at this size, and below the precision the sliders offer. */
const SAME = 0.011

export function matchesShared(framing: Framing): string | null {
  for (const { name, framing: shared } of SHARED_FRAMINGS) {
    if (
      Math.abs(framing.heightRatio - shared.heightRatio) < SAME &&
      Math.abs(framing.x - shared.x) < SAME &&
      Math.abs(framing.y - shared.y) < SAME
    ) {
      return name
    }
  }
  return null
}

/** The nudge off the nearest shared framing, which is what `Nudge` holds. */
export function nudgeFrom(framing: Framing, base: Framing): { x: number; y: number } {
  return {
    x: Math.round((framing.x - base.x) * 1000) / 1000,
    y: Math.round((framing.y - base.y) * 1000) / 1000,
  }
}

const quote = (s: string) => `'${s.replace(/'/g, "\\'")}'`

export interface EmitInput {
  /** Roster id, lowercase — the folder under public/live2d and the key used
   *  everywhere else. */
  id: string
  servedPath: string | null
  settings: SettingsReport
  framing: Framing
}

export function emitConfig({ id, servedPath, settings, framing }: EmitInput): string {
  const lines: string[] = []

  const groups = settings.motionGroups.map((g) => g.name)
  const idle = groups.find((g) => /idle/i.test(g)) ?? groups[0] ?? 'Idle'
  const tap = groups.find((g) => /tap/i.test(g)) ?? groups.find((g) => g !== idle) ?? 'TapBody'
  const tapGroup = settings.motionGroups.find((g) => g.name === tap)
  const voiced = tapGroup?.entries.filter((e) => e.sound !== null).length ?? 0

  const path =
    servedPath ?? `live2d/${id}/${id.charAt(0).toUpperCase()}${id.slice(1)}.model3.json`

  lines.push(`/* ---------- ${id} ---------- */`)
  lines.push('')
  lines.push(`const ${id}: Live2DModelBase = {`)
  lines.push('  modelPath: `${import.meta.env.BASE_URL}' + path + '`,')
  lines.push(`  idleMotionGroup: ${quote(idle)},`)
  lines.push(`  tapMotionGroup: ${quote(tap)},`)

  if (settings.expressions.length === 0) {
    lines.push('  // The model ships no expressions.')
    lines.push('  expressions: [],')
  } else {
    const ids = settings.expressions.map((e) => quote(e.id)).join(', ')
    lines.push(`  expressions: numbered([${ids}]),`)
  }

  lines.push('  voiceVolume: 0.9,')

  if (voiced === 0) {
    lines.push('  // No motion in this group carries a Sound, so these captions are')
    lines.push('  // subtitles with nothing behind them.')
  }
  lines.push('  tapLines: [')
  const taps = tapGroup?.entries ?? []
  if (taps.length === 0) {
    lines.push('    // No tap motions at all -- a tap will do nothing.')
  }
  for (const entry of taps) {
    const mark = entry.sound ? ' // 有語音' : ''
    lines.push(`    { motionIndex: ${entry.index}, caption: '' },${mark}`)
  }
  lines.push('  ],')
  lines.push('}')
  lines.push('')

  const shared = matchesShared(framing)
  if (shared) {
    lines.push(`export const ${id}Home = framed(${id}, HOME_FRAMING)`)
    lines.push(`export const ${id}Detail = framed(${id}, DETAIL_FRAMING)`)
    lines.push('')
    lines.push(`// Framing matched ${shared} as measured -- no nudge needed.`)
  } else {
    const base = SHARED_FRAMINGS[0]
    const nudge = nudgeFrom(framing, base.framing)
    lines.push(`const ${id.toUpperCase()}_NUDGE: Nudge = { x: ${nudge.x}, y: ${nudge.y} }`)
    lines.push('')
    lines.push(`export const ${id}Home = framed(${id}, HOME_FRAMING, ${id.toUpperCase()}_NUDGE)`)
    lines.push(`export const ${id}Detail = framed(${id}, DETAIL_FRAMING, ${id.toUpperCase()}_NUDGE)`)
    lines.push('')
    lines.push(`// Measured heightRatio ${framing.heightRatio.toFixed(3)}, which is off the`)
    lines.push(`// shared ${base.framing.heightRatio}. If it is far off, the model's artwork`)
    lines.push('// is a different shape rather than differently placed -- worth checking the')
    lines.push('// art box on the bench before overriding the shared framing.')
  }

  return lines.join('\n')
}
