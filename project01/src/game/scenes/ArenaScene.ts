import Phaser from 'phaser'

/** Design resolution. The canvas is scaled to fit; the world stays this size. */
export const ARENA_WIDTH = 1280
export const ARENA_HEIGHT = 720

/**
 * Placeholder arena.
 *
 * Deliberately does nothing but prove the scene is alive and being ticked --
 * this commit is the mount, teardown and routing, not the game. Gameplay goes
 * on top of this: a fixed-timestep step separate from `update`, entities in
 * plain arrays rather than Phaser display objects one-per-enemy, and a uniform
 * grid for broadphase.
 */
export class ArenaScene extends Phaser.Scene {
  private elapsed = 0
  private readout?: Phaser.GameObjects.Text

  constructor() {
    super('arena')
  }

  create(): void {
    const { width, height } = this.scale.gameSize

    this.cameras.main.setBackgroundColor('#0a0510')

    // A grid, so it is obvious at a glance that the renderer is running and
    // where the world's origin is.
    const grid = this.add.graphics()
    grid.lineStyle(1, 0x2a1730, 1)
    for (let x = 0; x <= width; x += 64) {
      grid.lineBetween(x, 0, x, height)
    }
    for (let y = 0; y <= height; y += 64) {
      grid.lineBetween(0, y, width, y)
    }

    this.add
      .text(width / 2, height / 2 - 40, 'ARENA', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '64px',
        color: '#ff2b3d',
      })
      .setOrigin(0.5)

    this.readout = this.add
      .text(width / 2, height / 2 + 36, '', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '20px',
        color: '#c8aaff',
      })
      .setOrigin(0.5)
  }

  update(_time: number, delta: number): void {
    this.elapsed += delta
    this.readout?.setText(
      `場景運作中 · ${(this.elapsed / 1000).toFixed(1)}s · ${Math.round(this.game.loop.actualFps)} FPS`,
    )
  }
}
