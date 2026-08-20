import { useEffect, useRef } from 'react'
import { Application, Graphics, type Ticker } from 'pixi.js'

export function PixiCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    // StrictMode remounts run this effect twice, and `app.init()` is async:
    // the cleanup may fire while init is still pending. `initialized` makes
    // sure destroy happens exactly once, and never before init resolves.
    let disposed = false
    let initialized = false
    const app = new Application()
    let tickerCallback: ((ticker: Ticker) => void) | null = null

    const destroyApp = () => {
      if (tickerCallback) {
        app.ticker.remove(tickerCallback)
        tickerCallback = null
      }

      app.destroy(true, {
        children: true,
        texture: true,
        textureSource: true,
      })
    }

    const init = async () => {
      await app.init({
        background: '#0b1020',
        antialias: true,
        resizeTo: container,
      })

      initialized = true

      if (disposed) {
        destroyApp()
        return
      }

      container.appendChild(app.canvas)

      const orb = new Graphics().circle(0, 0, 48).fill('#34d399')
      orb.x = 120
      orb.y = 120
      app.stage.addChild(orb)

      // Pixi v8 hands the Ticker itself to the callback, not a number.
      let elapsed = 0
      tickerCallback = (ticker) => {
        elapsed += ticker.deltaTime
        orb.x = 120 + Math.sin(elapsed / 40) * 70
        orb.y = 120 + Math.cos(elapsed / 50) * 45
      }
      app.ticker.add(tickerCallback)
    }

    void init()

    return () => {
      disposed = true

      if (initialized) {
        destroyApp()
      }
    }
  }, [])

  return <div className="pixi-canvas" ref={containerRef} aria-label="Pixi canvas host" />
}
