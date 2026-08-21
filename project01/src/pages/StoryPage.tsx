import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StageShell } from '../components/StageShell'
import { Icon, type IconName } from '../components/icons'
import { useSelectedCharacter } from '../app/selectedCharacterContext'
import { formatCurrency, useProfile } from '../features/profile'
import { CHAPTERS, DEFAULT_CHAPTER_ID, type StoryReward } from '../features/story'
import './StoryPage.css'

const REWARD_ICON: Record<StoryReward['kind'], IconName> = {
  coin: 'coin',
  gem: 'gem',
  exp: 'exp',
}

const REWARD_LABEL: Record<StoryReward['kind'], string> = {
  coin: '金幣',
  gem: '寶石',
  exp: '經驗',
}

export function StoryPage() {
  const navigate = useNavigate()
  const { character } = useSelectedCharacter()
  const profile = useProfile()
  const [chapterId, setChapterId] = useState(DEFAULT_CHAPTER_ID)
  const [stageId, setStageId] = useState(CHAPTERS[0].stages[0].id)

  const chapter = CHAPTERS.find((c) => c.id === chapterId) ?? CHAPTERS[0]
  // A locked chapter has no stages, so the preview keeps showing the last real
  // selection rather than blanking out half the screen.
  const stage =
    CHAPTERS.flatMap((c) => c.stages).find((s) => s.id === stageId) ?? CHAPTERS[0].stages[0]

  return (
    <StageShell background={character.background}>
      <div className="hud story-hud">
        <div className="story-scrim" aria-hidden="true" />

        {/* One bar rather than two floating controls, so the top of the screen
            reads as chrome and the columns below it get a clean edge to start
            from. */}
        <div className="top-bar">
          <button type="button" className="back-btn panel" onClick={() => navigate('/')}>
            <Icon name="back" />
            <span>BACK</span>
          </button>

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
        </div>

        {/* ---------- chapters ---------- */}
        <div className="chapter-col">
          <header className="story-head">
            <Icon name="book" className="story-head-icon" />
            <div>
              <h1 className="story-title">STORY</h1>
              <p className="story-sub">主線劇情</p>
            </div>
          </header>

          <div className="chapter-list" role="listbox" aria-label="章節">
            {CHAPTERS.map((entry) => {
              const selected = entry.id === chapter.id
              return (
                <button
                  type="button"
                  key={entry.id}
                  role="option"
                  aria-selected={selected}
                  disabled={entry.locked}
                  className={`chapter${selected ? ' is-selected' : ''}${entry.locked ? ' is-locked' : ''}`}
                  onClick={() => setChapterId(entry.id)}
                >
                  {/* Its own layer so a closed chapter can be desaturated with
                      `filter`. As a background on the card itself the only tool
                      is `backdrop-filter`, which filters what is behind the
                      element -- the art is painted by the element, so nothing
                      happened and the locked cards kept their colour. */}
                  <span className="chapter-art" style={{ backgroundImage: `url(${entry.art})` }} />
                  {/* Left zone: the lock sits over the art, as in the mock.
                      Empty for an unlocked chapter, which lets its art show. */}
                  <span className="chapter-mark">
                    {entry.locked ? <Icon name="lock" className="chapter-lock" /> : null}
                  </span>
                  <span className="chapter-text">
                    <span className="chapter-label">{entry.label}</span>
                    <span className="chapter-name">{entry.name}</span>
                  </span>
                  <Icon name="chevron" className="chapter-chevron" />
                </button>
              )
            })}
          </div>

        </div>

        {/* ---------- stages ---------- */}
        <div className="stage-col">
          <div className="stage-head">
            <div>
              <p className="stage-chapter-label">{chapter.label}</p>
              <h2 className="stage-chapter-name">{chapter.name}</h2>
            </div>
            <p className="stage-chapter-intro">{chapter.intro}</p>
          </div>

          {/* The rail is one continuous line behind the rows, with a node per
              stage, so it reads as a path rather than as separate cards. */}
          <div className="stage-list">
            <span className="stage-rail" aria-hidden="true" />
            {chapter.stages.map((entry) => {
              const selected = entry.id === stage.id
              return (
                <div className="stage-row" key={entry.id}>
                  <span
                    className={`stage-node${entry.locked ? ' is-locked' : ''}`}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    disabled={entry.locked}
                    aria-pressed={selected}
                    className={`stage${selected ? ' is-selected' : ''}${entry.locked ? ' is-locked' : ''}`}
                    onClick={() => setStageId(entry.id)}
                  >
                    <img className="stage-thumb" src={entry.art} alt="" />
                    <span className="stage-text">
                      <span className="stage-title">
                        <span className="stage-code">{entry.code}</span>
                        {entry.name}
                      </span>
                      <span className="stage-summary">{entry.summary}</span>
                    </span>
                    <span className="stage-status">
                      {entry.locked ? (
                        <Icon name="lock" className="stage-lock" />
                      ) : (
                        <>
                          <span className="stage-clear">CLEAR</span>
                          <span className="stage-stars" aria-label={`${entry.stars} 星`}>
                            {Array.from({ length: 3 }, (_, i) => (
                              <Icon
                                key={i}
                                name="star"
                                className={i < (entry.stars ?? 0) ? 'star-on' : 'star-off'}
                              />
                            ))}
                          </span>
                        </>
                      )}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ---------- stage preview ---------- */}
        <div className="preview-col">
          <button type="button" className="recap-btn panel">
            <Icon name="book" />
            <span>劇情回顧</span>
          </button>

          <div className="preview panel">
            <img className="preview-art" src={stage.art} alt="" />

            <div className="preview-title-row">
              <h3 className="preview-title">
                <span className="stage-code">{stage.code}</span>
                {stage.name}
              </h3>
              <span className="preview-level">推薦 LV. {stage.recommendedLevel}</span>
            </div>

            <p className="preview-summary">{stage.summary}</p>

            <div className="preview-cols">
              <section>
                <h4 className="preview-heading">目標</h4>
                <ul className="objective-list">
                  {stage.objectives.map((objective) => (
                    <li key={objective}>
                      <Icon name="star" className="objective-star" />
                      {objective}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h4 className="preview-heading">首次通關獎勵</h4>
                <div className="reward-row">
                  {stage.rewards.map((reward) => (
                    <div className={`reward reward-${reward.kind}`} key={reward.id}>
                      <Icon
                        name={REWARD_ICON[reward.kind]}
                        className="reward-icon"
                        aria-label={REWARD_LABEL[reward.kind]}
                      />
                      <span className="reward-amount">
                        ×{reward.amount.toLocaleString('zh-Hant')}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* The arena is the only thing behind any of this so far. */}
            <button type="button" className="start-quest" onClick={() => navigate('/battle')}>
              <Icon name="swords" />
              <span>開始劇情</span>
            </button>
          </div>
        </div>
      </div>
    </StageShell>
  )
}
