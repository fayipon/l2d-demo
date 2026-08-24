import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GameCanvas } from '../game/GameCanvas'
import { Minimap } from './Minimap'
import { Inventory, ItemSection, StatSection, WeaponSection, type StatViews } from './Inventory'
import { Icon, type IconName } from '../components/icons'
import { Emblem, type EmblemTone } from '../components/Emblem'
import {
  requestBuy,
  requestLeaveShop,
  requestReroll,
  requestRestart,
  useRunSnapshot,
} from '../game/runStore'
import {
  BASE_STATS,
  FAMILY_LABEL,
  STAT_INFO,
  WEAPONS,
  type PlayerStats,
  type UpgradeId,
} from '../game/data/content'
import { SHOP_ITEMS } from '../game/data/shop'
import { useSelectedCharacter } from '../app/selectedCharacterContext'
import { usePortraits } from '../features/portraits'
import { recordRun, useLastReward } from '../features/profile'
import { loadoutFor } from '../game/data/loadouts'
import { sceneFor } from '../game/data/scenes'
import './GamePage.css'
import '../styles/ui-kit.css'

/** Roman numerals for weapon tiers -- short, and unmistakably a rank. */
const TIER_MARK = ['', 'I', 'II', 'III', 'IV']

/**
 * The wave the objectives panel counts towards.
 *
 * A milestone, not a win condition: nothing happens at twenty, the run simply
 * carries on and the row stays full. Worth having anyway -- "12" alone is a
 * number, "12 / 20" is a position.
 */
const WAVE_MILESTONE = 20

/** mm:ss. A wave is under a minute, but the mock's clock has two fields and a
 *  bare "31" reads as a score rather than as time running out. */
const clock = (seconds: number) => {
  const whole = Math.max(0, Math.ceil(seconds))
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

/* The weapon tints are stored as numbers for Phaser; CSS wants the string. */
const hexOf = (tint: number) => `#${tint.toString(16).padStart(6, '0')}`

/**
 * Rarity, which is not stored anywhere and does not need to be.
 *
 * The mock's cards carry a rank, and the data already ranks everything twice
 * over: an upgrade's draw weight is exactly how ordinary it is, an item's list
 * price is what it is worth, and a weapon's tier is its rank outright. Reading
 * rarity off those keeps one source of truth -- tune a weight and the card
 * label follows -- where a hand-written table would drift the first time a
 * number moved.
 */
const RARITY_LABEL: Record<EmblemTone, string> = {
  common: '普通',
  rare: '稀有',
  epic: '進階',
  legend: '傳說',
}

/** The list price, not the wave-scaled one: what the shop charges climbs with
 *  the wave, and a card that changed rank as the run went on would be lying. */
const rarityOfPrice = (price: number): EmblemTone =>
  price < 25 ? 'common' : price < 32 ? 'rare' : price < 40 ? 'epic' : 'legend'

const RARITY_BY_TIER: EmblemTone[] = ['common', 'common', 'rare', 'epic', 'legend']

/* The data file stays free of view concerns, so the glyph for each stat is
   chosen here rather than stored beside its numbers. */
const STAT_ICON: Record<UpgradeId, IconName> = {
  attackPower: 'sword',
  meleePower: 'axe',
  rangedPower: 'bow',
  elementalPower: 'flame',
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
  vision: 'eye',
  xpGain: 'exp',
  coinRate: 'coin',
}

/* An item's glyph is the glyph of the first stat it moves, so a new shop entry
   gets a sensible medallion for free and there is no second table to forget to
   update. Ordering is the literal's own, which is the order the detail string
   lists them in. */
const glyphForItem = (mods: Partial<PlayerStats>): IconName =>
  STAT_ICON[Object.keys(mods)[0] as UpgradeId] ?? 'sigil'

/**
 * How each stat reads on the strip.
 *
 * A multiplier wants "x1.30", a percentage wants "30%", a flat value wants the
 * number. Deriving that from the value alone is guesswork -- 0.3 could be any
 * of the three -- so it is declared.
 */
const STAT_FORMAT: Record<UpgradeId, (value: number) => string> = {
  attackPower: (v) => `+${v.toFixed(1)}`,
  meleePower: (v) => `+${v.toFixed(1)}`,
  rangedPower: (v) => `+${v.toFixed(1)}`,
  elementalPower: (v) => `+${v.toFixed(1)}`,
  maxHp: (v) => String(Math.round(v)),
  regen: (v) => `${(v * 100).toFixed(1)}%/s`,
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
  vision: (v) => `×${v.toFixed(2)}`,
  xpGain: (v) => `×${v.toFixed(2)}`,
  /* A percentage, and allowed past a hundred: over that it stops being the
     chance of a drop and becomes how many drops. */
  coinRate: (v) => `${Math.round(v * 100)}%`,
}

/** The three view-side tables the sheet needs, bundled: they always travel
    together and always describe the same list. */
const STAT_VIEWS: StatViews = {
  icon: STAT_ICON,
  format: STAT_FORMAT,
  get order() {
    return STAT_ORDER
  },
}

/** Order on the strip, which is the order they are grouped on the cards. */
const STAT_ORDER: UpgradeId[] = [
  'attackPower',
  'meleePower',
  'rangedPower',
  'elementalPower',
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
  'vision',
  'xpGain',
  'coinRate',
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
  /*
   * Which place this run is fought in, from the URL.
   *
   * A query parameter rather than router state, so /battle?scene=1-1 survives
   * a refresh and can be shared -- and so the story screen hands over the
   * stage code it already prints on the row, instead of a second identifier
   * invented for the trip. An unknown code is not an error: sceneFor falls
   * back to the first scene, and a stage with no map of its own is playable.
   */
  const [params] = useSearchParams()
  const map = sceneFor(params.get('scene') ?? '')
  // The lobby's selected character decides what the run opens with.
  const { character } = useSelectedCharacter()
  const loadout = loadoutFor(character.id)
  const portraits = usePortraits()
  const portrait = portraits[character.id]
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

  /*
   * The equipment sheet, on I.
   *
   * Local state rather than anything the scene knows about: it reads the
   * published snapshot and changes nothing, so the arena has no business being
   * told it is open.
   */
  const [sheetOpen, setSheetOpen] = useState(false)

  /* Hidden, not closed, while a screen that owns the whole display is up.
     Derived rather than pushed into state by an effect: an effect that calls
     setState is a second render to reach a value that was already knowable
     during the first, and it would also fight the key handler over who owns
     the flag. */
  const overlayUp = run.status === 'shop' || run.status === 'dead'
  const showSheet = sheetOpen && !overlayUp

  useEffect(() => {
    if (overlayUp) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key === 'i') {
        setSheetOpen((open) => !open)
      } else if (key === 'escape') {
        setSheetOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlayUp])

  const hpPercent = run.maxHp > 0 ? (run.hp / run.maxHp) * 100 : 0

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
      <GameCanvas loadout={loadout} characterId={character.id} map={map} />

      <div className="game-overlay">
        {/* ---------- who is fighting ---------- */}
        {/*
          The mock leads with the character: portrait, name, level, then the
          two bars. That is the right call for a run that opens from a roster
          -- the arena is drawn from primitives, so without this the screen
          never says who any of it is about.

          The portrait is the one captured from the Live2D model in the lobby,
          which means a player who came straight here may not have one yet.
          Hence the fallback rather than a broken frame.
        */}
        <div className="pilot">
          <div className="pilot-head">
            <span className="pilot-face uk-portrait-frame">
              {portrait ? (
                <img src={portrait} alt="" />
              ) : (
                <Icon name="person" className="pilot-face-fallback" />
              )}
            </span>

            <div className="pilot-plate uk-name-plate">
              <p className="pilot-name">
                {character.name}
                <Icon name="sigil" className="pilot-sigil" />
              </p>
              <p className="pilot-level">LV.{run.level}</p>
            </div>
          </div>

          {/* Widths move in 66ms steps because that is how often the scene
              publishes; the transition is what makes them look continuous. */}
          <span className="pilot-bar is-hp uk-bar-hp">
            <i className="pilot-fill" style={{ width: `${hpPercent}%` }} />
            <b className="pilot-bar-count">
              {Math.max(0, Math.ceil(run.hp))} / {Math.round(run.maxHp)}
            </b>
          </span>
        </div>

        {/* Under the panel, as in the mock. Coins are what the shop will spend,
            so they belong where the eye starts rather than tucked in with the
            diagnostics. The account's balance is deliberately not here: the
            shop spends what this run earned, and showing a five-figure lobby
            total beside it would read as money you could use. */}
        {/* The two numbers a run accumulates, as the kit's pair of medallions.
            Experience moved here from a caption under its own bar: the bar says
            how far along the level is, and this says the count -- which is the
            same relationship coins have to nothing, so they read as a pair. */}
        <div className="purse">
          <span className="purse-row">
            <i className="purse-icon is-coin" aria-label="金幣" />
            <b>{run.coins}</b>
          </span>
          <span className="purse-row">
            <i className="purse-icon is-exp" aria-label="經驗" />
            <b>
              {Math.floor(run.xp).toLocaleString()} / {run.xpToLevel.toLocaleString()}
            </b>
          </span>
        </div>

        {/* ---------- which wave ---------- */}
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
              <span className="wave-timer">{clock(run.timeLeft)}</span>
            </>
          )}
        </div>

        <Minimap code={map.code} name={map.name} />

        {/* ---------- what the run is for ---------- */}
        {/*
          Three numbers the run already keeps, rather than an objective system
          it does not have. Twenty waves is a milestone to aim at, not a win
          condition -- nothing happens there, and the row simply fills up and
          stays full, which is honest about what it is.
        */}
        <div className="goals uk-panel">
          <p className="goals-title">任務目標</p>
          <ul className="goals-list">
            <li className="goal">
              <span className="goal-name">存活 {WAVE_MILESTONE} 波</span>
              <span className="goal-count">
                {Math.min(run.wave, WAVE_MILESTONE)} / {WAVE_MILESTONE}
              </span>
              <i
                className="goal-track"
                style={{ '--fill': `${Math.min(100, (run.wave / WAVE_MILESTONE) * 100)}%` } as CSSProperties}
              />
            </li>
            <li className="goal">
              <span className="goal-name">累計擊殺</span>
              <span className="goal-count">{run.kills}</span>
            </li>
            <li className="goal">
              <span className="goal-name">本場金幣</span>
              <span className="goal-count">{run.coins}</span>
            </li>
          </ul>
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
            <i className="counter-icon is-kills" aria-label="擊殺" />
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

        {showSheet ? (
          <Inventory run={run} views={STAT_VIEWS} onClose={() => setSheetOpen(false)} />
        ) : null}


        {/* ---------- shop ---------- */}
        {run.status === 'shop' ? (
          <div className="shop">
            <header className="screen-head">
              <p className="screen-eyebrow">WAVE {run.wave} CLEAR</p>
              <h2 className="screen-title">補給</h2>
              <p className="screen-sub">
                持有 <b>{run.coins}</b> 金幣
              </p>
              <i className="ui-rule is-wide uk-rule-lg" aria-hidden="true" />
            </header>

            {/* Above the shelf, as in the mock: rerolling is something you do
                to the shelf, so it belongs next to it rather than filed with
                the button that leaves. */}
            <button
              type="button"
              className="shop-reroll"
              onClick={requestReroll}
              disabled={run.coins < run.rerollPrice}
            >
              <Icon name="sparkle" />
              重骰貨架
              <span className="card-price">
                <i className="card-coin" aria-hidden="true" />
                {run.rerollPrice}
              </span>
            </button>

            <div className="card-row">
              {run.shop.map((offer, slot) => {
                const affordable = run.coins >= offer.price
                if (offer.sort === 'weapon') {
                  const weapon = WEAPONS[offer.index]
                  const tone = RARITY_BY_TIER[offer.tier] ?? 'common'
                  return (
                    <button
                      type="button"
                      key={`w${slot}-${offer.index}-${offer.tier}`}
                      className={`card uk-frame-md is-weapon tone-${tone}${affordable ? '' : ' is-broke'}`}
                      style={{ '--weapon-tint': hexOf(weapon.tint) } as CSSProperties}
                      onClick={() => requestBuy(slot)}
                      disabled={!affordable}
                    >
                      <span className="card-name">{weapon.label}</span>
                      <span className="card-rarity">
                        {FAMILY_LABEL[weapon.family]}武器 {TIER_MARK[offer.tier]} ·{' '}
                        {RARITY_LABEL[tone]}
                      </span>
                      <Emblem className="card-art" frame="ring" glyph="swords" tone={tone} />
                      <span className="card-detail">{weapon.detail}</span>
                      <span className="card-plate">
                        <i className="card-coin" aria-hidden="true" />
                        {offer.price}
                      </span>
                    </button>
                  )
                }
                const item = SHOP_ITEMS[offer.index]
                const tone = rarityOfPrice(item.price)
                return (
                  <button
                    type="button"
                    key={`i${slot}-${item.id}`}
                    className={`card uk-frame-md tone-${tone}${affordable ? '' : ' is-broke'}`}
                    onClick={() => requestBuy(slot)}
                    disabled={!affordable}
                  >
                    <span className="card-name">{item.label}</span>
                    <span className="card-rarity">道具 · {RARITY_LABEL[tone]}</span>
                    <Emblem
                      className="card-art"
                      frame="shield"
                      glyph={glyphForItem(item.mods)}
                      tone={tone}
                    />
                    <span className="card-detail">{item.detail}</span>
                    <span className="card-plate">
                      <i className="card-coin" aria-hidden="true" />
                      {offer.price}
                    </span>
                  </button>
                )
              })}

              {run.shop.length === 0 ? <p className="shop-empty">貨架空了。</p> : null}
            </div>

            {/* The same three sections the I sheet shows, because the shop is
                where they are actually needed: what to buy depends on what is
                already held, and a full rack has to be merged here rather than
                discovered to be full after the card is clicked. Laid out as a
                strip under the shelf rather than as the sheet's three tall
                columns -- the cards have the height. */}
            <div className="shop-kit">
              <WeaponSection run={run} />
              <StatSection run={run} views={STAT_VIEWS} />
              <ItemSection run={run} views={STAT_VIEWS} />
            </div>

            <footer className="shop-foot">
              <button type="button" className="shop-go" onClick={requestLeaveShop}>
                前往第 {run.wave + 1} 波
              </button>
            </footer>

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
                  <i className="reward-icon is-coin" aria-hidden="true" />
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
          WASD / 方向鍵 移動 · 武器自動開火 · I 查看裝備
        </p>

        {/* Bottom-left, out of the way. The top-left corner belongs to the
            character panel now, and this is an escape hatch rather than
            something the eye should land on first. */}
        <button type="button" className="back-btn panel" onClick={() => navigate('/')}>
          <Icon name="back" />
          <span>返回大廳</span>
        </button>
      </div>
    </div>
  )
}
