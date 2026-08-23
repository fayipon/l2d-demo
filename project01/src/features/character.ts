import {
  haruHome, haruDetail,
  hiyoriHome, hiyoriDetail,
  maoHome, maoDetail,
  riceHome, riceDetail,
  type Live2DModelConfig,
} from '../pixi/live2dConfig'
import background01 from '../assets/game-background-01.webp'
import background02 from '../assets/game-background-02.webp'
import background03 from '../assets/game-background-03.webp'
import background04 from '../assets/game-background-04.webp'

/**
 * The roster, and the character sheet behind each entry.
 *
 * Stats and skill text are placeholder -- there is no combat or progression
 * system behind any of it. What is real is the shape: a character owns its
 * models, its backdrop and its sheet, so adding one is an entry here plus a
 * config in pixi/live2dConfig. No screen is hardcoded to a particular
 * character.
 *
 * The models are Live2D's own sample data, fetched by scripts/fetch-models.mjs
 * and covered by Live2D's Free Material Licence -- fine for a demo, worth
 * re-reading before anything commercial.
 */
export interface Character {
  id: string
  name: string
  /** Class. The roster and the detail panel both show this one value. */
  title: string
  rarity: number
  level: number
  levelCap: number
  element: string
  bio: string
  /* No stat block and no skill list here.
     What a character is worth in the arena is decided by their loadout in
     game/data/loadouts.ts, and features/arenaProfile derives the selection
     screen from it -- a second, hand-written set of numbers on this screen was
     a set of numbers and a piece of fiction, and the fiction was the half
     people read before choosing.

     The skills went the same way and for the same reason. Four named ones per
     character with levels and cooldowns sat here for a while, and none of them
     existed: nothing in the game had heard of 落月斬 or its twelve-second
     cooldown. What a character can do is data/skills.ts now, because that is
     the list the arena actually reads. */
  /** Framing for the home screen and for the character screen. */
  home: Live2DModelConfig
  detail: Live2DModelConfig
  /** Backdrop this character brings with them, on every screen. */
  background: string
  /** Accent used for the roster highlight and the character screen's chrome. */
  accent: string
}

export const ROSTER: Character[] = [
  {
    id: 'haru',
    name: 'HARU',
    title: '緋月劍士',
    rarity: 5,
    level: 34,
    levelCap: 60,
    element: '闇',
    bio: '在血月籠罩的城下獨自巡守的劍士。話不多，但只要開口，多半是提醒你別走太遠。',
    home: haruHome,
    detail: haruDetail,
    background: background02,
    accent: '#ff2b3d',
  },
  {
    id: 'hiyori',
    name: 'HIYORI',
    title: '晨風信使',
    rarity: 4,
    level: 27,
    levelCap: 50,
    element: '風',
    bio: '跑遍整座城送信的少女。腳程比誰都快，但總會在半路停下來看風景。',
    home: hiyoriHome,
    detail: hiyoriDetail,
    background: background04,
    accent: '#3fb9ff',
  },
  {
    id: 'mao',
    name: 'MAO',
    title: '書庫看守',
    rarity: 5,
    level: 31,
    levelCap: 60,
    element: '光',
    bio: '掌管地下書庫的守夜人。記得每一本書的位置，也記得每一個借走沒還的人。',
    home: maoHome,
    detail: maoDetail,
    background: background03,
    accent: '#ffc74a',
  },
  {
    id: 'rice',
    name: 'RICE',
    title: '祓月巫女',
    rarity: 5,
    level: 29,
    levelCap: 60,
    element: '靈',
    bio: '在城外神社替旅人祓除穢氣的巫女。看起來溫和，動起手來卻毫不留情。',
    home: riceHome,
    detail: riceDetail,
    background: background01,
    accent: '#a05cff',
  },
]

export const DEFAULT_CHARACTER_ID = ROSTER[0].id

export const findCharacter = (id: string): Character =>
  ROSTER.find((c) => c.id === id) ?? ROSTER[0]
