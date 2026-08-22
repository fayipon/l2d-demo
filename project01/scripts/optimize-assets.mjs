/**
 * Converts the source art in DESIGN/ into the WebP files the app ships.
 *
 * The originals are multi-megabyte PNGs. The background alone was seven times
 * the gzipped JS bundle, and the model textures are another few megabytes that
 * do not even start downloading until a model3.json has been parsed. WebP cuts
 * both by roughly an order of magnitude.
 *
 * Model textures are the delicate case: they carry the character's alpha mask,
 * and lossy alpha frays the silhouette. `alphaQuality: 100` keeps the alpha
 * channel bit-exact while the colour channels compress, which is why quality
 * can sit at 92 without visible edge artefacts.
 *
 * Backgrounds: there are two paintings but four characters, so two of the
 * outputs are hue-rotated grades of a painting rather than art of their own.
 * They read as different places, but they are a stand-in -- drop a real
 * DESIGN/game_background_0N.png in and point the entry at it.
 *
 * Run with `npm run assets:optimize`. Output is committed, so a normal build
 * never needs sharp.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { buildDigitFont } from './fontjob.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(root, '..')
const assets = resolve(root, 'src/assets')

/** Chroma subsampling, not quantisation, is what bands these red skies. */
const BACKGROUND_WEBP = { quality: 82, smartSubsample: true, effort: 6 }
const TEXTURE_WEBP = { quality: 92, alphaQuality: 100, effort: 6 }

const BACKGROUNDS = [
  { out: 'game-background-01.webp', from: 'game_background_01.png' },
  { out: 'game-background-02.webp', from: 'game_background_02.png' },
  // Colour grades standing in for art that does not exist yet.
  { out: 'game-background-03.webp', from: 'game_background_02.png', modulate: { hue: 150, saturation: 0.85 } },
  { out: 'game-background-04.webp', from: 'game_background_01.png', modulate: { hue: 205, saturation: 0.9 } },
]

/*
 * Scene art for the story screen: chapter cards, stage rows and the stage
 * preview panel. There is no art for these, so each is a different region of
 * one of the two paintings, colour graded. Cropping is what makes them read as
 * different places -- the same painting hue-shifted six times still looks like
 * six pictures of the same castle.
 *
 * They are 560x315 because the largest place one appears is the preview panel,
 * around 550 device pixels wide. Replace an entry with real art and nothing
 * else has to change.
 */
const STORY_ART = [
  { out: 'scene-01.webp', from: 'game_background_02.png', crop: [1030, 470, 560, 315] },
  { out: 'scene-02.webp', from: 'game_background_01.png', crop: [60, 520, 560, 315], modulate: { hue: 120, saturation: 0.7 } },
  { out: 'scene-03.webp', from: 'game_background_02.png', crop: [560, 180, 560, 315], modulate: { hue: 40, saturation: 0.75 } },
  { out: 'scene-04.webp', from: 'game_background_01.png', crop: [1090, 300, 560, 315], modulate: { hue: 265, saturation: 0.8 } },
  { out: 'scene-05.webp', from: 'game_background_02.png', crop: [80, 60, 560, 315], modulate: { hue: 200, saturation: 0.85 } },
  { out: 'scene-06.webp', from: 'game_background_01.png', crop: [600, 600, 560, 315], modulate: { hue: 330, saturation: 0.9 } },
  // The chapter-1 card. The blood moon and the castle, ungraded and pushed a
  // little warmer -- the crop with the most contrast and the only warm one,
  // which is what the mock puts there.
  { out: 'scene-07.webp', from: 'game_background_02.png', crop: [770, 250, 560, 315], modulate: { saturation: 1.05 } },
]

/** Every model's textures, named by the folder they live in. */
const MODELS = [
  { dir: 'haru', textures: ['Haru.2048/texture_00', 'Haru.2048/texture_01'] },
  { dir: 'hiyori', textures: ['Hiyori.2048/texture_00', 'Hiyori.2048/texture_01'] },
  { dir: 'mao', textures: ['Mao.2048/texture_00'] },
  { dir: 'rice', textures: ['Rice.2048/texture_00', 'Rice.2048/texture_01'] },
]

/**
 * Character sprite sheets for the arena.
 *
 * The source is one image of labelled rows -- 待機 / 攻擊 / 升級 / 受傷, six
 * frames each -- with a decorative plaque down the left edge that is not art,
 * and cells that are not on a round pitch. This measures nothing at runtime:
 * the geometry below was read off the source's own alpha, once, and is the
 * only place it is written down.
 *
 * The source also carries a faint plate behind every pose -- part of the
 * contact sheet's presentation, not of the art. It is nearly invisible on the
 * grey it was drawn against and reads as a dark box on the arena floor, so
 * anything under SPRITE_ALPHA_FLOOR is cleared before slicing. The plate sits
 * at an alpha of 1 to 7; the effects' outer glow is well above it, so the
 * cut takes the box and leaves the light.
 *
 * Frames are re-laid with a gutter between them. Two different things need it.
 * The game runs with linear filtering, so a sampler at a frame's edge reaches
 * into whatever is next to it; and lossy WebP has no notion of frames at all,
 * so it will happily spread one pose's red into another's. Neither shows up
 * until something is on screen and moving.
 */
const SPRITES = [
  {
    out: 'actor-haru.webp',
    from: 'game_char_sprite_01.png',
    /* The grid, in source pixels. The left edge clears the label plaque, which
       runs to x=60 and overlaps where a uniform first cell would start. */
    grid: { left: 61, top: 14, right: 1524, bottom: 979, cols: 6, rows: 4 },
  },
]

/** Output geometry, shared by every sheet so the loader has one set of
 *  numbers to be told. Mirrored in game/data/actors.ts, which is the only
 *  other place that may know them. */
const SPRITE_FRAME = 128
const SPRITE_MARGIN = 2
const SPRITE_SPACING = 4
/** Alpha at or below this is presentation rather than art. See above. */
const SPRITE_ALPHA_FLOOR = 8

async function buildSpriteSheet(spec) {
  const { left, top, right, bottom, cols, rows } = spec.grid
  const cw = (right - left) / cols
  const chh = (bottom - top) / rows
  const source = resolve(repo, 'DESIGN', spec.from)

  /* Cleared once, on the source, rather than per cell: doing it after the
     resize would be too late, because resampling turns a cleared edge and its
     neighbour back into a value just above the floor. */
  const raw = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 3; i < raw.data.length; i += raw.info.channels) {
    if (raw.data[i] <= SPRITE_ALPHA_FLOOR) {
      raw.data[i] = 0
    }
  }
  const cleaned = await sharp(raw.data, {
    raw: { width: raw.info.width, height: raw.info.height, channels: raw.info.channels },
  })
    .png()
    .toBuffer()

  const cells = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.round(left + c * cw)
      const y = Math.round(top + r * chh)
      const width = Math.round(left + (c + 1) * cw) - x
      const height = Math.round(top + (r + 1) * chh) - y
      /* Fitted inside the frame rather than stretched to it: the source cells
         are slightly wider than tall, and squaring them would make the
         character subtly fatter in a way that is hard to see and impossible to
         unsee. */
      const cell = await sharp(cleaned)
        .extract({ left: x, top: y, width, height })
        .resize(SPRITE_FRAME, SPRITE_FRAME, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
      cells.push({
        input: cell,
        left: SPRITE_MARGIN + c * (SPRITE_FRAME + SPRITE_SPACING),
        top: SPRITE_MARGIN + r * (SPRITE_FRAME + SPRITE_SPACING),
      })
    }
  }

  const sheetWidth = SPRITE_MARGIN * 2 + cols * SPRITE_FRAME + (cols - 1) * SPRITE_SPACING
  const sheetHeight = SPRITE_MARGIN * 2 + rows * SPRITE_FRAME + (rows - 1) * SPRITE_SPACING
  return sharp({
    create: { width: sheetWidth, height: sheetHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(cells)
    .webp(TEXTURE_WEBP)
    .toBuffer()
}

const JOBS = [
  ...BACKGROUNDS.map((bg) => ({
    from: resolve(repo, 'DESIGN', bg.from),
    to: resolve(assets, bg.out),
    webp: BACKGROUND_WEBP,
    modulate: bg.modulate,
  })),
  ...STORY_ART.map((art) => ({
    from: resolve(repo, 'DESIGN', art.from),
    to: resolve(assets, art.out),
    webp: BACKGROUND_WEBP,
    modulate: art.modulate,
    crop: art.crop,
  })),
  {
    /* The arena's digits. See fontjob.mjs -- the source is a painted display
       of every glyph, and this takes the ten the game draws.

       Two files: the packed glyphs and the BMFont XML that says how wide each
       one is. The metrics are written beside the image rather than mirrored
       into TypeScript, because they are generated from the same measurement
       in the same pass and a hand-copied table is a table that goes stale. */
    from: resolve(repo, 'DESIGN/game_font.png'),
    to: resolve(assets, 'font-digits.webp'),
    alsoWrites: ['font-digits.fnt'],
    build: async () => {
      const { png, xml } = await buildDigitFont(resolve(repo, 'DESIGN/game_font.png'))
      await writeFile(resolve(assets, 'font-digits.fnt'), xml)
      return png
    },
  },
  ...SPRITES.map((sprite) => ({
    from: resolve(repo, 'DESIGN', sprite.from),
    to: resolve(assets, sprite.out),
    build: () => buildSpriteSheet(sprite),
  })),
  ...MODELS.flatMap((model) =>
    model.textures.map((texture) => ({
      from: resolve(repo, 'DESIGN/live2d', model.dir, `${texture}.png`),
      to: resolve(root, 'public/live2d', model.dir, `${texture}.webp`),
      webp: TEXTURE_WEBP,
    })),
  ),
]

const kb = (n) => `${(n / 1024).toFixed(0)} kB`

let before = 0
let after = 0

for (const job of JOBS) {
  await mkdir(dirname(job.to), { recursive: true })
  const input = await readFile(job.from)
  let pipeline = sharp(input)
  if (job.crop) {
    const [left, top, width, height] = job.crop
    pipeline = pipeline.extract({ left, top, width, height })
  }
  if (job.modulate) {
    pipeline = pipeline.modulate(job.modulate)
  }
  const output = job.build ? await job.build() : await pipeline.webp(job.webp).toBuffer()
  await writeFile(job.to, output)
  before += input.length
  after += output.length
  const { width, height } = await sharp(output).metadata()
  console.log(
    `${relative(root, job.to).replace(/\\/g, '/')}  ${width}x${height}  ` +
    `${kb(input.length)} -> ${kb(output.length)}  ` +
    `(-${((1 - output.length / input.length) * 100).toFixed(1)}%)`,
  )
}

console.log(`total  ${kb(before)} -> ${kb(after)}  (-${((1 - after / before) * 100).toFixed(1)}%)`)

// A job may write more than the file it is named for -- the digit font emits
// its metrics beside its image -- so those are declared rather than inferred,
// and a file nobody claims is stale by definition.
// Swapping art leaves the previous output behind, and an unreferenced megabyte
// is easy to miss in review. Every directory written here holds nothing but
// this script's output, so anything else in one is stale.
for (const dir of new Set(JOBS.map((job) => dirname(job.to)))) {
  const produced = new Set(
    JOBS.filter((j) => dirname(j.to) === dir).flatMap((j) => [basename(j.to), ...(j.alsoWrites ?? [])]),
  )
  const stale = (await readdir(dir)).filter((name) => !produced.has(name))
  if (stale.length) {
    console.warn(
      `warning: unreferenced in ${relative(root, dir).replace(/\\/g, '/')} -- ` +
      `delete if unused: ${stale.join(', ')}`,
    )
  }
}
