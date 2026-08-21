import Phaser from 'phaser'
import { ARENA_HEIGHT, ARENA_WIDTH, STEP_SECONDS, World } from '../sim/world'
import { ENEMY_KINDS, WEAPONS } from '../data/content'
import { ATLAS_KEY, buildAtlas } from '../view/atlas'
import { consumeRestart, publishRun } from '../runStore'

export { ARENA_WIDTH, ARENA_HEIGHT }

/** Never run more than this many simulation steps for one rendered frame. */
const MAX_STEPS_PER_FRAME = 5

/** Ignore anything longer than this between frames -- a backgrounded tab hands
 *  back a delta of seconds, and catching up on it is neither possible nor
 *  wanted. */
const MAX_FRAME_MS = 250

/** How often the HUD snapshot goes out. */
const PUBLISH_MS = 66

const STEP_MS = STEP_SECONDS * 1000
const PLAYER_TINT = 0xffe8f2
const FLASH_TINT = 0xffffff
const PICKUP_TINT = 0x4fc3ff

/**
 * The arena.
 *
 * Everything here is view and plumbing: the simulation is in sim/world.ts and
 * does not know Phaser exists. This class steps it at a fixed rate, then moves
 * one sprite per live entity to match.
 *
 * There is no Arcade Physics body anywhere, and there must not be. A survivors
 * game runs hundreds of enemies at once; a physics body each, with Phaser's
 * own broadphase over all of them, is exactly the cost the uniform grid in the
 * simulation exists to avoid paying twice.
 */
export class ArenaScene extends Phaser.Scene {
  private world!: World
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private restartKey!: Phaser.Input.Keyboard.Key

  private playerSprite!: Phaser.GameObjects.Sprite
  private enemySprites: Phaser.GameObjects.Sprite[] = []
  private projectileSprites: Phaser.GameObjects.Sprite[] = []
  private pickupSprites: Phaser.GameObjects.Sprite[] = []
  /* Last frame and tint pushed to each slot. A pool slot is reused by whatever
     spawns next, so the texture and colour only need touching when the slot
     changes hands or an enemy starts flashing -- and setTexture in particular
     is not something to call 700 times a frame for no reason. */
  private enemyFrames = new Int8Array(0)
  private enemyTints = new Int32Array(0)
  private projectileFrames = new Int8Array(0)

  private accumulator = 0
  private publishTimer = 0
  /** Movement axis for the current frame. Not named `input`: Scene.input is
   *  Phaser's own plugin, and a field of that name would shadow it. */
  private readonly moveInput = { x: 0, y: 0 }

  constructor() {
    super('arena')
  }

  create(): void {
    buildAtlas(this)

    this.cameras.main.setBackgroundColor('#07030d')
    this.drawFloor()

    this.world = new World()

    // Created in paint order: depth sorting is off, so the order they are
    // added is the order they are drawn. Drops go under the crowd, shots and
    // the player over it.
    this.pickupSprites = this.makeSprites(this.world.pickups.capacity, 'material', PICKUP_TINT)
    this.enemySprites = this.makeSprites(this.world.enemies.capacity, 'grunt', 0xffffff)
    this.projectileSprites = this.makeSprites(this.world.projectiles.capacity, 'bullet', 0xffffff)
    this.enemyFrames = new Int8Array(this.enemySprites.length).fill(-1)
    this.enemyTints = new Int32Array(this.enemySprites.length).fill(-1)
    this.projectileFrames = new Int8Array(this.projectileSprites.length).fill(-1)

    this.playerSprite = this.add.sprite(this.world.player.x, this.world.player.y, ATLAS_KEY, 'player')
    this.playerSprite.setTint(PLAYER_TINT)

    const keyboard = this.requireKeyboard()
    this.keys = keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >
    this.restartKey = keyboard.addKey('R')

    this.accumulator = 0
    this.publishTimer = 0
  }

  update(_time: number, delta: number): void {
    const world = this.world

    // Consumed every frame, not just while dead, so a press that landed at
    // the wrong moment cannot sit in the flag and restart a live run later.
    const restartAsked = consumeRestart()
    if (world.status === 'dead' && (restartAsked || Phaser.Input.Keyboard.JustDown(this.restartKey))) {
      world.restart()
      this.accumulator = 0
    }

    this.readInput()

    /*
     * Fixed timestep. The renderer runs at whatever the display gives it; the
     * simulation always advances in equal 1/60 slices, with the remainder
     * carried in the accumulator.
     *
     * The step cap is the guard against a spiral of death: if a frame takes
     * long enough to owe more steps than we are willing to run, the leftover
     * is dropped rather than carried -- carrying it makes the next frame
     * slower still and the game never recovers.
     */
    this.accumulator += Math.min(delta, MAX_FRAME_MS)
    let steps = 0
    while (this.accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      world.step(this.moveInput)
      this.accumulator -= STEP_MS
      steps += 1
    }
    if (steps === MAX_STEPS_PER_FRAME) {
      this.accumulator = 0
    }

    if (world.shake > 0) {
      this.cameras.main.shake(140, Math.min(0.012, world.shake * 0.0009))
      world.shake = 0
    }

    this.syncSprites()

    this.publishTimer += delta
    if (this.publishTimer >= PUBLISH_MS) {
      this.publishTimer = 0
      this.publish()
    }
  }

  /* ---------- input ---------- */

  private readInput(): void {
    const keys = this.keys
    let x = 0
    let y = 0
    if (keys.A.isDown || keys.LEFT.isDown) {
      x -= 1
    }
    if (keys.D.isDown || keys.RIGHT.isDown) {
      x += 1
    }
    if (keys.W.isDown || keys.UP.isDown) {
      y -= 1
    }
    if (keys.S.isDown || keys.DOWN.isDown) {
      y += 1
    }

    // Normalised, or holding two keys would move you 41% faster on a diagonal.
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2
      y *= Math.SQRT1_2
    }
    this.moveInput.x = x
    this.moveInput.y = y
  }

  /* ---------- view ---------- */

  private syncSprites(): void {
    const world = this.world

    const pickups = world.pickups.items
    for (let i = 0; i < pickups.length; i++) {
      const drop = pickups[i]
      const sprite = this.pickupSprites[i]
      if (!drop.active) {
        sprite.visible = false
        continue
      }
      sprite.visible = true
      sprite.x = drop.x
      sprite.y = drop.y
      // Spins, so a field of drops does not read as a static texture.
      sprite.rotation = drop.age * 3.2
    }

    const enemies = world.enemies.items
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i]
      const sprite = this.enemySprites[i]
      if (!enemy.active) {
        sprite.visible = false
        this.enemyFrames[i] = -1
        continue
      }

      if (this.enemyFrames[i] !== enemy.kind) {
        this.enemyFrames[i] = enemy.kind
        sprite.setTexture(ATLAS_KEY, ENEMY_KINDS[enemy.kind].frame)
      }

      // The atlas shapes are white, so a hit flash is simply the absence of a
      // tint -- no second texture and no fill mode needed.
      const tint = enemy.flash > 0 ? FLASH_TINT : ENEMY_KINDS[enemy.kind].tint
      if (this.enemyTints[i] !== tint) {
        this.enemyTints[i] = tint
        sprite.setTint(tint)
      }

      sprite.visible = true
      sprite.x = enemy.x
      sprite.y = enemy.y
    }

    const shots = world.projectiles.items
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i]
      const sprite = this.projectileSprites[i]
      if (!shot.active) {
        sprite.visible = false
        this.projectileFrames[i] = -1
        continue
      }

      if (this.projectileFrames[i] !== shot.kind) {
        this.projectileFrames[i] = shot.kind
        sprite.setTexture(ATLAS_KEY, WEAPONS[shot.kind].frame)
        sprite.setTint(WEAPONS[shot.kind].tint)
      }

      sprite.visible = true
      sprite.x = shot.x
      sprite.y = shot.y
      sprite.rotation = Math.atan2(shot.vy, shot.vx)
    }

    const player = world.player
    this.playerSprite.x = player.x
    this.playerSprite.y = player.y
    // Blinks through the invulnerability window, which is the only signal that
    // a second hit did not just fail to register.
    this.playerSprite.visible = player.invuln <= 0 || Math.floor(player.invuln * 20) % 2 === 0
  }

  private makeSprites(count: number, frame: string, tint: number): Phaser.GameObjects.Sprite[] {
    const sprites: Phaser.GameObjects.Sprite[] = []
    for (let i = 0; i < count; i++) {
      const sprite = this.add.sprite(0, 0, ATLAS_KEY, frame)
      sprite.visible = false
      sprite.setTint(tint)
      sprites.push(sprite)
    }
    return sprites
  }

  private drawFloor(): void {
    const floor = this.add.graphics()
    floor.fillStyle(0x0b0512, 1)
    floor.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT)
    floor.lineStyle(1, 0x1d0f28, 1)
    for (let x = 0; x <= ARENA_WIDTH; x += 64) {
      floor.lineBetween(x, 0, x, ARENA_HEIGHT)
    }
    for (let y = 0; y <= ARENA_HEIGHT; y += 64) {
      floor.lineBetween(0, y, ARENA_WIDTH, y)
    }
    floor.lineStyle(3, 0xf4436c, 0.5)
    floor.strokeRect(1.5, 1.5, ARENA_WIDTH - 3, ARENA_HEIGHT - 3)
  }

  private publish(): void {
    const world = this.world
    const player = world.player
    publishRun({
      status: world.status,
      wave: world.wave,
      timeLeft: Math.max(0, world.status === 'break' ? world.breakTimeLeft : world.waveTimeLeft),
      hp: player.hp,
      maxHp: player.maxHp,
      level: player.level,
      xp: player.xp,
      xpToLevel: player.xpToLevel,
      materials: player.materials,
      kills: world.kills,
      enemies: world.enemies.used,
      fps: Math.round(this.game.loop.actualFps),
    })
  }

  /* Phaser types the keyboard plugin as possibly null, since a game can be
     built without it. It is always present in this config, and threading the
     null through every call site buys nothing. */
  private requireKeyboard(): Phaser.Input.Keyboard.KeyboardPlugin {
    const keyboard = this.input.keyboard
    if (!keyboard) {
      throw new Error('the arena needs the keyboard plugin')
    }
    return keyboard
  }
}
