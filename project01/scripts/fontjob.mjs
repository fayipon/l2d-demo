import sharp from 'sharp'

/**
 * The arena's digits, cut out of the painted glyph sheet.
 *
 * The source is a display of every glyph on a dark plate, not a font file. All
 * this takes is the ten digits, because the ten digits are what the arena
 * draws -- damage, and nothing else. The rest of the sheet is left where it is
 * rather than exported against a use that does not exist.
 *
 * Laid out as fixed-width cells, which is a choice and not a limitation of the
 * loader. Numbers that change every frame must not shuffle sideways as a 1
 * becomes an 8, so the advance is constant and each digit is centred in it --
 * tabular figures, the same reason the HUD's CSS asks for them.
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
 * Cell geometry of the output.
 *
 * Exported taller than anything draws it -- the numbers run at 26 and crits at
 * half again -- so the scale is always down. An upscaled painted glyph looks
 * like a photograph of a glyph.
 */
export const DIGIT_CELL = { width: 56, height: 64, spacing: 4, margin: 2 }

export async function buildDigitFont(source) {
  const raw = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 3; i < raw.data.length; i += raw.info.channels) {
    if (raw.data[i] <= ALPHA_FLOOR) {
      raw.data[i] = 0
    }
  }
  const cleaned = await sharp(raw.data, {
    raw: { width: raw.info.width, height: raw.info.height, channels: raw.info.channels },
  })
    .png()
    .toBuffer()

  const bandHeight = DIGIT_BAND.bottom - DIGIT_BAND.top + 1
  /* Every digit is cut at the full height of the band rather than trimmed to
     its own ink. They share a baseline in the source, and trimming each to
     itself would throw that away and put a 7 and a 4 at different heights. */
  const scale = DIGIT_CELL.height / bandHeight

  const cells = []
  for (const [index, [left, right]] of DIGIT_COLUMNS.entries()) {
    const width = right - left + 1
    const glyph = await sharp(cleaned)
      .extract({ left, top: DIGIT_BAND.top, width, height: bandHeight })
      .resize({ height: DIGIT_CELL.height })
      .png()
      .toBuffer()
    const drawn = Math.round(width * scale)
    cells.push({
      input: glyph,
      left:
        DIGIT_CELL.margin +
        index * (DIGIT_CELL.width + DIGIT_CELL.spacing) +
        Math.round((DIGIT_CELL.width - drawn) / 2),
      top: DIGIT_CELL.margin,
    })
  }

  const sheetWidth =
    DIGIT_CELL.margin * 2 +
    DIGIT_COLUMNS.length * DIGIT_CELL.width +
    (DIGIT_COLUMNS.length - 1) * DIGIT_CELL.spacing
  const sheetHeight = DIGIT_CELL.margin * 2 + DIGIT_CELL.height

  return sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(cells)
    .webp({ quality: 94, alphaQuality: 100, effort: 6 })
    .toBuffer()
}
