import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Application } from 'pixi.js'
import { Live2DModel, MotionPreloadStrategy } from 'pixi-live2d-display-advanced/cubism4'
import { haruConfig, type Live2DModelConfig } from './live2dConfig'

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
  { config = haruConfig, muted = false, onLine, onReady },
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
      void modelRef.current?.expression(config.expressions[index] ?? index)
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

    const layout = () => {
      if (!model) {
        return
      }
      const { width, height } = app.screen
      // Scale from the model's own height so the framing survives a model swap.
      const scale = (height * config.heightRatio) / model.internalModel.height
      model.scale.set(scale)
      model.position.set(width * config.position.x, height * config.position.y)
    }

    const pickLine = () => config.voiceLines[Math.floor(Math.random() * config.voiceLines.length)]

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
      if (!model) {
        return null
      }
      const line = pickLine()
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
        loaded.anchor.set(config.anchor.x, config.anchor.y)
        loaded.eventMode = 'static'
        loaded.cursor = 'pointer'

        // HitAreas are named Head/Body while the motion group is TapBody, so the
        // default hit-to-motion mapping finds nothing -- wire it up by hand.
        loaded.on('hit', () => {
          playLine()
        })

        app.stage.addChild(loaded)
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

