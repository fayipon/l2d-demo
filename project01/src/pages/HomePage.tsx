import { useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Live2DStage, type Live2DStageHandle } from '../pixi/Live2DStage'
import { StageShell } from '../components/StageShell'
import { Icon, type IconName } from '../components/icons'
import { useSelectedCharacter } from '../app/selectedCharacterContext'
import { formatCurrency, useProfile } from '../features/profile'
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
  { id: 'story', en: 'STORY', sub: '劇情', icon: 'book', tone: 'story', event: true, to: '/story' },
  { id: 'character', en: 'CHARACTER', sub: '角色', icon: 'sword', tone: 'character', to: '/character' },
  { id: 'achievement', en: 'ACHIEVEMENT', sub: '成就', icon: 'trophy', tone: 'achievement', to: '/achievements' },
]

/**
 * The pixel shards that dissolve off the inside edges of the START frame.
 *
 * The mock draws them as a static fringe; here they drift and fade, which is
 * what the button was missing -- everything else on this screen is lit and
 * still, so one thing that moves is what makes it read as a game rather than
 * as a picture of one.
 *
 * Built once at module scope from a seeded generator. `Math.random()` while
 * rendering would deal a new field on every keystroke of state, so the shards
 * would jump the moment anything else on the screen changed.
 */
interface Shard {
  /** Percentages within the frame. */
  x: number
  y: number
  /** Side in cqh. */
  size: number
  delay: number
  duration: number
  peak: number
  hot: boolean
}

const SHARDS: Shard[] = (() => {
  let seed = 0x5f3a91
  const rand = () => {
    // Numerical Recipes LCG -- any stable generator does, this one is short.
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }
  return Array.from({ length: 36 }, (_, i) => {
    const right = i % 2 === 1
    // Clustered against the left and right edges, thinning towards the middle,
    // so the text keeps a clear field.
    const inset = rand() ** 2 * 17
    return {
      x: right ? 100 - inset : inset,
      y: 3 + rand() * 94,
      size: 0.5 + rand() * 1.1,
      delay: -rand() * 5,
      duration: 3 + rand() * 3,
      peak: 0.25 + rand() * 0.6,
      hot: rand() > 0.72,
    }
  })
})()

export function HomePage() {
  const stageRef = useRef<Live2DStageHandle>(null)
  const navigate = useNavigate()
  const { character } = useSelectedCharacter()
  const profile = useProfile()
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
            <span className="player-level-value">{profile.level}</span>
          </div>
          <div className="player-main">
            <div className="player-name-row">
              <span className="player-name">{character.name}</span>
              <span className="player-crest" aria-hidden="true">
                <Icon name="sword" />
              </span>
            </div>
            <div className="exp-bar">
              <div
                className="exp-fill"
                style={{ width: `${Math.min(100, (profile.xp / profile.xpToLevel) * 100)}%` }}
              />
            </div>
            <div className="exp-text">
              EXP {formatCurrency(profile.xp)} / {formatCurrency(profile.xpToLevel)}
            </div>
          </div>
        </div>

        <div className="currency-row">
          <div className="currency-pill panel">
            <Icon name="coin" className="currency-icon" />
            <span className="currency-value">{formatCurrency(profile.coins)}</span>
            <button type="button" className="plus" aria-label="增加金幣">+</button>
          </div>
          <div className="currency-pill panel">
            <Icon name="gem" className="currency-icon" />
            <span className="currency-value">{formatCurrency(profile.gems)}</span>
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
          <span className="start-shards" aria-hidden="true">
            {SHARDS.map((shard, i) => (
              <i
                key={i}
                className={`shard${shard.hot ? ' is-hot' : ''}`}
                style={
                  {
                    left: `${shard.x}%`,
                    top: `${shard.y}%`,
                    width: `${shard.size}cqh`,
                    height: `${shard.size}cqh`,
                    animationDelay: `${shard.delay}s`,
                    animationDuration: `${shard.duration}s`,
                    '--peak': shard.peak,
                  } as CSSProperties
                }
              />
            ))}
          </span>
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
