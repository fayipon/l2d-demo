import { SelectedCharacterProvider } from './app/SelectedCharacter'
import { AppRoutes } from './routes/AppRoutes'
import './App.css'

function App() {
  return (
    <SelectedCharacterProvider>
      <AppRoutes />
    </SelectedCharacterProvider>
  )
}

export default App
