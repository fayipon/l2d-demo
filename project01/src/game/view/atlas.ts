import Phaser from 'phaser'
import type { SpriteFrame } from '../data/content'
import digitsUrl from '../../assets/font-digits.webp'
import digitsFntUrl from '../../assets/font-digits.fnt?url'

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
    /*
     * The fireball. A disc with a tail, drawn pointing along +x so the sprite's
     * rotation -- which every projectile already gets from its velocity --
     * points the flame the way it is travelling.
     *
     * Larger than the other shots and with the same punched core as the rest,
     * so it reads as something burning rather than as a bigger pellet.
     */
    name: 'fireball',
    width: 26,
    height: 18,
    draw: (ctx, w, h, inset) => {
      const r = h / 2 - inset
      const cx = w - r - inset
      const cy = h / 2
      ctx.beginPath()
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2)
      // The tail: two curves meeting at a point at the back.
      ctx.quadraticCurveTo(cx - r * 0.6, cy + r * 0.85, inset, cy)
      ctx.quadraticCurveTo(cx - r * 0.6, cy - r * 0.85, cx, cy - r)
      ctx.closePath()
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

  /* The sheet is hand-sized, and a shape that does not fit is silently
     cropped by the canvas rather than reported by it -- which shows up as one
     sprite with a shaved edge, at runtime, long after the change that caused
     it. Cheaper to refuse to boot. */
  const overflow = placements.filter((p) => p.y + p.height > SHEET_HEIGHT)
  if (overflow.length > 0) {
    throw new Error(
      `the arena atlas is too small for ${overflow.map((p) => p.name).join(', ')} -- ` +
        `raise SHEET_HEIGHT past ${Math.max(...overflow.map((p) => p.y + p.height))}`,
    )
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
 * The digits the arena draws damage with.
 *
 * Painted art, cut out of DESIGN/game_font.png by the asset pipeline -- see
 * scripts/fontjob.mjs, which is where the geometry below comes from and the
 * only other place that may know it. It replaces a set of digits this file
 * used to draw with the system font, which was right while there was no art
 * and is the wrong answer the moment there is.
 *
 * Fixed-width cells, so a number that changes every frame does not shuffle
 * sideways as a 1 becomes an 8.
 *
 * Loaded rather than drawn, which is the one thing that makes it different
 * from everything else in this file: the image has to arrive before the font
 * can be registered, so the scene fetches it in preload and calls
 * registerDamageFont afterwards.
 *
 * Arena-only by construction. It lives under game/view and is loaded by the
 * arena scene; nothing in the lobby imports either.
 */
export const FONT_KEY = 'arena-digits'

/**
 * The two files the loader needs, handed over by the scene's preload.
 *
 * Proportional, not a fixed grid. The metrics live beside the image as BMFont
 * XML because both come out of the same measuring pass in the pipeline --
 * mirroring them into a table here is how a table goes stale, and a font whose
 * advances disagree with its glyphs does not fail, it just looks wrong.
 */
export const FONT_IMAGE_URL = digitsUrl
export const FONT_DATA_URL = digitsFntUrl

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

/**
 * The edge of sight.
 *
 * A screen-sized texture: clear out to the vision radius, fading to solid over
 * a band, and solid black past it. Because the player is always dead centre it
 * never moves, so this is one sprite with scrollFactor 0 drawn over everything
 * else, and it costs one quad a frame however far the stat travels.
 *
 * Drawn over the arena rather than woven into it, which is what makes decision
 * 6 free. Weapons fire past the dark and kill what is out there, and the two
 * things that would otherwise give the position away for nothing -- the
 * damage number over an unlit corpse, the health bar on something invisible --
 * are under this by construction, because they are in the display list below
 * it. Fading every sprite individually would have been a per-entity write in
 * the busiest loop in the scene to arrive at the same picture.
 *
 * Rebuilt when the radius changes rather than scaled. Scaling one baked
 * gradient would mean choosing between a clear centre big enough to be useful
 * and an opaque margin wide enough to still cover the corners at low vision,
 * and those pull in opposite directions. Vision moves perhaps a dozen times in
 * a run, so redrawing a canvas then is not a cost worth designing around.
 */
export const VIGNETTE_KEY = 'arena-vignette'

export function buildVignette(
  scene: Phaser.Scene,
  width: number,
  height: number,
  radius: number,
  fade: number,
): void {
  // Replaced, not added to: the key has to keep pointing at one texture, and
  // the old one's GPU memory is not worth leaking a dozen times a run.
  if (scene.textures.exists(VIGNETTE_KEY)) {
    scene.textures.remove(VIGNETTE_KEY)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('no 2D context for the vignette')
  }

  const cx = width / 2
  const cy = height / 2
  const inner = Math.max(1, radius - fade)

  /* The gradient only covers the band. Everything outside it is filled
     separately, because a canvas gradient stops at its outer radius and leaves
     the corners of a 16:9 rectangle untouched -- which is exactly where the
     dark is most needed. */
  const gradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, radius)
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 1)')

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  // Punch the lit circle back out, then lay the band into the hole it left.
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()

  scene.textures.addCanvas(VIGNETTE_KEY, canvas)
}
