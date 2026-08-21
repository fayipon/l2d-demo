import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from '../pages/HomePage'
import { CharacterPage } from '../pages/CharacterPage'
import '../pages/GamePage.css'

/**
 * The battle route is split out because Phaser is about 1.3 MB minified, and
 * the lobby has no use for it. Splitting the other way round is not worth it:
 * the lobby is the entry point, so lazy-loading it would only add a round trip
 * before anything at all appears.
 */
const GamePage = lazy(() =>
  import('../pages/GamePage').then((m) => ({ default: m.GamePage })),
)

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/character" element={<CharacterPage />} />
      <Route
        path="/battle"
        element={
          <Suspense fallback={<div className="game-loading">LOADING</div>}>
            <GamePage />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
