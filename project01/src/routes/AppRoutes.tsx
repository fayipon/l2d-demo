import { Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from '../pages/HomePage'
import { PixiPage } from '../pages/PixiPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/pixi" element={<PixiPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
