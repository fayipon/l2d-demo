import { useEffect, useRef } from 'react'
import { visionRadius } from '../game/data/content'
import { WORLD_HEIGHT, WORLD_WIDTH } from '../game/sim/world'
import { useRunSnapshot } from '../game/runStore'

/**
 * The minimap.
 *
 * One canvas in the DOM, not a Graphics in the scene, which reverses what the
 * plan said. The plan's argument was against hundreds of DOM *nodes* redrawn
 * every frame, and that argument is right -- but it does not reach a single
 * canvas element, which has one node and draws its dots with fillRect, which
 * is the thing canvas exists for. Three reasons to prefer it here:
 *
 * It lands in the HUD's coordinate system. Drawn in the scene it would sit at
 * the corner of the letterboxed arena while the objectives panel it has to
 * hang above sits at the corner of the window. They coincide at 16:9 and
 * visibly disagree at anything else, and the mock stacks the two.
 *
 * The frame around it is CSS. A circular plate with a rim, a header and a
 * title is a few declarations here and a pile of arc-drawing in Graphics.
 *
 * And it costs the arena nothing. No scrollFactor to get right, no depth to
 * keep above the vignette, no interaction with the culling.
 *
 * What it does cost is the feed: the scene packs live positions into two
 * reused buffers on each publish, fifteen times a second. That is a flat loop
 * over the pools and no allocation -- see `pack` in the scene.
 *
 * Not limited by the vision stat, deliberately. Vision already takes the
 * screen away; taking the map as well would make every point of it a
 * catastrophe rather than a trade, and a minimap that only shows what is
 * already on screen is decoration.
 */

/** Side of the backing bitmap. Fixed rather than measured: the panel is a
 *  fixed size in the layout, and a resize observer for a decoration that never
 *  changes shape is machinery for nothing. */
const SIZE = 168

const COLOURS = {
  ground: '#0c0713',
  grid: 'rgba(255, 255, 255, 0.05)',
  edge: 'rgba(244, 67, 108, 0.35)',
  enemy: '#f4436c',
  loot: '#ffc74a',
  player: '#ffffff',
  sight: 'rgba(255, 255, 255, 0.22)',
}

/** Dot radii, in bitmap pixels. An enemy has to read in a crowd of five
 *  hundred without the crowd becoming one blob, so it is small and opaque
 *  rather than large and translucent. */
const ENEMY_DOT = 1.6
const LOOT_DOT = 1.3
const PLAYER_ARROW = 6

export function Minimap() {
  const run = useRunSnapshot()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  /*
   * Drawn in an effect on every publish rather than from the render itself.
   * The buffers behind `run.radar` are reused in place by the scene, so there
   * is nothing here for React to diff -- what makes the redraw happen is that
   * the snapshot object around them is new each time.
   */
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) {
      return
    }

    ctx.clearRect(0, 0, SIZE, SIZE)

    /* The world is 16:9 and the map is a circle, so the world is fitted to the
       circle's width and centred vertically. Fitting to the diagonal instead
       would waste most of the plate on nothing. */
    const scale = SIZE / WORLD_WIDTH
    const worldH = WORLD_HEIGHT * scale
    const top = (SIZE - worldH) / 2
    const at = (x: number, y: number) => [x * scale, top + y * scale] as const

    ctx.fillStyle = COLOURS.ground
    ctx.fillRect(0, top, SIZE, worldH)

    /* Enough grid to read movement against, and no more: the arena floor rules
       every 64px, which at this scale would be fifty lines across 168 pixels
       and a grey wash. Every tenth one is a landmark instead. */
    ctx.strokeStyle = COLOURS.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= WORLD_WIDTH; x += 640) {
      ctx.moveTo(x * scale, top)
      ctx.lineTo(x * scale, top + worldH)
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += 640) {
      ctx.moveTo(0, top + y * scale)
      ctx.lineTo(SIZE, top + y * scale)
    }
    ctx.stroke()

    ctx.strokeStyle = COLOURS.edge
    ctx.strokeRect(0.5, top + 0.5, SIZE - 1, worldH - 1)

    /* Drops before enemies, so a coin under a body does not cover it: what the
       map is for during a wave is where the crowd is, and during the break it
       is where the floor still has something on it -- and the crowd is gone by
       then anyway. */
    ctx.fillStyle = COLOURS.loot
    for (let i = 0; i < run.lootCount; i++) {
      const [x, y] = at(run.loot[i * 2], run.loot[i * 2 + 1])
      ctx.fillRect(x - LOOT_DOT, y - LOOT_DOT, LOOT_DOT * 2, LOOT_DOT * 2)
    }

    /* Squares, not circles. At this size a filled arc costs a path per dot and
       lands on the same two or three pixels a rect does. */
    ctx.fillStyle = COLOURS.enemy
    for (let i = 0; i < run.radarCount; i++) {
      const [x, y] = at(run.radar[i * 2], run.radar[i * 2 + 1])
      ctx.fillRect(x - ENEMY_DOT, y - ENEMY_DOT, ENEMY_DOT * 2, ENEMY_DOT * 2)
    }

    const [px, py] = at(run.x, run.y)

    /* How far the player can see, as a ring. Two jobs: it says where the dots
       stop being a rumour and start being a fight, and it is what makes the
       vision stat legible on the map at all -- the dots themselves are not
       filtered by it. */
    ctx.strokeStyle = COLOURS.sight
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(px, py, visionRadius(run.stats) * scale, 0, Math.PI * 2)
    ctx.stroke()

    /* The player, as an arrow pointing where they were last going. Outlined
       in the ground colour rather than left white: at five pixels among three
       hundred red dots, an unoutlined arrow is just another dot. */
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(run.facing)
    ctx.beginPath()
    ctx.moveTo(PLAYER_ARROW, 0)
    ctx.lineTo(-PLAYER_ARROW * 0.7, PLAYER_ARROW * 0.72)
    ctx.lineTo(-PLAYER_ARROW * 0.3, 0)
    ctx.lineTo(-PLAYER_ARROW * 0.7, -PLAYER_ARROW * 0.72)
    ctx.closePath()
    ctx.fillStyle = COLOURS.player
    ctx.fill()
    ctx.lineWidth = 1.6
    ctx.strokeStyle = COLOURS.ground
    ctx.stroke()
    ctx.restore()
  }, [run])

  return (
    <div className="minimap">
      <p className="minimap-title">戰場</p>
      <div className="minimap-plate">
        <canvas ref={canvasRef} width={SIZE} height={SIZE} />
      </div>
    </div>
  )
}
