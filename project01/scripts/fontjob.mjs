import sharp from 'sharp'

/**
 * The arena's digits, cut out of the painted glyph sheet.
 *
 * The source is a display of every glyph on a dark plate, not a font file. All
 * this takes is the ten digits, because the ten digits are what the arena
 * draws -- damage, and nothing else. The rest of the sheet is left where it is
 * rather than exported against a use that does not exist.
 *
 * Proportionally spaced, which took a second attempt. The first version laid
 * the digits out in fixed-width cells and let the loader advance by the cell:
 * tabular figures, on the argument that a number changing every frame must not
 * shuffle sideways as a 1 becomes an 8. That argument is sound for a HUD
 * readout and wrong for damage, which appears, drifts and dies -- and it made
 * "11" look like two separate numbers, because a 1 is two thirds the width of
 * the cell it sat in and wore the difference as air on both sides.
 *
 * So each digit is now cut to its own ink and carries its own advance, and the
 * font ships as BMFont XML rather than as a fixed grid. TRACKING is the gap
 * between glyphs and the one number to turn if it wants to be tighter still.
 *
 * The plate behind the glyphs is cleared the same way the character sheet's
 * is: the alpha histogram is two peaks, 63% at or below 31 and 31% at or above
 * 224, with 5% of anti-aliased edge between. Anything at 31 or below is
 * presentation.
 */

/** Where the digits are in the source, measured off its own alpha. */
const DIGIT_BAND = { top: 536, bottom: 662 }
const DIGIT_COLUMNS = [
  [20, 114],
  [155, 222],
  [269, 361],
  [400, 486],
  [519, 610],
  [640, 728],
  [762, 853],
  [884, 973],
  [1000, 1089],
  [1122, 1211],
]

/** Alpha at or below this is the plate rather than a glyph. */
const ALPHA_FLOOR = 31

/**
 * Height of a glyph in the exported sheet.
 *
 * Taller than anything draws it -- damage runs at 26 and crits at half again
 * -- so every draw scales down. An upscaled painted glyph looks like a
 * photograph of a glyph.
 */
const GLYPH_HEIGHT = 64

/** Gap between one glyph's ink and the next, at GLYPH_HEIGHT. */
const TRACKING = 3

/** Gutter in the packed sheet, so linear filtering and lossy WebP cannot
 *  reach from one glyph into its neighbour. Nothing to do with TRACKING. */
const GUTTER = 4
const MARGIN = 2

export async function buildDigitFont(source) {
  const raw = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: srcW, channels } = raw.info
  for (let i = 3; i < raw.data.length; i += channels) {
    if (raw.data[i] <= ALPHA_FLOOR) {
      raw.data[i] = 0
    }
  }
  const cleaned = await sharp(raw.data, {
    raw: { width: srcW, height: raw.info.height, channels },
  })
    .png()
    .toBuffer()

  const bandHeight = DIGIT_BAND.bottom - DIGIT_BAND.top + 1
  const scale = GLYPH_HEIGHT / bandHeight

  /* Each digit is cut at the full height of the band and only trimmed
     sideways. They share a baseline in the source, and trimming each to its
     own ink vertically would throw that away and stand a 7 taller than a 4. */
  const glyphs = []
  let cursor = MARGIN
  for (const [index, [left, right]] of DIGIT_COLUMNS.entries()) {
    const width = Math.round((right - left + 1) * scale)
    const image = await sharp(cleaned)
      .extract({ left, top: DIGIT_BAND.top, width: right - left + 1, height: bandHeight })
      .resize({ width, height: GLYPH_HEIGHT })
      .png()
      .toBuffer()
    glyphs.push({ code: 48 + index, image, x: cursor, width })
    cursor += width + GUTTER
  }

  const sheetWidth = cursor - GUTTER + MARGIN
  const sheetHeight = GLYPH_HEIGHT + MARGIN * 2
  const png = await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(glyphs.map((g) => ({ input: g.image, left: g.x, top: MARGIN })))
    .webp({ quality: 94, alphaQuality: 100, effort: 6 })
    .toBuffer()

  const chars = glyphs
    .map(
      (g) =>
        `    <char id="${g.code}" x="${g.x}" y="${MARGIN}" width="${g.width}" ` +
        `height="${GLYPH_HEIGHT}" xoffset="0" yoffset="0" xadvance="${g.width + TRACKING}"/>`,
    )
    .join('\n')

  const xml =
    `<?xml version="1.0"?>\n<font>\n` +
    `  <info face="arena-digits" size="${GLYPH_HEIGHT}"/>\n` +
    `  <common lineHeight="${GLYPH_HEIGHT}" base="${GLYPH_HEIGHT}"/>\n` +
    `  <chars count="${glyphs.length}">\n${chars}\n  </chars>\n</font>\n`

  return { png, xml }
}
