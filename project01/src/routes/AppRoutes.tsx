import { Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from '../pages/HomePage'
import { CharacterPage } from '../pages/CharacterPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/character" element={<CharacterPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
