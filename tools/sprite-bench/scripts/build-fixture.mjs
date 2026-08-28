import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

/**
 * The bench's two control sheets, generated rather than drawn.
 *
 * A bench needs subjects whose answer is known before the tool is asked, so
 * that when the tool says something surprising the tool is the suspect. Real
 * art cannot do that job: the demo sheet's frame counts are known only because
 * somebody counted them by eye, and counting them by eye is exactly the thing
 * being automated.
 *
 * So these are built from numbers, and the numbers are what the detector is
 * checked against:
 *
 *   grid-6x4      the game's own shape -- 6x4 cells of 128 px, margin 2,
 *                 spacing 4 -- with the drawing INSET BY A DIFFERENT AMOUNT IN
 *                 EVERY CELL. That last part is the whole point of the file.
 *                 Content that fills its cell makes the uniform-grid search
 *                 trivial and untested; real art never fills its cell, and the
 *                 search has to recover 128/2/4 from boxes that touch none of
 *                 those edges.
 *
 *   ragged-5row   the demo sheet's shape without its art: rows of 12, 16, 18,
 *                 10 and 20 boxes, a different box size per row, left-aligned
 *                 and ragged on the right, each row with a caption band above
 *                 it for the label-rejection pass to reject.
 *
 * Every box carries its own index painted large, so a mis-slice shows two half
 * numbers in one box rather than something merely "off". The digits are seven
 * segments of SVG rectangle rather than text: a font would make the output
 * depend on what is installed on the machine that ran this, and the assertions
 * below sample exact pixels.
 *
 * Lossless WebP, for the same reason. These files are flat colour and small,
 * and a lossy encoder would smear a hue across a gutter and break both the
 * assertions and the thing being demonstrated.
 */

const OUT = new URL('../public/fixtures/', import.meta.url)

/** Alpha at or below this is not art. The same floor project01's
 *  scripts/optimize-assets.mjs uses, and the same one src/sheet.ts measures
 *  with -- a fixture whose gutters read as "nearly empty" to one and "empty"
 *  to the other would be worse than no fixture. */
const ALPHA_FLOOR = 8

/** One hue per row, far enough apart to tell apart at a glance and by pixel. */
const HUES = ['#e4572e', '#f3a712', '#4c9f70', '#3f7cac', '#8a4fff', '#d64550']

/* Which of the seven segments each digit lights. Order: a b c d e f g --
   top, top-right, bottom-right, bottom, bottom-left, top-left, middle. */
const DIGITS = [
  [1, 1, 1, 1, 1, 1, 0],
  [0, 1, 1, 0, 0, 0, 0],
  [1, 1, 0, 1, 1, 0, 1],
  [1, 1, 1, 1, 0, 0, 1],
  [0, 1, 1, 0, 0, 1, 1],
  [1, 0, 1, 1, 0, 1, 1],
  [1, 0, 1, 1, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 0, 1, 1],
]

function digitRects(value, x, y, w, h, colour) {
  const t = Math.max(2, Math.round(Math.min(w, h) * 0.18))
  const half = h / 2
  const on = DIGITS[value]
  const seg = [
    [x, y, w, t],
    [x + w - t, y, t, half],
    [x + w - t, y + half, t, half],
    [x, y + h - t, w, t],
    [x, y + half, t, half],
    [x, y, t, half],
    [x, y + half - t / 2, w, t],
  ]
  return seg
    .filter((_, i) => on[i])
    .map(([rx, ry, rw, rh]) => `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${colour}"/>`)
    .join('')
}

/** The index, right-aligned inside the given box, as one or two digits. */
function numberRects(value, x, y, w, h, colour) {
  const text = String(value)
  const gap = Math.max(2, Math.round(w * 0.12))
  const dw = (w - gap * (text.length - 1)) / text.length
  return [...text]
    .map((ch, i) => digitRects(Number(ch), x + i * (dw + gap), y, dw, h, colour))
    .join('')
}

/**
 * A box: filled rounded rect in the row's hue, a darker inset border, and the
 * frame's index painted in the UPPER LEFT.
 *
 * Upper left rather than centred so that the assertions have somewhere flat to
 * probe. The probe is the box's lower-right quadrant, which is hue and nothing
 * else, and a digit sitting in the middle of the box would have made that
 * either fragile or a lie.
 */
function box(index, x, y, w, h, hue) {
  const inset = Math.max(1, Math.round(Math.min(w, h) * 0.04))
  const nw = Math.round(w * 0.42)
  const nh = Math.round(h * 0.36)
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.round(w * 0.08)}" fill="${hue}"/>`,
    `<rect x="${x + inset}" y="${y + inset}" width="${w - inset * 2}" height="${h - inset * 2}"`,
    ` rx="${Math.round(w * 0.06)}" fill="none" stroke="#0b0b12" stroke-width="${inset}"/>`,
    numberRects(index, x + Math.round(w * 0.12), y + Math.round(h * 0.12), nw, nh, '#0b0b12'),
  ].join('')
}

function svg(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`
}

/* ---------------------------------------------------------------- uniform */

const GRID = { frame: 128, margin: 2, spacing: 4, columns: 6, rows: 4 }

function buildUniform() {
  const { frame, margin, spacing, columns, rows } = GRID
  const width = margin * 2 + columns * frame + (columns - 1) * spacing
  const height = margin * 2 + rows * frame + (rows - 1) * spacing
  const boxes = []
  const parts = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const cellX = margin + c * (frame + spacing)
      const cellY = margin + r * (frame + spacing)
      /* The inset that makes this file worth having. It varies per cell, so
         the content boxes are a different size and a different offset in every
         cell and the grid has to be recovered rather than read off. */
      const inset = 8 + ((c + r * 2) % 4) * 7
      const x = cellX + inset
      const y = cellY + inset
      const size = frame - inset * 2
      parts.push(box(r * columns + c, x, y, size, size, HUES[r % HUES.length]))
      boxes.push({ row: r, x, y, w: size, h: size, hue: HUES[r % HUES.length] })
    }
  }
  return { name: 'grid-6x4.webp', width, height, svg: svg(width, height, parts.join('')), boxes, rowCounts: Array(rows).fill(columns) }
}

/* ----------------------------------------------------------------- ragged */

/** The demo sheet's counts, which is the point: 12 / 16 / 18 / 10 / 20. */
const ROWS = [
  { count: 12, w: 64, h: 64 },
  { count: 16, w: 56, h: 72 },
  { count: 18, w: 80, h: 80 },
  { count: 10, w: 48, h: 48 },
  { count: 20, w: 96, h: 60 },
]
const PAD = 8
const GAP = 6
const CAPTION_H = 18
const CAPTION_GAP = 6
const ROW_GAP = 20

function buildRagged() {
  const width =
    PAD * 2 + Math.max(...ROWS.map((r) => r.count * r.w + (r.count - 1) * GAP))
  let y = PAD
  const parts = []
  const boxes = []
  const captions = []
  for (const [index, row] of ROWS.entries()) {
    /* The caption band: short, narrow, hard against the left edge. It carries
       the row's index in the same digits, which is enough -- what the
       label-rejection pass keys on is the geometry, not the words. */
    const capW = 34 + String(row.count).length * 22
    parts.push(
      `<rect x="${PAD}" y="${y}" width="${capW}" height="${CAPTION_H}" rx="3" fill="#6b7280"/>`,
      numberRects(index, PAD + 6, y + 4, 14, CAPTION_H - 8, '#0b0b12'),
      numberRects(row.count, PAD + 26, y + 4, 24, CAPTION_H - 8, '#0b0b12'),
    )
    captions.push({ x: PAD, y, w: capW, h: CAPTION_H })
    y += CAPTION_H + CAPTION_GAP
    for (let i = 0; i < row.count; i++) {
      const x = PAD + i * (row.w + GAP)
      parts.push(box(i, x, y, row.w, row.h, HUES[index % HUES.length]))
      boxes.push({ row: index, x, y, w: row.w, h: row.h, hue: HUES[index % HUES.length] })
    }
    y += row.h + ROW_GAP
  }
  const height = y - ROW_GAP + PAD
  return {
    name: 'ragged-5row.webp',
    width,
    height,
    svg: svg(width, height, parts.join('')),
    boxes,
    captions,
    rowCounts: ROWS.map((r) => r.count),
  }
}

/* ------------------------------------------------------------- assertions */

function hex(colour) {
  return [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16))
}

/**
 * The script proving its own claim, rather than warning about it.
 *
 * Two things have to hold for the fixture to be a control at all: every box is
 * where the numbers say it is (probed in its flat lower-right quadrant, in the
 * row's exact hue), and every gutter between boxes is EMPTY -- alpha 0, not
 * alpha 3. The second is the one that would rot silently: a lossy encoder, a
 * stray shadow or an off-by-one in the layout leaves a gutter that the
 * detector then refuses to split on, and the fixture would report the wrong
 * counts while looking perfect on screen.
 */
async function assertFixture(built, raw) {
  const { data, info } = raw
  const at = (x, y) => {
    const i = (y * info.width + x) * info.channels
    return [data[i], data[i + 1], data[i + 2], data[i + 3]]
  }

  let probed = 0
  for (const b of built.boxes) {
    const px = Math.round(b.x + b.w * 0.72)
    const py = Math.round(b.y + b.h * 0.72)
    const [r, g, bl, a] = at(px, py)
    const [er, eg, eb] = hex(b.hue)
    if (a !== 255 || r !== er || g !== eg || bl !== eb) {
      throw new Error(
        `${built.name}: box at ${b.x},${b.y} probes rgba(${r},${g},${bl},${a}), expected ${b.hue} opaque`,
      )
    }
    probed++
  }

  /* Every pixel not inside a declared box or caption must be clear. That is a
     stronger claim than "the gutters are empty" and costs one pass. */
  const claimed = new Uint8Array(info.width * info.height)
  for (const b of [...built.boxes, ...(built.captions ?? [])]) {
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        claimed[y * info.width + x] = 1
      }
    }
  }
  let leaked = 0
  let gutter = 0
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (claimed[y * info.width + x]) continue
      gutter++
      if (at(x, y)[3] > ALPHA_FLOOR) leaked++
    }
  }
  if (leaked > 0) {
    throw new Error(`${built.name}: ${leaked} of ${gutter} gutter pixels carry ink`)
  }
  return { probed, gutter }
}

/* ------------------------------------------------------------------- main */

await mkdir(OUT, { recursive: true })

for (const built of [buildUniform(), buildRagged()]) {
  const png = await sharp(Buffer.from(built.svg)).png().toBuffer()
  const webp = await sharp(png).webp({ lossless: true }).toBuffer()
  const raw = await sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { probed, gutter } = await assertFixture(built, raw)
  await writeFile(new URL(built.name, OUT), webp)
  console.log(
    `${built.name}  ${built.width}x${built.height}  ${(webp.length / 1024).toFixed(1)} kB  ` +
      `rows [${built.rowCounts.join(', ')}]  ${probed} boxes probed  ${gutter} clear pixels`,
  )
}
