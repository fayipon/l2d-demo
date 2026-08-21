import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Application } from 'pixi.js'
import { Live2DModel, MotionPreloadStrategy } from 'pixi-live2d-display-advanced/cubism4'
import { haruHome, type Live2DModelConfig } from './live2dConfig'

export interface Live2DStageHandle {
  /** Play a random voiced tap motion. Returns the caption for the speech bubble. */
  speak(): string | null
  setExpression(index: number): void
}

interface Live2DStageProps {
  config?: Live2DModelConfig
  muted?: boolean
  /**
   * Fired with the caption when a voice line starts (including taps on the
   * model itself), and with null once it finishes.
   */
  onLine?: (caption: string | null) => void
  onReady?: () => void
}

export const Live2DStage = forwardRef<Live2DStageHandle, Live2DStageProps>(function Live2DStage(
  { config = haruHome, muted = false, onLine, onReady },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const modelRef = useRef<Live2DModel | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Read through refs inside the effect so changing these props never tears
  // down and rebuilds the WebGL context. Assigned in an effect rather than
  // during render, which React disallows.
  const mutedRef = useRef(muted)
  const onLineRef = useRef(onLine)
  const onReadyRef = useRef(onReady)

  useEffect(() => {
    mutedRef.current = muted
    onLineRef.current = onLine
    onReadyRef.current = onReady
  })

  const speakRef = useRef<() => string | null>(() => null)

  useImperativeHandle(ref, () => ({
    speak: () => speakRef.current(),
    setExpression: (index: number) => {
      void modelRef.current?.expression(config.expressions[index]?.id ?? index)
    },
  }))

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    // The model loads asynchronously, so a StrictMode remount can fire cleanup
    // while the load is still in flight. `disposed` makes the late arrival
    // tear itself down instead of attaching to a dead stage.
    let disposed = false

    const app = new Application({
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      resizeTo: host,
    })

    const canvas = app.view as HTMLCanvasElement
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    host.appendChild(canvas)

    let model: Live2DModel | null = null

    /**
     * Bounding box of the artwork itself, in the model canvas's pixel space.
     *
     * Framing on the canvas instead is what put Rice off to one side: a model's
     * canvas is authored around whatever the artist needed, so its centre is
     * not the character's centre, and how much empty margin surrounds the art
     * differs from model to model. Measuring the drawables makes one set of
     * framing numbers mean the same thing for every model.
     */
    let artBounds: { x: number; y: number; width: number; height: number } | null = null

    /**
     * Opacity below which a drawable is treated as not on screen.
     *
     * Not zero: Rice parks spare parts at a hair above transparent, and the
     * visibility flag still reports them visible. Testing for exactly zero let
     * a mesh at the far left of the canvas set the bounding box's left edge,
     * which dragged the measured centre back to the canvas centre and undid the
     * whole correction. Anything this faint cannot be what the framing is for.
     */
    const MIN_OPACITY = 0.05

    const measureArt = (target: Live2DModel, requireVisible: boolean) => {
      const core = target.internalModel.coreModel as {
        getDrawableCount(): number
        getDrawableVertices(index: number): Float32Array
        getDrawableOpacity(index: number): number
        getDrawableDynamicFlagIsVisible(index: number): boolean
      }
      const { originalWidth, originalHeight } = target.internalModel
      const ppu = (target.internalModel as unknown as { pixelsPerUnit: number }).pixelsPerUnit

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      for (let i = 0; i < core.getDrawableCount(); i++) {
        // Hidden parts still carry vertices -- an alternate mouth parked off to
        // the side would drag the box out for nothing.
        if (requireVisible) {
          if (!core.getDrawableDynamicFlagIsVisible(i) || core.getDrawableOpacity(i) < MIN_OPACITY) {
            continue
          }
        }
        const vertices = core.getDrawableVertices(i)
        for (let v = 0; v < vertices.length; v += 2) {
          // Same mapping the library uses: model units to canvas pixels, with
          // y flipped because Cubism's axis points up.
          const x = vertices[v] * ppu + originalWidth / 2
          const y = -vertices[v + 1] * ppu + originalHeight / 2
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }

      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !(maxX > minX) || !(maxY > minY)) {
        return null
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    }

    /**
     * Runs each frame until the model has posed once and the measurement takes,
     * then unsubscribes. The frame budget is a backstop: if a model somehow
     * never reports a visible drawable, measuring every drawable is still far
     * better than framing on the canvas.
     */
    let measureAttempts = 0

    function measureWhenPosed() {
      if (!model) {
        return
      }
      measureAttempts++
      const bounds = measureArt(model, true)
      if (!bounds) {
        // Give up refining after a second or so and keep the all-drawables box
        // measured at load; it is close, and retrying forever costs a frame
        // callback for nothing.
        if (measureAttempts > 60) {
          app.ticker.remove(measureWhenPosed)
        }
        return
      }
      app.ticker.remove(measureWhenPosed)
      artBounds = bounds
      layout()
    }

    const layout = () => {
      if (!model) {
        return
      }
      const { width, height } = app.screen
      const internal = model.internalModel
      // localTransform is baked into internalModel.width/height; recover it so
      // canvas pixels can be converted to display pixels.
      const unitX = internal.width / internal.originalWidth
      const unitY = internal.height / internal.originalHeight
      const art = artBounds

      if (!art) {
        // Fall back to canvas framing if the drawables could not be measured.
        const scale = (height * config.heightRatio) / internal.height
        model.scale.set(scale)
        model.position.set(width * config.position.x, height * config.position.y)
        return
      }

      // heightRatio is the artwork's height as a fraction of stage height, so a
      // value above 1 crops the character deliberately.
      const scale = (height * config.heightRatio) / (art.height * unitY)
      model.scale.set(scale)

      // The model's anchor is its canvas centre, so shift by the distance from
      // that centre to the art's centre to land the character on the mark.
      const dx = (art.x + art.width / 2 - internal.originalWidth / 2) * unitX * scale
      const dy = (art.y + art.height / 2 - internal.originalHeight / 2) * unitY * scale
      model.position.set(width * config.position.x - dx, height * config.position.y - dy)
    }

    const pickLine = () => config.tapLines[Math.floor(Math.random() * config.tapLines.length)]

    // Lines can overlap if the character is tapped again mid-sentence, so each
    // one carries a token -- a stale callback must not retract the newer line.
    let lineSeq = 0
    let lineTimer: ReturnType<typeof setTimeout> | undefined

    const endLine = (token: number) => {
      if (token !== lineSeq) {
        return
      }
      clearTimeout(lineTimer)
      onLineRef.current?.(null)
    }

    const playLine = (): string | null => {
      const line = pickLine()
      // A model with no tap motions declared has nothing to play.
      if (!model || !line) {
        return null
      }
      const token = ++lineSeq
      clearTimeout(lineTimer)

      // The motion carries its own Sound reference, so this plays the voice and
      // drives the LipSync parameter group in one call. onFinish is fired off
      // the sound's completion, not the motion's.
      void model.motion(config.tapMotionGroup, line.motionIndex, undefined, {
        volume: mutedRef.current ? 0 : config.voiceVolume,
        onFinish: () => endLine(token),
        onError: () => endLine(token),
      })

      // Fallback so a callback that never arrives cannot strand the bubble
      // on screen; the longest sample line is a few seconds.
      lineTimer = setTimeout(() => endLine(token), 12000)

      onLineRef.current?.(line.caption)
      return line.caption
    }

    speakRef.current = playLine

    const load = async () => {
      try {
        const loaded = await Live2DModel.from(config.modelPath, {
          // No global PIXI namespace under a bundler, so the ticker has to be
          // handed over explicitly or the model never updates.
          ticker: app.ticker,
          autoHitTest: true,
          autoFocus: true,
          idleMotionGroup: config.idleMotionGroup,
          motionPreload: MotionPreloadStrategy.IDLE,
        })

        if (disposed) {
          loaded.destroy()
          return
        }

        model = loaded
        modelRef.current = loaded
        // Fixed at the canvas centre: layout() offsets from there to put the
        // artwork on its mark, so a configurable anchor would be a second,
        // conflicting way to say the same thing.
        loaded.anchor.set(0.5, 0.5)
        loaded.eventMode = 'static'
        loaded.cursor = 'pointer'

        // HitAreas are named Head/Body while the motion group is TapBody, so the
        // default hit-to-motion mapping finds nothing -- wire it up by hand.
        loaded.on('hit', () => {
          playLine()
        })

        app.stage.addChild(loaded)
        // Two-step on purpose. The drawable visibility flags are only
        // meaningful once the model has posed, and it has not ticked yet -- so
        // measure every drawable now to get framing that is right immediately,
        // and let the ticker refine it to visible-only once a frame has run.
        // Measuring only on the ticker would leave the first paint mis-framed,
        // and on a backgrounded tab rAF never fires, so it could stay that way.
        artBounds = measureArt(loaded, false)
        app.ticker.add(measureWhenPosed)
        layout()
        onReadyRef.current?.()
      } catch (e) {
        if (!disposed) {
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    }

    void load()

    const resizeObserver = new ResizeObserver(layout)
    resizeObserver.observe(host)

    return () => {
      disposed = true
      clearTimeout(lineTimer)
      speakRef.current = () => null
      // Harmless if it already unsubscribed itself, and required if the model
      // was torn down before it ever posed.
      app.ticker.remove(measureWhenPosed)
      resizeObserver.disconnect()
      modelRef.current = null
      model?.destroy()
      model = null
      app.destroy(true, { children: true, texture: true, baseTexture: true })
    }
  }, [config])

  return (
    <div className="live2d-stage" ref={hostRef} aria-label="Live2D character">
      {error ? <p className="live2d-error">Live2D 載入失敗：{error}</p> : null}
    </div>
  )
})

