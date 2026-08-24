/**
 * What can be known about a model before it is handed to the loader, and what
 * can be read off it afterwards.
 *
 * The order matters and is the reason this file exists. The moc3 version is
 * read from the raw bytes *first*, because the failure it predicts is the one
 * that costs real money: a model authored in a current Cubism Editor exports
 * moc3 v6, the pinned Core 5 refuses it with `Failed to CubismMoc.create()`,
 * and that message says nothing at all to anyone who has not read the note in
 * project01/index.html. Reported up front it is one line: this is v6, the Core
 * takes 5, it will not run.
 */

/**
 * The ceiling the bundled Core imposes.
 *
 * The same number as `MAX_MOC_VERSION` in project01/scripts/fetch-models.mjs,
 * and the two have to agree -- that script guards models fetched from Live2D's
 * sample repository, and this guards everything acquired any other way. If the
 * runtime is ever upgraded, both move together or one of them starts lying.
 */
export const MAX_MOC_VERSION = 5

/** 'MOC3' — every moc3 file opens with it. */
const MAGIC = [0x4d, 0x4f, 0x43, 0x33]

export interface MocReport {
  version: number | null
  supported: boolean
  /** Present when the file is not a moc3 at all, rather than merely too new. */
  problem: string | null
  bytes: number
}

export function readMoc(buffer: ArrayBuffer): MocReport {
  const view = new Uint8Array(buffer)
  if (view.length < 8) {
    return { version: null, supported: false, problem: '檔案太小，不是 moc3', bytes: view.length }
  }
  for (let i = 0; i < MAGIC.length; i++) {
    if (view[i] !== MAGIC[i]) {
      return {
        version: null,
        supported: false,
        problem: '開頭不是 MOC3，這不是一個 moc3 檔',
        bytes: view.length,
      }
    }
  }
  /* The version is the fifth byte, flat. Not a struct, not an offset -- one
     byte, which is what makes this check cheap enough to run before anything
     else and worth running on every model that arrives from anywhere. */
  const version = view[4]
  return {
    version,
    supported: version <= MAX_MOC_VERSION,
    problem: null,
    bytes: view.length,
  }
}

/* ---------- what the settings JSON declares ---------- */

export interface MotionEntry {
  index: number
  file: string
  /** Only Haru's motions carry one in the sample set, and it is what makes the
   *  difference between a pose and a line of dialogue. */
  sound: string | null
}

export interface SettingsReport {
  motionGroups: { name: string; entries: MotionEntry[] }[]
  expressions: { id: string; file: string }[]
  textures: string[]
  hitAreas: { id: string; name: string }[]
  hasPhysics: boolean
  hasPose: boolean
}

interface RawMotion {
  File?: string
  Sound?: string
}

interface RawExpression {
  Name?: string
  File?: string
}

interface RawHitArea {
  Id?: string
  Name?: string
}

interface RawSettings {
  FileReferences?: {
    Moc?: string
    Textures?: string[]
    Physics?: string
    Pose?: string
    Expressions?: RawExpression[]
    Motions?: Record<string, RawMotion[]>
  }
  HitAreas?: RawHitArea[]
}

export function readSettings(json: unknown): SettingsReport {
  const raw = (json ?? {}) as RawSettings
  const files = raw.FileReferences ?? {}
  const motions = files.Motions ?? {}

  return {
    motionGroups: Object.entries(motions).map(([name, entries]) => ({
      name,
      entries: (entries ?? []).map((entry, index) => ({
        index,
        file: entry.File ?? '',
        sound: entry.Sound ?? null,
      })),
    })),
    expressions: (files.Expressions ?? []).map((e, i) => ({
      // A model that numbers its expressions without naming them still needs a
      // key to fire them by, and the index is what the library falls back to.
      id: e.Name ?? String(i),
      file: e.File ?? '',
    })),
    textures: files.Textures ?? [],
    hitAreas: (raw.HitAreas ?? []).map((h, i) => ({
      id: h.Id ?? String(i),
      name: h.Name ?? '',
    })),
    hasPhysics: Boolean(files.Physics),
    hasPose: Boolean(files.Pose),
  }
}

/** The moc's path as the settings declares it, for fetching the bytes to
 *  version-check before the loader is given anything. */
export function mocPath(json: unknown): string | null {
  return ((json ?? {}) as RawSettings).FileReferences?.Moc ?? null
}

/* ---------- what the loaded model says about itself ---------- */

/**
 * The core model, as much of it as this tool touches.
 *
 * Typed by hand rather than imported: the library's own types describe
 * `coreModel` as `object`, and every reader of it in this project ends up
 * asserting a shape. Better one honest local interface than an `any`.
 */
export interface CoreModelLike {
  getDrawableCount(): number
  getParameterCount(): number
  getDrawableVertices(index: number): Float32Array
  getDrawableOpacity(index: number): number
  getDrawableDynamicFlagIsVisible(index: number): boolean
}

export interface LoadedReport {
  canvasWidth: number
  canvasHeight: number
  pixelsPerUnit: number
  drawables: number
  parameters: number
}
