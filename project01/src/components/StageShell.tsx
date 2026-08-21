import type { ReactNode } from 'react'
import { StageBackdrop } from './StageBackdrop'
import '../styles/stage.css'

interface StageShellProps {
  /** Backdrop image URL, supplied by the selected character. */
  background: string
  children: ReactNode
}

/**
 * The letterboxed 16:9 stage every screen is drawn into, with the backdrop
 * already in place. Screens supply the Live2D layer and their own HUD.
 */
export function StageShell({ background, children }: StageShellProps) {
  return (
    <div className="stage-root">
      <div className="stage-frame">
        <StageBackdrop src={background} />
        {children}
      </div>
    </div>
  )
}
