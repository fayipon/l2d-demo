import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import {
  ArenaScene,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './scenes/ArenaScene'
import { resetRun } from './runStore'
import { DEFAULT_LOADOUT, type ArenaLoadout } from './data/loadouts'

interface GameCanvasProps {
  /** The selected character's arena traits. Read once, at mount: a run does
   *  not change character halfway through, and re-reading it would mean
   *  re-creating the game. */
  loadout?: ArenaLoadout
  /** Who is fighting, for the drawn art in game/data/actors. Read once at
   *  mount for the same reason. */
  characterId?: string
}

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
export function GameCanvas({ loadout = DEFAULT_LOADOUT, characterId = '' }: GameCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  /* Held in a ref so the effect below can stay keyed on nothing: a prop in the
     dependency array would tear down and rebuild the whole game the first time
     the parent re-rendered with a fresh object. */
  const loadoutRef = useRef(loadout)
  const characterRef = useRef(characterId)

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
      backgroundColor: '#0a0510',
      scale: {
        // Same letterboxing the lobby gets from CSS, done by Phaser: the
        // window onto the world is a fixed 1280x720 and the canvas is fitted
        // into whatever space the host has, so nothing in the game needs to
        // know the size of the browser viewport.
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      // Sharp pixels when the canvas is scaled up, and no smoothing surprises
      // once there is pixel art in here.
      pixelArt: false,
      // An instance, not the class, so the loadout can be handed to it.
      scene: [new ArenaScene(loadoutRef.current, characterRef.current)],
    })

    if (import.meta.env.DEV) {
      /*
       * Dev-only handle on the running game, so the arena can be poked at from
       * the console or a headless browser -- jumping to a late wave to see what
       * six hundred enemies do to the frame time is not something you can wait
       * out by playing. Stripped from the production bundle by the guard.
       */
      const hooks = window as unknown as {
        __arena?: Phaser.Game
        __arenaWorld?: { width: number; height: number }
      }
      hooks.__arena = game
      // The size of the map, which nothing on the page can otherwise find out:
      // the scene is told it, Phaser is not. scripts/bench.mjs needs it to
      // scatter a crowd across the world rather than across the window.
      hooks.__arenaWorld = { width: WORLD_WIDTH, height: WORLD_HEIGHT }
    }

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
      // Otherwise the last run's numbers flash back up on the next visit,
      // before the new scene has published anything.
      resetRun()
    }
  }, [])

  return <div className="game-host" ref={hostRef} />
}
