import { Cubism4ModelSettings } from 'pixi-live2d-display-advanced/cubism4'
import { mocPath } from './inspect'

/**
 * What the settings constructor takes, derived from the constructor itself.
 *
 * Named this way rather than by importing the library's `ModelJSON`, because
 * the whole reason a settings object is being hand-built here is that the JSON
 * came from a file the tool has not validated. Deriving the type keeps the cast
 * honest about being a cast, and cannot go stale if the library renames it.
 */
type SettingsInput = ConstructorParameters<typeof Cubism4ModelSettings>[0]

/**
 * Where a model can come from.
 *
 * Two routes, and the second one is why this tool exists. The built-in list is
 * convenience -- the four models already in the repo, for checking the bench
 * itself and for comparing a new model against a known-good one. The folder
 * route is the point: a model downloaded from anywhere at all can be dropped in
 * and answered without being copied into the repository first.
 *
 * Both end at the same place, a `Cubism4ModelSettings` plus the moc's raw
 * bytes, so everything downstream is unaware of which route it came by.
 */

export interface ModelSource {
  /** Shown in the picker. */
  label: string
  /** For the emitted config's `modelPath`, when there is a meaningful one. */
  servedPath: string | null
  settings: Cubism4ModelSettings
  json: unknown
  /** Raw moc3, for the version check that runs before the loader is called. */
  moc: ArrayBuffer
  /** Revoked when the source is replaced. Empty for the built-in models. */
  blobs: string[]
}

/**
 * The four in project01/public/live2d.
 *
 * Hardcoded because HTTP has no directory listing and the static directory is
 * not part of the module graph, so there is nothing to glob. It mirrors the
 * `MODELS` array in project01/scripts/fetch-models.mjs and wants updating
 * alongside it -- a stale entry here is a 404 in the picker and nothing worse.
 */
const BUILT_IN = [
  { id: 'haru', file: 'Haru' },
  { id: 'hiyori', file: 'Hiyori' },
  { id: 'mao', file: 'Mao' },
  { id: 'rice', file: 'Rice' },
]

export const BUILT_IN_LABELS = BUILT_IN.map((m) => m.file)

/** Joins a relative reference onto the directory of a URL. */
function relativeTo(url: string, path: string): string {
  return url.slice(0, url.lastIndexOf('/') + 1) + path
}

export async function loadBuiltIn(index: number): Promise<ModelSource> {
  const entry = BUILT_IN[index]
  const url = `/live2d/${entry.id}/${entry.file}.model3.json`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`讀不到 ${url}（${res.status}）— 這個模型可能不在 project01/public 裡`)
  }
  const json = await res.json()

  const moc = mocPath(json)
  if (!moc) {
    throw new Error('model3.json 沒有宣告 Moc')
  }
  const mocRes = await fetch(relativeTo(url, moc))
  if (!mocRes.ok) {
    throw new Error(`讀不到 moc：${moc}`)
  }

  return {
    label: entry.file,
    servedPath: `live2d/${entry.id}/${entry.file}.model3.json`,
    settings: new Cubism4ModelSettings({ ...(json as object), url } as SettingsInput),
    json,
    moc: await mocRes.arrayBuffer(),
    blobs: [],
  }
}

/* ---------- a dropped folder ---------- */

/** The path a File carries relative to the folder it was picked from. */
const pathOf = (file: File): string =>
  (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name

/**
 * Turns a set of files into something the loader will take.
 *
 * The trick is `ModelSettings.replaceFiles`, which hands back every resource
 * path the settings declares and takes a replacement. So each declared path is
 * matched against the dropped files and swapped for a blob URL, and the loader
 * never learns that the model is not on a server.
 *
 * Paths are matched from the *right*. A folder dropped as `natori/` gives
 * `natori/Natori.2048/texture_00.png` while the settings says
 * `Natori.2048/texture_00.png`, and how many folders deep the drop happened to
 * be is not something the model should have to agree about.
 */
export async function loadFolder(files: File[]): Promise<ModelSource> {
  const settingsFile = files.find((f) => f.name.endsWith('.model3.json'))
  if (!settingsFile) {
    throw new Error('這個資料夾裡沒有 .model3.json')
  }

  const json = JSON.parse(await settingsFile.text())
  const blobs: string[] = []
  const urlFor = (file: File) => {
    const url = URL.createObjectURL(file)
    blobs.push(url)
    return url
  }

  const settingsPath = pathOf(settingsFile)
  const base = settingsPath.slice(0, settingsPath.lastIndexOf('/') + 1)
  const byPath = new Map(files.map((f) => [pathOf(f), f]))
  const find = (declared: string): File | undefined =>
    byPath.get(base + declared) ??
    byPath.get(declared) ??
    files.find((f) => pathOf(f).endsWith('/' + declared) || pathOf(f) === declared)

  const moc = mocPath(json)
  const mocFile = moc ? find(moc) : undefined
  if (!mocFile) {
    throw new Error(`model3.json 指向的 moc 不在這個資料夾裡：${moc ?? '(未宣告)'}`)
  }

  const settings = new Cubism4ModelSettings({
    ...(json as object),
    /* Any URL will do -- every path below is replaced with an absolute blob:
       URL, which `resolveURL` leaves alone. It only has to be non-empty, since
       the library takes the model's name from the folder part of it. */
    url: settingsPath,
  } as SettingsInput)

  const missing: string[] = []
  settings.replaceFiles((declared) => {
    const file = find(declared)
    if (!file) {
      missing.push(declared)
      return declared
    }
    return urlFor(file)
  })

  if (missing.length > 0) {
    blobs.forEach((url) => URL.revokeObjectURL(url))
    throw new Error(`資料夾裡少了 ${missing.length} 個檔案，第一個是 ${missing[0]}`)
  }

  /*
   * Resolution has to be switched off, and this is not a nicety.
   *
   * `resolveURL` joins a relative path onto the settings' own URL, and the
   * routine it uses normalises the `//` in a `blob:` URL out of existence:
   *
   *   blob:http://localhost:5174/abc  ->  blob:http//localhost:5174/abc
   *
   * The colon after the scheme is eaten, every texture and motion 404s, and the
   * model arrives as an untextured mesh with no obvious cause. Every path above
   * has already been replaced with an absolute blob URL, so there is nothing
   * left to resolve and identity is the correct answer.
   */
  settings.resolveURL = (path: string) => path

  return {
    label: settingsFile.name.replace('.model3.json', ''),
    servedPath: null,
    settings,
    json,
    moc: await mocFile.arrayBuffer(),
    blobs,
  }
}

/* ---------- getting the files out of a drop ---------- */

/**
 * Walks a dropped directory into a flat file list.
 *
 * `webkitGetAsEntry` is the only way to read a *folder* out of a drop -- the
 * plain `DataTransfer.files` list is empty for a directory. And the reader has
 * to be called repeatedly until it returns nothing, which is the part that is
 * easy to get wrong: Chrome hands back at most a hundred entries per call, so a
 * model with a large motion folder silently loses everything past the first
 * batch and then fails as a missing file rather than as a truncated read.
 */
async function walk(entry: FileSystemEntry, prefix: string): Promise<File[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject))
    // The path is how a declared resource is matched back to a dropped file,
    // and a File from an entry does not carry one.
    Object.defineProperty(file, 'webkitRelativePath', { value: prefix + entry.name })
    return [file]
  }
  if (!entry.isDirectory) {
    return []
  }

  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const children: FileSystemEntry[] = []
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    )
    if (batch.length === 0) {
      break
    }
    children.push(...batch)
  }

  const nested = await Promise.all(children.map((c) => walk(c, `${prefix}${entry.name}/`)))
  return nested.flat()
}

export async function filesFromDrop(transfer: DataTransfer): Promise<File[]> {
  const entries = Array.from(transfer.items)
    .map((item) => item.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null)

  if (entries.length === 0) {
    // Files rather than a folder, which is still worth accepting: a model
    // flattened into one directory is a normal way to receive one.
    return Array.from(transfer.files)
  }
  const walked = await Promise.all(entries.map((e) => walk(e, '')))
  return walked.flat()
}
