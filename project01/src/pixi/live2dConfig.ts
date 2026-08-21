/**
 * Everything model-specific lives here. Adding a character means adding a
 * model under public/live2d, describing it below, and listing it in
 * features/character.ts -- no screen code changes.
 *
 * Each model gets two framings. The home screen leaves the right half of the
 * stage to the menu diamonds; the character screen leaves the right third to
 * the detail panel and the left tenth to the roster. Both are built at module
 * scope: Live2DStage keys its whole WebGL lifecycle off config identity, so an
 * object built during render would tear the model down on every re-render.
 */
export interface Live2DExpression {
  /** Expression id as declared in the model3.json. */
  id: string
  label: string
}

export interface Live2DTapLine {
  /** Index into the tap motion group. */
  motionIndex: number
  /**
   * Subtitle for the speech bubble. Only Haru's motions carry Sound
   * references, so for every other model this is display text with no audio
   * behind it -- and even Haru's is a placeholder, not a transcript.
   */
  caption: string
}

export interface Live2DModelConfig {
  /** Path to the .model3.json, served from public/ under the deployed base. */
  modelPath: string
  /**
   * Height of the drawn artwork as a fraction of stage height -- not of the
   * model's canvas, which is padded differently by every artist. Above 1 crops
   * the character deliberately.
   */
  heightRatio: number
  /** Where the artwork's centre sits, as a fraction of stage size. */
  position: { x: number; y: number }
  idleMotionGroup: string
  tapMotionGroup: string
  expressions: Live2DExpression[]
  voiceVolume: number
  tapLines: Live2DTapLine[]
}

/** Base description of a model, before either framing is applied. */
type Live2DModelBase = Omit<Live2DModelConfig, 'heightRatio' | 'position'>

interface Framing {
  heightRatio: number
  x: number
  y: number
}

/*
 * Because framing is measured against the artwork rather than the canvas, one
 * pair of framings covers every model: a full body twice the stage height,
 * centred so its top edge lands just inside the stage, shows head and torso
 * cropped at the waist.
 *
 * Art top = y - heightRatio / 2. The character screen puts it at 0.03, hard up
 * against the top of the stage, because nothing is up there but the back
 * button on the far left.
 *
 * The home screen starts lower, at 0.155. The player card runs to 0.1403 of
 * stage height, and a head that begins above that reads as being behind the
 * panel rather than under it -- so the framing clears the card by a hair and
 * the model loses a little height to pay for it.
 */
const HOME_FRAMING: Framing = { heightRatio: 1.82, x: 0.3, y: 1.065 }
const DETAIL_FRAMING: Framing = { heightRatio: 1.85, x: 0.43, y: 0.955 }

/**
 * Per-model correction, in stage fractions, applied on top of a framing.
 *
 * Measuring the artwork gets every model close, but the measurement is a
 * bounding box, and a box is wrong whenever a model has something visible but
 * detached from the body -- Mao has two meshes sitting about 970 canvas pixels
 * clear of everything else, which drag the box's left edge out and so push her
 * to the right. Rather than pretend the measurement is exact, the offset is
 * where a human says otherwise.
 */
interface Nudge {
  x?: number
  y?: number
}

const framed = (base: Live2DModelBase, framing: Framing, nudge: Nudge = {}): Live2DModelConfig => ({
  ...base,
  heightRatio: framing.heightRatio,
  position: { x: framing.x + (nudge.x ?? 0), y: framing.y + (nudge.y ?? 0) },
})

/** Models that only number their expressions get numbered labels. */
const numbered = (ids: string[]): Live2DExpression[] =>
  ids.map((id, i) => ({ id, label: String(i + 1).padStart(2, '0') }))

/* ---------- Haru ---------- */

const haru: Live2DModelBase = {
  modelPath: `${import.meta.env.BASE_URL}live2d/haru/Haru.model3.json`,
  idleMotionGroup: 'Idle',
  tapMotionGroup: 'TapBody',
  expressions: numbered(['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08']),
  voiceVolume: 0.9,
  // Haru's TapBody motions each bind a Sound in the model3.json, so playing the
  // motion plays the voice and drives lip sync in one call.
  tapLines: [
    { motionIndex: 0, caption: '今天要去哪裡呢？' },
    { motionIndex: 1, caption: '有新的通知送到囉。' },
    { motionIndex: 2, caption: '隨時都可以叫我喔。' },
    { motionIndex: 3, caption: '任務好像還沒完成呢。' },
  ],
}

export const haruHome = framed(haru, HOME_FRAMING)
export const haruDetail = framed(haru, DETAIL_FRAMING)

/* ---------- Hiyori ---------- */

const hiyori: Live2DModelBase = {
  modelPath: `${import.meta.env.BASE_URL}live2d/hiyori/Hiyori.model3.json`,
  idleMotionGroup: 'Idle',
  tapMotionGroup: 'TapBody',
  // The sample ships no expressions for this model.
  expressions: [],
  voiceVolume: 0.9,
  tapLines: [{ motionIndex: 0, caption: '嘿，準備好出發了嗎？' }],
}

export const hiyoriHome = framed(hiyori, HOME_FRAMING)
export const hiyoriDetail = framed(hiyori, DETAIL_FRAMING)

/* ---------- Mao ---------- */

const mao: Live2DModelBase = {
  modelPath: `${import.meta.env.BASE_URL}live2d/mao/Mao.model3.json`,
  idleMotionGroup: 'Idle',
  tapMotionGroup: 'TapBody',
  expressions: numbered([
    'exp_01', 'exp_02', 'exp_03', 'exp_04', 'exp_05', 'exp_06', 'exp_07', 'exp_08',
  ]),
  voiceVolume: 0.9,
  tapLines: [
    { motionIndex: 0, caption: '今天也請多指教。' },
    { motionIndex: 1, caption: '有什麼想問的嗎？' },
    { motionIndex: 2, caption: '我隨時都在這裡。' },
    { motionIndex: 3, caption: '別站太近喔。' },
    { motionIndex: 4, caption: '嗯，我在聽。' },
    { motionIndex: 5, caption: '走吧。' },
  ],
}

// Two detached meshes widen the measured box on the left by roughly 493 canvas
// pixels, which at this framing is about 0.07 of stage width.
const MAO_NUDGE: Nudge = { x: -0.07 }

export const maoHome = framed(mao, HOME_FRAMING, MAO_NUDGE)
export const maoDetail = framed(mao, DETAIL_FRAMING, MAO_NUDGE)

/* ---------- Rice ---------- */

const rice: Live2DModelBase = {
  modelPath: `${import.meta.env.BASE_URL}live2d/rice/Rice.model3.json`,
  idleMotionGroup: 'Idle',
  tapMotionGroup: 'TapBody',
  // The sample ships no expressions for this model.
  expressions: [],
  voiceVolume: 0.9,
  tapLines: [
    { motionIndex: 0, caption: '需要我做什麼嗎？' },
    { motionIndex: 1, caption: '這裡就交給我吧。' },
    { motionIndex: 2, caption: '別擔心，我盯著呢。' },
  ],
}

export const riceHome = framed(rice, HOME_FRAMING)
export const riceDetail = framed(rice, DETAIL_FRAMING)
