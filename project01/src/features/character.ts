import {
  haruHome, haruDetail,
  hiyoriHome, hiyoriDetail,
  maoHome, maoDetail,
  riceHome, riceDetail,
  type Live2DModelConfig,
} from '../pixi/live2dConfig'
import type { IconName } from '../components/icons'
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
export interface CharacterSkill {
  id: string
  name: string
  /** Badge label. */
  kind: string
  /** Latin key for the badge and icon colour -- CJK class names are legal but
   *  miserable to grep for. */
  tone: 'normal' | 'skill' | 'burst' | 'passive'
  icon: IconName
  level: number
  levelCap: number
  /** Empty for passives, which have nothing to wait for. */
  cooldown: string
  description: string
}

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
  /* No stat block here. What a character is worth in the arena is decided by
     their loadout in game/data/loadouts.ts, and features/arenaProfile derives
     the selection screen from it -- a second, hand-written set of numbers on
     this screen was a set of numbers and a piece of fiction, and the fiction
     was the half people read before choosing. */
  skills: CharacterSkill[]
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
    skills: [
      {
        id: 'slash', name: '緋刃', kind: '普攻', tone: 'normal', icon: 'sword',
        level: 6, levelCap: 10, cooldown: '—',
        description: '揮出至多三段連擊，最後一段附帶闇屬性傷害。',
      },
      {
        id: 'moonfall', name: '落月斬', kind: '技能', tone: 'skill', icon: 'moon',
        level: 4, levelCap: 10, cooldown: '12 秒',
        description: '向前突進並造成範圍傷害，命中時回復自身少量生命。',
      },
      {
        id: 'eclipse', name: '蝕月·終焉', kind: '奧義', tone: 'burst', icon: 'burst',
        level: 2, levelCap: 10, cooldown: '60 秒',
        description: '召來血月之力，對周圍全體敵人造成大量闇屬性傷害並降低其防禦。',
      },
      {
        id: 'vigil', name: '夜巡', kind: '被動', tone: 'passive', icon: 'shield',
        level: 3, levelCap: 5, cooldown: '',
        description: '夜間作戰時攻擊提升 12%，且受到致命傷害時每場戰鬥可免疫一次。',
      },
    ],
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
    skills: [
      {
        id: 'dash', name: '疾風連擊', kind: '普攻', tone: 'normal', icon: 'sword',
        level: 5, levelCap: 10, cooldown: '—',
        description: '四段快速攻擊，速度越高則段數間隔越短。',
      },
      {
        id: 'gale', name: '順風而行', kind: '技能', tone: 'skill', icon: 'compass',
        level: 3, levelCap: 10, cooldown: '10 秒',
        description: '提升全隊移動速度，並在三秒內免疫位移效果。',
      },
      {
        id: 'stormline', name: '風痕·疾走', kind: '奧義', tone: 'burst', icon: 'burst',
        level: 1, levelCap: 10, cooldown: '50 秒',
        description: '沿直線穿越戰場，對路徑上的敵人反覆造成風屬性傷害。',
      },
      {
        id: 'courier', name: '信使之足', kind: '被動', tone: 'passive', icon: 'shield',
        level: 2, levelCap: 5, cooldown: '',
        description: '隊伍在場景中的移動速度提升 15%，探索時不會被減速地形影響。',
      },
    ],
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
    skills: [
      {
        id: 'quill', name: '銀筆', kind: '普攻', tone: 'normal', icon: 'sword',
        level: 5, levelCap: 10, cooldown: '—',
        description: '以光刃劃出三段攻擊，第三段附帶短暫暈眩。',
      },
      {
        id: 'index', name: '索引之光', kind: '技能', tone: 'skill', icon: 'book',
        level: 4, levelCap: 10, cooldown: '14 秒',
        description: '標記一名敵人，隊伍對其造成的傷害提升 20%，持續八秒。',
      },
      {
        id: 'archive', name: '封緘·萬卷', kind: '奧義', tone: 'burst', icon: 'burst',
        level: 2, levelCap: 10, cooldown: '65 秒',
        description: '展開書庫結界，範圍內敵人行動遲緩並持續受到光屬性傷害。',
      },
      {
        id: 'keeper', name: '守夜人', kind: '被動', tone: 'passive', icon: 'shield',
        level: 3, levelCap: 5, cooldown: '',
        description: '生命高於七成時防禦提升 18%；隊伍中每有一名光屬性角色再提升 4%。',
      },
    ],
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
    skills: [
      {
        id: 'purify', name: '祓刃', kind: '普攻', tone: 'normal', icon: 'sword',
        level: 7, levelCap: 10, cooldown: '—',
        description: '揮出三段靈刃，對帶有負面狀態的敵人傷害加倍。',
      },
      {
        id: 'moonveil', name: '月帳', kind: '技能', tone: 'skill', icon: 'moon',
        level: 4, levelCap: 10, cooldown: '11 秒',
        description: '張開結界，為全隊附加護盾並清除一個負面狀態。',
      },
      {
        id: 'exorcism', name: '祓月·淨盡', kind: '奧義', tone: 'burst', icon: 'burst',
        level: 2, levelCap: 10, cooldown: '55 秒',
        description: '降下月光淨化戰場，對全體敵人造成靈屬性傷害並驅散其增益。',
      },
      {
        id: 'shrine', name: '守社', kind: '被動', tone: 'passive', icon: 'shield',
        level: 3, levelCap: 5, cooldown: '',
        description: '每淨化一個負面狀態，全隊攻擊提升 6%，最多疊五層，離開戰鬥後重置。',
      },
    ],
    home: riceHome,
    detail: riceDetail,
    background: background01,
    accent: '#a05cff',
  },
]

export const DEFAULT_CHARACTER_ID = ROSTER[0].id

export const findCharacter = (id: string): Character =>
  ROSTER.find((c) => c.id === id) ?? ROSTER[0]
