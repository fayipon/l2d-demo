/**
 * Converts the source artwork in DESIGN/ into the WebP files the app imports.
 *
 * The originals are multi-megabyte PNGs, which would dominate first paint --
 * the background alone was seven times the gzipped JS bundle. WebP at quality
 * 82 is visually indistinguishable on this artwork and roughly an order of
 * magnitude smaller.
 *
 * Run with `npm run assets:optimize`. The output is committed, so a normal
 * build never needs sharp.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(root, '..')
const assets = resolve(root, 'src/assets')

const JOBS = [
  {
    from: resolve(repo, 'DESIGN/game_background_02.png'),
    to: resolve(assets, 'game-background-02.webp'),
    quality: 82,
    // Chroma subsampling is what bands the red sky; smartSubsample keeps it.
    smartSubsample: true,
  },
]

const kb = (n) => `${(n / 1024).toFixed(0)} kB`

for (const job of JOBS) {
  await mkdir(dirname(job.to), { recursive: true })
  const input = await readFile(job.from)
  const output = await sharp(input)
    .webp({ quality: job.quality, smartSubsample: job.smartSubsample, effort: 6 })
    .toBuffer()
  await writeFile(job.to, output)
  const { width, height } = await sharp(output).metadata()
  const saved = ((1 - output.length / input.length) * 100).toFixed(1)
  console.log(
    `${job.to.slice(root.length + 1)}  ${width}x${height}  ` +
    `${kb(input.length)} -> ${kb(output.length)}  (-${saved}%)`,
  )
}

// Swapping artwork leaves the previous output behind, and an unreferenced
// megabyte in src/assets is easy to miss in review. Name anything here that
// this run did not produce.
const produced = new Set(JOBS.map((job) => basename(job.to)))
const stale = (await readdir(assets)).filter((name) => !produced.has(name))
if (stale.length) {
  console.warn(`warning: unreferenced in src/assets -- delete if unused: ${stale.join(', ')}`)
}
