import type { IconName } from '../components/icons'
import type { EmblemFrame, EmblemTone } from '../components/Emblem'
import scene01 from '../assets/scene-01.webp'
import scene02 from '../assets/scene-02.webp'
import scene03 from '../assets/scene-03.webp'
import scene04 from '../assets/scene-04.webp'
import scene05 from '../assets/scene-05.webp'
import scene06 from '../assets/scene-06.webp'

/**
 * The achievement book.
 *
 * Same arrangement as features/story.ts: the content is real, the progress is
 * baked. Nothing in this demo can advance a counter, so `progress` and
 * `claimedOn` exist to give the screen its four states to draw. Claiming is
 * the one thing that does move -- the screen keeps that in its own state -- so
 * this file stays the starting position rather than the save.
 *
 * A category's `done`/`total` are written here rather than counted from the
 * list below. The list is a sample: the mock's sidebar says 128 achievements
 * and shows five, and a count derived from what happens to be written would
 * make the sidebar shrink every time an entry was cut.
 */
export type AchievementCategoryId =
  | 'all'
  | 'progress'
  | 'battle'
  | 'character'
  | 'challenge'
  | 'death'

export interface AchievementCategory {
  id: AchievementCategoryId
  en: string
  zh: string
  icon: IconName
  done: number
  total: number
  /** 'death' is drawn in red wherever it appears, as the mock does. */
  tone?: 'death'
}

export interface AchievementReward {
  id: string
  kind: 'coin' | 'gem' | 'exp' | 'cg'
  /** Absent for a CG, which is a thing rather than a quantity. */
  amount?: number
  /** Caption under a CG card. */
  label?: string
}

export interface Achievement {
  id: string
  category: Exclude<AchievementCategoryId, 'all'>
  name: string
  detail: string
  frame: EmblemFrame
  glyph: IconName
  tone: EmblemTone
  progress: number
  goal: number
  /** ISO date, set when the reward has already been taken. */
  claimedOn: string | null
  /** Backdrop for the feature panel. */
  art: string
  rewards: AchievementReward[]
}

export type AchievementState = 'progress' | 'claimable' | 'claimed'

export const CATEGORIES: AchievementCategory[] = [
  { id: 'all', en: 'ALL', zh: '全部成就', icon: 'sigil', done: 37, total: 128 },
  { id: 'progress', en: 'PROGRESS', zh: '通關成就', icon: 'banner', done: 8, total: 24 },
  { id: 'battle', en: 'BATTLE', zh: '戰鬥成就', icon: 'swords', done: 12, total: 36 },
  { id: 'character', en: 'CHARACTER', zh: '角色成就', icon: 'person', done: 7, total: 24 },
  { id: 'challenge', en: 'CHALLENGE', zh: '挑戰成就', icon: 'trophy', done: 6, total: 20 },
  { id: 'death', en: 'DEATH', zh: '死法成就', icon: 'skull', done: 4, total: 24, tone: 'death' },
]

const coin = (amount: number): AchievementReward => ({ id: 'coin', kind: 'coin', amount })
const gem = (amount: number): AchievementReward => ({ id: 'gem', kind: 'gem', amount })
const exp = (amount: number): AchievementReward => ({ id: 'exp', kind: 'exp', amount })
const cg: AchievementReward = { id: 'cg', kind: 'cg', label: '解鎖CG' }

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-survival',
    category: 'progress',
    name: '初次生還',
    detail: '完成主線劇情 Chapter 1。',
    frame: 'shield',
    glyph: 'swords',
    tone: 'legend',
    progress: 1,
    goal: 1,
    claimedOn: null,
    art: scene01,
    rewards: [coin(5000), exp(500)],
  },
  {
    id: 'battle-novice',
    category: 'battle',
    name: '戰鬥新手',
    detail: '累計擊敗 100 隻敵人。',
    frame: 'shield',
    glyph: 'sword',
    tone: 'rare',
    progress: 68,
    goal: 100,
    claimedOn: null,
    art: scene02,
    rewards: [coin(2000), exp(200)],
  },
  {
    id: 'reaper',
    category: 'battle',
    name: '無情收割',
    detail: '單次戰鬥擊敗 500 隻敵人。',
    frame: 'ring',
    glyph: 'skull',
    tone: 'epic',
    progress: 312,
    goal: 500,
    claimedOn: null,
    art: scene03,
    rewards: [coin(3000), exp(300)],
  },
  {
    id: 'awaken-1',
    category: 'character',
    name: '角色覺醒 I',
    detail: '將任意角色升到 Lv.20。',
    frame: 'shield',
    glyph: 'person',
    tone: 'rare',
    progress: 20,
    goal: 20,
    claimedOn: '2025-05-21',
    art: scene04,
    rewards: [gem(50), exp(500)],
  },
  {
    id: 'first-ending',
    category: 'death',
    name: '第一次…的結局',
    detail: '解鎖任意 1 種死法。',
    frame: 'ring',
    glyph: 'skull',
    tone: 'rare',
    progress: 1,
    goal: 1,
    claimedOn: '2025-05-20',
    art: scene06,
    rewards: [coin(1000)],
  },
  {
    id: 'blood-collector',
    category: 'death',
    name: '血色收藏家 I',
    detail: '解鎖 10 種敵人死法。',
    frame: 'ring',
    glyph: 'skull',
    tone: 'legend',
    progress: 6,
    goal: 10,
    claimedOn: null,
    art: scene06,
    rewards: [cg, coin(5000), exp(800)],
  },
  {
    id: 'frontier-end',
    category: 'progress',
    name: '邊境的盡頭',
    detail: '完成主線劇情 1-5。',
    frame: 'shield',
    glyph: 'banner',
    tone: 'rare',
    progress: 0,
    goal: 1,
    claimedOn: null,
    art: scene01,
    rewards: [coin(4000), exp(400)],
  },
  {
    id: 'trailblazer',
    category: 'progress',
    name: '開拓者',
    detail: '解鎖第 2 章「墮落之都」。',
    frame: 'shield',
    glyph: 'banner',
    tone: 'common',
    progress: 0,
    goal: 1,
    claimedOn: null,
    art: scene02,
    rewards: [coin(1500)],
  },
  {
    id: 'unbeaten',
    category: 'battle',
    name: '不敗之姿',
    detail: '連續 10 場戰鬥無人倒下。',
    frame: 'shield',
    glyph: 'shield',
    tone: 'epic',
    progress: 4,
    goal: 10,
    claimedOn: null,
    art: scene03,
    rewards: [gem(30), exp(600)],
  },
  {
    id: 'flawless',
    category: 'battle',
    name: '完美迴避',
    detail: '單場戰鬥中不受到任何傷害。',
    frame: 'ring',
    glyph: 'burst',
    tone: 'common',
    progress: 0,
    goal: 1,
    claimedOn: null,
    art: scene05,
    rewards: [coin(1200)],
  },
  {
    id: 'awaken-2',
    category: 'character',
    name: '角色覺醒 II',
    detail: '將任意角色升到 Lv.40。',
    frame: 'shield',
    glyph: 'person',
    tone: 'epic',
    progress: 34,
    goal: 40,
    claimedOn: null,
    art: scene04,
    rewards: [gem(80), exp(1200)],
  },
  {
    id: 'full-roster',
    category: 'character',
    name: '滿員出擊',
    detail: '同時擁有 4 名角色。',
    frame: 'shield',
    glyph: 'friends',
    tone: 'rare',
    progress: 4,
    goal: 4,
    claimedOn: null,
    art: scene02,
    rewards: [coin(2500), gem(20)],
  },
  {
    id: 'trial-of-time',
    category: 'challenge',
    name: '時之試煉',
    detail: '90 秒內通關任意關卡。',
    frame: 'ring',
    glyph: 'trophy',
    tone: 'rare',
    progress: 1,
    goal: 1,
    claimedOn: '2025-05-18',
    art: scene05,
    rewards: [coin(2000), exp(300)],
  },
  {
    id: 'perfect-three',
    category: 'challenge',
    name: '完美三星',
    detail: '取得任一章節全部三星。',
    frame: 'ring',
    glyph: 'star',
    tone: 'legend',
    progress: 4,
    goal: 5,
    claimedOn: null,
    art: scene01,
    rewards: [cg, gem(120), exp(2000)],
  },
  {
    id: 'live-to-die',
    category: 'death',
    name: '向死而生',
    detail: '在瀕死狀態下通關關卡。',
    frame: 'ring',
    glyph: 'moon',
    tone: 'epic',
    progress: 0,
    goal: 1,
    claimedOn: null,
    art: scene06,
    rewards: [gem(40), exp(700)],
  },
]

/** The one the feature panel opens on, matching the mock. */
export const FEATURED_ID = 'blood-collector'

export function achievementState(entry: Achievement, claimed: boolean): AchievementState {
  if (entry.claimedOn || claimed) {
    return 'claimed'
  }
  return entry.progress >= entry.goal ? 'claimable' : 'progress'
}
