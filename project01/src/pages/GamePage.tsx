import { useNavigate } from 'react-router-dom'
import { GameCanvas } from '../game/GameCanvas'
import { Icon } from '../components/icons'
import './GamePage.css'

/**
 * The battle route. No StageShell and no Live2D: this screen is Phaser plus a
 * thin DOM overlay, and the lobby's letterboxed stage would just fight Phaser's
 * own scale manager.
 */
export function GamePage() {
  const navigate = useNavigate()

  return (
    <div className="game-root">
      <GameCanvas />

      <div className="game-overlay">
        <button type="button" className="back-btn panel" onClick={() => navigate('/')}>
          <Icon name="back" />
          <span>返回大廳</span>
        </button>
      </div>
    </div>
  )
}
