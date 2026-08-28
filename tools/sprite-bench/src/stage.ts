import Phaser from 'phaser'
import { ARENA } from './game'
import type { Box } from './sheet'

/**
 * The playback half, run through the real Phaser.
 *
 * A `requestAnimationFrame` loop over an array of boxes would be twenty lines
 * and would answer a different question. What the game does is register frames
 * on a texture, build an animation from them and let the animation manager
 * decide which frame is showing at a given millisecond -- including how it
 * rounds a frame rate that does not divide the display's, and what `repeat: 0`
 * does on the last frame. Those are exactly the behaviours a bench is asked
 * about, so the bench pays the 1.3 MB and uses the same manager.
 *
 * Frames are registered with `Texture.add(name, 0, x, y, w, h)` rather than
 * with `load.spritesheet`. That is the one thing here the game does not do,
 * and it is deliberate: `load.spritesheet` can only cut a uniform grid, and
 * half this tool's purpose is to play sheets that have no uniform grid. Boxes
 * measured off the image become frames directly, ragged or not.
 *
 * Two sprites, always:
 *
 *   NATIVE  one texture pixel to one canvas pixel, for judging the drawing.
 *   ARENA   scaled to ARENA.displayHeight, which is how big it will actually
 *           be. Art is drawn and reviewed at four times this size, and a sheet
 *           that reads beautifully at 128 px can be mush at 64.
 */

const TEXTURE_KEY = 'sheet'
const ANIM_PREFIX = 'bench-'

export interface StageRow {
  name: string
  boxes: Box[]
}

export type Anchor = 'centre' | 'feet'

export interface PlayOptions {
  frameRate: number
  repeat: number
  anchor: Anchor
}

/** Reported back for the frame counter, so the panel can say which frame of
 *  which row is on screen without polling Phaser from the DOM side. */
export type FrameReport = (row: number, frame: number, total: number, playing: boolean) => void

class BenchScene extends Phaser.Scene {
  private native!: Phaser.GameObjects.Sprite
  private arena!: Phaser.GameObjects.Sprite
  private rows: StageRow[] = []
  /** The animation keys this scene registered. The manager is global and
   *  outlives a sheet, so they have to be taken back by name before the next
   *  sheet registers its own -- and Phaser 4 keeps its key map protected, so
   *  there is nothing to enumerate after the fact. */
  private registered: string[] = []
  private current = -1
  private report: FrameReport | null = null
  /** The height one frame is considered to be, for the arena scale. Uniform
   *  sheets use their cell height, which is what `ArenaScene` divides by;
   *  ragged sheets have no cell, so the tallest frame stands in for one. */
  private reference = 1

  create(): void {
    const { width, height } = this.scale
    this.native = this.add.sprite(width * 0.28, height * 0.55, '__DEFAULT')
    this.arena = this.add.sprite(width * 0.72, height * 0.55, '__DEFAULT')
    this.add
      .text(width * 0.28, height - 18, 'native', { fontFamily: 'monospace', fontSize: '12px', color: '#8b93a7' })
      .setOrigin(0.5)
    this.add
      .text(width * 0.72, height - 18, `arena ${ARENA.displayHeight}px`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8b93a7',
      })
      .setOrigin(0.5)
  }

  setSheet(image: HTMLImageElement, rows: StageRow[], reference: number): void {
    this.rows = rows
    this.reference = Math.max(1, reference)
    this.current = -1

    for (const key of this.registered) {
      this.anims.remove(key)
    }
    this.registered = []
    if (this.textures.exists(TEXTURE_KEY)) {
      this.textures.remove(TEXTURE_KEY)
    }
    const texture = this.textures.addImage(TEXTURE_KEY, image)
    if (!texture) {
      return
    }
    rows.forEach((row, r) => {
      row.boxes.forEach((box, i) => {
        texture.add(`${r}_${i}`, 0, box.x, box.y, box.w, box.h)
      })
      const key = `${ANIM_PREFIX}${r}`
      this.registered.push(key)
      this.anims.create({
        key,
        frames: row.boxes.map((_, i) => ({ key: TEXTURE_KEY, frame: `${r}_${i}` })),
        frameRate: 8,
        repeat: -1,
      })
    })
    if (rows.length > 0) {
      this.show(0, { frameRate: 8, repeat: -1, anchor: 'centre' })
    }
  }

  show(row: number, options: PlayOptions): void {
    const spec = this.rows[row]
    if (!spec || spec.boxes.length === 0) {
      return
    }
    this.current = row
    /* Origin first: switching it after `play` leaves the first frame drawn
       from the old one for a tick, which looks exactly like a jittery sheet
       and would be blamed on the art. */
    const originY = options.anchor === 'feet' ? 1 : 0.5
    for (const sprite of [this.native, this.arena]) {
      sprite.setOrigin(0.5, originY)
      sprite.setTexture(TEXTURE_KEY, `${row}_0`)
      sprite.play({ key: `${ANIM_PREFIX}${row}`, frameRate: options.frameRate, repeat: options.repeat })
    }
    this.native.setScale(1)
    this.arena.setScale(ARENA.displayHeight / this.reference)
  }

  stop(): void {
    this.native.anims.stop()
    this.arena.anims.stop()
  }

  resume(options: PlayOptions): void {
    if (this.current >= 0) {
      this.show(this.current, options)
    }
  }

  onFrame(report: FrameReport): void {
    this.report = report
  }

  update(): void {
    if (!this.report || this.current < 0) {
      return
    }
    const anim = this.native.anims
    const total = this.rows[this.current]?.boxes.length ?? 0
    this.report(this.current, anim.currentFrame ? anim.currentFrame.index : 0, total, anim.isPlaying)
  }
}

export class Stage {
  private game: Phaser.Game
  private scene: BenchScene

  constructor(host: HTMLElement, width: number, height: number) {
    this.scene = new BenchScene()
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width,
      height,
      /* The page draws the checkerboard, not the canvas. A sheet is judged on
         what its edges do against a background, and a background baked into
         the renderer would be one more thing to disbelieve. */
      transparent: true,
      /* Off, matching project01. The game's art is drawn, not pixel art, and a
         bench that snapped to nearest-neighbour would show crisper edges than
         the arena does. */
      pixelArt: false,
      scene: [this.scene],
    })
  }

  setSheet(image: HTMLImageElement, rows: StageRow[], reference: number): void {
    /* The scene may not have run `create` yet on the first sheet -- Phaser
       boots asynchronously. Queueing on the scene's own ready event is more
       code than waiting for the next tick and no more correct. */
    const apply = () => this.scene.setSheet(image, rows, reference)
    if (this.scene.sys.isActive()) {
      apply()
    } else {
      this.scene.events.once(Phaser.Scenes.Events.CREATE, apply)
    }
  }

  show(row: number, options: PlayOptions): void {
    this.scene.show(row, options)
  }

  stop(): void {
    this.scene.stop()
  }

  resume(options: PlayOptions): void {
    this.scene.resume(options)
  }

  onFrame(report: FrameReport): void {
    this.scene.onFrame(report)
  }

  destroy(): void {
    this.game.destroy(true)
  }
}
