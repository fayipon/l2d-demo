import { NavLink } from 'react-router-dom'
import { AppRoutes } from './routes/AppRoutes'
import './App.css'

function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>l2d-demo</h1>
        <nav className="topnav" aria-label="Primary">
          <NavLink
            to="/"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            end
          >
            Home
          </NavLink>
          <NavLink
            to="/pixi"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            Pixi Demo
          </NavLink>
        </nav>
      </header>

      <main className="content">
        <AppRoutes />
      </main>
    </div>
  )
}

export default App
