/**
 * Everything model-specific lives here. Swapping in a different Live2D model
 * should mean editing this file only, not the stage component.
 */
export interface Live2DVoiceLine {
  /** Index into the tap motion group. */
  motionIndex: number
  /** Placeholder subtitle for the speech bubble. The voice clips are Japanese;
   * these are display text, never a transcript. */
  caption: string
}

export interface Live2DModelConfig {
  /** Path to the .model3.json, served from public/ under the deployed base. */
  modelPath: string
  /** Model height as a fraction of stage height. >1 crops the model deliberately. */
  heightRatio: number
  /** Model origin within its own bounds. */
  anchor: { x: number; y: number }
  /** Model position as a fraction of stage size. */
  position: { x: number; y: number }
  idleMotionGroup: string
  tapMotionGroup: string
  /** Expression ids declared in the model3.json. */
  expressions: string[]
  voiceVolume: number
  /** Lines bound to the tap motions that carry a Sound reference. */
  voiceLines: Live2DVoiceLine[]
}

export const haruConfig: Live2DModelConfig = {
  modelPath: `${import.meta.env.BASE_URL}live2d/haru/Haru.model3.json`,
  heightRatio: 2.25,
  anchor: { x: 0.5, y: 0.5 },
  position: { x: 0.3, y: 1.04 },
  idleMotionGroup: 'Idle',
  tapMotionGroup: 'TapBody',
  expressions: ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08'],
  voiceVolume: 0.9,
  // The TapBody group has 4 motions, each with a Sound bound in the model3.json,
  // so playing the motion plays the voice and drives lip sync automatically.
  voiceLines: [
    { motionIndex: 0, caption: '今天要去哪裡呢？' },
    { motionIndex: 1, caption: '有新的通知送到囉。' },
    { motionIndex: 2, caption: '隨時都可以叫我喔。' },
    { motionIndex: 3, caption: '任務好像還沒完成呢。' },
  ],
}
