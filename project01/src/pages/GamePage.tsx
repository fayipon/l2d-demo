import { useNavigate } from 'react-router-dom'
import { GameCanvas } from '../game/GameCanvas'
import { Icon } from '../components/icons'
import { requestRestart, useRunSnapshot } from '../game/runStore'
import './GamePage.css'

/**
 * The battle route. No StageShell and no Live2D: this screen is Phaser plus a
 * thin DOM overlay, and the lobby's letterboxed stage would just fight Phaser's
 * own scale manager.
 *
 * The HUD is DOM rather than drawn in the scene, on the rule that Phaser owns
 * the arena and React owns everything that is not it. None of this is
 * performance-sensitive, all of it wants the panel and bar styles the rest of
 * the app already has, and the upgrade and shop screens that come next are
 * pure UI -- there is nothing to gain by rebuilding that vocabulary inside a
 * canvas.
 *
 * What the HUD must never do is own the run. It reads a snapshot the scene
 * pushes into runStore; a component that held the state would re-render
 * GameCanvas and tear the whole game down.
 */
export function GamePage() {
  const navigate = useNavigate()
  const run = useRunSnapshot()

  const hpPercent = run.maxHp > 0 ? (run.hp / run.maxHp) * 100 : 0
  const xpPercent = run.xpToLevel > 0 ? (run.xp / run.xpToLevel) * 100 : 0

  return (
    <div className="game-root">
      <GameCanvas />

      <div className="game-overlay">
        <button type="button" className="back-btn panel" onClick={() => navigate('/')}>
          <Icon name="back" />
          <span>返回大廳</span>
        </button>

        {/* ---------- wave ---------- */}
        <div className="wave-readout">
          {run.status === 'break' ? (
            <>
              <span className="wave-label">WAVE {run.wave} CLEAR</span>
              <span className="wave-timer is-break">下一波 {Math.ceil(run.timeLeft)}</span>
            </>
          ) : (
            <>
              <span className="wave-label">WAVE {run.wave}</span>
              <span className="wave-timer">{Math.ceil(run.timeLeft)}</span>
            </>
          )}
        </div>

        {/* ---------- vitals ---------- */}
        <div className="vitals">
          <div className="vital-row">
            <span className="vital-tag">HP</span>
            <span className="vital-bar">
              {/* Widths move in 66ms steps because that is how often the scene
                  publishes; the transition is what makes them look continuous. */}
              <i className="vital-fill is-hp" style={{ width: `${hpPercent}%` }} />
            </span>
            <span className="vital-count">
              {Math.max(0, Math.ceil(run.hp))} / {run.maxHp}
            </span>
          </div>

          <div className="vital-row">
            <span className="vital-tag">LV {run.level}</span>
            <span className="vital-bar is-thin">
              <i className="vital-fill is-xp" style={{ width: `${xpPercent}%` }} />
            </span>
            <span className="vital-count">
              {run.xp} / {run.xpToLevel}
            </span>
          </div>
        </div>

        {/* ---------- counters ---------- */}
        <div className="counters">
          <div className="counter">
            <Icon name="gem" className="counter-icon" />
            <span>{run.materials}</span>
          </div>
          <div className="counter">
            <Icon name="skull" className="counter-icon is-kills" />
            <span>{run.kills}</span>
          </div>
          {/* Not decoration: the whole point of the pooling and the grid is that
              this number can climb without the frame rate moving, and there is
              no way to tell whether that holds without both on screen. */}
          <div className="counter is-diagnostic">
            <span>{run.enemies} 敵</span>
            <span>{run.fps} FPS</span>
          </div>
        </div>

        {run.status === 'dead' ? (
          <div className="game-over">
            <p className="game-over-title">陣亡</p>
            <p className="game-over-line">
              存活到第 <b>{run.wave}</b> 波 · 擊殺 <b>{run.kills}</b>
            </p>
            <button type="button" className="game-over-btn" onClick={requestRestart}>
              重新開始 <kbd>R</kbd>
            </button>
          </div>
        ) : null}

        <p className="game-hint">WASD / 方向鍵 移動 · 武器自動開火</p>
      </div>
    </div>
  )
}
