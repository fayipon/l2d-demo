import { useRef, useState } from 'react'
import { Live2DStage, type Live2DStageHandle } from '../pixi/Live2DStage'
import { StageBackdrop } from '../components/StageBackdrop'
import { Icon, type IconName } from '../components/icons'
import './HomePage.css'

// Everything below the Live2D layer is decorative -- no game systems behind it.
interface MenuTile {
  id: string
  en: string
  jp: string
  icon: IconName
  tone: string
  event?: boolean
}

const MENU_TILES: MenuTile[] = [
  { id: 'story', en: 'STORY', jp: 'ストーリー', icon: 'book', tone: 'story', event: true },
  { id: 'character', en: 'CHARACTER', jp: 'キャラクター', icon: 'sword', tone: 'character' },
  { id: 'explore', en: 'EXPLORE', jp: '探索', icon: 'compass', tone: 'explore' },
]

export function HomePage() {
  const stageRef = useRef<Live2DStageHandle>(null)
  const [muted, setMuted] = useState(false)
  // The bubble is hidden until the character is tapped. Text is kept while it
  // fades out so the words do not vanish before the animation does.
  const [bubble, setBubble] = useState({ text: '', visible: false })

  return (
    <div className="home-root">
      <div className="home-stage">
        <StageBackdrop />

        <Live2DStage
          ref={stageRef}
          muted={muted}
          onLine={(caption) =>
            setBubble((prev) =>
              caption ? { text: caption, visible: true } : { ...prev, visible: false },
            )
          }
        />

        <div className="hud">
          <div className="player-card">
            <div className="player-level">
              <span className="player-level-label">PLAYER LV.</span>
              <span className="player-level-value">34</span>
            </div>
            <div className="player-main">
              <div className="player-name-row">
                <span className="player-name">HARU</span>
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
            <div className="currency-pill">
              <Icon name="coin" className="currency-icon" />
              <span className="currency-value">99,999</span>
              <button type="button" className="plus" aria-label="コインを追加">+</button>
            </div>
            <div className="currency-pill">
              <Icon name="gem" className="currency-icon" />
              <span className="currency-value">8,420</span>
              <button type="button" className="plus" aria-label="ジェムを追加">+</button>
            </div>
          </div>

          <nav className="menu-cluster" aria-label="Main menu">
            {MENU_TILES.map((tile) => (
              <button type="button" key={tile.id} className={`tile tile-${tile.tone}`}>
                <span className="tile-inner">
                  {/* inside the counter-rotated layer so the ribbon sits against
                      the tile's upper-right edge rather than a rotated corner */}
                  {tile.event ? <span className="tile-ribbon">EVENT!</span> : null}
                  <Icon name={tile.icon} className="tile-icon" />
                  <span className="tile-en">{tile.en}</span>
                  <span className="tile-jp">{tile.jp}</span>
                </span>
              </button>
            ))}
          </nav>

          {/* Nothing to launch yet, so START just prompts the character. */}
          <button type="button" className="start-btn" onClick={() => stageRef.current?.speak()}>
            <span className="start-en">START</span>
            <span className="start-jp">
              <i className="start-rule" />
              任務開始
              <i className="start-rule" />
            </span>
          </button>

          <button
            type="button"
            className="round-btn"
            onClick={() => setMuted((m) => !m)}
            aria-pressed={muted}
            title={muted ? '音声オン' : '音声オフ'}
          >
            <Icon name={muted ? 'soundOff' : 'soundOn'} />
          </button>

          {/* Display only -- tapping the character is what raises it. */}
          <div className={`speech-bubble${bubble.visible ? ' is-visible' : ''}`} aria-live="polite">
            {bubble.text}
          </div>
        </div>
      </div>
    </div>
  )
}
