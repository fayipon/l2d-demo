import scene01 from '../assets/scene-01.webp'
import scene02 from '../assets/scene-02.webp'
import scene03 from '../assets/scene-03.webp'
import scene04 from '../assets/scene-04.webp'
import scene05 from '../assets/scene-05.webp'
import scene06 from '../assets/scene-06.webp'
import scene07 from '../assets/scene-07.webp'

/**
 * Main-story chapters and their stages.
 *
 * Progress is baked in rather than tracked: nothing in this demo can clear a
 * stage, so `stars` and `locked` are here to give the screen its states to
 * render. When there is a real save, this file keeps the content and progress
 * moves to the save.
 *
 * The scene images are crops of the two paintings in DESIGN/, colour graded --
 * see scripts/optimize-assets.mjs. Each stage points at one by name, so real
 * art is a file swap.
 */
export interface StoryReward {
  id: string
  /** 'coin' | 'gem' | 'exp' -- picks the tile's icon and colour. */
  kind: 'coin' | 'gem' | 'exp'
  amount: number
}

export interface StoryStage {
  id: string
  /** Shown in the pink prefix, e.g. "1-1". */
  code: string
  name: string
  summary: string
  art: string
  recommendedLevel: number
  /** Null when the stage has never been cleared. */
  stars: number | null
  locked: boolean
  objectives: string[]
  rewards: StoryReward[]
}

export interface StoryChapter {
  id: string
  /** Shown above the title, e.g. "CHAPTER 1". */
  label: string
  name: string
  intro: string
  art: string
  locked: boolean
  stages: StoryStage[]
}

const FIRST_CLEAR: StoryReward[] = [
  { id: 'coin', kind: 'coin', amount: 5000 },
  { id: 'gem', kind: 'gem', amount: 50 },
  { id: 'exp', kind: 'exp', amount: 1000 },
]

/** Locked chapters have no stages written yet; the screen only shows the card. */
const lockedChapter = (n: number, name: string, art: string): StoryChapter => ({
  id: `ch${n}`,
  label: `CHAPTER ${n}`,
  name,
  intro: '',
  art,
  locked: true,
  stages: [],
})

export const CHAPTERS: StoryChapter[] = [
  {
    id: 'ch1',
    label: 'CHAPTER 1',
    name: '血染的邊境',
    intro: '帝國與魔物的戰爭將邊境化作煉獄，\n而妳的命運，從這片血色大地開始。',
    // Its own crop rather than stage 1-1's: this is the one card on the screen
    // whose art is meant to be looked at, and it wants the warm, high-contrast
    // one.
    art: scene07,
    locked: false,
    stages: [
      {
        id: '1-1',
        code: '1-1',
        name: '破碎的哨站',
        summary: '邊境哨站遭到魔物襲擊，\n尋找倖存者並突破包圍。',
        art: scene01,
        recommendedLevel: 10,
        stars: 3,
        locked: false,
        objectives: ['通關關卡', '90 秒內通關', '戰鬥不能超過 1 次'],
        rewards: FIRST_CLEAR,
      },
      {
        id: '1-2',
        code: '1-2',
        name: '血色森林',
        summary: '深入被魔物佔據的森林，\n小心潛伏在陰影中的危險。',
        art: scene02,
        recommendedLevel: 12,
        stars: 3,
        locked: false,
        objectives: ['通關關卡', '110 秒內通關', '不使用回復道具'],
        rewards: FIRST_CLEAR,
      },
      {
        id: '1-3',
        code: '1-3',
        name: '哥布林的伏擊',
        summary: '調查商隊失蹤的原因，\n擊退哥布林的伏擊。',
        art: scene03,
        recommendedLevel: 14,
        stars: 3,
        locked: false,
        objectives: ['通關關卡', '擊破全部伏兵', '隊伍無人倒下'],
        rewards: FIRST_CLEAR,
      },
      {
        id: '1-4',
        code: '1-4',
        name: '被遺棄的村莊',
        summary: '尋找村莊倖存者，\n揭開背後的真相。',
        art: scene04,
        recommendedLevel: 16,
        stars: 3,
        locked: false,
        objectives: ['通關關卡', '找到全部三名倖存者', '不觸發警報'],
        rewards: FIRST_CLEAR,
      },
      {
        id: '1-5',
        code: '1-5',
        name: '邊境的王者',
        summary: '強大的魔物盤踞在此，\n妳能否活著面對牠？',
        art: scene05,
        recommendedLevel: 20,
        stars: null,
        locked: true,
        objectives: ['通關關卡', '150 秒內通關', '不被王者的咆哮命中'],
        rewards: FIRST_CLEAR,
      },
    ],
  },
  lockedChapter(2, '墮落之都', scene02),
  lockedChapter(3, '教團的陰謀', scene03),
  lockedChapter(4, '禁忌的儀式', scene04),
  lockedChapter(5, '女神的沉默', scene05),
  lockedChapter(6, '終焉的代價', scene06),
]

export const DEFAULT_CHAPTER_ID = CHAPTERS[0].id
