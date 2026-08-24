import { Emblem } from '../components/Emblem'
import { ATTRIBUTES, ATTRIBUTE_CAP } from '../game/data/attributes'
import { Icon, type IconName } from '../components/icons'
import { BASE_STATS, MAX_WEAPON_SLOTS, STAT_INFO, type PlayerStats, type UpgradeId } from '../game/data/content'
import { SHOP_ITEMS } from '../game/data/shop'
import type { RunSnapshot } from '../game/runStore'
import { WeaponGrid } from './WeaponGrid'

/**
 * What the run is carrying.
 *
 * Three pieces, exported separately because the shop screen wants two of them
 * beside its shelf and the sheet on I wants all three. Composing them at each
 * call site beats a `compact` flag threaded through one component that then
 * has to mean something different in each half of itself.
 *
 * The HUD already shows a compressed version -- the rack, and the strip of
 * stats that have moved -- because those are the glance you take mid-fight.
 * This is the read you stop and do.
 */

export interface StatViews {
  icon: Record<UpgradeId, IconName>
  format: Record<UpgradeId, (value: number) => string>
  order: UpgradeId[]
}

const GROUP_LABEL: Record<string, string> = {
  offence: '攻擊',
  defence: '防禦',
  utility: '輔助',
}

export function WeaponSection({ run, detailed }: { run: RunSnapshot; detailed?: boolean }) {
  return (
    <section className="sheet-col">
      <h3 className="sheet-heading">
        武器
        <span className="sheet-count">
          {run.weapons.length} / {MAX_WEAPON_SLOTS}
        </span>
      </h3>
      <p className="sheet-note">拖曳同名同階的武器互相重疊即可合成</p>
      <WeaponGrid run={run} detailed={detailed} />
    </section>
  )
}

export function StatSection({ run, views }: { run: RunSnapshot; views: StatViews }) {
  const groups = ['offence', 'defence', 'utility'].map((group) => ({
    group,
    ids: views.order.filter((id) => STAT_INFO[id].group === group),
  }))

  return (
    <section className="sheet-col is-stats">
      <h3 className="sheet-heading">屬性</h3>

      {/*
        The class's passives above everything, because they change what the
        numbers under them mean rather than being one of them. The regeneration
        one quotes what it is currently worth: a passive whose value moves with
        the build is a passive worth watching, and one that only said 隨護甲提升
        would be asking the player to do the arithmetic.

        Both halves of it, since the stat became a fraction. The percentage is
        what the skill produces and the health is what the player gets, and they
        move independently -- buying maximum health raises the second without
        touching the first, which is exactly the thing a rate is for and exactly
        the thing quoting only the rate would hide.
      */}
      {run.skills.length > 0 ? (
        <div className="sheet-group group-skill">
          <p className="sheet-group-name">職業技能</p>
          <ul className="sheet-skills">
            {run.skills.map((skill) => (
              <li className="sheet-skill" key={skill.id}>
                <span className="sheet-skill-name">{skill.name}</span>
                <span className="sheet-skill-kind">{skill.kind}</span>
                <p className="sheet-skill-detail">{skill.description}</p>
                {skill.effect.sort === 'regenFrom' ? (
                  <b className="sheet-skill-value">
                    目前 {(run.stats.regen * 100).toFixed(1)}%/秒 ·{' '}
                    {(run.stats.maxHp * run.stats.regen).toFixed(1)} HP/秒
                  </b>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/*
        The six primaries next, because everything under them is computed from
        them. A level adds to these and the block below follows -- showing the
        derived numbers alone would be showing the result and hiding the rule.

        Rounded here and nowhere else: growth is fractional, so 34.6 STR is the
        real value and 35 is what a player needs to read.
      */}
      <div className="sheet-group group-primary">
        <p className="sheet-group-name">主屬性</p>
        <ul className="sheet-attrs">
          {ATTRIBUTES.map((entry) => (
            <li className="sheet-attr" key={entry.id}>
              <span className="sheet-attr-name">{entry.label}</span>
              <span className="sheet-attr-feeds">{entry.feeds}</span>
              <b className="sheet-attr-value">
                {Math.round(run.attributes[entry.id])}
                <i>/{ATTRIBUTE_CAP}</i>
              </b>
            </li>
          ))}
        </ul>
      </div>

      {groups.map(({ group, ids }) => (
        <div key={group} className={`sheet-group group-${group}`}>
          <p className="sheet-group-name">{GROUP_LABEL[group]}</p>
          <ul className="sheet-stats">
            {ids.map((id) => {
              /* Marked when it has moved off the starting value. The strip on
                 the HUD shows only those; this shows everything, so without the
                 mark a build would be a wall of numbers with no shape to it. */
              const moved = run.stats[id] !== BASE_STATS[id as keyof PlayerStats]
              return (
                <li key={id} className={`sheet-stat${moved ? ' is-moved' : ''}`}>
                  <Icon name={views.icon[id]} className="sheet-stat-icon" />
                  <span className="sheet-stat-name">{STAT_INFO[id].label}</span>
                  <b className="sheet-stat-value">{views.format[id](run.stats[id])}</b>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}

export function ItemSection({ run, views }: { run: RunSnapshot; views: StatViews }) {
  return (
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
                glyph={first ? views.icon[first] : 'sigil'}
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
  )
}

/**
 * The full sheet, on I.
 *
 * It does not pause the arena. The whole tension of a wave is a clock, and a
 * panel that stops it is a rest button with an information panel drawn on it.
 * If that turns out to be the wrong call it is one flag in the scene's frozen
 * check.
 */
export function Inventory({
  run,
  views,
  onClose,
}: {
  run: RunSnapshot
  views: StatViews
  onClose: () => void
}) {
  return (
    <div className="sheet">
      <header className="screen-head">
        <p className="screen-eyebrow">WAVE {run.wave}</p>
        <h2 className="screen-title">裝備與屬性</h2>
        <p className="screen-sub">按 I 或 ESC 關閉 · 戰鬥仍在進行</p>
      </header>

      <div className="sheet-cols">
        <WeaponSection run={run} detailed />
        <StatSection run={run} views={views} />
        <ItemSection run={run} views={views} />
      </div>

      <button type="button" className="sheet-close" onClick={onClose}>
        關閉 <kbd>I</kbd>
      </button>
    </div>
  )
}
