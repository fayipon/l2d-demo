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
 * Bounded by the vision stat, which reverses what this file used to say.
 *
 * The old argument was that vision already takes the screen away, and taking
 * the map with it would make every point of the stat a catastrophe rather than
 * a trade. What that produced was a whole-world map that never changed -- a
 * picture of the arena, not an instrument -- and a stat whose only expression
 * was the dark closing in.
 *
 * So the map is now a window on the world, `VISION_MARGIN` wider than what the
 * player can actually see, centred on them and sliding under them. Vision is
 * the one thing that changes its size: buy some and the window opens, and the
 * ground and the crowd that were off it are on it. The margin is what keeps it
 * from being decoration -- a map showing exactly the lit circle would only ever
 * repeat the screen, and the ring drawn on it is the line between the two.
 */

/** Side of the backing bitmap. Fixed rather than measured: the panel is a
 *  fixed size in the layout, and a resize observer for a decoration that never
 *  changes shape is machinery for nothing. */
const SIZE = 168

/*
 * Light ground on a dark field, which is the other way round from how this
 * started.
 *
 * A near-black map inside a near-black HUD on a near-black arena was three
 * dark things stacked, and the dots were the only thing on it with any
 * contrast -- which made the map a scatter of dots rather than a picture of a
 * place. Filled pale, the arena reads as a shape first: where the ground is,
 * then what is standing on it.
 *
 * It also fixes the dots. Red on near-black is red on red; red on grey is red.
 */
const COLOURS = {
  /* Inside the frame but outside the arena. Not black -- the frame is drawn
     over a hole, and a black field would put a hard square behind ornament
     that is meant to have the screen showing through it. */
  field: '#171320',
  ground: '#84848f',
  groundEdge: '#a6a6b2',
  enemy: '#ff2f43',
  loot: '#ffc74a',
  player: '#ffffff',
  playerEdge: '#12101a',
  sight: 'rgba(20, 16, 28, 0.42)',
}

/** Dot radii, in bitmap pixels. An enemy has to read in a crowd of five
 *  hundred without the crowd becoming one blob, so it is small and opaque
 *  rather than large and translucent. */
const ENEMY_DOT = 2.1
const LOOT_DOT = 1.5
const PLAYER_ARROW = 7

/**
 * How much wider the window is than what the player can actually see.
 *
 * The whole value of the map is the band between the two. At 1.0 it would show
 * exactly the lit circle and be a smaller copy of the screen; much above 1.5
 * and the lit circle is a dot in the middle of it and vision stops reading as
 * the thing that sizes it.
 */
const VISION_MARGIN = 1.4

interface MinimapProps {
  /** The scene's number and name, printed above the ring.
   *
   *  They used to sit over the wave clock, which put two unrelated answers in
   *  one column -- where this is, and how far into it you are. The map of a
   *  place is the thing on the HUD that should be labelled with the place. */
  code: string
  name: string
}

export function Minimap({ code, name }: MinimapProps) {
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

    /*
     * A window on the world, not the world. Its half-width is what the player
     * can see times VISION_MARGIN, so the scale is the vision stat and nothing
     * else -- buy vision and the window opens.
     *
     * Everything is placed relative to the player, who is always at the centre
     * of both the map and the screen. That is the same fact the camera works
     * from, which is why neither needs to know about the other.
     */
    const sight = visionRadius(run.stats)
    const half = sight * VISION_MARGIN
    const scale = SIZE / (half * 2)
    const at = (x: number, y: number) =>
      [(x - run.x) * scale + SIZE / 2, (y - run.y) * scale + SIZE / 2] as const

    ctx.fillStyle = COLOURS.field
    ctx.fillRect(0, 0, SIZE, SIZE)

    /* The arena, as far as it reaches into the window. In the middle of the map
       that is the whole canvas and there is no edge to see; near a wall the
       ground stops and the field beyond it is the outside -- which is the only
       thing on this map that says which way is out.

       No grid on it. The floor rules every 64px, which at this scale is a grey
       wash; every tenth was drawn for a while and read as graph paper. Flat
       ground with a lit edge says the same thing and leaves the contrast for
       the things that move. */
    const [gx, gy] = at(0, 0)
    ctx.fillStyle = COLOURS.ground
    ctx.fillRect(gx, gy, WORLD_WIDTH * scale, WORLD_HEIGHT * scale)
    ctx.strokeStyle = COLOURS.groundEdge
    ctx.lineWidth = 1
    ctx.strokeRect(gx + 0.5, gy + 0.5, WORLD_WIDTH * scale - 1, WORLD_HEIGHT * scale - 1)

    /* Drops before enemies, so a coin under a body does not cover it: what the
       map is for during a wave is where the crowd is, and during the break it
       is where the floor still has something on it -- and the crowd is gone by
       then anyway. */
    ctx.fillStyle = COLOURS.loot
    for (let i = 0; i < run.lootCount; i++) {
      const [x, y] = at(run.loot[i * 2], run.loot[i * 2 + 1])
      ctx.fillRect(x - LOOT_DOT, y - LOOT_DOT, LOOT_DOT * 2, LOOT_DOT * 2)
    }

    /* Circles now, and all of them in one path: an arc per dot is only
       expensive if each one is its own path and its own fill. Squares were the
       right call while the dots were two pixels across on black; at this size
       against pale ground a square reads as a square. */
    ctx.fillStyle = COLOURS.enemy
    ctx.beginPath()
    for (let i = 0; i < run.radarCount; i++) {
      const [x, y] = at(run.radar[i * 2], run.radar[i * 2 + 1])
      ctx.moveTo(x + ENEMY_DOT, y)
      ctx.arc(x, y, ENEMY_DOT, 0, Math.PI * 2)
    }
    ctx.fill()

    /* The player is the centre of the window by construction, so this is not
       a lookup -- it is where the map is drawn from. */
    const px = SIZE / 2
    const py = SIZE / 2

    /* The edge of what is actually on screen. It lands in the same place every
       frame, because the window is that circle times a constant -- which is the
       point of it: inside is the fight, the ring of map outside it is the
       warning, and the two keep the same proportion however much vision is
       bought. */
    ctx.strokeStyle = COLOURS.sight
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(px, py, sight * scale, 0, Math.PI * 2)
    ctx.stroke()

    /* The player, as an arrow pointing where they were last going. Outlined
       dark rather than left plain white: on pale ground a white arrow is a
       hole, and among three hundred red dots it has to be the one thing the
       eye lands on first. */
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
    ctx.strokeStyle = COLOURS.playerEdge
    ctx.stroke()
    ctx.restore()
  }, [run])

  return (
    <div className="minimap">
      <p className="minimap-title">
        <span className="scene-code">SCENE {code}</span>
        <span className="scene-name">{name}</span>
      </p>
      <div className="minimap-plate uk-ring">
        <canvas ref={canvasRef} width={SIZE} height={SIZE} />
      </div>
    </div>
  )
}
