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
const SHEET_HEIGHT = 64

/** Alpha of the inner fill. The rim stays opaque, which is what gives every
 *  entity a lit edge against the dark floor. */
const CORE_ALPHA = 0.42
const RIM = 3

interface ShapeSpec {
  name: SpriteFrame
  width: number
  height: number
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
    name: 'material',
    width: 14,
    height: 14,
    draw: (ctx, w, h, inset) => polygon(ctx, w / 2, h / 2, w / 2 - inset, 4, 0),
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

    // Punched out of the middle rather than drawn over it: drawing a dark core
    // would tint along with the rim and the shape would stay solid.
    ctx.globalCompositeOperation = 'destination-out'
    ctx.globalAlpha = 1 - CORE_ALPHA
    shape.draw(ctx, shape.width, shape.height, RIM)
    ctx.fill()

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
