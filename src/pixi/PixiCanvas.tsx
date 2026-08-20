import { useEffect, useRef } from 'react'
import { Application, Graphics } from 'pixi.js'

export function PixiCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    let disposed = false
    const app = new Application()
    let tickerCallback: ((time: unknown) => void) | null = null

    const init = async () => {
      await app.init({
        background: '#0b1020',
        antialias: true,
        resizeTo: container,
      })

      if (disposed) {
        app.destroy(true)
        return
      }

      container.appendChild(app.canvas)

      const orb = new Graphics().circle(0, 0, 48).fill('#34d399')
      orb.x = 120
      orb.y = 120
      app.stage.addChild(orb)

      tickerCallback = (time) => {
        const t = typeof time === 'number' ? time : 0
        orb.x = 120 + Math.sin(t / 40) * 70
        orb.y = 120 + Math.cos(t / 50) * 45
      }
      app.ticker.add(tickerCallback)
    }

    void init()

    return () => {
      disposed = true

      if (tickerCallback) {
        app.ticker.remove(tickerCallback)
      }

      app.destroy(true, {
        children: true,
        texture: true,
        textureSource: true,
      })
    }
  }, [])

  return <div className="pixi-canvas" ref={containerRef} aria-label="Pixi canvas host" />
}
