import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Live2DStage, type Live2DStageHandle } from '../pixi/Live2DStage'
import { StageShell } from '../components/StageShell'
import { Icon, type IconName } from '../components/icons'
import { useSelectedCharacter } from '../app/selectedCharacterContext'
import './HomePage.css'

// Everything below the Live2D layer is decorative -- no game systems behind it.
interface MenuTile {
  id: string
  en: string
  sub: string
  icon: IconName
  tone: string
  event?: boolean
  /** Route to open. Tiles without one are not wired up to anything yet. */
  to?: string
}

const MENU_TILES: MenuTile[] = [
  { id: 'story', en: 'STORY', sub: '劇情', icon: 'book', tone: 'story', event: true },
  { id: 'character', en: 'CHARACTER', sub: '角色', icon: 'sword', tone: 'character', to: '/character' },
  { id: 'explore', en: 'EXPLORE', sub: '探索', icon: 'compass', tone: 'explore' },
]

export function HomePage() {
  const stageRef = useRef<Live2DStageHandle>(null)
  const navigate = useNavigate()
  const { character } = useSelectedCharacter()
  const [muted, setMuted] = useState(false)
  // The bubble is hidden until the character is tapped. Text is kept while it
  // fades out so the words do not vanish before the animation does.
  const [bubble, setBubble] = useState({ text: '', visible: false })

  return (
    <StageShell background={character.background}>
      <Live2DStage
        // The stage owns a WebGL context and one loaded model, so changing
        // character is a remount rather than a prop update.
        key={character.id}
        ref={stageRef}
        config={character.home}
        muted={muted}
        onLine={(caption) =>
          setBubble((prev) =>
            caption ? { text: caption, visible: true } : { ...prev, visible: false },
          )
        }
      />

      <div className="hud">
        <div className="player-card panel">
          <div className="player-level">
            <span className="player-level-label">PLAYER LV.</span>
            <span className="player-level-value">34</span>
          </div>
          <div className="player-main">
            <div className="player-name-row">
              <span className="player-name">{character.name}</span>
              <span className="player-crest" aria-hidden="true">
                <Icon name="sword" />
              </span>
            </div>
            <div className="exp-bar">
              <div className="exp-fill" style={{ width: '42%' }} />
            </div>
            <div className="exp-text">EXP 7,569 / 18,000</div>
          </div>
        </div>

        <div className="currency-row">
          <div className="currency-pill panel">
            <Icon name="coin" className="currency-icon" />
            <span className="currency-value">99,999</span>
            <button type="button" className="plus" aria-label="增加金幣">+</button>
          </div>
          <div className="currency-pill panel">
            <Icon name="gem" className="currency-icon" />
            <span className="currency-value">8,420</span>
            <button type="button" className="plus" aria-label="增加寶石">+</button>
          </div>
        </div>

        <nav className="menu-cluster" aria-label="主選單">
          {MENU_TILES.map((tile) => (
            <button
              type="button"
              key={tile.id}
              className={`tile tile-${tile.tone}`}
              disabled={!tile.to}
              onClick={tile.to ? () => navigate(tile.to!) : undefined}
            >
              <span className="tile-inner">
                {/* inside the counter-rotated layer so the ribbon sits against
                    the tile's upper-right edge rather than a rotated corner */}
                {tile.event ? <span className="tile-ribbon">EVENT!</span> : null}
                <Icon name={tile.icon} className="tile-icon" />
                <span className="tile-en">{tile.en}</span>
                <span className="tile-sub">{tile.sub}</span>
              </span>
            </button>
          ))}
        </nav>

        <button type="button" className="start-btn" onClick={() => navigate('/battle')}>
          <span className="start-en">START</span>
          <span className="start-sub">
            <i className="start-rule" />
            任務開始
            <i className="start-rule" />
          </span>
        </button>

        <button
          type="button"
          className="round-btn panel"
          onClick={() => setMuted((m) => !m)}
          aria-pressed={muted}
          title={muted ? '開啟語音' : '關閉語音'}
        >
          <Icon name={muted ? 'soundOff' : 'soundOn'} />
        </button>

        {/* Display only -- tapping the character is what raises it. */}
        <div className={`speech-bubble${bubble.visible ? ' is-visible' : ''}`} aria-live="polite">
          {bubble.text}
        </div>
      </div>
    </StageShell>
  )
}
