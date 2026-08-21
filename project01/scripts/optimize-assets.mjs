/**
 * Converts the source artwork in DESIGN/ into the WebP files the app ships.
 *
 * The originals are multi-megabyte PNGs. The background alone was seven times
 * the gzipped JS bundle, and the two model textures were another 2.6 MB that
 * do not even start downloading until the model3.json has been parsed. WebP
 * cuts both by roughly an order of magnitude.
 *
 * Model textures are the delicate case: they carry the character's alpha mask,
 * and lossy alpha frays the silhouette. `alphaQuality: 100` keeps the alpha
 * channel bit-exact while the colour channels compress, which is why quality
 * can sit at 92 without any visible edge artefacts.
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
const textures = resolve(root, 'public/live2d/haru/Haru.2048')

const JOBS = [
  {
    from: resolve(repo, 'DESIGN/game_background_02.png'),
    to: resolve(assets, 'game-background-02.webp'),
    // Chroma subsampling, not quantisation, is what bands the red sky.
    webp: { quality: 82, smartSubsample: true, effort: 6 },
  },
  ...['texture_00', 'texture_01'].map((name) => ({
    from: resolve(repo, `DESIGN/live2d/haru/Haru.2048/${name}.png`),
    to: resolve(textures, `${name}.webp`),
    webp: { quality: 92, alphaQuality: 100, effort: 6 },
  })),
]

const kb = (n) => `${(n / 1024).toFixed(0)} kB`

let before = 0
let after = 0

for (const job of JOBS) {
  await mkdir(dirname(job.to), { recursive: true })
  const input = await readFile(job.from)
  const output = await sharp(input).webp(job.webp).toBuffer()
  await writeFile(job.to, output)
  before += input.length
  after += output.length
  const { width, height } = await sharp(output).metadata()
  const saved = ((1 - output.length / input.length) * 100).toFixed(1)
  console.log(
    `${relative(root, job.to)}  ${width}x${height}  ` +
    `${kb(input.length)} -> ${kb(output.length)}  (-${saved}%)`,
  )
}

console.log(`total  ${kb(before)} -> ${kb(after)}  (-${((1 - after / before) * 100).toFixed(1)}%)`)

// Swapping artwork leaves the previous output behind, and an unreferenced
// megabyte is easy to miss in review. Both output directories hold nothing but
// this script's output, so anything else in them is stale.
for (const dir of new Set(JOBS.map((job) => dirname(job.to)))) {
  const produced = new Set(JOBS.filter((j) => dirname(j.to) === dir).map((j) => basename(j.to)))
  const stale = (await readdir(dir)).filter((name) => !produced.has(name))
  if (stale.length) {
    console.warn(`warning: unreferenced in ${relative(root, dir)} -- delete if unused: ${stale.join(', ')}`)
  }
}
