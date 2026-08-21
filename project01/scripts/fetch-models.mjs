/**
 * One-off fetch of Live2D sample models from Live2D's own CubismWebSamples
 * repository -- the same place this project's Haru came from.
 *
 * Everything except the textures lands in public/live2d/<name>/ ready to serve.
 * Texture PNGs land in DESIGN/live2d/<name>/ instead, because they are sources
 * for assets:optimize rather than files to ship; that script emits the WebP the
 * model3.json actually points at.
 *
 * The file list comes from each model3.json rather than a directory walk over
 * the GitHub contents API: unauthenticated API calls are capped at 60 an hour
 * and four models blow through that, while raw.githubusercontent.com is not
 * rate limited the same way. It also means only referenced files are fetched.
 *
 * CHOOSING A MODEL: the bundled Cubism Core loads moc3 up to version 5, and a
 * newer Core breaks the renderer this library ships with -- see the note in
 * index.html. A model's moc3 version is the fifth byte of its .moc3 file, and
 * this script refuses anything higher rather than letting it fail in the
 * browser as "Failed to CubismMoc.create()".
 *
 * These models are Live2D sample data, covered by Live2D's Free Material
 * Licence. Fine for a demo like this one; check the terms before shipping
 * anything commercial.
 *
 * Run with `npm run models:fetch`. Output is committed, so this is not part of
 * a normal build.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(root, '..')

const MODELS = ['Haru', 'Hiyori', 'Mao', 'Rice']
const RAW = 'https://raw.githubusercontent.com/Live2D/CubismWebSamples/develop/Samples/Resources'
const MAX_MOC_VERSION = 5

/** e.g. "Haru.2048/texture_00.png" inside a model3.json's Textures array. */
const TEXTURE_REF = /("[A-Za-z]+\.2048\/texture_\d+)\.png"/g

const isTexture = (path) => /\.(png|jpe?g)$/i.test(path)

async function download(path) {
  const res = await fetch(`${RAW}/${path}`)
  if (!res.ok) {
    throw new Error(`fetch ${path}: ${res.status}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/** Every file a model3.json points at, relative to the model's own folder. */
function referencedFiles(model3) {
  const f = model3.FileReferences ?? {}
  const motions = Object.values(f.Motions ?? {}).flat()
  return [
    f.Moc,
    ...(f.Textures ?? []),
    f.Physics,
    f.Pose,
    f.UserData,
    f.DisplayInfo,
    ...(f.Expressions ?? []).map((e) => e.File),
    ...motions.map((m) => m.File),
    ...motions.map((m) => m.Sound),
  ].filter(Boolean)
}

for (const model of MODELS) {
  // Directories are lowercased so served paths match the character ids the app
  // uses; the files inside keep the sample's own capitalisation.
  const dir = model.toLowerCase()
  const manifestName = `${model}.model3.json`
  const manifestRaw = await download(`${model}/${manifestName}`)
  const model3 = JSON.parse(manifestRaw.toString('utf8'))

  const mocRef = model3.FileReferences.Moc
  const moc = await download(`${model}/${mocRef}`)
  if (moc[4] > MAX_MOC_VERSION) {
    throw new Error(
      `${model}: moc3 version ${moc[4]} is above the supported ${MAX_MOC_VERSION}; ` +
      'the bundled Cubism Core cannot load it. Pick a different model.',
    )
  }

  let shipped = 1 // the manifest itself, written below
  let sources = 0

  for (const ref of referencedFiles(model3)) {
    const body = ref === mocRef ? moc : await download(`${model}/${ref}`)
    const target = isTexture(ref)
      ? resolve(repo, 'DESIGN/live2d', dir, ref)
      : resolve(root, 'public/live2d', dir, ref)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, body)
    if (isTexture(ref)) {
      sources++
    } else {
      shipped++
    }
  }

  // The upstream model3.json points at PNG textures; assets:optimize emits
  // WebP, so rewrite the references here rather than leaving a manual step that
  // only surfaces as a 404 much later.
  const manifest = resolve(root, 'public/live2d', dir, manifestName)
  await mkdir(dirname(manifest), { recursive: true })
  await writeFile(manifest, manifestRaw.toString('utf8').replace(TEXTURE_REF, '$1.webp"'))

  console.log(
    `${model.padEnd(7)} moc3 v${moc[4]}  ${shipped} files to public/live2d/${dir}, ` +
    `${sources} texture${sources === 1 ? '' : 's'} to DESIGN`,
  )
}
