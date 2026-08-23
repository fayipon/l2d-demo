import { useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Live2DStage, type Live2DStageHandle } from '../pixi/Live2DStage'
import { StageShell } from '../components/StageShell'
import { Icon } from '../components/icons'
import { useSelectedCharacter } from '../app/selectedCharacterContext'
import { ROSTER } from '../features/character'
import { arenaProfile } from '../features/arenaProfile'
import { savePortrait, usePortraits } from '../features/portraits'
import './CharacterPage.css'

type PanelTab = 'stats' | 'skills'

export function CharacterPage() {
  const stageRef = useRef<Live2DStageHandle>(null)
  const navigate = useNavigate()
  // Selecting here is what the home screen reads, so it goes straight into the
  // shared state rather than into local state that would be lost on navigate.
  const { character, select } = useSelectedCharacter()
  const [muted, setMuted] = useState(false)
  const [tab, setTab] = useState<PanelTab>('stats')
  // Recomputed on selection rather than memoised: it is four multiplications
  // and a lookup, and a stale profile beside a live portrait would be the
  // exact failure this whole change exists to remove.
  const profile = arenaProfile(character.id)
  const [expression, setExpression] = useState(0)
  const [bubble, setBubble] = useState({ text: '', visible: false })
  const portraits = usePortraits()

  const expressions = character.detail.expressions

  const selectCharacter = (id: string) => {
    select(id)
    // Expression ids are per-model, so the highlight would otherwise point at a
    // slot the new model does not have.
    setExpression(0)
    setBubble((prev) => ({ ...prev, visible: false }))
  }

  const applyExpression = (index: number) => {
    setExpression(index)
    stageRef.current?.setExpression(index)
  }

  return (
    <StageShell background={character.background}>
      <Live2DStage
        // The stage owns a WebGL context and one loaded model, so changing
        // character is a remount rather than a prop update.
        key={character.id}
        ref={stageRef}
        config={character.detail}
        muted={muted}
        onPortrait={(dataUrl) => savePortrait(character.id, dataUrl)}
        onLine={(caption) =>
          setBubble((prev) =>
            caption ? { text: caption, visible: true } : { ...prev, visible: false },
          )
        }
      />

      {/* The accent follows the selected character through the whole screen. */}
      <div className="hud char-hud" style={{ '--accent': character.accent } as CSSProperties}>
        <button type="button" className="back-btn panel" onClick={() => navigate('/')}>
          <Icon name="back" />
          <span>BACK</span>
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

        {/* ---------- roster ---------- */}
        <div className="roster panel" role="listbox" aria-label="角色選擇">
          <span className="roster-title">CHARACTER</span>
          {ROSTER.map((entry) => {
            const selected = entry.id === character.id
            const portrait = portraits[entry.id]
            return (
              <button
                type="button"
                key={entry.id}
                role="option"
                aria-selected={selected}
                className={`roster-slot${selected ? ' is-selected' : ''}`}
                style={{ '--accent': entry.accent } as CSSProperties}
                onClick={() => selectCharacter(entry.id)}
              >
                <span className="roster-portrait">
                  {portrait ? (
                    <img src={portrait} alt="" />
                  ) : (
                    // Until this character's model has been on screen once,
                    // there is no capture to show.
                    <Icon name="sword" className="roster-portrait-fallback" />
                  )}
                </span>
                <span className="roster-text">
                  <span className="roster-name">{entry.name}</span>
                  <span className="roster-role">{entry.title}</span>
                  <span className="roster-lv">LV. {entry.level}</span>
                </span>
                <Icon name="sigil" className="roster-sigil" />
              </button>
            )
          })}
        </div>

        {/* ---------- detail ---------- */}
        <div className="char-panel panel">
          <header className="char-head">
            <div className="char-rarity" aria-label={`稀有度 ${character.rarity} 星`}>
              {Array.from({ length: character.rarity }, (_, i) => (
                <Icon key={i} name="star" className="char-star" />
              ))}
            </div>
            <h1 className="char-name">{character.name}</h1>
            <p className="char-title">{character.title}</p>
            <div className="char-meta">
              <span className="char-chip">LV. {character.level} / {character.levelCap}</span>
              <span className="char-chip char-chip-element">屬性 · {character.element}</span>
            </div>
          </header>

          <div className="tab-row" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'stats'}
              className={`tab${tab === 'stats' ? ' is-active' : ''}`}
              onClick={() => setTab('stats')}
            >
              能力
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'skills'}
              className={`tab${tab === 'skills' ? ' is-active' : ''}`}
              onClick={() => setTab('skills')}
            >
              技能
            </button>
          </div>

          <div className="tab-body">
            {tab === 'stats' ? (
              <>
                {/* Everything below is derived from the loadout the run is
                    actually built from -- see features/arenaProfile. It used to
                    be a hand-written block on a scale nothing else in the game
                    used, which is the sort of number people read before
                    choosing and then never see again. */}
                {/* The six primaries, which is what a class now is: where the
                    character starts and how fast each one grows. The derived
                    rows below are the same numbers read as an opening, and
                    they follow from these rather than being written beside
                    them. */}
                <dl className="char-attrs">
                  {profile.attributes.map((attr) => (
                    <div className="char-attr" key={attr.id}>
                      <dt>
                        {attr.label}
                        <span className="char-attr-feeds">{attr.feeds}</span>
                      </dt>
                      <dd>
                        {attr.value}
                        <span className="char-attr-growth">+{attr.growth.toFixed(1)}/級</span>
                      </dd>
                      <div className="char-stat-bar">
                        <div
                          className="char-stat-fill"
                          style={{ width: `${Math.round(attr.ratio * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </dl>

                <dl className="char-stats">
                  {profile.rows.map((row) => (
                    <div className="char-stat" key={row.id}>
                      <dt>{row.label}</dt>
                      <dd>{row.text}</dd>
                      <div className="char-stat-bar">
                        <div
                          className="char-stat-fill"
                          style={{ width: `${Math.round(row.ratio * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </dl>

                {profile.weapon ? (
                  <div className="char-weapon">
                    <p className="char-weapon-head">
                      <Icon name="swords" />
                      起手武器
                      <b>{profile.weapon.label}</b>
                      <span className="char-weapon-family">{profile.weapon.family}</span>
                    </p>
                    <p className="char-weapon-detail">{profile.weapon.detail}</p>
                    <p className="char-weapon-numbers">
                      <span>傷害 {profile.weapon.damage}</span>
                      <span>間隔 {profile.weapon.cooldown.toFixed(2)}s</span>
                      <span>射程 {profile.weapon.range}</span>
                      {profile.weapon.count > 1 ? <span>彈數 {profile.weapon.count}</span> : null}
                    </p>
                  </div>
                ) : null}

                {profile.mods.length > 0 ? (
                  <ul className="char-mods">
                    {profile.mods.map((mod) => (
                      <li key={mod.id} className={mod.penalty ? 'is-penalty' : ''}>
                        <span>{mod.label}</span>
                        <b>{mod.text}</b>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className="char-bio">{character.bio}</p>
              </>
            ) : (
              <ul className="skill-list">
                {character.skills.map((skill) => (
                  <li className="skill" key={skill.id}>
                    <span className={`skill-icon tone-${skill.tone}`}>
                      <Icon name={skill.icon} />
                    </span>
                    <div className="skill-body">
                      <div className="skill-head">
                        <span className="skill-name">{skill.name}</span>
                        <span className={`skill-kind tone-${skill.tone}`}>{skill.kind}</span>
                        <span className="skill-lv">Lv.{skill.level}/{skill.levelCap}</span>
                      </div>
                      <p className="skill-desc">{skill.description}</p>
                      {skill.cooldown ? (
                        <span className="skill-cd">冷卻 {skill.cooldown}</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ---------- bottom actions ---------- */}
        <div className="char-actions">
          {/* Not every sample model ships expressions, so the strip is dropped
              rather than rendered empty. */}
          {expressions.length > 0 ? (
            <div className="expr-row" role="group" aria-label="表情">
              <span className="expr-label">
                <Icon name="face" />
                表情
              </span>
              {expressions.map((exp, i) => (
                <button
                  type="button"
                  key={exp.id}
                  className={`expr-btn panel${i === expression ? ' is-active' : ''}`}
                  aria-pressed={i === expression}
                  onClick={() => applyExpression(i)}
                >
                  {exp.label}
                </button>
              ))}
            </div>
          ) : null}

          <button type="button" className="talk-btn" onClick={() => stageRef.current?.speak()}>
            <Icon name="chat" />
            <span className="talk-en">TALK</span>
            <span className="talk-sub">對話</span>
          </button>
        </div>

        {/* Tapping the model raises this too, same as on the home screen. */}
        <div
          className={`speech-bubble tail-right${bubble.visible ? ' is-visible' : ''}`}
          aria-live="polite"
        >
          {bubble.text}
        </div>
      </div>
    </StageShell>
  )
}
