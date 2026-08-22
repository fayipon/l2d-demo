import Phaser from 'phaser'
import floorUrl from '../../assets/tiles-abyss-floor.webp'
import sheetUrl from '../../assets/tiles-abyss.webp'
import sheet from '../../assets/tiles-abyss.json'

/**
 * The arena's terrain art, and the only place the scene learns what is in it.
 *
 * Two textures, for two different jobs. The floor is a strict grid a Phaser
 * tileset can index by number, so the whole 3200x1800 ground is one layer and
 * one draw. The scenery is a packed atlas of every wall piece, prop and ground
 * mark, addressed by name.
 *
 * Both are loaded rather than drawn, which is what makes this file different
 * from `atlas.ts` next door: the enemies are still shapes baked on a canvas at
 * boot, and the ground they stand on is painted art off the pipeline. That
 * split is deliberate and temporary in one direction only -- when there is
 * enemy art it becomes a load too, and the frame names do not change.
 *
 * The frame table is generated beside the image by scripts/tilejob.mjs. It is
 * imported rather than copied, so a frame that moves in the sheet moves here
 * with it and nothing has to be kept in step by hand.
 */
export const TILES_KEY = 'arena-tiles'
export const FLOOR_KEY = 'arena-floor'

/** Handed to the scene's preload; nothing else may load these. */
export const TILES_URL = sheetUrl
export const FLOOR_URL = floorUrl

/**
 * World pixels per floor tile.
 *
 * The same 64 the procedural floor's grid used, which is not a coincidence
 * worth hiding: it is one character tall (see `data/actors.ts`), and it is what
 * sets the scale of everything else on the sheet.
 */
export const TILE = sheet.tile

/**
 * World pixels per source pixel, and the tileset's cell in source pixels.
 *
 * Both come out of the pipeline rather than being written here, because
 * nothing on either sheet is resized to its world size at bake time -- the
 * frames keep every pixel they were drawn with and the scene shrinks them on
 * the way to the screen. That is what keeps the art sharp on a canvas rendered
 * above 1:1; see RENDER_SCALE in the arena scene.
 */
export const WORLD_SCALE = sheet.scale
export const FLOOR_CELL = sheet.cell

/** How many tiles the floor tileset holds, reading order. */
export const FLOOR_TILE_COUNT = 25

/**
 * Cuts the packed sheet into named frames.
 *
 * Safe to call more than once: Phaser keeps one texture per key for the life
 * of the game, and a scene that restarts would otherwise re-add every frame.
 */
export function registerTiles(scene: Phaser.Scene): void {
  const texture = scene.textures.get(TILES_KEY)
  for (const [name, [x, y, width, height]] of Object.entries(sheet.frames)) {
    if (!texture.has(name)) {
      texture.add(name, 0, x, y, width, height)
    }
  }
}

/**
 * A frame name, checked.
 *
 * Scene data names its art in strings, because the frame table is generated
 * and a union type kept by hand would go stale against it. The cost of that is
 * a typo surviving to runtime, where Phaser answers a missing frame by drawing
 * the entire sheet at that position -- a 1024px rectangle of everything, which
 * looks like a rendering bug rather than a spelling one. So it is caught here,
 * at boot, and says which name.
 */
export function requireFrame(scene: Phaser.Scene, name: string): string {
  if (!scene.textures.get(TILES_KEY).has(name)) {
    throw new Error(`arena: no frame "${name}" in the terrain sheet`)
  }
  return name
}
