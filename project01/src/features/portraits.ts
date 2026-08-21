import { useSyncExternalStore } from 'react'

/**
 * Roster thumbnails, rendered from the Live2D models themselves.
 *
 * There is no portrait art for these characters, and their texture atlases are
 * no help -- the face is a blank oval with the eyes and mouth scattered
 * elsewhere as separate UV islands. So the stage captures a head crop from the
 * live model once it has posed, and that lands here.
 *
 * Consequence worth knowing: a character only has a portrait once their model
 * has been on screen at least once. The roster falls back to an emblem until
 * then, and the cache is persisted so that after a first pass through the
 * roster it holds for good. Warming them all up front would mean downloading
 * every model's textures on load, which is exactly the cost the preloading
 * work was spent avoiding.
 */
// Versioned: the head-crop rule changes, and a cached thumbnail from an older
// rule would otherwise stick around forever.
const STORAGE_KEY = 'l2d-demo:portraits:v2'

let portraits: Record<string, string> = load()
const listeners = new Set<() => void>()

function load(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
  } catch {
    // Unreadable or blocked storage only costs the cache.
  }
  return {}
}

export function savePortrait(id: string, dataUrl: string): void {
  if (portraits[id] === dataUrl) {
    return
  }
  // Replaced rather than mutated: useSyncExternalStore compares snapshots by
  // identity, so mutating in place would not re-render the roster.
  portraits = { ...portraits, [id]: dataUrl }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(portraits))
  } catch {
    // Over quota or blocked -- the in-memory cache still works this session.
  }
  listeners.forEach((notify) => notify())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => portraits

/** All known portraits, re-rendering the caller whenever one is captured. */
export function usePortraits(): Record<string, string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
