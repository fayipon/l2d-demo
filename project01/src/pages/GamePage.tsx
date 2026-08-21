import { useEffect, useRef, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { GameCanvas } from '../game/GameCanvas'
import { Icon, type IconName } from '../components/icons'
import {
  requestBuy,
  requestLeaveShop,
  requestReroll,
  requestRestart,
  requestUpgrade,
  useRunSnapshot,
} from '../game/runStore'
import {
  BASE_STATS,
  STAT_INFO,
  WEAPONS,
  getUpgrade,
  type PlayerStats,
  type UpgradeId,
} from '../game/data/content'
import { SHOP_ITEMS } from '../game/data/shop'
import { useSelectedCharacter } from '../app/selectedCharacterContext'
import { recordRun, useLastReward } from '../features/profile'
import { loadoutFor } from '../game/data/loadouts'
import './GamePage.css'

/** Roman numerals for weapon tiers -- short, and unmistakably a rank. */
const TIER_MARK = ['', 'I', 'II', 'III', 'IV']

/* The weapon tints are stored as numbers for Phaser; CSS wants the string. */
const hexOf = (tint: number) => `#${tint.toString(16).padStart(6, '0')}`

/* The data file stays free of view concerns, so the glyph for each stat is
   chosen here rather than stored beside its numbers. */
const STAT_ICON: Record<UpgradeId, IconName> = {
  attackPower: 'sword',
  maxHp: 'heart',
  regen: 'sparkle',
  lifesteal: 'droplet',
  armour: 'shield',
  dodge: 'sigil',
  damage: 'swords',
  critChance: 'star',
  critDamage: 'burst',
  attackSpeed: 'bolt',
  bonusCount: 'scatter',
  range: 'crosshair',
  moveSpeed: 'compass',
  lootRange: 'coin',
  xpGain: 'exp',
}

/**
 * How each stat reads on the strip.
 *
 * A multiplier wants "x1.30", a percentage wants "30%", a flat value wants the
 * number. Deriving that from the value alone is guesswork -- 0.3 could be any
 * of the three -- so it is declared.
 */
const STAT_FORMAT: Record<UpgradeId, (value: number) => string> = {
  attackPower: (v) => `+${v.toFixed(1)}`,
  maxHp: (v) => String(Math.round(v)),
  regen: (v) => `${v.toFixed(1)}/s`,
  lifesteal: (v) => v.toFixed(1),
  armour: (v) => String(Math.round(v)),
  dodge: (v) => `${Math.round(v * 100)}%`,
  damage: (v) => `×${v.toFixed(2)}`,
  critChance: (v) => `${Math.round(v * 100)}%`,
  critDamage: (v) => `×${v.toFixed(2)}`,
  attackSpeed: (v) => `×${v.toFixed(2)}`,
  bonusCount: (v) => `+${v}`,
  range: (v) => `×${v.toFixed(2)}`,
  moveSpeed: (v) => `×${v.toFixed(2)}`,
  lootRange: (v) => `×${v.toFixed(2)}`,
  xpGain: (v) => `×${v.toFixed(2)}`,
}

/** Order on the strip, which is the order they are grouped on the cards. */
const STAT_ORDER: UpgradeId[] = [
  'attackPower',
  'damage',
  'attackSpeed',
  'bonusCount',
  'critChance',
  'critDamage',
  'maxHp',
  'regen',
  'lifesteal',
  'armour',
  'dodge',
  'range',
  'moveSpeed',
  'lootRange',
  'xpGain',
]

/**
 * The battle route. No StageShell and no Live2D: this screen is Phaser plus a
 * thin DOM overlay, and the lobby's letterboxed stage would just fight Phaser's
 * own scale manager.
 *
 * The HUD is DOM rather than drawn in the scene, on the rule that Phaser owns
 * the arena and React owns everything that is not it. None of this is
 * performance-sensitive, all of it wants the panel and bar styles the rest of
 * the app already has, and the shop screen that comes next is pure UI -- there
 * is nothing to gain by rebuilding that vocabulary inside a canvas.
 *
 * What the HUD must never do is own the run. It reads a snapshot the scene
 * pushes into runStore; a component that held the state would re-render
 * GameCanvas and tear the whole game down.
 */
export function GamePage() {
  const navigate = useNavigate()
  const run = useRunSnapshot()
  // The lobby's selected character decides what the run opens with.
  const { character } = useSelectedCharacter()
  const loadout = loadoutFor(character.id)
  const lastReward = useLastReward()
  // Only ever shown on the panel that is up because this run ended, so a
  // reward banked before a restart cannot reappear.
  const reward = run.status === 'dead' ? lastReward : null

  /*
   * Bank the run exactly once.
   *
   * Keyed on the world's own death counter rather than on the status, because
   * the status stays 'dead' across every publish until a restart -- paying on
   * that would pay fifteen times a second. The ref survives re-renders; the
   * counter survives restarts.
   */
  const bankedRun = useRef(0)
  useEffect(() => {
    if (run.deaths === 0 || run.deaths === bankedRun.current) {
      return
    }
    bankedRun.current = run.deaths
    recordRun({
      wave: run.wave,
      kills: run.kills,
      coins: run.coins,
      hitsTaken: run.hitsTaken,
    })
  }, [run.deaths, run.wave, run.kills, run.coins, run.hitsTaken])

  const hpPercent = run.maxHp > 0 ? (run.hp / run.maxHp) * 100 : 0
  const xpPercent = run.xpToLevel > 0 ? (run.xp / run.xpToLevel) * 100 : 0
  const choosing = run.pendingLevels > 0

  /*
   * 1/2/3 pick a card.
   *
   * On window rather than through Phaser: these keys are not registered with
   * its keyboard plugin, and the choice belongs to the overlay anyway -- the
   * arena is frozen while it is up.
   */
  useEffect(() => {
    if (!choosing) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      const id = run.offers[Number(event.key) - 1]
      if (id) {
        requestUpgrade(id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choosing, run.offers])

  /*
   * Only what the run has actually changed. Thirteen stats at their starting
   * values is a wall of x1.00 that says nothing; a strip that grows as picks
   * are made is a record of the build.
   */
  const earned = STAT_ORDER.filter(
    (id) => run.stats[id] !== BASE_STATS[id as keyof PlayerStats],
  )

  return (
    <div className="game-root">
      <GameCanvas loadout={loadout} />

      <div className="game-overlay">
        {/* Top-left: the way out, and the purse. Coins are what the shop will
            spend, so they belong where the eye starts rather than tucked in
            with the diagnostics. */}
        <div className="game-topleft">
          <button type="button" className="back-btn panel" onClick={() => navigate('/')}>
            <Icon name="back" />
            <span>返回大廳</span>
          </button>

          <div className="coin-purse">
            <Icon name="coin" className="coin-icon" />
            <span className="coin-value">{run.coins}</span>
          </div>
        </div>

        {/* ---------- wave ---------- */}
        <div className="wave-readout">
          {run.status === 'break' ? (
            <>
              <span className="wave-label">WAVE {run.wave} CLEAR</span>
              <span className="wave-timer is-break">下一波 {Math.ceil(run.timeLeft)}</span>
            </>
          ) : run.status === 'shop' ? (
            /* The clock is genuinely stopped here, so showing a timer sitting
               at zero reads as expired rather than as paused. */
            <>
              <span className="wave-label">WAVE {run.wave} CLEAR</span>
              <span className="wave-timer is-paused">補給中 · 計時暫停</span>
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
              {Math.max(0, Math.ceil(run.hp))} / {Math.round(run.maxHp)}
            </span>
          </div>

          <div className="vital-row">
            <span className="vital-tag">LV {run.level}</span>
            <span className="vital-bar is-thin">
              <i className="vital-fill is-xp" style={{ width: `${xpPercent}%` }} />
            </span>
            <span className="vital-count">
              {Math.floor(run.xp)} / {run.xpToLevel}
            </span>
          </div>
        </div>

        {/* ---------- the rack ---------- */}
        <div className="rack">
          {run.weapons.map((slot, i) => (
            <span
              key={`${slot.kind}-${slot.tier}-${i}`}
              className="rack-slot"
              style={{ '--weapon-tint': hexOf(WEAPONS[slot.kind].tint) } as CSSProperties}
              title={WEAPONS[slot.kind].detail}
            >
              <span className="rack-name">{WEAPONS[slot.kind].label}</span>
              <span className="rack-tier">{TIER_MARK[slot.tier]}</span>
            </span>
          ))}
        </div>

        {/* ---------- counters ---------- */}
        <div className="counters">
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

        {/* ---------- earned stats ---------- */}
        {earned.length > 0 ? (
          <div className="stat-strip">
            {earned.map((id) => (
              <span key={id} className={`stat group-${STAT_INFO[id].group}`}>
                <Icon name={STAT_ICON[id]} className="stat-icon" />
                <b>{STAT_FORMAT[id](run.stats[id])}</b>
                {STAT_INFO[id].label}
              </span>
            ))}
          </div>
        ) : null}

        {/* ---------- level up ---------- */}
        {choosing ? (
          <div className="levelup">
            <p className="levelup-title">LEVEL {run.level}</p>
            <p className="levelup-sub">
              選擇一項強化
              {run.pendingLevels > 1 ? ` · 還有 ${run.pendingLevels - 1} 次` : ''}
            </p>

            <div className="levelup-cards">
              {run.offers.map((id, index) => {
                const upgrade = getUpgrade(id)
                if (!upgrade) {
                  return null
                }
                return (
                  <button
                    type="button"
                    key={id}
                    className={`upgrade-card group-${STAT_INFO[id].group}`}
                    onClick={() => requestUpgrade(id)}
                  >
                    <kbd className="upgrade-key">{index + 1}</kbd>
                    <Icon name={STAT_ICON[id]} className="upgrade-icon" />
                    <span className="upgrade-label">{STAT_INFO[id].label}</span>
                    <span className="upgrade-effect">{upgrade.effect}</span>
                    <span className="upgrade-detail">{upgrade.detail}</span>
                    {/* Where it stands now, so a pick is a change to something
                        rather than a number in isolation. */}
                    <span className="upgrade-current">
                      目前 {STAT_FORMAT[id](run.stats[id])}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {/* ---------- shop ---------- */}
        {run.status === 'shop' ? (
          <div className="shop">
            <header className="shop-head">
              <p className="shop-title">補給</p>
              <p className="shop-sub">
                第 {run.wave} 波結束 · 持有 <b>{run.coins}</b> 金幣
              </p>
            </header>

            <div className="shop-cards">
              {run.shop.map((offer, slot) => {
                const affordable = run.coins >= offer.price
                if (offer.sort === 'weapon') {
                  const weapon = WEAPONS[offer.index]
                  return (
                    <button
                      type="button"
                      key={`w${slot}-${offer.index}-${offer.tier}`}
                      className={`shop-card is-weapon${affordable ? '' : ' is-broke'}`}
                      style={{ '--weapon-tint': hexOf(weapon.tint) } as CSSProperties}
                      onClick={() => requestBuy(slot)}
                      disabled={!affordable}
                    >
                      <span className="shop-kind">武器 {TIER_MARK[offer.tier]}</span>
                      <span className="shop-label">{weapon.label}</span>
                      <span className="shop-detail">{weapon.detail}</span>
                      <span className="shop-price">
                        <Icon name="coin" className="shop-coin" />
                        {offer.price}
                      </span>
                    </button>
                  )
                }
                const item = SHOP_ITEMS[offer.index]
                return (
                  <button
                    type="button"
                    key={`i${slot}-${item.id}`}
                    className={`shop-card${affordable ? '' : ' is-broke'}`}
                    onClick={() => requestBuy(slot)}
                    disabled={!affordable}
                  >
                    <span className="shop-kind">道具</span>
                    <span className="shop-label">{item.label}</span>
                    <span className="shop-detail">{item.detail}</span>
                    <span className="shop-price">
                      <Icon name="coin" className="shop-coin" />
                      {offer.price}
                    </span>
                  </button>
                )
              })}

              {run.shop.length === 0 ? <p className="shop-empty">貨架空了。</p> : null}
            </div>

            <footer className="shop-foot">
              <button
                type="button"
                className="shop-reroll"
                onClick={requestReroll}
                disabled={run.coins < run.rerollPrice}
              >
                重骰
                <span className="shop-price">
                  <Icon name="coin" className="shop-coin" />
                  {run.rerollPrice}
                </span>
              </button>

              <button type="button" className="shop-go" onClick={requestLeaveShop}>
                前往第 {run.wave + 1} 波
              </button>
            </footer>

            {run.items.length > 0 ? (
              <p className="shop-owned">
                已持有：
                {run.items
                  .map((id) => SHOP_ITEMS.find((entry) => entry.id === id)?.label ?? id)
                  .join('、')}
              </p>
            ) : null}
          </div>
        ) : null}

        {run.status === 'dead' ? (
          <div className="game-over">
            <p className="game-over-title">陣亡</p>
            <p className="game-over-line">
              存活到第 <b>{run.wave}</b> 波 · 擊殺 <b>{run.kills}</b>
            </p>
            {reward ? (
              <div className="reward-row">
                {reward.record ? <p className="reward-record">新紀錄</p> : null}
                <div className="reward-line">
                  <Icon name="coin" className="reward-icon" />
                  <b>+{reward.coins}</b>
                </div>
                <div className="reward-line">
                  <Icon name="gem" className="reward-icon" />
                  <b>+{reward.gems}</b>
                </div>
                <div className="reward-line">
                  <Icon name="exp" className="reward-icon" />
                  <b>+{reward.exp}</b>
                </div>
              </div>
            ) : null}

            <button type="button" className="game-over-btn" onClick={requestRestart}>
              重新開始 <kbd>R</kbd>
            </button>
          </div>
        ) : null}

        <p className="game-hint">
          {loadout.trait ? `${loadout.trait} · ` : ''}
          WASD / 方向鍵 移動 · 武器自動開火
        </p>
      </div>
    </div>
  )
}
