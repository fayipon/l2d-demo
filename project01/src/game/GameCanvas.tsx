import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { ArenaScene, ARENA_HEIGHT, ARENA_WIDTH } from './scenes/ArenaScene'

/**
 * Owns one Phaser.Game for as long as it is mounted.
 *
 * Phaser and Live2D never share a WebGL context here, and never share a screen
 * -- the lobby routes are React plus the Pixi/Live2D canvas, the battle route
 * is this. Integrating Live2D into Phaser would mean re-implementing what
 * pixi-live2d-display does for Pixi, against a renderer that caches GL state
 * aggressively; keeping them on separate routes costs nothing because they are
 * never visible at the same time.
 *
 * The same rule as the Live2D stage applies to what goes inside: game state
 * belongs in the scene, not in React. React mounts this and gets out of the
 * way -- a re-render here would tear down the whole game.
 */
export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: ARENA_WIDTH,
      height: ARENA_HEIGHT,
      backgroundColor: '#0a0510',
      scale: {
        // Same letterboxing the lobby gets from CSS, done by Phaser: the world
        // is a fixed 1280x720 and the canvas is fitted into whatever space the
        // host has, so nothing in the game needs to know the viewport size.
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      // Sharp pixels when the canvas is scaled up, and no smoothing surprises
      // once there is pixel art in here.
      pixelArt: false,
      scene: [ArenaScene],
    })

    return () => {
      // true removes the canvas from the DOM. This matters more than it looks:
      // browsers cap how many live WebGL contexts a page may hold, so routing
      // between lobby and battle without tearing down would eventually get the
      // oldest context killed out from under a running game.
      //
      // Phaser defers the teardown until the current frame finishes, so under
      // StrictMode's double-mount the outgoing game outlives the incoming one
      // by a frame. That is safe -- each game removes its own canvas, by
      // reference, not by clearing the parent -- but it is why you briefly see
      // two canvases in the inspector in development.
      game.destroy(true, false)
    }
  }, [])

  return <div className="game-host" ref={hostRef} />
}
