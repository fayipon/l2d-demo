import Phaser from 'phaser'
import type { SpriteFrame } from '../data/content'

/**
 * The arena's sprite sheet, drawn at boot rather than loaded.
 *
 * There is no art for this yet, and a folder of placeholder PNGs would be a
 * download, a loader state and a set of files to delete later. A 2D canvas
 * costs none of that, and it keeps the arena in the same visual language as
 * the lobby -- the same trick as the achievement medallions. Real art is a
 * texture swap: replace this call with a load and keep the frame names.
 *
 * Two things matter about how it is built:
 *
 * Every shape is drawn WHITE. Colour comes from the sprite's tint at runtime,
 * which multiplies -- so one white shape serves every enemy kind that wants
 * that silhouette, and a hit flash is just tinting it back to white.
 *
 * Everything lands in ONE texture. Phaser's WebGL renderer flushes its batch
 * whenever the texture changes, and the display list interleaves enemy kinds
 * freely, so a texture per shape would mean hundreds of flushes a frame. One
 * atlas means one batch for the whole arena.
 */
export const ATLAS_KEY = 'arena-atlas'

const PADDING = 2
const SHEET_WIDTH = 256
/* Two rows with room to spare. The packer wraps, and at 64 the last frame
   cleared the bottom edge by eight pixels -- one more shape would have been
   silently clipped rather than reported. */
const SHEET_HEIGHT = 96

/** Alpha of the inner fill. The rim stays opaque, which is what gives every
 *  entity a lit edge against the dark floor. */
const CORE_ALPHA = 0.42
const RIM = 3

interface ShapeSpec {
  name: SpriteFrame
  width: number
  height: number
  /** Skips the punched core, for shapes that want to be a flat block of
   *  colour rather than a lit outline. */
  solid?: boolean
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, inset: number) => void
}

const SHAPES: ShapeSpec[] = [
  {
    name: 'player',
    width: 34,
    height: 34,
    draw: (ctx, w, h, inset) => roundedRect(ctx, inset, inset, w - inset * 2, h - inset * 2, 7 - inset),
  },
  {
    name: 'grunt',
    width: 30,
    height: 30,
    draw: (ctx, w, h, inset) => {
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, w / 2 - inset, 0, Math.PI * 2)
    },
  },
  {
    name: 'runner',
    width: 28,
    height: 28,
    draw: (ctx, w, h, inset) => polygon(ctx, w / 2, h / 2 + inset * 0.3, w / 2 - inset, 3, -Math.PI / 2),
  },
  {
    name: 'brute',
    width: 48,
    height: 48,
    draw: (ctx, w, h, inset) => polygon(ctx, w / 2, h / 2, w / 2 - inset, 6, 0),
  },
  {
    name: 'bullet',
    width: 18,
    height: 8,
    draw: (ctx, w, h, inset) => roundedRect(ctx, inset, inset, w - inset * 2, h - inset * 2, (h - inset * 2) / 2),
  },
  {
    name: 'blade',
    width: 22,
    height: 22,
    draw: (ctx, w, h, inset) => polygon(ctx, w / 2, h / 2, w / 2 - inset, 4, 0),
  },
  {
    name: 'pellet',
    width: 10,
    height: 10,
    draw: (ctx, w, h, inset) => {
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, w / 2 - inset, 0, Math.PI * 2)
    },
  },
  {
    name: 'beam',
    width: 30,
    height: 8,
    draw: (ctx, w, h, inset) =>
      roundedRect(ctx, inset, inset, w - inset * 2, h - inset * 2, (h - inset * 2) / 2),
  },
  {
    name: 'coin',
    width: 14,
    height: 14,
    draw: (ctx, w, h, inset) => {
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, w / 2 - inset, 0, Math.PI * 2)
    },
  },
  {
    // Health bars. Solid and rectangular: it is stretched to whatever width and
    // height a bar needs, and a rim would stretch with it into a smear.
    name: 'bar',
    width: 16,
    height: 4,
    solid: true,
    draw: (ctx, w, h) => {
      ctx.beginPath()
      ctx.rect(0, 0, w, h)
    },
  },
]

export function buildAtlas(scene: Phaser.Scene): void {
  // Built once per page load, not per scene start -- a restart re-enters
  // create() and would otherwise redraw and re-register the same frames.
  if (scene.textures.exists(ATLAS_KEY)) {
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = SHEET_WIDTH
  canvas.height = SHEET_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('no 2D context for the arena atlas')
  }

  const placements: { name: SpriteFrame; x: number; y: number; width: number; height: number }[] = []
  let cursorX = PADDING
  let cursorY = PADDING
  let rowHeight = 0

  for (const shape of SHAPES) {
    if (cursorX + shape.width + PADDING > SHEET_WIDTH) {
      cursorX = PADDING
      cursorY += rowHeight + PADDING
      rowHeight = 0
    }

    ctx.save()
    ctx.translate(cursorX, cursorY)

    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 1
    shape.draw(ctx, shape.width, shape.height, 0)
    ctx.fill()

    if (!shape.solid) {
      // Punched out of the middle rather than drawn over it: drawing a dark
      // core would tint along with the rim and the shape would stay solid.
      ctx.globalCompositeOperation = 'destination-out'
      ctx.globalAlpha = 1 - CORE_ALPHA
      shape.draw(ctx, shape.width, shape.height, RIM)
      ctx.fill()
    }

    ctx.restore()
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    placements.push({
      name: shape.name,
      x: cursorX,
      y: cursorY,
      width: shape.width,
      height: shape.height,
    })

    cursorX += shape.width + PADDING
    rowHeight = Math.max(rowHeight, shape.height)
  }

  const texture = scene.textures.addCanvas(ATLAS_KEY, canvas)
  if (!texture) {
    throw new Error('could not register the arena atlas')
  }
  for (const placement of placements) {
    texture.add(placement.name, 0, placement.x, placement.y, placement.width, placement.height)
  }
}

/* ---------- damage numbers ---------- */

/**
 * A fixed-width bitmap font of digits, also drawn at boot.
 *
 * Damage numbers are the one thing on this screen made of text, and there can
 * be dozens on screen at once. A Phaser Text object carries its own canvas and
 * re-renders it whenever the string changes, which at this rate is dozens of
 * canvas rasterisations a second. A bitmap font is one texture and one batch,
 * and the glyphs are already on the machine -- so they get baked into a grid
 * here and handed to Phaser's RetroFont parser, which is exactly the fixed-cell
 * layout this produces.
 *
 * Its own texture rather than a corner of the sprite atlas, because RetroFont
 * needs a uniform grid and the sprite frames are all different sizes. One
 * extra batch for all the numbers is a fair price.
 */
export const FONT_KEY = 'arena-digits'

const DIGITS = '0123456789'
/*
 * The cell is only a little wider than a digit.
 *
 * RetroFont is fixed-width, so the cell IS the advance: at 20px a bold digit
 * is about 12px across and the rest of the cell became a gap, which made every
 * number read as separated characters rather than one figure.
 */
const CELL_WIDTH = 13
const CELL_HEIGHT = 26

export function buildDamageFont(scene: Phaser.Scene): void {
  if (scene.cache.bitmapFont.has(FONT_KEY)) {
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = CELL_WIDTH * DIGITS.length
  canvas.height = CELL_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('no 2D context for the damage font')
  }

  ctx.font = `700 ${CELL_HEIGHT - 6}px "Segoe UI", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < DIGITS.length; i++) {
    // Centred in its own cell, which is what makes the grid uniform by
    // construction rather than by hoping the font's metrics cooperate.
    ctx.fillText(DIGITS[i], i * CELL_WIDTH + CELL_WIDTH / 2, CELL_HEIGHT / 2 + 1)
  }

  if (!scene.textures.exists(FONT_KEY)) {
    scene.textures.addCanvas(FONT_KEY, canvas)
  }

  scene.cache.bitmapFont.add(
    FONT_KEY,
    Phaser.GameObjects.RetroFont.Parse(scene, {
      image: FONT_KEY,
      'offset.x': 0,
      'offset.y': 0,
      width: CELL_WIDTH,
      height: CELL_HEIGHT,
      chars: DIGITS,
      charsPerRow: DIGITS.length,
      'spacing.x': 0,
      'spacing.y': 0,
      lineSpacing: 0,
    }),
  )
}

/* Path helpers. Each leaves a path on the context without filling it, so the
   caller can fill it twice under different composite modes. */

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function polygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotation: number,
): void {
  ctx.beginPath()
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i / sides) * Math.PI * 2
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.closePath()
}
