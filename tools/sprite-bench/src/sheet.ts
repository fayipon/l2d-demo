/**
 * What is actually on the sheet, measured from the alpha channel.
 *
 * The obvious way to read a sprite sheet is to be told the grid -- frame size,
 * margin, spacing -- and cut on it. That is what the game does, and it is why
 * the game cannot notice when the numbers are wrong: cutting on a grid always
 * succeeds, it just produces a quarter of one pose and a sliver of the next.
 *
 * So this goes the other way. Nothing is assumed about the layout. Two passes
 * over the alpha channel find what is there:
 *
 *   BANDS   runs of image rows that carry ink, separated by rows that do not.
 *           One per animation, plus one per caption on a sheet that labels
 *           itself.
 *   BOXES   inside a band, runs of columns that carry ink. One per frame, each
 *           trimmed to its own tight bounds.
 *
 * That reads a ragged sheet -- rows of 12, 16, 18, 10 and 20 frames, every row
 * a different size, captions baked into the image -- which is the sheet this
 * bench was built for and the shape no grid can express.
 *
 * It does NOT read a sheet that is already packed, and that is not a bug to be
 * fixed with a better threshold. Measured on project01's own actor-haru.webp:
 * the gaps between frames are 4-5 px and the gaps inside a frame are 1-9 px,
 * so the two populations overlap completely. For a sheet like that the frames
 * are not observable and the grid has to be supplied -- which is what
 * `checkGrid` and `gridCells` at the bottom of this file are for, and why the
 * bench has two cut modes rather than one clever one.
 *
 * Pure: pixels in, numbers out. No DOM, no Phaser. The browser hands it an
 * alpha plane and the same function would run in Node over a decoded PNG.
 */

/** Alpha at or below this is presentation rather than art.
 *
 *  The same floor `project01/scripts/optimize-assets.mjs` clears at, and for
 *  the reason written there: upscalers leave a haze of alpha 1-4 across the
 *  whole canvas, which is invisible and enough to defeat trimming completely.
 *  At alpha > 0 a sheet like that reads as ONE band and ONE box -- the entire
 *  image -- and the tool would look broken rather than the art. */
export const ALPHA_FLOOR = 8

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/**
 * What a band turned out to be.
 *
 * `frames`  an animation.
 * `label`   a caption baked into the image -- `IDLE (12)` and its friends.
 * `noise`   a two-pixel sliver of shadow that belongs to the row above or
 *           below. The game's own sheet has one, at y 398, and counting it as
 *           a fifth animation was the first wrong answer this tool gave.
 *
 * Both of the non-frame kinds are PROPOSALS. A band holding one small sprite
 * is indistinguishable from a caption by geometry alone, so the UI puts a
 * checkbox on every row and the person decides.
 */
export type BandKind = 'frames' | 'label' | 'noise'

export interface Band {
  /** Where the band sits in the image, before per-box trimming. */
  top: number
  height: number
  boxes: Box[]
  kind: BandKind
}

export interface Measure {
  width: number
  height: number
  bands: Band[]
  /** The gap width that was used to split boxes apart, and whether it was
   *  measured or supplied. Surfaced because it is the one knob that changes
   *  what the tool sees: too small and a sword separated from its owner
   *  becomes its own frame, too large and two frames become one. */
  minGap: number
  minGapAuto: boolean
  /**
   * The run of thresholds that all give the same answer, and the reason the
   * automatic one is chosen the way it is.
   *
   * Half the median gap was the first rule and it is wrong on real art. On the
   * mushroom sheet it picks 5 px, which welds two pairs of the lying-down
   * DEATH frames into one box each -- their bodies are 4 px apart -- while
   * every threshold from 1 to 4 reports the same 77 frames. A number that
   * survives a range of thresholds is a measurement; one that changes if you
   * nudge the knob is a coincidence. So the sweep runs first and the widest
   * plateau wins.
   */
  plateau: [number, number]
}

export interface Grid {
  frameWidth: number
  frameHeight: number
  margin: number
  spacing: number
  columns: number
  rows: number
}

export interface GridCheck {
  ok: boolean
  /** Frames that straddle a cell boundary or fall outside the sheet, named the
   *  way a person would look for them: band 2, frame 13. */
  violations: { band: number; frame: number; reason: string }[]
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Runs of `true` in a flag array, as [start, end] inclusive. */
function runs(flags: Uint8Array): [number, number][] {
  const out: [number, number][] = []
  let start = -1
  for (let i = 0; i < flags.length; i++) {
    if (flags[i]) {
      if (start < 0) start = i
    } else if (start >= 0) {
      out.push([start, i - 1])
      start = -1
    }
  }
  if (start >= 0) {
    out.push([start, flags.length - 1])
  }
  return out
}

/** Merge runs separated by less than `minGap` empty columns. */
function mergeRuns(segments: [number, number][], minGap: number): [number, number][] {
  const out: [number, number][] = []
  for (const seg of segments) {
    const last = out[out.length - 1]
    if (last && seg[0] - last[1] - 1 < minGap) {
      last[1] = seg[1]
    } else {
      out.push([...seg])
    }
  }
  return out
}

export interface MeasureOptions {
  /** Overrides the measured gap. */
  minGap?: number
}

export function measure(
  alpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: MeasureOptions = {},
): Measure {
  const ink = (x: number, y: number) => alpha[y * width + x] > ALPHA_FLOOR

  const inkedRows = new Uint8Array(height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (ink(x, y)) {
        inkedRows[y] = 1
        break
      }
    }
  }
  const bandRuns = runs(inkedRows)

  /* The column profile of every band, computed once -- which is what makes the
     threshold sweep below affordable, since every candidate is then a re-merge
     of these segments rather than another pass over two million pixels.
     One threshold is chosen for the whole sheet, not one per band: a ten-frame
     row does not carry enough gaps to decide anything on its own, and two rows
     of one sheet split on different rules would be indefensible. */
  const profiles = bandRuns.map(([top, bottom]) => {
    const cols = new Uint8Array(width)
    for (let x = 0; x < width; x++) {
      for (let y = top; y <= bottom; y++) {
        if (ink(x, y)) {
          cols[x] = 1
          break
        }
      }
    }
    return { top, bottom, segments: runs(cols) }
  })

  const minGapAuto = options.minGap === undefined
  /* The sweep looks at the tall bands only. Captions are two or three blobs of
     text whose count changes at almost every threshold -- the letters merge
     into words, the words into a line -- and including them means no threshold
     is ever flat, which is how the mushroom sheet ended up on a plateau of
     one. Height is enough to leave them out here; the proper classification
     happens further down and needs the boxes this decides. */
  const tallest = Math.max(...profiles.map((p) => p.bottom - p.top + 1), 1)
  const plateau = widestPlateau(
    profiles.filter((p) => p.bottom - p.top + 1 >= tallest * 0.5).map((p) => p.segments),
  )
  const minGap = options.minGap ?? plateau.gap

  const bands: Band[] = profiles.map(({ top, bottom, segments }) => {
    const boxes = mergeRuns(segments, minGap).map(([x0, x1]) => {
      let boxTop = bottom
      let boxBottom = top
      for (let y = top; y <= bottom; y++) {
        for (let x = x0; x <= x1; x++) {
          if (ink(x, y)) {
            if (y < boxTop) boxTop = y
            if (y > boxBottom) boxBottom = y
            break
          }
        }
      }
      return { x: x0, y: boxTop, w: x1 - x0 + 1, h: boxBottom - boxTop + 1 }
    })
    return { top, height: bottom - top + 1, boxes, kind: 'frames' as BandKind }
  })

  classifyBands(bands, width)
  return { width, height, bands, minGap, minGapAuto, plateau: plateau.range }
}

const MAX_GAP = 24

/**
 * A threshold that is not a coincidence.
 *
 * Raising the threshold can only merge boxes, so the box count falls as it
 * rises, in steps with flat stretches between them. A flat stretch means a
 * range of thresholds that all give the same answer, and that is what a
 * measurement should look like; a count that changes when the knob is nudged
 * is a number somebody chose, not one the sheet has.
 *
 * The trap is that the widest stretch is always the useless one at the top,
 * where every row has collapsed into a single box and nothing can merge any
 * further. The first version of this picked exactly that, and reported the
 * ragged fixture as five rows of one frame. Hence RETENTION: a stretch is only
 * a candidate while it still holds most of the boxes the finest threshold
 * found. Half is a wide margin -- the real plateau on the mushroom sheet keeps
 * 77 of 78 -- and it eliminates every collapsed reading outright.
 */
const RETENTION = 0.5

function widestPlateau(profiles: [number, number][][]): {
  gap: number
  range: [number, number]
} {
  const total = (gap: number) =>
    profiles.reduce((sum, segments) => sum + mergeRuns(segments, gap).length, 0)

  const finest = total(1)
  const floor = finest * RETENTION
  let best: { gap: number; range: [number, number]; length: number } = {
    gap: 1,
    range: [1, 1],
    length: 0,
  }
  let runStart = 1
  let runCount = finest
  for (let gap = 2; gap <= MAX_GAP + 1; gap++) {
    const count = gap <= MAX_GAP ? total(gap) : -1
    if (count === runCount) {
      continue
    }
    const length = gap - runStart
    if (runCount >= floor && length > best.length) {
      best = { gap: runStart, range: [runStart, gap - 1], length }
    }
    runStart = gap
    runCount = count
  }
  return { gap: best.gap, range: best.range }
}

/**
 * Which bands are captions.
 *
 * A caption is short and it is alone: `IDLE (12)` is a fraction of the height
 * of the frames under it and sits by itself against the left edge. Both halves
 * are needed -- a sheet whose first animation is a single wide frame is short
 * too, and a sheet of small sprites is short everywhere.
 *
 * The first version of this compared each band against the median height and
 * called anything at half of it a label. It reads well and it does not work.
 * On the ragged fixture the bands are 18, 64, 18, 72, 18, 80, 18, 48, 18, 60:
 * five captions and five rows, so the median lands at 33, and a caption of 18
 * is more than half of that. Every caption was counted as a one-frame
 * animation and the sheet reported 81 frames instead of 76.
 *
 * What actually separates them is that there are TWO populations and a wide
 * empty space between them. So: sort the heights, find the largest ratio
 * between neighbours, and if that jump is big enough treat it as the split. On
 * an unlabelled sheet the heights are all alike, the biggest jump is nothing
 * like 1.8x, and no band is ever called a caption.
 */
const LABEL_JUMP = 1.8

/** A band this much shorter than the tallest is a sliver of somebody else's
 *  shadow, not a row of frames. project01's own sheet carries one two pixels
 *  tall between rows three and four. */
const NOISE_RATIO = 0.12

function classifyBands(bands: Band[], width: number): void {
  const tallest = Math.max(...bands.map((b) => b.height), 1)
  for (const band of bands) {
    if (band.height < tallest * NOISE_RATIO) {
      band.kind = 'noise'
    }
  }
  const rest = bands.filter((b) => b.kind === 'frames')
  if (rest.length < 3) {
    return
  }
  const heights = rest.map((b) => b.height).sort((a, b) => a - b)
  let ratio = 1
  let cut = 0
  for (let i = 1; i < heights.length; i++) {
    const step = heights[i] / heights[i - 1]
    if (step > ratio) {
      ratio = step
      cut = heights[i - 1]
    }
  }
  if (ratio < LABEL_JUMP) {
    return
  }
  for (const band of rest) {
    const narrow = band.boxes.every((b) => b.x + b.w < width * 0.5)
    if (band.height <= cut && narrow) {
      band.kind = 'label'
    }
  }
}

/** The bands that hold frames, in order, captions and slivers dropped. */
export function frameBands(m: Measure): Band[] {
  return m.bands.filter((b) => b.kind === 'frames')
}

/**
 * Does every measured box sit inside ONE cell of this grid?
 *
 * This is the test the game cannot perform on itself: `load.spritesheet` given
 * the wrong frame size does not fail, it draws. A box that straddles a cell
 * boundary is named here with the band and the position a person can find it
 * at on the sheet.
 *
 * Note what is NOT asserted: that box number three is in cell number three. On
 * a tightly packed sheet the measurement over-splits -- see the note above
 * `fitGrids` -- so a cell may hold three boxes and the box count may exceed
 * the column count. Every fragment of a frame is still inside that frame's
 * cell, which is what makes containment the right question and indexing the
 * wrong one.
 */
export function checkGrid(m: Measure, grid: Grid): GridCheck {
  const bands = frameBands(m)
  const violations: GridCheck['violations'] = []
  const pitchX = grid.frameWidth + grid.spacing
  const pitchY = grid.frameHeight + grid.spacing

  bands.forEach((band, r) => {
    if (r >= grid.rows) {
      violations.push({ band: r, frame: 0, reason: `a ${grid.rows}-row grid has no row ${r}` })
      return
    }
    const cellY = grid.margin + r * pitchY
    band.boxes.forEach((box, i) => {
      const column = Math.floor((box.x - grid.margin) / pitchX)
      const cellX = grid.margin + column * pitchX
      if (column < 0 || column >= grid.columns) {
        violations.push({ band: r, frame: i, reason: `x ${box.x} falls outside the ${grid.columns} columns` })
      } else if (box.x < cellX || box.x + box.w > cellX + grid.frameWidth) {
        violations.push({
          band: r,
          frame: i,
          reason: `spans x ${box.x}..${box.x + box.w}, cell ${column} is ${cellX}..${cellX + grid.frameWidth}`,
        })
      } else if (box.y < cellY || box.y + box.h > cellY + grid.frameHeight) {
        violations.push({
          band: r,
          frame: i,
          reason: `spans y ${box.y}..${box.y + box.h}, row ${r} is ${cellY}..${cellY + grid.frameHeight}`,
        })
      }
    })
  })
  return { ok: violations.length === 0, violations }
}

/**
 * Every uniform grid this sheet could be cut on, finest first.
 *
 * Two things make this harder than it sounds, and both were found by pointing
 * the tool at real files rather than at its own fixtures.
 *
 * **The cell boundaries are not observable.** Content does not touch its cell
 * edges -- art is centred in a frame with air around it -- so only the pitch
 * between cells shows. A 792 px sheet of six columns is equally well described
 * as `frame 128, margin 2, spacing 4` and as `frame 132, margin 0, spacing 0`.
 * Every drawn pixel is inside a cell in both readings and no amount of looking
 * separates them. So this enumerates the readings that FIT instead of
 * inventing the one that is true, and the question worth asking of the list is
 * whether the GAME's numbers are in it.
 *
 * **A packed sheet cannot be split by gaps at all.** Measured on
 * `project01/src/assets/actor-haru.webp`: the gaps between frames are 4 to 5
 * pixels, and the gaps inside a frame -- between an arm and a body, between
 * the legs -- are 1 to 9. The two populations overlap completely. That is why
 * the search below works from containment rather than from box counts, and why
 * the bench offers a grid mode at all: for a sheet like that, being told the
 * grid is not a shortcut, it is the only way.
 *
 * Margin and spacing are shared between the axes because that is how
 * `optimize-assets.mjs` writes sheets and how `load.spritesheet` reads them.
 */
export function fitGrids(m: Measure, limit = 8): Grid[] {
  const bands = frameBands(m)
  if (bands.length === 0) {
    return []
  }
  const rows = bands.length
  const widest = Math.max(...bands.flatMap((b) => b.boxes.map((box) => box.w)), 1)
  /* No point proposing cells narrower than the widest thing that has to fit
     inside one, and that bound is what keeps the search a few thousand
     candidates rather than a few hundred thousand. */
  const maxColumns = Math.max(1, Math.floor(m.width / widest))
  const found: Grid[] = []
  for (let columns = maxColumns; columns >= 1; columns--) {
    for (let margin = 0; margin <= 16; margin++) {
      for (let spacing = 0; spacing <= 24; spacing++) {
        const fw = (m.width - margin * 2 - (columns - 1) * spacing) / columns
        const fh = (m.height - margin * 2 - (rows - 1) * spacing) / rows
        if (!Number.isInteger(fw) || !Number.isInteger(fh) || fw < widest || fh <= 0) {
          continue
        }
        const grid = { frameWidth: fw, frameHeight: fh, margin, spacing, columns, rows }
        if (checkGrid(m, grid).ok) {
          found.push(grid)
        }
      }
    }
    /* Finest first, and stop at the first column count that works: a coarser
       grid always "fits" -- one cell per row contains everything in that row
       -- and reporting that as a finding would be true and useless. */
    if (found.length > 0) {
      break
    }
  }
  return found.slice(0, limit)
}

/** The cells of a grid, as boxes, row by row. What the game would cut, and
 *  what the bench plays when a grid is in force. */
export function gridCells(grid: Grid): Box[][] {
  const cells: Box[][] = []
  for (let r = 0; r < grid.rows; r++) {
    const row: Box[] = []
    for (let c = 0; c < grid.columns; c++) {
      row.push({
        x: grid.margin + c * (grid.frameWidth + grid.spacing),
        y: grid.margin + r * (grid.frameHeight + grid.spacing),
        w: grid.frameWidth,
        h: grid.frameHeight,
      })
    }
    cells.push(row)
  }
  return cells
}

/** The spacing between frame origins, per axis, for reporting. Measured as the
 *  span between the first and last box rather than averaged pairwise: content
 *  offsets inside a cell cancel over the span and accumulate pairwise. */
export function pitch(m: Measure): { x: number; y: number } | null {
  const bands = frameBands(m)
  if (bands.length === 0) {
    return null
  }
  const xs = bands
    .filter((b) => b.boxes.length > 1)
    .map((b) => (b.boxes[b.boxes.length - 1].x - b.boxes[0].x) / (b.boxes.length - 1))
  const ys =
    bands.length > 1
      ? [(bands[bands.length - 1].top - bands[0].top) / (bands.length - 1)]
      : []
  if (xs.length === 0) {
    return null
  }
  return { x: Math.round(median(xs)), y: ys.length ? Math.round(ys[0]) : 0 }
}

