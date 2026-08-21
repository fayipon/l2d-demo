import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StageShell } from '../components/StageShell'
import { Emblem } from '../components/Emblem'
import { Icon, type IconName } from '../components/icons'
import { useSelectedCharacter } from '../app/selectedCharacterContext'
import { usePortraits } from '../features/portraits'
import {
  ACHIEVEMENTS,
  CATEGORIES,
  FEATURED_ID,
  achievementState,
  type Achievement,
  type AchievementCategoryId,
  type AchievementReward,
  type AchievementState,
} from '../features/achievements'
import './AchievementsPage.css'

type ListTab = 'all' | 'open' | 'done'
type SortKey = 'recent' | 'progress' | 'tier'

const TABS: { id: ListTab; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'open', label: '未達成' },
  { id: 'done', label: '已達成' },
]

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'recent', label: '最新解鎖' },
  { id: 'progress', label: '完成度' },
  { id: 'tier', label: '稀有度' },
]

/** How many rows the list shows before "更多成就". */
const PAGE_SIZE = 5

const REWARD_ICON: Record<Exclude<AchievementReward['kind'], 'cg'>, IconName> = {
  coin: 'coin',
  gem: 'gem',
  exp: 'exp',
}

const STATE_RANK: Record<AchievementState, number> = { claimable: 0, progress: 1, claimed: 2 }
const TIER_RANK = { legend: 0, epic: 1, rare: 2, common: 3 } as const

/* Stamped once rather than per render: a reward claimed in this session is
   dated today, and re-reading the clock while rendering is how two rows that
   were claimed together end up with different dates. */
const TODAY = new Date().toISOString().slice(0, 10)

function RewardTile({ reward, portrait }: { reward: AchievementReward; portrait?: string }) {
  if (reward.kind === 'cg') {
    return (
      <div className="ach-reward ach-reward-cg">
        {portrait ? (
          <img className="ach-reward-art" src={portrait} alt="" />
        ) : (
          // The portrait is captured off the live model, so there is none until
          // that character has been on screen once. See features/portraits.
          <Emblem frame="ring" glyph="face" tone="legend" className="ach-reward-fallback" />
        )}
        <span className="ach-reward-amount">{reward.label}</span>
      </div>
    )
  }
  return (
    <div className={`ach-reward ach-reward-${reward.kind}`}>
      <Icon name={REWARD_ICON[reward.kind]} className="ach-reward-icon" />
      <span className="ach-reward-amount">×{(reward.amount ?? 0).toLocaleString('zh-Hant')}</span>
    </div>
  )
}

export function AchievementsPage() {
  const navigate = useNavigate()
  const { character } = useSelectedCharacter()
  const portraits = usePortraits()

  const [categoryId, setCategoryId] = useState<AchievementCategoryId>('all')
  const [tab, setTab] = useState<ListTab>('all')
  const [sort, setSort] = useState<SortKey>('recent')
  const [selectedId, setSelectedId] = useState(FEATURED_ID)
  const [expanded, setExpanded] = useState(false)
  /* Claiming is the one piece of progress this screen can actually move, so it
     lives here rather than in features/achievements -- that file stays the
     starting position. */
  const [claimed, setClaimed] = useState<ReadonlySet<string>>(() => new Set())

  const stateOf = (entry: Achievement) => achievementState(entry, claimed.has(entry.id))

  const category = CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[0]

  const visible = useMemo(() => {
    const state = (entry: Achievement) =>
      achievementState(entry, claimed.has(entry.id))

    const list = ACHIEVEMENTS.filter((entry) => {
      if (categoryId !== 'all' && entry.category !== categoryId) {
        return false
      }
      if (tab === 'open') {
        return state(entry) !== 'claimed'
      }
      if (tab === 'done') {
        return state(entry) === 'claimed'
      }
      return true
    })

    return [...list].sort((a, b) => {
      if (sort === 'progress') {
        return b.progress / b.goal - a.progress / a.goal
      }
      if (sort === 'tier') {
        return TIER_RANK[a.tone] - TIER_RANK[b.tone]
      }
      // 最新解鎖: what needs the player's attention first, then what is closest
      // to needing it, then the history.
      const byState = STATE_RANK[state(a)] - STATE_RANK[state(b)]
      return byState !== 0 ? byState : b.progress / b.goal - a.progress / a.goal
    })
  }, [categoryId, tab, sort, claimed])

  const rows = expanded ? visible : visible.slice(0, PAGE_SIZE)

  // A filter can hide the selected achievement; the panel keeps showing it
  // rather than emptying out a third of the screen.
  const selected = ACHIEVEMENTS.find((entry) => entry.id === selectedId) ?? ACHIEVEMENTS[0]
  const selectedState = stateOf(selected)

  const claimableCount = ACHIEVEMENTS.filter((entry) => stateOf(entry) === 'claimable').length

  const claim = (id: string) =>
    setClaimed((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })

  const claimAll = () =>
    setClaimed((prev) => {
      const next = new Set(prev)
      ACHIEVEMENTS.forEach((entry) => {
        if (achievementState(entry, prev.has(entry.id)) === 'claimable') {
          next.add(entry.id)
        }
      })
      return next
    })

  const meterPercent = Math.round((category.done / category.total) * 100)

  return (
    <StageShell background={character.background}>
      <div className="hud ach-hud">
        <div className="ach-scrim" aria-hidden="true" />

        <div className="top-bar">
          <button type="button" className="back-btn panel" onClick={() => navigate('/')}>
            <Icon name="back" />
            <span>BACK</span>
          </button>

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
        </div>

        {/* ---------- masthead ---------- */}
        <header className="ach-masthead">
          <h1 className="ach-title">
            <Icon name="sparkle" className="ach-title-flourish" />
            <span className="ach-title-text">ACHIEVEMENTS</span>
            <Icon name="sparkle" className="ach-title-flourish" />
          </h1>

          {/* Follows the selected category, so the sidebar and the headline
              never disagree about what is being looked at. */}
          <div className="ach-meter">
            <span className="ach-meter-label">成就達成度</span>
            <span className="ach-meter-count">
              <b>{category.done}</b> / {category.total}
            </span>
            <span className="ach-meter-track">
              <i className="ach-meter-fill" style={{ width: `${meterPercent}%` }} />
            </span>
            <span className="ach-meter-percent">{meterPercent}%</span>
          </div>
        </header>

        {/* ---------- categories ---------- */}
        <div className="ach-cats panel" role="listbox" aria-label="成就分類">
          {CATEGORIES.map((entry) => {
            const selectedCat = entry.id === categoryId
            return (
              <button
                type="button"
                key={entry.id}
                role="option"
                aria-selected={selectedCat}
                className={`ach-cat${selectedCat ? ' is-selected' : ''}${
                  entry.tone === 'death' ? ' is-death' : ''
                }`}
                onClick={() => {
                  setCategoryId(entry.id)
                  setExpanded(false)
                }}
              >
                <Icon name={entry.icon} className="ach-cat-icon" />
                <span className="ach-cat-text">
                  <span className="ach-cat-en">{entry.en}</span>
                  <span className="ach-cat-zh">{entry.zh}</span>
                </span>
                <span className="ach-cat-count">
                  {entry.done} / {entry.total}
                </span>
              </button>
            )
          })}
        </div>

        {/* ---------- list ---------- */}
        <div className="ach-list-col panel">
          <div className="ach-tabs">
            <div className="ach-tab-group" role="tablist" aria-label="成就狀態">
              {TABS.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  role="tab"
                  aria-selected={tab === entry.id}
                  className={`ach-tab${tab === entry.id ? ' is-active' : ''}`}
                  onClick={() => {
                    setTab(entry.id)
                    setExpanded(false)
                  }}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            <label className="ach-sort">
              <span className="visually-hidden">排序</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {SORTS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <Icon name="chevron" className="ach-sort-caret" />
            </label>
          </div>

          <div className="ach-rows">
            {rows.map((entry) => {
              const state = stateOf(entry)
              const percent = Math.min(100, Math.round((entry.progress / entry.goal) * 100))
              const isSelected = entry.id === selectedId
              return (
                <div
                  key={entry.id}
                  className={`ach-row is-${state}${isSelected ? ' is-selected' : ''}`}
                >
                  {/* Two controls rather than one: the row picks what the panel
                      on the right shows, and 領取 takes the reward. A button
                      inside a button is not valid HTML and does not receive
                      clicks reliably where it is allowed. */}
                  <button
                    type="button"
                    className="ach-open"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedId(entry.id)}
                  >
                    <Emblem
                      frame={entry.frame}
                      glyph={entry.glyph}
                      tone={entry.tone}
                      dim={state === 'progress' && entry.progress === 0}
                      className="ach-row-emblem"
                    />

                    <span className="ach-row-body">
                      <span className={`ach-row-name tone-${entry.tone}`}>{entry.name}</span>
                      <span className="ach-row-detail">{entry.detail}</span>
                      <span className="ach-row-meter">
                        <span className="ach-bar">
                          <i className="ach-bar-fill" style={{ width: `${percent}%` }} />
                        </span>
                        <span className="ach-bar-text">
                          {entry.progress} / {entry.goal}
                        </span>
                      </span>
                    </span>

                    <span className="ach-row-rewards">
                      {entry.rewards
                        .filter((reward) => reward.kind !== 'cg')
                        .map((reward) => (
                          <RewardTile key={reward.id} reward={reward} />
                        ))}
                    </span>
                  </button>

                  {state === 'claimable' ? (
                    <button type="button" className="ach-claim" onClick={() => claim(entry.id)}>
                      領取
                    </button>
                  ) : state === 'claimed' ? (
                    <span className="ach-done">
                      <span className="ach-done-label">已達成</span>
                      <span className="ach-done-date">{entry.claimedOn ?? TODAY}</span>
                    </span>
                  ) : (
                    <span className="ach-pending">進行中</span>
                  )}
                </div>
              )
            })}

            {rows.length === 0 ? <p className="ach-empty">這個分類還沒有成就。</p> : null}
          </div>

          {visible.length > PAGE_SIZE ? (
            <button type="button" className="ach-more" onClick={() => setExpanded((v) => !v)}>
              <Icon name="chevron" className={`ach-more-caret${expanded ? ' is-open' : ''}`} />
              <span>{expanded ? '收合列表' : '更多成就'}</span>
            </button>
          ) : null}
        </div>

        {/* ---------- feature ---------- */}
        <div className="ach-feature-col">
          <button
            type="button"
            className="ach-claim-all panel"
            disabled={claimableCount === 0}
            onClick={claimAll}
          >
            一鍵領取
          </button>

          <div className="ach-feature panel">
            {/* Its own layer, like the chapter cards: art behind a scrim, so the
                text on top stays readable whatever the crop happens to be. */}
            <span
              className="ach-feature-art"
              style={{ backgroundImage: `url(${selected.art})` }}
              aria-hidden="true"
            />

            <div className="ach-feature-body">
              <h2 className={`ach-feature-name tone-${selected.tone}`}>{selected.name}</h2>
              <p className="ach-feature-detail">{selected.detail}</p>

              <Emblem
                frame={selected.frame}
                glyph={selected.glyph}
                tone={selected.tone}
                className="ach-feature-emblem"
              />

              <div className="ach-feature-progress">
                <span className="ach-feature-heading">進度</span>
                <span className="ach-feature-count">
                  {selected.progress} / {selected.goal}
                </span>
                <span className="ach-bar">
                  <i
                    className="ach-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.round((selected.progress / selected.goal) * 100))}%`,
                    }}
                  />
                </span>
              </div>

              <div className="ach-feature-rewards">
                <span className="ach-feature-heading with-rule">獎勵</span>
                <div className="ach-feature-reward-row">
                  {selected.rewards.map((reward) => (
                    <RewardTile
                      key={reward.id}
                      reward={reward}
                      portrait={portraits[character.id]}
                    />
                  ))}

                  {selectedState === 'claimable' ? (
                    <button
                      type="button"
                      className="ach-claim ach-claim-wide"
                      onClick={() => claim(selected.id)}
                    >
                      領取
                    </button>
                  ) : selectedState === 'claimed' ? (
                    <span className="ach-done ach-done-wide">
                      <Icon name="check" className="ach-done-check" />
                      <span className="ach-done-label">已達成</span>
                    </span>
                  ) : (
                    <span className="ach-pending ach-pending-wide">進行中</span>
                  )}
                </div>
              </div>

              {/* Nothing behind it yet -- the achievement's own story is the
                  next thing this screen would gain. */}
              <button type="button" className="ach-details">
                查看詳情
              </button>
            </div>
          </div>
        </div>
      </div>
    </StageShell>
  )
}
