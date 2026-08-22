import Phaser from 'phaser'
import type { ArenaMap, Landmark, Scatter } from '../data/scenes'
import { WORLD_HEIGHT, WORLD_WIDTH } from '../sim/world'
import { makeRand, weighted, type Rand } from '../sim/rand'
import {
  FLOOR_CELL,
  FLOOR_KEY,
  FLOOR_TILE_COUNT,
  TILE,
  TILES_KEY,
  WORLD_SCALE,
  registerTiles,
  requireFrame,
} from './tiles'

/**
 * Builds a place out of an `ArenaMap`: the ground, what is scattered on it,
 * and the wall around it.
 *
 * All of it is made once, at boot, and never touched again. Nothing here runs
 * per frame and nothing here is in the simulation -- a prop is a picture on the
 * floor, and an enemy walks straight through it. That is a deliberate line:
 * anything solid would mean obstacle avoidance in the spatial grid, which is a
 * simulation feature and not a decoration one.
 *
 * Everything is placed from a seeded generator keyed on the scene's number, so
 * a scene is the same ground every time it is entered. See `sim/rand.ts`.
 */

/**
 * How far outside the play field the wall stands, and how much of the field
 * the near wall is allowed to cover.
 *
 * The simulation clamps the player to `0..WORLD_WIDTH` and rejects spawns
 * inside `SPAWN_MARGIN` of the edge, and the benchmark and the invariant checks
 * are both measured against that. So the wall is built in the empty space
 * *outside* those bounds: it explains the edge the arena already had rather
 * than moving it, and no number in `sim/` changes because of it.
 *
 * The near wall is the one exception, and only visually -- it laps the last
 * `NEAR_OVERLAP` pixels of the field so that walking into the bottom edge puts
 * the character behind stone instead of stopping short of it for no reason.
 */
const NEAR_OVERLAP = 20

/** Props are kept this far inside the field, so nothing grows out of a wall. */
const EDGE_INSET = 40

export interface Scenery {
  floor: Phaser.GameObjects.GameObject
  /** Drawn behind the crowd: the far and side walls, and everything standing
   *  on the ground. */
  back: Phaser.GameObjects.GameObject[]
  /** Drawn in front of the crowd: the near wall alone. */
  front: Phaser.GameObjects.GameObject[]
}

/**
 * The ground.
 *
 * A `TilemapGPULayer` -- one game object, one draw, and a cost that depends on
 * the pixels on screen rather than on the 1450 tiles behind them. The two
 * alternatives are both worse here and both were tried elsewhere in this file's
 * history: a RenderTexture of the whole world is tens of megabytes of video
 * memory for a picture that never changes, and a sprite per tile is 1450 more
 * display-list entries for the culler to walk sixty times a second.
 *
 * It also fixes something the flexible layer cannot: its shader samples the
 * tileset itself and draws the border between two tiles without bleeding, so a
 * floor under linear filtering has no seams. The fallback below exists because
 * that layer is WebGL-only -- on a canvas context Phaser has to draw the tiles
 * one at a time, which is slower and slightly seamy, and is still better than
 * no floor at all.
 */
function buildFloor(scene: Phaser.Scene, map: ArenaMap, rand: Rand): Phaser.GameObjects.GameObject {
  const columns = Math.ceil(WORLD_WIDTH / TILE)
  /* Rounded up, so the last row hangs past the bottom edge of the world. That
     overhang is covered by the near wall -- moving the wall without revisiting
     this leaves a strip of nothing along the bottom. */
  const rows = Math.ceil(WORLD_HEIGHT / TILE)

  const weights = map.floorWeights.slice(0, FLOOR_TILE_COUNT)
  const data: number[][] = []
  for (let row = 0; row < rows; row++) {
    const line: number[] = []
    for (let column = 0; column < columns; column++) {
      line.push(weighted(rand, weights))
    }
    data.push(line)
  }

  /* The map is laid out in the tileset's own cell, which is the size the
     flagstones were painted, and the whole layer is then scaled down to the
     size they are in the world. Building it at TILE instead would mean
     throwing away a third of every stone in the pipeline and asking the GPU to
     magnify what was left. */
  const tilemap = scene.make.tilemap({ data, tileWidth: FLOOR_CELL, tileHeight: FLOOR_CELL })
  const tileset = tilemap.addTilesetImage('abyss-floor', FLOOR_KEY, FLOOR_CELL, FLOOR_CELL, 0, 0)
  if (!tileset) {
    throw new Error('arena: the floor tileset is missing')
  }
  const layer = tilemap.createLayer(0, tileset, 0, 0, scene.game.renderer.type === Phaser.WEBGL)
  if (!layer) {
    throw new Error('arena: the floor layer could not be created')
  }
  layer.setScale(TILE / FLOOR_CELL)
  return layer
}

/**
 * A picture on the ground: centred on its position, flat, under everything.
 *
 * `WORLD_SCALE` is applied here rather than in the pipeline, and the same goes
 * for every other frame the scene places. The sheet holds the art at the size
 * it was drawn; this is where it becomes a size in the world.
 */
function addDecal(
  scene: Phaser.Scene,
  frame: string,
  x: number,
  y: number,
  scale: number,
  alpha: number,
): Phaser.GameObjects.Image {
  const image = scene.add.image(x, y, TILES_KEY, requireFrame(scene, frame))
  image.setScale(scale * WORLD_SCALE)
  image.setAlpha(alpha)
  return image
}

/**
 * Something standing on the ground: anchored at its feet, so `y` is where it
 * touches the floor rather than where its middle is. Every prop in the sheet is
 * drawn facing the camera, the same way the characters are, so this is the only
 * anchor that makes one look like it is standing rather than floating.
 */
function addProp(
  scene: Phaser.Scene,
  frame: string,
  x: number,
  y: number,
  scale: number,
  alpha = 1,
): Phaser.GameObjects.Image {
  const image = scene.add.image(x, y, TILES_KEY, requireFrame(scene, frame))
  image.setOrigin(0.5, 1)
  image.setScale(scale * WORLD_SCALE)
  image.setAlpha(alpha)
  return image
}

/**
 * Scatters one group.
 *
 * Rejection against the clearance radius rather than a push away from it: a
 * position nudged out of the middle lands on the clearance circle, and a dozen
 * props on a perfect circle around the player is more obviously generated than
 * a gap would ever be. Twelve tries and then give up on that one -- the same
 * bargain the enemy spawner makes.
 */
function scatter(
  scene: Phaser.Scene,
  spec: Scatter,
  rand: Rand,
  standing: boolean,
  into: Phaser.GameObjects.Image[],
): void {
  const clearance = spec.clearance ?? 0
  const [low, high] = spec.scale ?? [1, 1]
  const centreX = WORLD_WIDTH / 2
  const centreY = WORLD_HEIGHT / 2

  for (let i = 0; i < spec.count; i++) {
    let x = 0
    let y = 0
    let placed = false
    for (let attempt = 0; attempt < 12 && !placed; attempt++) {
      x = rand.range(EDGE_INSET, WORLD_WIDTH - EDGE_INSET)
      y = rand.range(EDGE_INSET, WORLD_HEIGHT - EDGE_INSET)
      placed = Math.hypot(x - centreX, y - centreY) >= clearance
    }
    if (!placed) {
      continue
    }
    const frame = rand.pick(spec.frames)
    const scale = rand.range(low, high)
    const alpha = spec.alpha ?? 1
    into.push(
      standing
        ? addProp(scene, frame, x, y, scale, alpha)
        : addDecal(scene, frame, x, y, scale, alpha),
    )
  }
}

function placeLandmark(
  scene: Phaser.Scene,
  landmark: Landmark,
): Phaser.GameObjects.Image {
  const x = landmark.x * WORLD_WIDTH
  const y = landmark.y * WORLD_HEIGHT
  const scale = landmark.scale ?? 1
  const alpha = landmark.alpha ?? 1
  return landmark.standing
    ? addProp(scene, landmark.frame, x, y, scale, alpha)
    : addDecal(scene, landmark.frame, x, y, scale, alpha)
}

/**
 * The wall.
 *
 * The far edge is a run of the drawn unit -- post, span, post, span -- with its
 * feet on `y = 0`, so the whole thing stands in the empty space above the
 * field. The near edge is the same run, laid along the bottom and added to the
 * front list, because a wall between the camera and the field is what art drawn
 * facing the camera means: walk into the bottom edge and the character goes
 * behind the stone.
 *
 * The side edges cannot be that. The unit is drawn face-on and there is no
 * three-quarter view of it to turn, so the left and right walls are the same
 * spans laid on their side into a continuous band, with a lit pillar standing
 * upright every few of them. Upright is what sells it: the pillars are the part
 * that reads at a glance, and they are the one piece whose drawn direction is
 * still correct on a vertical edge.
 */
function buildBoundary(scene: Phaser.Scene, map: ArenaMap): { back: Phaser.GameObjects.Image[]; front: Phaser.GameObjects.Image[] } {
  const style = map.boundary
  const texture = scene.textures.get(TILES_KEY)
  /** A piece's size in the world, not on the sheet. */
  const size = (name: string) => {
    const frame = texture.get(requireFrame(scene, name))
    return { width: frame.width * WORLD_SCALE, height: frame.height * WORLD_SCALE }
  }

  const post = size(style.post)
  const span = size(style.span)
  const corner = size(style.corner)
  const sidePost = size(style.sidePost)

  const back: Phaser.GameObjects.Image[] = []
  const front: Phaser.GameObjects.Image[] = []

  /*
   * One unit of the run is a post plus a span. Cutting the drawn wall that way
   * is what makes a run of any length possible: the piece as drawn has a
   * pillar at each end, so repeating it whole would double every pillar at
   * every join.
   *
   * The edge is then divided into a whole number of units and the spans
   * stretched by the remainder -- a few pixels each -- rather than laid at
   * their exact width and left to overhang the corner. A wall that runs past
   * its own corner is the kind of thing nobody notices until they walk into
   * the corner, which in this arena is a place you can stand.
   */
  const units = Math.max(1, Math.round(WORLD_WIDTH / (post.width + span.width)))
  const step = WORLD_WIDTH / units
  const runHorizontal = (baseY: number, into: Phaser.GameObjects.Image[]) => {
    for (let i = 0; i < units; i++) {
      const piece = addProp(scene, style.span, (i + 0.5) * step, baseY, 1)
      piece.displayWidth = step - post.width + 2
      into.push(piece)
    }
    for (let i = 0; i <= units; i++) {
      into.push(addProp(scene, style.post, i * step, baseY, 1))
      if (style.banner && style.bannerEvery && i % style.bannerEvery === 0 && i < units) {
        const banner = scene.add.image(
          i * step,
          baseY - post.height + 6,
          TILES_KEY,
          requireFrame(scene, style.banner),
        )
        banner.setOrigin(0.5, 0)
        banner.setScale(WORLD_SCALE)
        into.push(banner)
      }
    }
  }

  // The far wall: feet on the top edge of the field, body entirely outside it.
  runHorizontal(0, back)
  // The near wall, lapping the last few pixels of the field. See NEAR_OVERLAP.
  const nearBase = WORLD_HEIGHT + span.height - NEAR_OVERLAP
  runHorizontal(nearBase, front)

  /*
   * The side bands. A span turned a quarter turn is `span.height` across and
   * `span.width` along, so it steps down the edge by its own width and sits
   * half a height outside the field. Same trick as the runs: the edge is
   * divided into whole pieces and each is stretched to close the remainder.
   */
  /* Run past both ends by the height of a wall, so the bands reach the corners
     the far and near runs stand on rather than stopping level with the field
     and leaving a notch of nothing where the two meet. */
  const sideTop = -post.height
  const sideLength = WORLD_HEIGHT + post.height * 2
  const sideCount = Math.max(1, Math.round(sideLength / span.width))
  const sideStep = sideLength / sideCount
  for (const [edgeX, angle] of [
    [-span.height / 2, 90],
    [WORLD_WIDTH + span.height / 2, -90],
  ] as const) {
    for (let i = 0; i < sideCount; i++) {
      const piece = scene.add.image(edgeX, sideTop + (i + 0.5) * sideStep, TILES_KEY, requireFrame(scene, style.span))
      /* Scaled to the world first, then turned, then stretched along the edge.
         Order matters: displayWidth rewrites scaleX only, so the band's
         thickness -- which is the frame's height once it is on its side --
         keeps the world scale set here. */
      piece.setScale(WORLD_SCALE)
      piece.setAngle(angle)
      piece.displayWidth = sideStep + 2
      back.push(piece)
    }
    /* Standing upright on the band rather than turned with it. The pillars are
       the part of the wall that reads at a glance, and a pillar lying on its
       side reads as a pillar lying on its side. */
    for (let y = style.sideGap / 2; y < WORLD_HEIGHT; y += style.sideGap) {
      back.push(addProp(scene, style.sidePost, edgeX, y + sidePost.height / 2, 1))
    }
  }

  // The corners last, so a pillar is never half-buried by the run it caps.
  back.push(addProp(scene, style.corner, 0, corner.height / 2, 1))
  back.push(addProp(scene, style.corner, WORLD_WIDTH, corner.height / 2, 1))
  front.push(addProp(scene, style.corner, 0, nearBase, 1))
  front.push(addProp(scene, style.corner, WORLD_WIDTH, nearBase, 1))

  return { back, front }
}

/**
 * Everything, in paint order.
 *
 * The scene draws in the order things are added -- depth sorting is off, and
 * turning it on to place a few hundred static pictures would put every enemy
 * through a sort every frame. So the order is built here instead: ground marks,
 * then the walls behind the field, then the standing props sorted by how far
 * down the map they are, so a tree in front of a rock overlaps it correctly.
 */
export function buildScenery(scene: Phaser.Scene, map: ArenaMap): Scenery {
  registerTiles(scene)
  const rand = makeRand(0x5ce9e * (map.index + 1))

  const floor = buildFloor(scene, map, rand)

  const flat: Phaser.GameObjects.Image[] = []
  for (const spec of map.decals) {
    scatter(scene, spec, rand, false, flat)
  }
  for (const landmark of map.landmarks) {
    if (!landmark.standing) {
      flat.push(placeLandmark(scene, landmark))
    }
  }

  const standing: Phaser.GameObjects.Image[] = []
  for (const spec of map.props) {
    scatter(scene, spec, rand, true, standing)
  }
  for (const landmark of map.landmarks) {
    if (landmark.standing) {
      standing.push(placeLandmark(scene, landmark))
    }
  }
  /* Sorted once, here, rather than by the renderer every frame: these never
     move, so their overlap is decided for good the moment they are placed. */
  standing.sort((a, b) => a.y - b.y)
  for (const prop of standing) {
    scene.children.bringToTop(prop)
  }

  const walls = buildBoundary(scene, map)

  return { floor, back: [...flat, ...standing, ...walls.back], front: walls.front }
}

/**
 * Lifts the near wall over the crowd.
 *
 * Called by the scene once the entities exist, because paint order is add
 * order and the wall has to be built with the rest of the boundary -- the two
 * runs share the geometry that positions them. Everything the scene adds after
 * this call still draws on top, which is the right answer for the two things
 * that do: the damage numbers, and the edge of sight over all of it.
 */
export function raiseNearWall(scene: Phaser.Scene, scenery: Scenery): void {
  for (const piece of scenery.front) {
    scene.children.bringToTop(piece)
  }
}
