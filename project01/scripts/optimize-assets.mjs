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

/** Every model's textures, named by the folder they live in. */
const MODELS = [
  { dir: 'haru', textures: ['Haru.2048/texture_00', 'Haru.2048/texture_01'] },
  { dir: 'hiyori', textures: ['Hiyori.2048/texture_00', 'Hiyori.2048/texture_01'] },
  { dir: 'mao', textures: ['Mao.2048/texture_00'] },
  { dir: 'rice', textures: ['Rice.2048/texture_00', 'Rice.2048/texture_01'] },
]

const JOBS = [
  ...BACKGROUNDS.map((bg) => ({
    from: resolve(repo, 'DESIGN', bg.from),
    to: resolve(assets, bg.out),
    webp: BACKGROUND_WEBP,
    modulate: bg.modulate,
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
  if (job.modulate) {
    pipeline = pipeline.modulate(job.modulate)
  }
  const output = await pipeline.webp(job.webp).toBuffer()
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

// Swapping art leaves the previous output behind, and an unreferenced megabyte
// is easy to miss in review. Every directory written here holds nothing but
// this script's output, so anything else in one is stale.
for (const dir of new Set(JOBS.map((job) => dirname(job.to)))) {
  const produced = new Set(JOBS.filter((j) => dirname(j.to) === dir).map((j) => basename(j.to)))
  const stale = (await readdir(dir)).filter((name) => !produced.has(name))
  if (stale.length) {
    console.warn(
      `warning: unreferenced in ${relative(root, dir).replace(/\\/g, '/')} -- ` +
      `delete if unused: ${stale.join(', ')}`,
    )
  }
}
