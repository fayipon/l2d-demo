import { useRef, useState } from 'react'
import { Live2DStage, type Live2DStageHandle } from '../pixi/Live2DStage'
import './HomePage.css'

// Everything below the Live2D layer is decorative -- no game systems behind it.
interface MenuTile {
  id: string
  en: string
  jp: string
  icon: string
  tone: string
  event?: boolean
}

interface RailItem {
  id: string
  jp: string
  icon: string
  badge?: boolean
}

const MENU_TILES: MenuTile[] = [
  { id: 'story', en: 'STORY', jp: 'ストーリー', icon: '📖', tone: 'story', event: true },
  { id: 'character', en: 'CHARACTER', jp: 'キャラクター', icon: '🎀', tone: 'character' },
  { id: 'explore', en: 'EXPLORE', jp: '探索', icon: '🧭', tone: 'explore' },
  { id: 'studio', en: 'STUDIO', jp: 'スタジオ', icon: '🎤', tone: 'studio' },
  { id: 'gacha', en: 'GACHA', jp: 'ガチャ', icon: '💠', tone: 'gacha' },
]

const RAIL_ITEMS: RailItem[] = [
  { id: 'mail', jp: 'メール', icon: '✉️', badge: true },
  { id: 'present', jp: 'プレゼント', icon: '🎁', badge: true },
  { id: 'shop', jp: 'ショップ', icon: '🛒' },
  { id: 'friend', jp: 'フレンド', icon: '👥' },
  { id: 'menu', jp: 'メニュー', icon: '☰' },
]

export function HomePage() {
  const stageRef = useRef<Live2DStageHandle>(null)
  const [caption, setCaption] = useState('今日はどこへ行く？')
  const [muted, setMuted] = useState(false)
  const [ready, setReady] = useState(false)

  return (
    <div className="home-root">
      <div className="home-stage">
        <div className="stage-backdrop" />

        <Live2DStage
          ref={stageRef}
          muted={muted}
          onLine={setCaption}
          onReady={() => setReady(true)}
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
                <button type="button" className="icon-mini">✎</button>
              </div>
              <div className="exp-bar">
                <div className="exp-fill" style={{ width: '75%' }} />
              </div>
              <div className="exp-text">
                <span>EXP</span>
                <span>7,500 / 10,000</span>
              </div>
            </div>
          </div>

          <div className="currency-row">
            <div className="currency-pill energy">
              <span className="currency-icon">⚡</span>
              <div className="currency-body">
                <span className="currency-value">60 / 80</span>
                <div className="energy-bar"><div className="energy-fill" style={{ width: '75%' }} /></div>
                <span className="currency-sub">回復まで 01:25</span>
              </div>
              <button type="button" className="plus">+</button>
            </div>
            <div className="currency-pill">
              <span className="currency-icon">🪙</span>
              <span className="currency-value">99,999</span>
              <button type="button" className="plus">+</button>
            </div>
            <div className="currency-pill">
              <span className="currency-icon">💎</span>
              <span className="currency-value">8,420</span>
              <button type="button" className="plus">+</button>
            </div>
          </div>

          <nav className="menu-cluster" aria-label="Main menu">
            {MENU_TILES.map((tile) => (
              <button type="button" key={tile.id} className={`tile tile-${tile.tone}`}>
                <span className="tile-inner">
                  {/* inside the counter-rotated layer so the ribbon sits against
                      the tile's upper-right edge rather than a rotated corner */}
                  {tile.event ? <span className="tile-ribbon">EVENT!</span> : null}
                  <span className="tile-icon">{tile.icon}</span>
                  <span className="tile-en">{tile.en}</span>
                  <span className="tile-jp">{tile.jp}</span>
                </span>
              </button>
            ))}
          </nav>

          <div className="side-rail">
            {RAIL_ITEMS.map((item) => (
              <button type="button" key={item.id} className="rail-btn">
                {item.badge ? <span className="badge">!</span> : null}
                <span className="rail-icon">{item.icon}</span>
                <span className="rail-label">{item.jp}</span>
              </button>
            ))}
          </div>

          <div className="bottom-left">
            <button type="button" className="wide-btn">
              <span className="wide-icon">🛏️</span>
              <span className="wide-text">
                <span className="wide-en">MY ROOM</span>
                <span className="wide-jp">マイルーム</span>
              </span>
            </button>
            <button type="button" className="wide-btn">
              <span className="badge">!</span>
              <span className="wide-icon">📋</span>
              <span className="wide-text">
                <span className="wide-en">MISSION</span>
                <span className="wide-jp">ミッション</span>
              </span>
            </button>
          </div>

          <div className="bottom-right">
            <button
              type="button"
              className="round-btn"
              onClick={() => setMuted((m) => !m)}
              aria-pressed={muted}
              title={muted ? '音声オン' : '音声オフ'}
            >
              {muted ? '🔇' : '🔊'}
            </button>
            <button type="button" className="round-btn" title="設定">⚙️</button>
          </div>

          {/* The bubble is the one control wired to the model: it plays a voiced
              tap motion, same as clicking the character. */}
          <button
            type="button"
            className="speech-bubble"
            onClick={() => stageRef.current?.speak()}
            disabled={!ready}
          >
            {ready ? caption : 'ロード中…'}
          </button>
        </div>
      </div>
    </div>
  )
}
