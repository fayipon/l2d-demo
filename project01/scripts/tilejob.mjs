import sharp from 'sharp'

/**
 * The arena's terrain sheet, cut out of the painted tileset.
 *
 * The source is a contact sheet of everything the artist drew for one place --
 * floor tiles, a wall, pillars, banners, props, ground decals -- laid out on a
 * transparent background. Every piece is already an island of alpha, so the
 * geometry below was read off that alpha with a connected-component pass, once,
 * and this file is the only place it is written down.
 *
 * Two things this pass does that matter downstream:
 *
 * Everything answers to ONE scale, and none of it is baked to that scale.
 * `WORLD_SCALE` turns source pixels into world pixels and is written into the
 * table for the scene to apply, so a crate drawn at 69px and a statue drawn at
 * 300 come out the right size next to each other without either being
 * flattened first. See the note on WORLD_SCALE for why that matters.
 *
 * The frame table is written beside the image rather than mirrored into
 * TypeScript. Same argument as the digit font: both come out of this one pass,
 * and a hand-copied table is a table that goes stale.
 *
 * The floor tiles keep their soft alpha edge on purpose. Butted together, that
 * edge is the grout between flagstones -- drawn over the camera's near-black
 * background, it reads as a dark seam instead of a hard join.
 *
 * Two images out, not one. The floor is a strict grid because a Phaser tileset
 * addresses tiles by index off a fixed pitch, and the scenery is shelf-packed
 * because those frames are every size there is. Trying to serve both from one
 * image means either padding every prop out to a tile cell or giving up the
 * tilemap.
 */

/**
 * World pixels per source pixel.
 *
 * Set by the floor tile, which is ~104px in the source and wants to be TILE
 * wide in the world. Everything else inherits it, which is what keeps a crate
 * the right size next to a character: the actor stands 64 world px tall (see
 * game/data/actors.ts), so a tile is one character high and the statue is
 * three.
 *
 * Nothing here is resized to it. The frames are baked at the size they were
 * drawn and the scale is written into the table for the scene to apply, which
 * is the whole difference between art that looks painted and art that looks
 * blurry: the canvas is rendered above 1:1 (see RENDER_SCALE in the arena
 * scene), so a frame flattened to its world size at bake time is a frame that
 * has to be magnified again to be drawn. Every pixel the artist put in stays
 * in, and the GPU does the one resample there is.
 */
const TILE = 64
const WORLD_SCALE = 0.64

/**
 * The floor tileset's cell, in source pixels.
 *
 * The largest of the source's own bands, so every flagstone is padded up to a
 * square rather than any of them being shrunk into one. The layer is scaled by
 * TILE / FLOOR_CELL at runtime, which is how a 104px cell ends up 64 world px
 * wide with all 104 pixels still available to the sampler.
 */
const FLOOR_CELL = 104

/** Packing. The gutter is the same defence as the character sheet's: linear
 *  filtering samples past a frame's edge, and lossy WebP has no idea frames
 *  exist. */
const SHEET_WIDTH = 1024
const MARGIN = 2
const GUTTER = 4

/**
 * The floor grid, in source pixels.
 *
 * Five columns by five rows of square flagstones. Bands rather than a pitch:
 * the source's cells are hand-placed and drift by up to six pixels across the
 * block, so a uniform grid fitted to them clips an edge somewhere in the
 * middle. Each band is the tile's own alpha extent.
 */
const FLOOR_COLUMNS = [
  [9, 107],
  [112, 211],
  [221, 319],
  [328, 429],
  [433, 531],
]
const FLOOR_ROWS = [
  [9, 110],
  [117, 219],
  [223, 330],
  [334, 440],
  [447, 552],
]

/**
 * Everything that is not floor, as `[left, top, width, height]` in the source.
 *
 * The boundary pieces come off a single drawn unit -- a low wall between two
 * candle pillars -- cut into a post and a span so a run of any length is
 * post, span, post, span, post. Cutting it anywhere else means either a
 * doubled pillar at every join or a wall that cannot repeat.
 *
 * `wall-span` is cut to the wall's own top, not to the post's. The unit as
 * drawn has posts taller than the wall between them, so a span taken at the
 * post's height carries 31 rows of nothing above the stone -- invisible in a
 * horizontal run, where both pieces stand on the same ground, and a 20px hole
 * between the wall and the field on the side edges, where the span is turned a
 * quarter turn and that padding becomes a gap. Both slices still share a
 * bottom edge, which is what keeps the run aligned.
 */
const PIECES = {
  'wall-post': [704, 200, 46, 169],
  'wall-span': [750, 231, 126, 138],
  pillar: [1235, 5, 55, 184],
  'fence-span': [1057, 5, 143, 184],
  banner: [937, 211, 55, 125],

  statue: [1305, 32, 211, 300],
  'tree-large': [1390, 348, 135, 282],
  'tree-thin': [1284, 442, 92, 164],
  'tree-small': [1314, 346, 77, 131],
  'rock-spire': [662, 495, 118, 201],
  'rock-cluster': [1216, 362, 80, 96],
  boulder: [1122, 372, 82, 75],
  'rock-small': [878, 440, 57, 63],
  skulls: [952, 452, 74, 59],
  'skulls-wide': [991, 521, 85, 53],
  crate: [823, 384, 69, 69],
  'crate-stack': [778, 466, 91, 102],
  barrel: [929, 387, 40, 55],
  candelabra: [1046, 382, 57, 126],
  candles: [1122, 600, 69, 101],
  lectern: [1230, 623, 89, 136],
  chest: [1446, 647, 77, 71],
  arch: [988, 594, 82, 111],
  gravestone: [696, 384, 40, 86],
  column: [1393, 733, 32, 83],
  obelisk: [1026, 721, 32, 82],

  'circle-large': [9, 765, 195, 196],
  'circle-star': [224, 763, 158, 156],
  fissure: [663, 826, 119, 191],
  rubble: [539, 921, 112, 84],
  twigs: [489, 775, 78, 47],
  'twigs-small': [571, 823, 68, 34],
  pebbles: [425, 937, 41, 32],
  pebble: [476, 972, 34, 29],
  spark: [401, 836, 73, 70],
  'spark-small': [214, 928, 57, 60],
  'ember-pool': [309, 938, 85, 56],
  ember: [130, 973, 77, 36],
}

/**
 * Cuts the sheet and returns the packed image plus its frame table.
 *
 * Shelf packing, left to right and top to bottom. Frames are sorted tallest
 * first, which is what keeps the shelves from being mostly air -- unsorted,
 * the 192px statue lands on a shelf of 40px pebbles and wastes the difference
 * across the whole row.
 */
export async function buildTileSheet(source) {
  const cuts = []

  for (const [name, [left, top, width, height]] of Object.entries(PIECES)) {
    cuts.push({ name, extract: { left, top, width, height }, width, height })
  }

  const order = [...cuts].sort((a, b) => b.height - a.height || b.width - a.width)
  const table = {}
  const composite = []
  let x = MARGIN
  let y = MARGIN
  let shelf = 0

  for (const cut of order) {
    if (x + cut.width + MARGIN > SHEET_WIDTH) {
      x = MARGIN
      y += shelf + GUTTER
      shelf = 0
    }
    const buffer = await sharp(source).extract(cut.extract).png().toBuffer()
    composite.push({ input: buffer, left: x, top: y })
    table[cut.name] = [x, y, cut.width, cut.height]
    x += cut.width + GUTTER
    shelf = Math.max(shelf, cut.height)
  }

  const height = y + shelf + MARGIN
  const png = await sharp({
    create: {
      width: SHEET_WIDTH,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composite)
    .webp({ quality: 92, alphaQuality: 100, effort: 6 })
    .toBuffer()

  return {
    png,
    json: JSON.stringify(
      { scale: WORLD_SCALE, tile: TILE, cell: FLOOR_CELL, width: SHEET_WIDTH, height, frames: table },
      null,
      1,
    ),
    count: cuts.length,
    height,
  }
}

/**
 * The floor tileset: the 5x5 block of flagstones on a strict TILE pitch, in
 * reading order, so tile index N is the Nth stone in the source block.
 *
 * No margin and no spacing. A `TilemapGPULayer` samples the grid in its own
 * shader and is documented to draw the borders between tiles without bleeding,
 * which is the whole reason the floor uses that layer type rather than the
 * flexible one -- and it is also why padding here would be padding for nothing.
 *
 * Bands rather than a pitch, and each band padded out to the same square: the
 * source's
 * cells are hand-placed and drift by up to six pixels across the block, so a
 * uniform grid fitted over them clips an edge somewhere in the middle, and a
 * tileset whose cells disagree by a pixel draws a seam on every tile.
 */
export async function buildFloorTileset(source) {
  const cells = []
  for (let row = 0; row < FLOOR_ROWS.length; row++) {
    for (let col = 0; col < FLOOR_COLUMNS.length; col++) {
      const [x0, x1] = FLOOR_COLUMNS[col]
      const [y0, y1] = FLOOR_ROWS[row]
      const buffer = await sharp(source)
        .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
        .resize(FLOOR_CELL, FLOOR_CELL, { fit: 'fill' })
        .png()
        .toBuffer()
      cells.push({ input: buffer, left: col * FLOOR_CELL, top: row * FLOOR_CELL })
    }
  }

  const png = await sharp({
    create: {
      width: FLOOR_COLUMNS.length * FLOOR_CELL,
      height: FLOOR_ROWS.length * FLOOR_CELL,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(cells)
    .webp({ quality: 92, alphaQuality: 100, effort: 6 })
    .toBuffer()

  return { png, cell: FLOOR_CELL, columns: FLOOR_COLUMNS.length, count: cells.length }
}
