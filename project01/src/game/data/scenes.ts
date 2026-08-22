/**
 * The places a run can be fought in, and everything that makes one look like
 * itself.
 *
 * Same arrangement as `content.ts` and `actors.ts`: data, read by the scene,
 * importing nothing from Phaser. Adding a second map is an entry in `SCENES`
 * plus whatever frames it wants out of the terrain sheet -- `ArenaScene` is
 * handed one of these and knows nothing about which.
 *
 * A scene has a **number**, and that is not decoration. It is what the story
 * screen's stage rows already use (`1-1`, `1-2`, ...), what the battle HUD
 * shows, and what seeds the layout -- so scene 1-1 is the same ground every
 * time it is entered, and scene 1-2 will be different ground for the same
 * reason.
 *
 * What is *not* here is anything the simulation reads. Enemies, waves and
 * stats are `content.ts`; this file is only what the place looks like.
 */

/** Frame names in the scenery atlas. Not a union type on purpose: the frames
 *  come from a generated table, and a hand-kept union would go stale against
 *  it. A missing name is caught at boot -- see `view/tiles.ts`. */
export type SceneryFrame = string

export interface Scatter {
  /** One is picked per instance. */
  frames: readonly SceneryFrame[]
  count: number
  /** Multiplied into the baked size, uniformly between the two. */
  scale?: readonly [number, number]
  /** Kept this far from the player's start, in world pixels. Nothing is
   *  allowed to sit on top of the character at wave 1. */
  clearance?: number
  /** Constant alpha, for ground marks that should look burnt in rather than
   *  painted on. */
  alpha?: number
}

export interface Landmark {
  frame: SceneryFrame
  /** Fractions of the world, not pixels. The map describes itself in its own
   *  proportions so that this file never has to import the world's size --
   *  `data/` reads no simulation -- and so a change to either dimension moves
   *  the furniture with it instead of leaving it in a corner. */
  x: number
  y: number
  scale?: number
  alpha?: number
  /** Flat on the floor and centred, or standing on it and anchored at the
   *  feet. Decals go under the props, props go under the crowd. */
  standing?: boolean
}

export interface BoundaryStyle {
  /** The repeating unit: a post, then a span, then a post, and so on. Cutting
   *  the drawn wall this way is what lets a run be any length. */
  post: SceneryFrame
  span: SceneryFrame
  /** Corner marker, taller than the run. */
  corner: SceneryFrame
  /** Hung on every Nth post along the top edge. 0 for none. */
  banner?: SceneryFrame
  bannerEvery?: number
  /** Posts down the left and right edges, this far apart. The drawn wall faces
   *  the camera and cannot be turned ninety degrees, so the side edges are a
   *  colonnade instead of a run. */
  sidePost: SceneryFrame
  sideGap: number
}

export interface ArenaMap {
  id: string
  /** Shown in the HUD, and the same code `features/story.ts` numbers its
   *  stages with. */
  code: string
  /** 場景編號. Seeds the layout, so it is the identity of the place and not
   *  just a label. */
  index: number
  name: string
  /** How often each of the 25 floor tiles is used. Index is the tile's place
   *  in the tileset, reading order. */
  floorWeights: readonly number[]
  boundary: BoundaryStyle
  landmarks: readonly Landmark[]
  decals: readonly Scatter[]
  props: readonly Scatter[]
}

/*
 * Mostly plain stone.
 *
 * The dramatic tiles -- lava through the cracks, blood, the summoning circle --
 * are worth one in forty each, because the arena is watched at speed while
 * something is chasing you. A floor where every stone has a story reads as
 * noise from six hundred pixels up; one where a crack turns up every few metres
 * reads as a floor with cracks in it.
 *
 * Two entries are zero and stay zero: 13 is the summoning circle, which is
 * placed by hand as a landmark rather than sprinkled, and 19 and 24 are the
 * source block's rounded corner pieces, which belong to a floor that ends.
 * This one does not end, it hits a wall.
 */
const ABYSS_FLOOR = [
  10, 10, 10, 1, 1,
  1, 1, 10, 10, 1,
  1, 1, 1, 0, 8,
  8, 10, 10, 1, 0,
  8, 1, 10, 8, 0,
]

export const SCENES: readonly ArenaMap[] = [
  {
    id: 'abyss',
    code: '1-1',
    index: 1,
    name: '血色祭壇',
    floorWeights: ABYSS_FLOOR,
    boundary: {
      post: 'wall-post',
      span: 'wall-span',
      corner: 'pillar',
      banner: 'banner',
      bannerEvery: 4,
      sidePost: 'pillar',
      sideGap: 260,
    },
    landmarks: [
      /* The circle the player stands in at wave 1. The map is 3200x1800 of
         open ground and the camera never leaves the character, so without
         something underfoot at the start there is no way to tell the middle
         of it from anywhere else. */
      { frame: 'circle-large', x: 0.5, y: 0.5, scale: 2.6, alpha: 0.85 },
      { frame: 'circle-star', x: 0.194, y: 0.761, scale: 1.7, alpha: 0.7 },
      { frame: 'circle-star', x: 0.816, y: 0.219, scale: 1.7, alpha: 0.7 },
      /* The one thing on the map worth walking towards. Off-centre, and far
         enough from the start that it is somewhere else rather than part of
         the opening view. */
      { frame: 'statue', x: 0.634, y: 0.189, scale: 1.35, standing: true },
      { frame: 'lectern', x: 0.338, y: 0.739, standing: true },
      { frame: 'arch', x: 0.131, y: 0.261, scale: 1.2, standing: true },
      { frame: 'chest', x: 0.859, y: 0.789, standing: true },
      { frame: 'fissure', x: 0.425, y: 0.111, scale: 1.5 },
      { frame: 'fissure', x: 0.756, y: 0.883, scale: 1.3 },
    ],
    decals: [
      { frames: ['rubble', 'twigs', 'twigs-small', 'pebbles', 'pebble'], count: 90, scale: [0.8, 1.6] },
      { frames: ['ember', 'ember-pool'], count: 22, scale: [0.7, 1.5], alpha: 0.75 },
      { frames: ['spark', 'spark-small'], count: 16, scale: [0.6, 1.2], alpha: 0.55 },
    ],
    props: [
      {
        frames: ['rock-cluster', 'boulder', 'rock-small', 'rock-spire'],
        count: 26,
        scale: [0.85, 1.4],
        clearance: 340,
      },
      {
        frames: ['tree-large', 'tree-thin', 'tree-small'],
        count: 14,
        scale: [0.9, 1.25],
        clearance: 420,
      },
      {
        frames: ['crate', 'crate-stack', 'barrel', 'skulls', 'skulls-wide', 'gravestone', 'column', 'obelisk'],
        count: 30,
        scale: [0.9, 1.2],
        clearance: 300,
      },
      /* The only lights on the map. Kept sparse and away from the middle: a
         candle every fifty metres is a lit room, not a haunted one. */
      { frames: ['candelabra', 'candles'], count: 12, scale: [0.9, 1.15], clearance: 380 },
    ],
  },
]

export const DEFAULT_SCENE = SCENES[0]

/** By stage code (`1-1`) or by id. Anything unknown gets the first scene --
 *  a stage with no map of its own is playable, not broken. */
export function sceneFor(code: string): ArenaMap {
  return SCENES.find((scene) => scene.code === code || scene.id === code) ?? DEFAULT_SCENE
}
