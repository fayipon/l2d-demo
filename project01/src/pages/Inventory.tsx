import { type CSSProperties } from 'react'
import { Emblem, type EmblemTone } from '../components/Emblem'
import { Icon, type IconName } from '../components/icons'
import {
  BASE_STATS,
  MAX_WEAPON_SLOTS,
  STAT_INFO,
  WEAPONS,
  tierDamageScale,
  tierRateScale,
  type PlayerStats,
  type UpgradeId,
} from '../game/data/content'
import { SHOP_ITEMS } from '../game/data/shop'
import type { RunSnapshot } from '../game/runStore'

/**
 * What the run is carrying, on a key.
 *
 * The HUD shows a compressed version of all of this already -- the rack, and
 * the strip of stats that have moved -- because those are what you glance at
 * mid-fight. This is the read you stop and do: every stat including the ones
 * still at their starting value, each weapon's actual numbers at the tier it
 * has reached, and the items, which until now had no home outside the shop
 * screen that sold them.
 *
 * It does not pause the arena. The whole tension of a wave is a clock, and a
 * panel that stops it is a rest button with an information panel drawn on it.
 * If that turns out to be the wrong call it is one flag in the scene's frozen
 * check.
 */

interface InventoryProps {
  run: RunSnapshot
  statIcon: Record<UpgradeId, IconName>
  statFormat: Record<UpgradeId, (value: number) => string>
  statOrder: UpgradeId[]
  onClose: () => void
}

const TIER_MARK = ['', 'I', 'II', 'III', 'IV']

const hexOf = (tint: number) => `#${tint.toString(16).padStart(6, '0')}`

const RARITY_BY_TIER: EmblemTone[] = ['common', 'common', 'rare', 'epic', 'legend']

/** Groups the stat list the same way the cards are coloured, so a stat is in
 *  the same family here as it was on the card that granted it. */
const GROUP_LABEL: Record<string, string> = {
  offence: '攻擊',
  defence: '防禦',
  utility: '輔助',
}

export function Inventory({ run, statIcon, statFormat, statOrder, onClose }: InventoryProps) {
  const groups: { group: string; ids: UpgradeId[] }[] = ['offence', 'defence', 'utility'].map(
    (group) => ({
      group,
      ids: statOrder.filter((id) => STAT_INFO[id].group === group),
    }),
  )

  return (
    <div className="sheet">
      <header className="screen-head">
        <p className="screen-eyebrow">WAVE {run.wave}</p>
        <h2 className="screen-title">裝備與屬性</h2>
        <p className="screen-sub">按 I 或 ESC 關閉 · 戰鬥仍在進行</p>
      </header>

      <div className="sheet-cols">
        {/* ---------- weapons ---------- */}
        <section className="sheet-col">
          <h3 className="sheet-heading">
            武器
            <span className="sheet-count">
              {run.weapons.length} / {MAX_WEAPON_SLOTS}
            </span>
          </h3>

          <ul className="sheet-list">
            {run.weapons.map((slot, i) => {
              const weapon = WEAPONS[slot.kind]
              const tone = RARITY_BY_TIER[slot.tier] ?? 'common'
              /* The numbers as this slot actually fires them, not the base
                 line from the data file: a tier III weapon that still showed
                 its tier I damage would be the one place in the game where the
                 rack lies about what it is doing. */
              const damage = weapon.damage * tierDamageScale(slot.tier)
              const cooldown = weapon.cooldown / tierRateScale(slot.tier)
              return (
                <li
                  key={`${slot.kind}-${i}`}
                  className="sheet-row is-weapon"
                  style={{ '--weapon-tint': hexOf(weapon.tint) } as CSSProperties}
                >
                  <Emblem className="sheet-art" frame="ring" glyph="swords" tone={tone} />
                  <div className="sheet-body">
                    <p className="sheet-name">
                      {weapon.label}
                      <span className="sheet-tier">{TIER_MARK[slot.tier]}</span>
                    </p>
                    <p className="sheet-detail">{weapon.detail}</p>
                    <p className="sheet-numbers">
                      <span>傷害 {damage.toFixed(1)}</span>
                      <span>間隔 {cooldown.toFixed(2)}s</span>
                      <span>射程 {Math.round(weapon.range * run.stats.range)}</span>
                      <span>彈數 {weapon.count + run.stats.bonusCount}</span>
                    </p>
                  </div>
                </li>
              )
            })}

            {/* Empty slots drawn rather than left blank: how much room is left
                is what decides whether the next shop weapon is a purchase or a
                merge. */}
            {Array.from({ length: Math.max(0, MAX_WEAPON_SLOTS - run.weapons.length) }, (_, i) => (
              <li key={`empty-${i}`} className="sheet-row is-empty">
                空欄位
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- stats ---------- */}
        <section className="sheet-col is-stats">
          <h3 className="sheet-heading">屬性</h3>

          {groups.map(({ group, ids }) => (
            <div key={group} className={`sheet-group group-${group}`}>
              <p className="sheet-group-name">{GROUP_LABEL[group]}</p>
              <ul className="sheet-stats">
                {ids.map((id) => {
                  /* Marked when it has moved off the starting value. The strip
                     on the HUD shows only those; this shows everything, so
                     without the mark a build would be a wall of numbers with no
                     shape to it. */
                  const moved = run.stats[id] !== BASE_STATS[id as keyof PlayerStats]
                  return (
                    <li key={id} className={`sheet-stat${moved ? ' is-moved' : ''}`}>
                      <Icon name={statIcon[id]} className="sheet-stat-icon" />
                      <span className="sheet-stat-name">{STAT_INFO[id].label}</span>
                      <b className="sheet-stat-value">{statFormat[id](run.stats[id])}</b>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </section>

        {/* ---------- items ---------- */}
        <section className="sheet-col">
          <h3 className="sheet-heading">
            道具
            <span className="sheet-count">{run.items.length}</span>
          </h3>

          <ul className="sheet-list">
            {run.items.map((id, i) => {
              const item = SHOP_ITEMS.find((entry) => entry.id === id)
              if (!item) {
                return null
              }
              const first = Object.keys(item.mods)[0] as UpgradeId | undefined
              return (
                <li key={`${id}-${i}`} className="sheet-row">
                  <Emblem
                    className="sheet-art"
                    frame="shield"
                    glyph={first ? statIcon[first] : 'sigil'}
                    tone={item.price < 25 ? 'common' : item.price < 32 ? 'rare' : 'epic'}
                  />
                  <div className="sheet-body">
                    <p className="sheet-name">{item.label}</p>
                    <p className="sheet-detail">{item.detail}</p>
                  </div>
                </li>
              )
            })}

            {run.items.length === 0 ? (
              <li className="sheet-row is-empty">還沒有買過道具。</li>
            ) : null}
          </ul>
        </section>
      </div>

      <button type="button" className="sheet-close" onClick={onClose}>
        關閉 <kbd>I</kbd>
      </button>
    </div>
  )
}
