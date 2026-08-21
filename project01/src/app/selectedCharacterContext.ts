import { createContext, useContext } from 'react'
import type { Character } from '../features/character'

export interface SelectedCharacterValue {
  character: Character
  select(id: string): void
}

export const SelectedCharacterContext = createContext<SelectedCharacterValue | null>(null)

export function useSelectedCharacter(): SelectedCharacterValue {
  const value = useContext(SelectedCharacterContext)
  if (!value) {
    throw new Error('useSelectedCharacter must be used inside SelectedCharacterProvider')
  }
  return value
}
