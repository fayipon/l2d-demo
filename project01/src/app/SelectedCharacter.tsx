import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_CHARACTER_ID, findCharacter } from '../features/character'
import { SelectedCharacterContext } from './selectedCharacterContext'

const STORAGE_KEY = 'l2d-demo:selected-character'

/** Reading storage can throw in private-mode Safari, so never let it break boot. */
function readStored(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_CHARACTER_ID
  } catch {
    return DEFAULT_CHARACTER_ID
  }
}

/**
 * Which character the player is currently using. It lives above the router
 * because the choice is made on the character screen but has to still be in
 * effect on the home screen, and a route change unmounts the screen that made
 * it. Persisted so a reload does not silently reset to the first character.
 */
export function SelectedCharacterProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState(readStored)

  const select = useCallback((next: string) => {
    setId(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage being unavailable only costs persistence, not the selection.
    }
  }, [])

  // findCharacter falls back to the default, so an id from an older build --
  // or a hand-edited storage entry -- cannot leave the app with no character.
  const value = useMemo(() => ({ character: findCharacter(id), select }), [id, select])

  return (
    <SelectedCharacterContext.Provider value={value}>
      {children}
    </SelectedCharacterContext.Provider>
  )
}
