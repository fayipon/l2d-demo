import type { Application, ICanvas } from 'pixi.js'
import type { Live2DModel } from 'pixi-live2d-display-advanced/cubism4'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Side of the square portrait written to the data URL. */
const PORTRAIT_SIZE = 192

/**
 * Height the model is temporarily scaled to before extracting.
 *
 * Extraction renders the whole model canvas into a texture, and on screen the
 * model is around twice the stage height at device pixel ratio -- a canvas of
 * tens of megapixels for a 192px thumbnail. Scaling down first keeps the
 * one-off cost small.
 */
const CAPTURE_HEIGHT = 1024

/**
 * The head's box within the artwork, in the model canvas's pixel space.
 *
 * Live2D sample models name their meshes ArtMesh07 and similar, so there is no
 * "this one is the face" to look for. What is reliable is that the top of a
 * standing character is their head: take the horizontal extent of just the top
 * slice of the artwork, which is hair and face and excludes the arms and skirt
 * that widen the box further down.
 */
export function headBoxFrom(art: Box, topSliceX: { min: number; max: number }): Box {
  const sliceWidth = topSliceX.max - topSliceX.min
  // Clamped at both ends against the figure's own height. The floor keeps a
  // model caught mid-turn from getting a crop tighter than its face; the
  // ceiling is for headwear -- Mao's hat brim is far wider than her head, and
  // sizing off it alone framed her from much too far away.
  const side = Math.min(
    Math.max(sliceWidth * 1.12, art.height * 0.22),
    art.height * 0.3,
  )
  const centreX = (topSliceX.min + topSliceX.max) / 2
  return {
    x: centreX - side / 2,
    // A little headroom above the crown reads better than a tight crop.
    y: art.y - side * 0.06,
    width: side,
    height: side,
  }
}

/**
 * Renders the model's head to a square WebP data URL.
 *
 * Returns null rather than throwing: a missing portrait falls back to the
 * roster's emblem, which is a much better outcome than a broken screen.
 */
export function capturePortrait(app: Application, model: Live2DModel, head: Box): string | null {
  const internal = model.internalModel
  const scaleX = model.scale.x
  const scaleY = model.scale.y
  const x = model.position.x
  const y = model.position.y

  try {
    // internalModel.height already carries the model's own layout transform, so
    // this is the on-screen height at scale 1.
    const captureScale = CAPTURE_HEIGHT / internal.height
    model.scale.set(captureScale)

    const source = app.renderer.extract.canvas(model) as ICanvas
    // The extracted image covers the whole model canvas, so canvas pixels map
    // to image pixels by a single ratio.
    const perCanvasPx = source.width / internal.originalWidth

    const out = document.createElement('canvas')
    out.width = PORTRAIT_SIZE
    out.height = PORTRAIT_SIZE
    const ctx = out.getContext('2d')
    if (!ctx) {
      return null
    }
    ctx.drawImage(
      source as unknown as CanvasImageSource,
      head.x * perCanvasPx,
      head.y * perCanvasPx,
      head.width * perCanvasPx,
      head.height * perCanvasPx,
      0,
      0,
      PORTRAIT_SIZE,
      PORTRAIT_SIZE,
    )
    return out.toDataURL('image/webp', 0.85)
  } catch {
    return null
  } finally {
    model.scale.set(scaleX, scaleY)
    model.position.set(x, y)
  }
}
