import { Application, Graphics } from 'pixi.js'
import { Live2DModel, MotionPreloadStrategy } from 'pixi-live2d-display-advanced/cubism4'
import type { CoreModelLike, LoadedReport } from './inspect'
import type { ModelSource } from './sources'

/**
 * The bench's stage.
 *
 * Deliberately **not** shared with project01's `Live2DStage`, and the reason is
 * the whole difference between the two. That one renders a character that is
 * known to work; this one has to survive a model that does not -- a moc the
 * Core refuses, a settings file pointing at textures that are not there, a
 * model with no motions and no expressions at all. Its loading path reports
 * where production's throws, and sharing one would mean either weakening the
 * game's or having the bench quietly not do what the game does.
 *
 * The measuring maths below is the same as `Live2DStage.measureArt` and is
 * duplicated on purpose. Both are noted; if a third reader ever appears it
 * should be extracted, and that is a change to project01 with its own argument.
 */

export interface Framing {
  heightRatio: number
  x: number
  y: number
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Loaded {
  report: LoadedReport
  /** Bounding box of the drawn artwork, in the model canvas's pixel space. */
  art: Box | null
}

/** Below this a drawable is treated as not on screen. Not zero: Rice parks
 *  spare parts a hair above transparent and still reports them visible, which
 *  drags the measured box out to nothing useful. */
const MIN_OPACITY = 0.05

export class Bench {
  readonly app: Application
  private model: Live2DModel | null = null
  private art: Box | null = null
  private overlay: Graphics | null = null
  private framing: Framing = { heightRatio: 1.82, x: 0.3, y: 1.065 }
  private showOverlay = true

  constructor(host: HTMLElement) {
    this.app = new Application({
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      resizeTo: host,
    })
    const canvas = this.app.view as HTMLCanvasElement
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    host.appendChild(canvas)

    new ResizeObserver(() => this.layout()).observe(host)
  }

  /** Tears down whatever is loaded. Safe to call with nothing loaded. */
  clear(): void {
    if (this.overlay) {
      this.app.stage.removeChild(this.overlay)
      this.overlay.destroy()
      this.overlay = null
    }
    if (this.model) {
      this.app.stage.removeChild(this.model)
      this.model.destroy()
      this.model = null
    }
    this.art = null
  }

  /**
   * Loads a source, or throws with something a human can act on.
   *
   * The moc version is checked by the caller before this runs -- see
   * `inspect.readMoc` -- so anything that fails here is a second, different
   * problem, and saying so is most of what the bench is for.
   */
  async load(source: ModelSource): Promise<Loaded> {
    this.clear()

    const model = await Live2DModel.from(source.settings, {
      // No global PIXI namespace under a bundler, so the ticker is handed over
      // explicitly or the model never updates. Same as the game.
      ticker: this.app.ticker,
      autoHitTest: true,
      autoFocus: true,
      motionPreload: MotionPreloadStrategy.IDLE,
    })

    model.anchor.set(0.5, 0.5)
    model.eventMode = 'static'
    model.cursor = 'pointer'
    this.model = model
    this.app.stage.addChild(model)

    /*
     * A handle, on purpose.
     *
     * project01 forbids measurement hooks in game code, and rightly -- the game
     * is the thing under test and a hook in it is a hole in the thing. This is
     * the other side of that rule: a bench that cannot be driven from the
     * console is a bench that can only answer the questions its buttons already
     * ask. Everything the UI does not surface -- drawable ids, UV rectangles,
     * the parameter table -- is one line away from here.
     */
    ;(window as unknown as { __model?: Live2DModel }).__model = model

    this.overlay = new Graphics()
    this.app.stage.addChild(this.overlay)

    const internal = model.internalModel
    const core = internal.coreModel as unknown as CoreModelLike
    const ppu = (internal as unknown as { pixelsPerUnit: number }).pixelsPerUnit

    /* Measured twice, for the same reason the game does it: visibility flags
       are only meaningful once the model has posed, and it has not ticked yet.
       Every drawable now for a box that is right immediately, then visible-only
       after a frame. */
    this.art = this.measure(core, internal.originalWidth, internal.originalHeight, ppu, false)
    this.layout()

    await new Promise((r) => requestAnimationFrame(r))
    const posed = this.measure(core, internal.originalWidth, internal.originalHeight, ppu, true)
    if (posed) {
      this.art = posed
    }
    this.layout()

    return {
      report: {
        canvasWidth: internal.originalWidth,
        canvasHeight: internal.originalHeight,
        pixelsPerUnit: ppu,
        drawables: core.getDrawableCount(),
        parameters: core.getParameterCount(),
      },
      art: this.art,
    }
  }

  private measure(
    core: CoreModelLike,
    width: number,
    height: number,
    ppu: number,
    visibleOnly: boolean,
  ): Box | null {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (let i = 0; i < core.getDrawableCount(); i++) {
      if (visibleOnly) {
        if (!core.getDrawableDynamicFlagIsVisible(i) || core.getDrawableOpacity(i) < MIN_OPACITY) {
          continue
        }
      }
      const vertices = core.getDrawableVertices(i)
      for (let v = 0; v < vertices.length; v += 2) {
        // Model units to canvas pixels, y flipped because Cubism's axis is up.
        const x = vertices[v] * ppu + width / 2
        const y = -vertices[v + 1] * ppu + height / 2
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }

    if (!Number.isFinite(minX) || !(maxX > minX) || !(maxY > minY)) {
      return null
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }

  setFraming(framing: Framing): void {
    this.framing = framing
    this.layout()
  }

  setOverlay(on: boolean): void {
    this.showOverlay = on
    this.layout()
  }

  /**
   * The same framing rule the game uses: `heightRatio` is the *artwork's*
   * height as a fraction of the stage, not the model canvas's, so one pair of
   * numbers means the same thing for every model however much padding the
   * artist left around it.
   */
  private layout(): void {
    const model = this.model
    if (!model) {
      return
    }
    const { width, height } = this.app.screen
    const internal = model.internalModel
    const unitX = internal.width / internal.originalWidth
    const unitY = internal.height / internal.originalHeight
    const art = this.art
    const { heightRatio, x, y } = this.framing

    let scale: number
    if (art) {
      scale = (height * heightRatio) / (art.height * unitY)
      model.scale.set(scale)
      const dx = (art.x + art.width / 2 - internal.originalWidth / 2) * unitX * scale
      const dy = (art.y + art.height / 2 - internal.originalHeight / 2) * unitY * scale
      model.position.set(width * x - dx, height * y - dy)
    } else {
      scale = (height * heightRatio) / internal.height
      model.scale.set(scale)
      model.position.set(width * x, height * y)
    }

    this.drawOverlay(scale, unitX, unitY)
  }

  /**
   * The two rectangles that explain a mis-framed model.
   *
   * The canvas box and the artwork box, drawn where they actually are. Mao is
   * the case this is for: two meshes parked about 970 canvas pixels clear of
   * her body drag the measured box's left edge out, which pushes her right, and
   * project01 carries a hand-written `MAO_NUDGE` to put her back. With these
   * drawn, that is something you see in a second rather than deduce.
   */
  private drawOverlay(scale: number, unitX: number, unitY: number): void {
    const g = this.overlay
    const model = this.model
    if (!g || !model) {
      return
    }
    g.clear()
    if (!this.showOverlay) {
      return
    }

    const internal = model.internalModel
    const canvasW = internal.originalWidth * unitX * scale
    const canvasH = internal.originalHeight * unitY * scale
    const left = model.position.x - canvasW / 2
    const top = model.position.y - canvasH / 2

    g.lineStyle(1, 0x4a5568, 0.9)
    g.drawRect(left, top, canvasW, canvasH)

    if (this.art) {
      g.lineStyle(1.5, 0x3fb9ff, 0.9)
      g.drawRect(
        left + this.art.x * unitX * scale,
        top + this.art.y * unitY * scale,
        this.art.width * unitX * scale,
        this.art.height * unitY * scale,
      )
    }

    // The mark the artwork's centre is being placed on.
    g.lineStyle(1, 0xff2b3d, 0.8)
    const markX = this.app.screen.width * this.framing.x
    const markY = this.app.screen.height * this.framing.y
    g.moveTo(markX - 8, markY).lineTo(markX + 8, markY)
    g.moveTo(markX, markY - 8).lineTo(markX, markY + 8)
  }

  /* ---------- exercising it ---------- */

  playMotion(group: string, index: number): void {
    void this.model?.motion(group, index, undefined, { volume: 0.9 })
  }

  setExpression(id: string): void {
    void this.model?.expression(id)
  }

  onHit(handler: (areas: string[]) => void): void {
    this.model?.on('hit', handler)
  }
}
