/**
 * The grid the artist painted, read back off the pixels.
 *
 * `sheet.ts` measures frames from the gaps between them and `checkGrid` cuts
 * on constants it is told. Both fail on a sheet that draws a box around every
 * frame, and that is not an exotic case -- it is what a batch of generated
 * character art looks like when the generator labels its own contact sheet.
 *
 * `DESIGN/game_enemy_sprite_02.png` is the file this was written against.
 * Measured on it:
 *
 *   - the ruling grey is `116,115,114` -- luma 116, chroma 2. `mask.ts` keys
 *     background at luma 200, so every ruling pixel is foreground, and the
 *     rulings form a CLOSED BOX around every cell. The flood fill enters at
 *     the four corners, hits the boxes and stops: 40.9% of the image claimed,
 *     against 77.6% on the unruled `_01`. With no transparent column anywhere,
 *     `measure` reads the whole sheet as one band holding one frame.
 *   - the per-band pitch is 140 / 116 / 131 / 143 / 140. Five different
 *     numbers, so no `frameWidth` describes the sheet either.
 *
 * So neither existing mode can read it, while the sheet is *telling* us where
 * every cut goes. This reads that and nothing else.
 *
 * TWO THINGS THE PAINTED GRID GETS WRONG, both of which are the sheet's fault
 * and both of which have to survive to the screen rather than be smoothed
 * over:
 *
 *   A RULING CAN BE HIDDEN. Art crosses the line and its coverage drops below
 *   any threshold that is not also picking up shadows. What is left is a gap
 *   that is an integer multiple of the pitch, so the interior lines are
 *   interpolated -- and drawn dashed, so a wrong guess is visible instead of
 *   merely wrong. This is what recovers the 16 cells of band 1 from the 13
 *   lines that are actually detectable.
 *
 *   A RULING CAN BE MISSING FROM THE ART. Band 4's last cell is 188px against
 *   a 140px pitch and holds two poses -- the body, and the cap that has rolled
 *   off it -- with no line between them. Pitch interpolation cannot help:
 *   188/140 rounds to 1. So an over-wide cell is re-cut on the widest
 *   transparent column inside it, which is the one piece of evidence the
 *   painted grid does not have and `measure` does.
 *
 * Pure: pixels in, numbers out. No DOM, no canvas.
 */

export interface RulingOptions {
  /** The ruling grey sits between the ink below it and the checkerboard above.
   *  Defaults bracket the measured 116 with room either side; exposed on the
   *  screen because the next sheet's rulings will be some other grey and
   *  hardcoding this one makes the tool a one-file tool. */
  lumaMin: number
  lumaMax: number
  /** How grey, as max channel minus min. 16 clears the compression wobble on a
   *  flat line and keeps coloured art out. */
  chroma: number
}

export const DEFAULT_RULINGS: RulingOptions = { lumaMin: 80, lumaMax: 205, chroma: 16 }

export type CellKind = 'frame' | 'empty'

export interface RulingCell {
  x: number
  w: number
  kind: CellKind
  /** True when the line that opens this cell was derived rather than seen --
   *  interpolated from the pitch, or cut from a transparent column. Drawn
   *  dashed. */
  derived: boolean
}

export interface RulingBand {
  top: number
  height: number
  /** Distance between neighbouring rulings, the median of the gaps that are
   *  wide enough to be cells. Reported because it is what the interpolation
   *  and the over-wide test are both measured against. */
  pitch: number
  cells: RulingCell[]
}

export interface Rulings {
  /** The horizontal rulings, top to bottom. One more than the number of
   *  bands, unless the last band runs to the bottom edge. */
  hLines: number[]
  bands: RulingBand[]
  /** How many cells came from a line nobody can see. Surfaced so the verdict
   *  can say how much of the answer is inference. */
  derived: number
}

/** Coverage a row of pixels needs before it is a candidate horizontal ruling.
 *  Well under half, because art crosses these lines: the y=806 ruling on the
 *  mushroom sheet only reaches 35%, and losing it merges two animations. */
const H_COVERAGE = 0.35

/** ...and coverage one of them needs before the sheet counts as ruled at all.
 *  A stray grey row is not a grid; a line that runs the width of the image is.
 */
const H_STRONG = 0.8

/**
 * How close a weaker candidate has to be to a stronger one to be its shadow.
 *
 * Every band on the mushroom sheet drops a shadow onto the ruling below it,
 * and the shadow's own edge reads as a second line 28-29px above the real one.
 * Taking both splits each band in two and yields a 27px sliver of nothing.
 * Since no real band is anywhere near this tall, a cluster this wide can only
 * hold one true ruling: keep the strongest and drop the rest.
 */
const H_CLUSTER = 40

/** Coverage for a vertical ruling, measured over its own band only. Higher
 *  than the horizontal test because there is no shadow case here and a
 *  half-covered column is art, not a line. */
const V_COVERAGE = 0.5

/** Vertical candidates this close are one line drawn two or three pixels
 *  wide. */
const V_CLUSTER = 6

/** Below this, a gap between vertical rulings is a doubled line rather than a
 *  cell, and must not be allowed into the pitch. */
const MIN_CELL = 20

/**
 * How much wider than the pitch a cell has to be before it is re-cut.
 *
 * Measured on the mushroom sheet: the welded DEATH cell is 1.34x the pitch,
 * and the widest cell that genuinely holds one pose is 1.15x. 1.25 sits in
 * that gap. Note this cannot be done by rounding gap/pitch the way the hidden
 * rulings are -- 188/140 rounds to 1, which is why that path exists at all.
 */
const WIDE = 1.25

/** How much emptier than the cell's own middle a column has to be to be the
 *  seam between two poses. Measured on the welded DEATH cell: 5 rows of ink at
 *  the seam against a median of 44, which is 0.11. */
const VALLEY = 0.25

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b

/** Keep the strongest candidate in every cluster of nearby ones. */
function thin(candidates: [number, number][], near: number): number[] {
  const out: number[] = []
  let run: [number, number][] = []
  const flush = () => {
    if (run.length > 0) {
      out.push(run.reduce((a, b) => (b[1] > a[1] ? b : a))[0])
    }
  }
  for (const candidate of candidates) {
    if (run.length > 0 && candidate[0] - run[run.length - 1][0] > near) {
      flush()
      run = []
    }
    run.push(candidate)
  }
  flush()
  return out
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[sorted.length >> 1]
}

/**
 * Find the painted grid, or null if there isn't one.
 *
 * Reads the FILE's own alpha, not the keyed mask from `mask.ts`. Two reasons,
 * and the first is the one that bites: the keying threshold is a control on
 * the screen, and at a setting low enough to swallow the rulings -- which is
 * the setting that makes `measure` work at all on a ruled sheet -- a mask-based
 * detector would find no rulings and the two modes would silently disagree
 * about the same image. The second is ordinary: a fully transparent pixel must
 * never be a ruling whatever colour happens to be stored under it.
 */
export function findRulings(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: RulingOptions = DEFAULT_RULINGS,
): Rulings | null {
  const isLine = (x: number, y: number): boolean => {
    const i = y * width + x
    if (rgba[i * 4 + 3] === 0) {
      return false
    }
    const r = rgba[i * 4]
    const g = rgba[i * 4 + 1]
    const b = rgba[i * 4 + 2]
    if (Math.max(r, g, b) - Math.min(r, g, b) > options.chroma) {
      return false
    }
    const value = luma(r, g, b)
    return value >= options.lumaMin && value <= options.lumaMax
  }

  const hCandidates: [number, number][] = []
  let strong = 0
  for (let y = 0; y < height; y++) {
    let n = 0
    for (let x = 0; x < width; x++) {
      if (isLine(x, y)) n++
    }
    const coverage = n / width
    if (coverage >= H_COVERAGE) {
      hCandidates.push([y, coverage])
      if (coverage >= H_STRONG) strong++
    }
  }
  /* Two strong lines is the floor: one is a border, and a sheet whose only
     horizontal line is its own top edge is not a ruled sheet. */
  if (strong < 2) {
    return null
  }
  const hLines = thin(hCandidates, H_CLUSTER)
  if (hLines.length < 2) {
    return null
  }

  const edges = [...hLines]
  /* A sheet whose last band runs to the bottom edge has no closing ruling
     there, and dropping that band would be dropping an animation. */
  if (edges[edges.length - 1] < height - MIN_CELL) {
    edges.push(height - 1)
  }

  const bands: RulingBand[] = []
  let derived = 0
  for (let i = 0; i < edges.length - 1; i++) {
    const top = edges[i]
    const bottom = edges[i + 1]
    const inner = bottom - top - 3
    if (inner < MIN_CELL) {
      continue
    }
    const vCandidates: [number, number][] = []
    for (let x = 0; x < width; x++) {
      let n = 0
      for (let y = top + 2; y < bottom - 1; y++) {
        if (isLine(x, y)) n++
      }
      if (n / inner >= V_COVERAGE) {
        vCandidates.push([x, n / inner])
      }
    }
    const seen = thin(vCandidates, V_CLUSTER)
    if (seen.length < 2) {
      continue
    }
    const pitch = median(seen.slice(1).map((v, k) => v - seen[k]).filter((g) => g >= MIN_CELL))
    if (pitch <= 0) {
      continue
    }

    /* Interpolate the rulings art is standing in front of. */
    const lines: { x: number; derived: boolean }[] = [{ x: seen[0], derived: false }]
    for (let k = 1; k < seen.length; k++) {
      const gap = seen[k] - seen[k - 1]
      const parts = Math.max(1, Math.round(gap / pitch))
      for (let j = 1; j < parts; j++) {
        lines.push({ x: Math.round(seen[k - 1] + (gap * j) / parts), derived: true })
      }
      lines.push({ x: seen[k], derived: false })
    }

    const cells: RulingCell[] = []
    for (let k = 0; k < lines.length - 1; k++) {
      cells.push({
        x: lines[k].x,
        w: lines[k + 1].x - lines[k].x,
        kind: 'frame',
        derived: lines[k].derived,
      })
    }
    derived += lines.filter((l) => l.derived).length
    bands.push({ top, height: bottom - top, pitch, cells })
  }

  if (bands.length === 0) {
    return null
  }
  return { hLines: edges, bands, derived }
}

/**
 * Second pass, once there is a mask to look through: mark the cells that hold
 * nothing, and re-cut the ones that hold two poses.
 *
 * Kept apart from `findRulings` because it answers a different question with
 * different evidence -- the painted grid says where the lines are, the alpha
 * says what is between them -- and because the caller may want the geometry
 * before it has decided which mask to use.
 */
export function readCells(
  rulings: Rulings,
  alpha: Uint8Array | Uint8ClampedArray,
  width: number,
  floor: number,
): Rulings {
  let derived = 0
  const bands = rulings.bands.map((band) => {
    const cells: RulingCell[] = []
    for (const cell of band.cells) {
      /* The column profile of the cell, minus the ruling itself: a line is ink
         by every test this tool has, and counting it would make every cell
         look occupied. */
      const x0 = cell.x + 2
      const x1 = cell.x + cell.w - 2
      const profile: number[] = []
      for (let x = x0; x <= x1; x++) {
        let n = 0
        for (let y = band.top + 2; y < band.top + band.height - 1; y++) {
          if (alpha[y * width + x] > floor) {
            n++
          }
        }
        profile.push(n)
      }
      if (!profile.some((n) => n > 0)) {
        cells.push({ ...cell, kind: 'empty' })
        continue
      }
      if (cell.w <= band.pitch * WIDE) {
        cells.push(cell)
        continue
      }
      /* Over-wide: cut it at its emptiest interior column, as many times as
         the pitch says it should have been cut.
         A VALLEY, not a gap. Measured on the welded DEATH cell: between the
         body and the cap that rolled off it the column is not empty, it holds
         5 rows of the ground shadow both of them cast, against 44 through the
         art either side. `measure` needs a column with nothing in it at all
         and there is none, which is the whole reason that ruling being missing
         costs a frame. A relative floor finds it and does not fire on the
         shallow dips inside one pose. */
      const parts = Math.max(2, Math.round(cell.w / band.pitch))
      const sorted = [...profile].sort((a, b) => a - b)
      const floorDepth = sorted[sorted.length >> 1] * VALLEY
      const guard = Math.round(band.pitch * 0.35)
      const order = profile
        .map((n, k) => [n, k] as [number, number])
        .filter(([n, k]) => n <= floorDepth && k >= guard && k <= profile.length - 1 - guard)
        .sort((a, b) => a[0] - b[0])
      const interior: number[] = []
      for (const [, k] of order) {
        if (interior.length >= parts - 1) {
          break
        }
        if (interior.every((other) => Math.abs(other - (x0 + k)) >= band.pitch * 0.5)) {
          interior.push(x0 + k)
        }
      }
      interior.sort((a, b) => a - b)
      if (interior.length === 0) {
        cells.push(cell)
        continue
      }
      const bounds = [cell.x, ...interior, cell.x + cell.w]
      for (let k = 0; k < bounds.length - 1; k++) {
        cells.push({
          x: bounds[k],
          w: bounds[k + 1] - bounds[k],
          kind: 'frame',
          derived: k === 0 ? cell.derived : true,
        })
      }
      derived += interior.length
    }
    return { ...band, cells }
  })
  return { hLines: rulings.hLines, bands, derived: rulings.derived + derived }
}
