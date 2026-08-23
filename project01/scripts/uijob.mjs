import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

/**
 * The painted UI kit, cut into the pieces the HUD is built from.
 *
 * The source is a sheet of frames, plates, bars, pills, buttons and icons on a
 * transparent background -- the thing the battle screen's CSS has been
 * imitating with gradients and one-pixel borders since it was written. Every
 * piece is an island of alpha, so the rectangles below came off a
 * connected-component pass over that alpha, once, and this file is the only
 * place they are written down.
 *
 * Three things about the shape of this job.
 *
 * **One file per piece, not a sheet.** Most of these frames stretch, and the
 * only way to stretch an ornate frame without smearing its corners is CSS
 * `border-image`, which takes a whole image and cannot address a rectangle
 * inside a larger one. Since the frames have to be separate files anyway,
 * making the icons a sheet would mean two delivery mechanisms to save a dozen
 * cached requests. They are all files.
 *
 * **The nine-slice insets are measured here, not typed into CSS.** They belong
 * to the crop: move a rectangle by four pixels and every inset on that piece
 * is wrong. So this pass writes `kit.css` beside the images, holding one rule
 * per piece, and the hand-written stylesheet imports it and does the layout.
 * Same argument as the digit font's metrics and the terrain's frame table.
 *
 * **Nothing is resized.** The pieces are used at roughly half the size they
 * were drawn, and the arena has already been through the lesson: flattening art
 * to its display size in the pipeline throws away exactly the detail the
 * display then asks for back. CSS scales them, and `--uk` is how.
 */

/**
 * The scale knob every generated rule is written in terms of.
 *
 * A nine-sliced frame is only right if its border widths are the source insets
 * times one factor -- get that wrong and the corners are stretched or the edges
 * are the wrong thickness. Writing the widths as `calc(<inset>px * var(--uk))`
 * means a caller sets one number, `--uk: 0.45`, and the whole frame lands at
 * 45% with its proportions intact.
 */
const SCALE_VAR = '--uk'

/**
 * Every piece, as `rect: [left, top, width, height]` in the source.
 *
 * `slice` is the interior of a frame -- `[top, right, bottom, left]`, the same
 * order CSS uses -- and its presence is what makes a piece nine-sliced rather
 * than a picture. Each one was measured by walking out from the centre of the
 * piece until the interior stopped: a filled frame until the flat backing ends,
 * a hollow one until the alpha comes back.
 *
 * `solid` says the interior is part of the art and should be kept (CSS `fill`).
 * Without it the middle is dropped and whatever is behind the element shows
 * through, which is what a hollow frame wants -- and what the two bars want,
 * because their middle is the part that has to move.
 *
 * Only what the HUD actually uses is cut. The sheet also holds two currency
 * pills, three round buttons, a second round slot, corner ornaments and a
 * flourish, and every one of them would be bytes in the bundle with nothing
 * pointing at it -- `kit.css` names every file, so the bundler cannot drop the
 * ones nobody wants. Adding one back is a line here.
 */
const PIECES = [
  /* The pilot panel, top-left of the sheet and top-left of the screen. The
     source stacks these four in the order they are used: a portrait beside a
     name plate, a health bar under them, an experience bar under that. */
  { name: 'portrait-frame', rect: [20, 46, 216, 213], slice: [25, 29, 25, 27], solid: true },
  { name: 'name-plate', rect: [236, 72, 393, 141], slice: [28, 39, 22, 9], solid: true },
  /* The bars are hollow on purpose. The kit draws the health bar full, so the
     middle -- the lit red -- is exactly the part a bar cannot have baked in;
     dropping it leaves the socket, the rails and the caps as a frame, and the
     fill goes behind at whatever width the run says. `bar-hp-fill` is a strip
     of that same lit red, taken from the middle of the drawn bar and repeated,
     so the fill is the artist's colour and not an approximation of it. */
  { name: 'bar-hp', rect: [15, 256, 613, 160], slice: [74, 42, 65, 138] },
  { name: 'bar-hp-fill', rect: [398, 330, 8, 21] },
  { name: 'bar-xp', rect: [40, 416, 585, 102], slice: [34, 39, 40, 103] },

  /* The big frame carries its own title bar -- that is what the deep top inset
     is. The three full-screen overlays all have a heading already, so the
     heading moves into the border. */
  { name: 'panel', rect: [657, 380, 446, 589], slice: [103, 35, 44, 38] },
  { name: 'frame-md', rect: [365, 568, 253, 257], slice: [51, 32, 33, 30] },
  { name: 'slot-square', rect: [234, 869, 150, 136], slice: [17, 22, 19, 21], solid: true },

  /* Pictures rather than frames: they are used at one size and have nothing to
     stretch. The ring's hole is measured, not guessed -- the minimap canvas is
     positioned into it as a percentage, so the map sits inside the frame
     rather than behind it. */
  { name: 'ring', rect: [20, 519, 334, 342], hole: [57, 67, 220, 218] },
  { name: 'slot-round', rect: [37, 864, 144, 147] },
  /* The two currencies the HUD counts: coins, and experience towards the next
     level. The sheet draws a pill for each as well, with the icon already set
     into it, but a pill is a fixed shape with a fixed amount of room in it and
     these two numbers are read side by side -- the medallion plus a number of
     its own is the pair that lines up. */
  { name: 'icon-coin', rect: [1208, 426, 105, 105] },
  { name: 'icon-gem', rect: [1209, 541, 103, 104] },
  { name: 'icon-skull', rect: [1207, 654, 111, 111] },

  /* Rules and flourishes. Deliberately not nine-sliced: the middle of a rule is
     a centre ornament, and a nine-slice would repeat or stretch it into a
     smear. They keep their aspect and sit centred in whatever they are given,
     which is what a rule does anyway. */
  { name: 'rule-lg', rect: [664, 57, 451, 109] },
  { name: 'rule-sm', rect: [691, 274, 391, 39] },
]

/** Every file this job writes beside its stylesheet, so the pipeline's
 *  stale-output check knows what belongs in the directory. */
export const UI_KIT_FILES = PIECES.map((piece) => `${piece.name}.webp`)

const WEBP = { quality: 92, alphaQuality: 100, effort: 6 }

const px = (n) => `calc(${n}px * var(${SCALE_VAR}, 1))`

function ruleFor(piece) {
  const [, , width, height] = piece.rect
  const url = `url('./${piece.name}.webp')`
  if (!piece.slice) {
    /* A hole is given as percentages of the piece, so whatever is meant to sit
       inside the frame can be positioned into it without anything downstream
       knowing the source was 334 pixels across. */
    const hole = piece.hole
      ? [
          `  --hole-x: ${((piece.hole[0] / width) * 100).toFixed(2)}%;`,
          `  --hole-y: ${((piece.hole[1] / height) * 100).toFixed(2)}%;`,
          `  --hole-w: ${((piece.hole[2] / width) * 100).toFixed(2)}%;`,
          `  --hole-h: ${((piece.hole[3] / height) * 100).toFixed(2)}%;`,
        ]
      : []
    return [
      `.uk-${piece.name} {`,
      `  background: ${url} center / contain no-repeat;`,
      `  aspect-ratio: ${width} / ${height};`,
      ...hole,
      `}`,
    ].join('\n')
  }
  const [top, right, bottom, left] = piece.slice
  return [
    `.uk-${piece.name} {`,
    `  border-style: solid;`,
    `  border-color: transparent;`,
    `  border-width: ${px(top)} ${px(right)} ${px(bottom)} ${px(left)};`,
    `  border-image-source: ${url};`,
    `  border-image-slice: ${top} ${right} ${bottom} ${left}${piece.solid ? ' fill' : ''};`,
    `  border-image-repeat: stretch;`,
    /* The border is transparent so the drawn frame is the only thing in it.
       Without clipping the background to the padding box, an element's own
       background fills that transparency and squares off the ornament. */
    `  background-clip: padding-box;`,
    `}`,
  ].join('\n')
}

/**
 * Cuts the sheet into `outDir` and returns the generated stylesheet.
 *
 * The stylesheet is the job's named output because it is the file that can go
 * stale: the images are just pixels, but a rule that disagrees with the crop it
 * came from draws a frame with its corners in the wrong place.
 */
export async function buildUiKit(source, outDir) {
  await mkdir(outDir, { recursive: true })
  const written = []

  for (const piece of PIECES) {
    const [left, top, width, height] = piece.rect
    const buffer = await sharp(source)
      .extract({ left, top, width, height })
      .webp(WEBP)
      .toBuffer()
    await writeFile(resolve(outDir, `${piece.name}.webp`), buffer)
    written.push(`${piece.name}.webp`)
  }

  const css = [
    '/*',
    ' * Generated by scripts/uijob.mjs from DESIGN/game_ui_01.png. Do not edit.',
    ' *',
    ' * One rule per piece of the kit. A frame is a `border-image` whose border',
    ` * widths are its own insets times \`var(${SCALE_VAR})\`, so setting that one`,
    ' * number on an element scales the whole frame without distorting a corner;',
    ' * a picture is a contained background with the aspect it was drawn at.',
    ' *',
    ' * Layout, colour and everything else lives in src/styles/ui-kit.css.',
    ' */',
    '',
    ...PIECES.map(ruleFor),
    '',
  ].join('\n')

  return { css, written }
}
