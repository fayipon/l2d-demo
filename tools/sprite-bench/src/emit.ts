import { ACTOR_ANIMS, ARENA, GAME_GRID } from './game'
import type { Box, Grid } from './sheet'

/**
 * The two things worth copying out of here.
 *
 * A bench that only says yes or no makes the person who ran it type the
 * numbers in again, and typing them in again is where they get wrong. The
 * Live2D bench emits a config block for the same reason.
 *
 *   ActorSheet block   what game/data/actors.ts wants, if the sheet is one the
 *                      game can currently express.
 *   slice spec         the measured boxes as JSON, which is what
 *                      optimize-assets.mjs would need in order to re-lay a
 *                      ragged sheet into one the loader can cut.
 *
 * Nothing here writes a file. This tool never reaches into project01.
 */

export interface RowSpec {
  name: string
  frameRate: number
  repeat: number
}

/**
 * The `ActorSheet` literal, or the reason there cannot be one.
 *
 * The mushroom sheet is the reason this returns prose as often as code. Its
 * rows are 12 / 16 / 18 / 10 / 20, and `ActorSheet` has a single `columns`
 * from which every row's frames are derived -- `first = row * columns`,
 * `end = first + columns - 1`, in ArenaScene.buildActorAnimations. There is no
 * value of `columns` that is right for two of those rows, let alone five. So
 * the emitted block carries the counts as a comment and says what the game
 * would have to grow to accept them, rather than emitting something that
 * compiles and draws garbage.
 */
export function actorSheetBlock(
  counts: number[],
  grid: Grid | null,
  rows: RowSpec[],
  id: string,
): string {
  const key = `actor-${id}`

  if (!grid) {
    const lines = [
      '/* This sheet has no uniform grid, so ActorSheet cannot describe it.',
      ` *`,
      ` * Frames per row: ${counts.join(' / ')}`,
      ' *',
      ' * ActorSheet carries one `columns`, and ArenaScene derives every row',
      ' * from it: first = row * columns, end = first + columns - 1. No single',
      ' * value is right for these rows.',
      ' *',
      ' * Two ways forward, both edits to project01:',
      ' *   1. give each animation its own `frames` count (or start/end pair)',
      ' *      in ActorSheet, and build the frame list from that;',
      ' *   2. or re-lay this sheet onto a uniform grid first -- the slice spec',
      ' *      beside this block is the input optimize-assets.mjs would need.',
      ' */',
    ]
    return lines.join('\n')
  }

  const anims = rows
    .map((row, i) => {
      const known = (ACTOR_ANIMS as readonly string[]).includes(row.name)
      const suffix = known ? '' : `   // not in ActorAnim -- the union has to grow`
      return `      ${row.name}: { row: ${i}, frameRate: ${row.frameRate}, repeat: ${row.repeat} },${suffix}`
    })
    .join('\n')

  return [
    `  ${id}: {`,
    `    key: '${key}',`,
    `    url: ${id}Sheet,`,
    `    frameWidth: ${grid.frameWidth},`,
    `    frameHeight: ${grid.frameHeight},`,
    `    margin: ${grid.margin},`,
    `    spacing: ${grid.spacing},`,
    `    columns: ${grid.columns},`,
    `    animations: {`,
    anims,
    `    },`,
    `    displayHeight: ${ARENA.displayHeight},`,
    `  },`,
  ].join('\n')
}

/**
 * The measured boxes, as the packer would want them.
 *
 * `optimize-assets.mjs` currently takes one rectangle and a column/row count
 * and divides -- which works for a sheet laid out on a regular grid in the
 * source art and for nothing else. A ragged source needs the boxes
 * themselves, and this is them, in the order they play.
 *
 * The output geometry is the game's, because the point of re-laying a sheet is
 * to produce one the game can already read.
 */
export function sliceSpec(frames: Box[][], rows: RowSpec[], id: string): string {
  const columns = Math.max(...frames.map((f) => f.length), 0)
  const packedWidth = GAME_GRID.margin * 2 + columns * GAME_GRID.frameWidth + (columns - 1) * GAME_GRID.spacing
  const packedHeight =
    GAME_GRID.margin * 2 + frames.length * GAME_GRID.frameHeight + (frames.length - 1) * GAME_GRID.spacing

  const spec = {
    id,
    source: `DESIGN/<the source file>`,
    out: `actor-${id}.webp`,
    /* Every row padded out to the longest, because a texture is a rectangle.
       The blank cells cost nothing but bytes, and the alternative -- packing
       rows end to end and carrying a start index per row -- is a change to how
       the game reads sheets, which is the thing this file is trying to avoid
       needing. */
    frame: GAME_GRID.frameWidth,
    margin: GAME_GRID.margin,
    spacing: GAME_GRID.spacing,
    columns,
    rows: frames.map((boxes, i) => ({
      name: rows[i]?.name ?? `row${i}`,
      frames: boxes.length,
      frameRate: rows[i]?.frameRate ?? 8,
      repeat: rows[i]?.repeat ?? -1,
      boxes: boxes.map((b) => [b.x, b.y, b.w, b.h]),
    })),
    packed: { width: packedWidth, height: packedHeight },
  }

  const warning =
    packedWidth > 4096 || packedHeight > 4096
      ? `\n// WARNING: packed at ${packedWidth}x${packedHeight}, past the 4096 px a` +
        `\n// conservative GPU guarantees. Split the sheet or shrink the frame.`
      : ''
  return JSON.stringify(spec, null, 2) + warning
}
