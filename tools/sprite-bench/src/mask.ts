/**
 * Where the alpha plane comes from when the file has none.
 *
 * The sheet this bench was built for -- the mushroom, `DESIGN/
 * game_enemy_sprite_01.png` -- arrived as a three-channel PNG. No alpha
 * channel at all, and what looks like transparency in a viewer is PAINTED: a
 * checkerboard of two light greys, 254 and 238, drawn into the pixels, with
 * compression noise wobbling both by a couple of counts.
 *
 * That is not a rare accident. It is what comes back from an image model asked
 * for "a sprite sheet on a transparent background", from a screenshot of a
 * tool that shows transparency as a checkerboard, and from anything that has
 * been through a JPEG on the way. Everything downstream in this bench measures
 * alpha, so without this the whole sheet reads as one band holding one frame
 * and the tool looks broken instead of the file.
 *
 * So: a mask, built from the colours, standing in for the alpha the file does
 * not have.
 *
 * **Flood fill from the border, not a colour test over the whole image.** The
 * mushroom's belly is cream and the spots on its cap are near-white; a rule
 * that says "light and grey means background" punches holes through both. The
 * background is the region CONNECTED TO THE EDGE, which the checkerboard is
 * and the highlights on a sprite are not.
 *
 * **The border is not always reachable.** A sheet that draws a box around
 * every frame -- `DESIGN/game_enemy_sprite_02.png` -- walls the fill out:
 * the ruling grey is luma 116, so it is foreground by the rule above, and the
 * boxes are closed. The fill enters at the four corners and claims 40.9% of
 * the image, all of it outside the grid, while the checkerboard inside every
 * cell survives untouched and no two frames have a transparent column between
 * them. So `buildMask` takes an optional list of cells and seeds each one from
 * its OWN border instead. `rulings.ts` is where that list comes from.
 *
 * What this is not: a way to fix the asset. The mask lives in memory to answer
 * "where are the frames". The sheet still has to be properly cut out before it
 * can go into the game, and the verdict on screen says so.
 */

export interface MaskOptions {
  /** Luminance at or above which a pixel may be background. Default 200,
   *  which clears both checker greys with room to spare and is far above any
   *  drawn shadow. */
  luma: number
  /** How grey a pixel has to be: max channel minus min channel, at or below
   *  this. Default 12, enough for the compression noise on the checkerboard
   *  and tight enough to keep cream and pale skin out of it. */
  chroma: number
}

export const DEFAULT_MASK: MaskOptions = { luma: 200, chroma: 12 }

export interface Mask {
  alpha: Uint8Array
  /** Whether the file carried real transparency. False means everything below
   *  is a stand-in and the verdict has something to say. */
  hadAlpha: boolean
  /** Whether the mask was keyed off the colours rather than read. */
  keyed: boolean
  /** How much of the image the fill claimed, as a fraction. A number near zero
   *  on a keyed sheet means the fill found nothing and the frames it reports
   *  are not to be believed. */
  backgroundRatio: number
  /** The two most common colours the fill swallowed, as hex. On a
   *  checkerboard there are two and they are the evidence. */
  greys: string[]
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

/** A rectangle to seed the fill from, in place of the image border. */
export interface Seed {
  x: number
  y: number
  w: number
  h: number
}

export function buildMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: MaskOptions = DEFAULT_MASK,
  force = false,
  seeds: Seed[] | null = null,
): Mask {
  const count = width * height
  const alpha = new Uint8Array(count)
  let opaque = 0
  for (let i = 0; i < count; i++) {
    alpha[i] = rgba[i * 4 + 3]
    if (alpha[i] > 250) {
      opaque++
    }
  }
  /* "Has alpha" means alpha that does something. A PNG saved with an alpha
     channel that is 255 everywhere is the same file as one without, and the
     canvas hands both to us identically. */
  const hadAlpha = opaque < count
  if (hadAlpha && !force) {
    return { alpha, hadAlpha, keyed: false, backgroundRatio: 0, greys: [] }
  }

  const background = (i: number) => {
    const r = rgba[i * 4]
    const g = rgba[i * 4 + 1]
    const b = rgba[i * 4 + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    return max - min <= options.chroma && (r + g + b) / 3 >= options.luma
  }

  /* Iterative, with an explicit stack. Two million pixels of recursion is a
     blown call stack, and the failure looks like a browser tab dying rather
     than like an image being difficult. */
  const filled = new Uint8Array(count)
  const stack: number[] = []
  const push = (i: number) => {
    if (!filled[i] && background(i)) {
      filled[i] = 1
      stack.push(i)
    }
  }
  if (seeds) {
    /* Each cell's own perimeter, one pixel inside the ruling that draws it --
       the line itself is foreground by every test here, and seeding on top of
       it would seed nothing. */
    for (const seed of seeds) {
      const x0 = Math.max(0, seed.x + 1)
      const x1 = Math.min(width - 1, seed.x + seed.w - 2)
      const y0 = Math.max(0, seed.y + 1)
      const y1 = Math.min(height - 1, seed.y + seed.h - 2)
      for (let x = x0; x <= x1; x++) {
        push(y0 * width + x)
        push(y1 * width + x)
      }
      for (let y = y0; y <= y1; y++) {
        push(y * width + x0)
        push(y * width + x1)
      }
    }
  } else {
    for (let x = 0; x < width; x++) {
      push(x)
      push((height - 1) * width + x)
    }
    for (let y = 0; y < height; y++) {
      push(y * width)
      push(y * width + width - 1)
    }
  }
  const tally = new Map<string, number>()
  while (stack.length > 0) {
    const i = stack.pop() as number
    const x = i % width
    const y = (i / width) | 0
    const key = hex(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])
    tally.set(key, (tally.get(key) ?? 0) + 1)
    if (x > 0) push(i - 1)
    if (x < width - 1) push(i + 1)
    if (y > 0) push(i - width)
    if (y < height - 1) push(i + width)
  }

  let cleared = 0
  for (let i = 0; i < count; i++) {
    if (filled[i]) {
      alpha[i] = 0
      cleared++
    } else if (!hadAlpha) {
      alpha[i] = 255
    }
  }

  return {
    alpha,
    hadAlpha,
    keyed: true,
    backgroundRatio: cleared / count,
    greys: [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([colour]) => colour),
  }
}
