import Phaser from 'phaser'
import { ARRIVAL_SECONDS, STEP_SECONDS, WORLD_HEIGHT, WORLD_WIDTH, World } from '../sim/world'
import { ENEMY_KINDS, VISION_FADE, WEAPONS, visionRadius } from '../data/content'
import {
  ATLAS_KEY,
  FONT_KEY,
  FONT_URL,
  VIGNETTE_KEY,
  buildAtlas,
  registerDamageFont,
  buildVignette,
} from '../view/atlas'
import { consumeRestart, consumeUpgrade, drainCommands, publishRun } from '../runStore'
import { rerollPrice } from '../data/shop'
import { DEFAULT_LOADOUT, type ArenaLoadout } from '../data/loadouts'
import { actorFor, type ActorAnim, type ActorSheet } from '../data/actors'

/**
 * The window onto the world, and the size the canvas is scaled to fit.
 *
 * The world is WORLD_WIDTH x WORLD_HEIGHT and much larger than this. Keeping
 * the two apart is what the camera needs: Phaser is told the size of the
 * window and nothing about the map, and the simulation is told the size of the
 * map and nothing about the window.
 */
export const VIEW_WIDTH = 1280
export const VIEW_HEIGHT = 720

export { WORLD_WIDTH, WORLD_HEIGHT }

/**
 * Copies the live entities' positions into a flat buffer, and returns how many
 * landed there.
 *
 * Flat pairs rather than objects because the only consumer is a canvas loop,
 * and a buffer that is written in place fifteen times a second must not be
 * allocating an array of points each time to do it.
 */
function pack(items: readonly { active: boolean; x: number; y: number }[], into: Float32Array): number {
  let count = 0
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.active) {
      into[count * 2] = item.x
      into[count * 2 + 1] = item.y
      count++
    }
  }
  return count
}

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
/** A dodged hit tints the player instead of hurting them, which is the only
 *  way to tell a dodge from a miss. */
const DODGE_TINT = 0x4fe6ff
const FLASH_TINT = 0xffffff
/** Crits flash gold rather than white, so a big hit is visible in a crowd
 *  without a damage-number pool. */
const CRIT_TINT = 0xffd166
/** Coins are gold, and the atlas frame is a disc -- the cyan diamond it used
 *  to be read as a gem, which is a different currency in the lobby. */
const PICKUP_TINT = 0xffc74a

/**
 * Floating damage numbers.
 *
 * A ring rather than a free list: spawning always takes the oldest slot, so
 * the count is capped by construction and there is no bookkeeping. Overwriting
 * a number that is still fading is the correct behaviour anyway -- at that
 * rate it was unreadable.
 */
const NUMBER_CAPACITY = 56
const NUMBER_LIFE = 0.62
const NUMBER_RISE = -74
const NUMBER_GRAVITY = 128
/**
 * How tall a damage number is drawn, in world pixels.
 *
 * The one number to turn. The font is exported at 64 and drawn at this, so the
 * scale is always down -- an upscaled painted glyph looks like a photograph of
 * a glyph rather than a glyph. Crits get NUMBER_CRIT_SCALE of it.
 */
const NUMBER_SIZE = 26
const NUMBER_CRIT_SCALE = 1.45
/* The glyphs are painted red already. Normal hits are left alone, and crits
   are lifted towards gold -- a tint multiplies, so there is not much room to
   move a red one, but the metallic highlights take it. */
const NUMBER_TINT = 0xffffff
const NUMBER_CRIT_TINT = 0xffcf7a

/**
 * Enemy health bars.
 *
 * Only drawn for an enemy that has actually been hit. Most of a crowd is at
 * full health at any moment, so hiding those costs nothing to check and saves
 * the screen from a thousand identical full bars -- which is also the more
 * readable choice: a visible bar means "this one is worth finishing".
 *
 * The atlas frame is 16x4 and every bar is that frame scaled, so all of this
 * stays inside the one batch.
 */
const BAR_FRAME_WIDTH = 16
const BAR_FRAME_HEIGHT = 4
const BAR_HEIGHT = 3.5
/** Bar width as a multiple of the enemy's radius. */
const BAR_SPAN = 2.1
/** Gap between the top of the enemy and the bar. */
const BAR_LIFT = 7
/* Light enough to read against the floor. At near-black the missing portion
   of a bar was invisible and the bar carried no information at all. */
const BAR_TRACK_TINT = 0x53293c
/** Fill colour by remaining fraction, healthiest first. */
const BAR_TINTS = [0x5ce6a0, 0xffc74a, 0xf4436c]

/**
 * How far past the window an entity is still given a sprite.
 *
 * Wide enough to cover the largest sprite's own half-width plus the health bar
 * that sits above it, so nothing is hidden while any part of it would still
 * have been on screen. Anything further out is not merely skipped -- its
 * sprite is hidden, which is the part that matters: `willRender` tests
 * visibility and camera filters and nothing else, so a sprite left visible at
 * a stale position off screen is still transformed and submitted with the
 * rest, and costs exactly what it did before.
 */
const CULL_MARGIN = 48

/**
 * The arrival telegraph.
 *
 * An enemy fades up over its arrival window while blinking, which is two
 * signals doing different jobs: the fade says "something is forming here" and
 * reads even in a crowd, and the blink says "not yet" -- a shape at a steady
 * low alpha just looks like a distant enemy.
 *
 * The blink is a square wave rather than a sine because a sine spends most of
 * its time in the middle, which is exactly where it stops looking like a
 * blink.
 */
const ARRIVAL_BLINKS_PER_SECOND = 7
/** How far down the blink pulls the fade, rather than to nothing: a shape that
 *  vanishes outright is easy to miss between two frames. */
const ARRIVAL_BLINK_FLOOR = 0.3

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
  private barTracks: Phaser.GameObjects.Sprite[] = []
  private barFills: Phaser.GameObjects.Sprite[] = []
  private barTints = new Int32Array(0)

  /**
   * The minimap's feed, filled in place on each publish.
   *
   * Allocated once at the pool's capacity and handed to the HUD by reference.
   * Fifteen times a second, a fresh pair of arrays would be 1400 floats of
   * garbage per publish for a canvas that reads them and forgets them.
   */
  private radar = new Float32Array(0)
  private loot = new Float32Array(0)
  /** Held from the last non-zero input, so a standing player keeps pointing
   *  where they were going rather than snapping to a default. */
  private facing = 0

  /** Drawn art for this character, or null for one who has none. */
  private readonly actor: ActorSheet | null
  /** What the player sprite is playing, so a pose that has not changed is not
   *  restarted from its first frame sixty times a second. */
  private actorAnim: ActorAnim = 'idle'
  /* Watched rather than pushed. The simulation reports what happened by
     counting it and the scene notices the count move; a callback per event
     would put a view concern inside the world. */
  private lastVolleys = 0
  private lastHits = 0
  private lastLevel = 0

  private vignette!: Phaser.GameObjects.Image
  /** The radius the vignette texture was baked at, so it is only redrawn when
   *  the stat actually moves rather than every frame. */
  private vignetteRadius = -1

  private numbers: {
    text: Phaser.GameObjects.BitmapText
    x: number
    y: number
    vy: number
    life: number
  }[] = []
  private numberCursor = 0

  private accumulator = 0
  private publishTimer = 0
  /* Last values published. A change in either forces a snapshot out at once
     rather than waiting up to 66ms -- an overlay that appears a frame late is
     an overlay that appears after the click that should have opened it. */
  private lastPending = 0
  private lastStatus = ''
  /** Movement axis for the current frame. Not named `input`: Scene.input is
   *  Phaser's own plugin, and a field of that name would shadow it. */
  private readonly moveInput = { x: 0, y: 0 }

  /**
   * The loadout is handed in rather than looked up, because the scene has no
   * business knowing there is a lobby. GameCanvas builds it from whichever
   * character is selected and passes an instance of this scene, which also
   * sidesteps the question of when a scene started by Phaser could read data
   * set after the game booted.
   */
  private readonly loadout: ArenaLoadout

  constructor(loadout: ArenaLoadout = DEFAULT_LOADOUT, characterId = '') {
    super('arena')
    this.loadout = loadout
    this.actor = actorFor(characterId)
  }

  /**
   * The sheet has to be fetched, which nothing else in this scene does -- the
   * atlas and the digits are drawn at boot. Phaser runs preload to completion
   * before create, so everything after it can assume the texture is there.
   */
  preload(): void {
    // The painted digits, which have to arrive before create can register them
    // as a font. Everything else this scene draws with is baked at boot.
    this.load.image(FONT_KEY, FONT_URL)

    if (!this.actor) {
      return
    }
    this.load.spritesheet(this.actor.key, this.actor.url, {
      frameWidth: this.actor.frameWidth,
      frameHeight: this.actor.frameHeight,
      margin: this.actor.margin,
      spacing: this.actor.spacing,
    })
  }

  create(): void {
    buildAtlas(this)
    registerDamageFont(this)

    this.cameras.main.setBackgroundColor('#07030d')
    this.drawFloor()

    this.world = new World(this.loadout)

    // Created in paint order: depth sorting is off, so the order they are
    // added is the order they are drawn. Drops go under the crowd, shots and
    // the player over it.
    this.pickupSprites = this.makeSprites(this.world.pickups.capacity, 'coin', PICKUP_TINT)
    this.enemySprites = this.makeSprites(this.world.enemies.capacity, 'grunt', 0xffffff)
    this.projectileSprites = this.makeSprites(this.world.projectiles.capacity, 'bullet', 0xffffff)
    // Added after the crowd and the shots, so a bar is never buried by the
    // enemy standing in front of the one it belongs to.
    this.barTracks = this.makeSprites(this.world.enemies.capacity, 'bar', BAR_TRACK_TINT)
    this.barFills = this.makeSprites(this.world.enemies.capacity, 'bar', BAR_TINTS[0])
    for (const sprite of this.barTracks) {
      sprite.setOrigin(0, 0.5)
    }
    for (const sprite of this.barFills) {
      // Anchored left, so scaleX alone is the remaining fraction -- no
      // repositioning as it empties.
      sprite.setOrigin(0, 0.5)
    }

    this.radar = new Float32Array(this.world.enemies.capacity * 2)
    this.loot = new Float32Array(this.world.pickups.capacity * 2)

    this.enemyFrames = new Int8Array(this.enemySprites.length).fill(-1)
    this.enemyTints = new Int32Array(this.enemySprites.length).fill(-1)
    this.barTints = new Int32Array(this.enemySprites.length).fill(-1)
    this.projectileFrames = new Int8Array(this.projectileSprites.length).fill(-1)

    if (this.actor) {
      this.buildActorAnimations(this.actor)
      this.playerSprite = this.add.sprite(this.world.player.x, this.world.player.y, this.actor.key)
      // Scaled by height alone, so a pose that reaches wider than the others --
      // the attack row carries a sword swing well past the shoulder -- is not
      // squeezed to match one that does not.
      this.playerSprite.setScale(this.actor.displayHeight / this.actor.frameHeight)
      this.playerSprite.play(`${this.actor.key}-idle`)
    } else {
      this.playerSprite = this.add.sprite(this.world.player.x, this.world.player.y, ATLAS_KEY, 'player')
      this.playerSprite.setTint(PLAYER_TINT)
    }
    this.actorAnim = 'idle'
    this.lastVolleys = this.world.volleys
    this.lastHits = this.world.hitsTaken
    this.lastLevel = this.world.player.level

    // Added last, so they draw over everything without needing depth sorting.
    this.numbers = Array.from({ length: NUMBER_CAPACITY }, () => {
      const text = this.add.bitmapText(0, 0, FONT_KEY, '', NUMBER_SIZE)
      text.setOrigin(0.5)
      text.visible = false
      return { text, x: 0, y: 0, vy: 0, life: 0 }
    })
    this.numberCursor = 0

    /* Added after the damage numbers, which are themselves added last, so the
       edge of sight covers every single thing the arena draws. That ordering
       is the whole mechanism: a hit in the dark still happens and still kills,
       and neither its number nor the victim's health bar leaks the position,
       because both are underneath this. */
    this.syncVignette()
    this.vignette = this.add.image(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIGNETTE_KEY)
    this.vignette.setScrollFactor(0)

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

    const chosen = consumeUpgrade()
    if (chosen) {
      world.applyUpgrade(chosen)
    }

    for (const command of drainCommands()) {
      /*
       * Exhaustive on purpose. This was a chain ending in a bare `else` that
       * called leaveShop, and adding a command to the queue without a branch
       * here landed it silently in that else -- a sell that quietly tried to
       * leave the shop, and did nothing at all outside one. Nothing caught it:
       * the else accepted any shape. The `never` below makes the next
       * omission a compile error instead of a mystery.
       */
      switch (command.sort) {
        case 'buy':
          world.buy(command.slot)
          break
        case 'reroll':
          world.reroll()
          break
        case 'merge':
          world.mergeWeapons(command.from, command.to)
          break
        case 'sell':
          world.sellWeapon(command.slot)
          break
        case 'leave':
          world.leaveShop()
          break
        default: {
          const unhandled: never = command
          throw new Error(`unhandled run command: ${JSON.stringify(unhandled)}`)
        }
      }
    }

    this.readInput()

    /* Frozen means frozen. The simulation stops for both an unspent level and
       an open shop, and so does everything drawn on real time rather than on
       simulation time -- otherwise the damage numbers keep drifting upward
       over a screen where nothing else moves. */
    const frozen = world.pendingLevels > 0 || world.status === 'shop'

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
    if (frozen) {
      /*
       * Frozen while a level is unspent or the shop is open. The accumulator
       * is held at zero rather than left to fill: carrying the paused seconds
       * would spend them all at once the moment play resumes, teleporting the
       * crowd on top of the player.
       */
      this.accumulator = 0
    } else {
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
    }

    this.drainHits()
    this.stepNumbers(frozen ? 0 : Math.min(delta, MAX_FRAME_MS) / 1000)

    if (world.shake > 0) {
      this.cameras.main.shake(140, Math.min(0.012, world.shake * 0.0009))
      world.shake = 0
    }

    this.syncSprites()

    // The overlay has to appear on the frame the level lands, not up to a
    // publish interval later, so a change in the queue jumps the schedule.
    this.publishTimer += delta
    if (
      this.publishTimer >= PUBLISH_MS ||
      world.pendingLevels !== this.lastPending ||
      world.status !== this.lastStatus
    ) {
      this.publishTimer = 0
      this.lastPending = world.pendingLevels
      this.lastStatus = world.status
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

    /*
     * Which way the player is pointing, held through a stop so a character who
     * lets go of the keys keeps facing where they were going rather than
     * snapping to a default.
     *
     * This was meant to land when the minimap was built and did not -- the
     * field was declared, published and read, and never once assigned, so the
     * arrow on the map pointed east for every run since. Nothing failed: a
     * number that is always zero is a perfectly good number.
     */
    if (x !== 0 || y !== 0) {
      this.facing = Math.atan2(y, x)
    }
  }

  /* ---------- damage numbers ---------- */

  private drainHits(): void {
    const world = this.world
    for (let i = 0; i < world.hitCount; i++) {
      const hit = world.hits[i]
      const slot = this.numbers[this.numberCursor]
      this.numberCursor = (this.numberCursor + 1) % this.numbers.length

      slot.x = hit.x + (Math.random() - 0.5) * 16
      slot.y = hit.y - 12
      slot.vy = NUMBER_RISE
      slot.life = NUMBER_LIFE
      // Rounded up, never to zero: a hit that reported "0" would read as a
      // miss, and there is no such thing here.
      slot.text.setText(String(Math.max(1, Math.round(hit.amount))))
      slot.text.setTint(hit.crit ? NUMBER_CRIT_TINT : NUMBER_TINT)
      slot.text.setScale(hit.crit ? NUMBER_CRIT_SCALE : 1)
      slot.text.visible = true
    }
    // Drained. The world appends from zero again on the next step.
    world.hitCount = 0
  }

  private stepNumbers(dt: number): void {
    for (const slot of this.numbers) {
      if (slot.life <= 0) {
        continue
      }
      slot.life -= dt
      if (slot.life <= 0) {
        slot.text.visible = false
        continue
      }
      // Thrown upwards and pulled back, so a cluster of numbers fans out
      // instead of sliding up in a column.
      slot.vy += NUMBER_GRAVITY * dt
      slot.y += slot.vy * dt
      slot.text.setPosition(slot.x, slot.y)
      slot.text.alpha = Math.min(1, slot.life / 0.22)
    }
  }

  /* ---------- view ---------- */

  private syncSprites(): void {
    const world = this.world
    const player = world.player

    /*
     * The camera is placed here, from the simulation's own position, in the
     * same pass that moves the player's sprite.
     *
     * `startFollow` on the sprite would be one line instead of four, and it
     * would put the camera a frame behind the thing it is following: the
     * player would slide off centre whenever they moved and settle back when
     * they stopped. Reading the position both the camera and the sprite are
     * about to use costs nothing and cannot drift.
     *
     * Deliberately unclamped. The player is always dead centre, so at the edge
     * of the map you see past the boundary into nothing -- which is why the
     * floor draws a hard border and no grid beyond it.
     */
    const camera = this.cameras.main
    camera.scrollX = player.x - VIEW_WIDTH / 2
    camera.scrollY = player.y - VIEW_HEIGHT / 2

    const sight = this.syncVignette()

    /* The rectangle worth drawing. Most of the crowd is off it now, which is
       new: nothing was ever off screen before, so every entity got a sprite
       update and a place in the batch whether it could be seen or not.

       Bounded by sight as well as by the window, because past the edge of
       sight the vignette is solid and a sprite there would be drawing under an
       opaque quad. It stays a rectangle test rather than becoming a distance
       one: the corners of that box are lit at the sides and dark at the
       diagonals, and paying a square root per entity to shave the difference
       would cost more than it saves. */
    const cullLeft = Math.max(camera.scrollX, player.x - sight) - CULL_MARGIN
    const cullRight = Math.min(camera.scrollX + VIEW_WIDTH, player.x + sight) + CULL_MARGIN
    const cullTop = Math.max(camera.scrollY, player.y - sight) - CULL_MARGIN
    const cullBottom = Math.min(camera.scrollY + VIEW_HEIGHT, player.y + sight) + CULL_MARGIN

    const pickups = world.pickups.items
    for (let i = 0; i < pickups.length; i++) {
      const drop = pickups[i]
      const sprite = this.pickupSprites[i]
      if (
        !drop.active ||
        drop.x < cullLeft ||
        drop.x > cullRight ||
        drop.y < cullTop ||
        drop.y > cullBottom
      ) {
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
        this.barTracks[i].visible = false
        this.barFills[i].visible = false
        this.enemyFrames[i] = -1
        continue
      }

      /* Off camera. The cached frame and tint are left alone rather than
         invalidated: the slot has not changed hands, and if it does while it
         is out there the checks below catch it on the way back in. */
      if (
        enemy.x < cullLeft ||
        enemy.x > cullRight ||
        enemy.y < cullTop ||
        enemy.y > cullBottom
      ) {
        sprite.visible = false
        this.barTracks[i].visible = false
        this.barFills[i].visible = false
        continue
      }

      if (this.enemyFrames[i] !== enemy.kind) {
        this.enemyFrames[i] = enemy.kind
        sprite.setTexture(ATLAS_KEY, ENEMY_KINDS[enemy.kind].frame)
      }

      // The atlas shapes are white, so a hit flash is simply the absence of a
      // tint -- no second texture and no fill mode needed.
      const tint =
        enemy.flash > 0
          ? enemy.flashCrit
            ? CRIT_TINT
            : FLASH_TINT
          : ENEMY_KINDS[enemy.kind].tint
      if (this.enemyTints[i] !== tint) {
        this.enemyTints[i] = tint
        sprite.setTint(tint)
      }

      sprite.visible = true
      sprite.x = enemy.x
      sprite.y = enemy.y

      /* Arriving: fading up and blinking. Compared before assigning because
         alpha is the same value for all seven hundred of them almost all of
         the time, and this loop is the busiest in the scene. */
      let alpha = 1
      if (enemy.arriving > 0) {
        const done = 1 - enemy.arriving / ARRIVAL_SECONDS
        const lit = Math.floor(enemy.arriving * ARRIVAL_BLINKS_PER_SECOND * 2) % 2 === 0
        alpha = done * (lit ? 1 : ARRIVAL_BLINK_FLOOR)
      }
      if (sprite.alpha !== alpha) {
        sprite.alpha = alpha
      }

      const track = this.barTracks[i]
      const fill = this.barFills[i]
      if (enemy.hp >= enemy.maxHp) {
        track.visible = false
        fill.visible = false
        continue
      }

      const ratio = Math.max(0, enemy.hp / enemy.maxHp)
      const span = enemy.radius * BAR_SPAN
      const left = enemy.x - span / 2
      const top = enemy.y - enemy.radius - BAR_LIFT

      track.visible = true
      track.setPosition(left, top)
      track.setScale(span / BAR_FRAME_WIDTH, BAR_HEIGHT / BAR_FRAME_HEIGHT)

      fill.visible = true
      fill.setPosition(left, top)
      fill.setScale((span * ratio) / BAR_FRAME_WIDTH, BAR_HEIGHT / BAR_FRAME_HEIGHT)

      const barTint = BAR_TINTS[ratio > 0.6 ? 0 : ratio > 0.3 ? 1 : 2]
      if (this.barTints[i] !== barTint) {
        this.barTints[i] = barTint
        fill.setTint(barTint)
      }
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

      if (
        shot.x < cullLeft ||
        shot.x > cullRight ||
        shot.y < cullTop ||
        shot.y > cullBottom
      ) {
        sprite.visible = false
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

    this.playerSprite.x = player.x
    this.playerSprite.y = player.y
    if (this.actor) {
      this.syncActor(this.actor)
      // Drawn art brings its own colour. The only tint left on it is the one
      // that says a hit was dodged rather than missed.
      this.playerSprite.setTint(player.dodgeFlash > 0 ? DODGE_TINT : 0xffffff)
    } else {
      this.playerSprite.setTint(player.dodgeFlash > 0 ? DODGE_TINT : PLAYER_TINT)
    }
    // Blinks through the invulnerability window, which is the only signal that
    // a second hit did not just fail to register.
    this.playerSprite.visible = player.invuln <= 0 || Math.floor(player.invuln * 20) % 2 === 0
  }

  /**
   * Keeps the vignette matching the vision stat, and returns the radius.
   *
   * Called every frame and does nothing on almost all of them: the stat only
   * moves when a card is taken or an item bought, perhaps a dozen times in a
   * run, and redrawing a screen-sized canvas then is not a cost worth
   * designing around. Rounded before the comparison so a stat that lands on
   * 1.0000001 does not rebuild the texture forever.
   */
  private syncVignette(): number {
    const radius = Math.round(visionRadius(this.world.player.stats))
    if (radius !== this.vignetteRadius) {
      this.vignetteRadius = radius
      buildVignette(this, VIEW_WIDTH, VIEW_HEIGHT, radius, radius * VISION_FADE)
      // The image holds a reference to the texture it was created with, so a
      // rebuilt one has to be handed over explicitly.
      this.vignette?.setTexture(VIGNETTE_KEY)
    }
    return radius
  }

  /**
   * One Phaser animation per row of the sheet.
   *
   * Registered on the global animation manager, which outlives the scene, so a
   * restart would try to register them a second time and Phaser would warn on
   * every key. Hence the check rather than a blind create.
   */
  private buildActorAnimations(actor: ActorSheet): void {
    for (const [name, spec] of Object.entries(actor.animations)) {
      const key = `${actor.key}-${name}`
      if (this.anims.exists(key)) {
        continue
      }
      const first = spec.row * actor.columns
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(actor.key, {
          start: first,
          end: first + actor.columns - 1,
        }),
        frameRate: spec.frameRate,
        repeat: spec.repeat,
      })
    }
  }

  /**
   * Which pose the player is in.
   *
   * A priority order rather than a state machine, because the priorities are
   * the whole rule: levelling outranks being hit, being hit interrupts a
   * swing, and a swing only starts from rest. Everything one-shot falls back
   * to idle when Phaser reports it finished, rather than on a timer kept here
   * that would have to agree with the frame rate.
   */
  private syncActor(actor: ActorSheet): void {
    const world = this.world
    const sprite = this.playerSprite

    let next: ActorAnim | null = null
    if (world.player.level !== this.lastLevel) {
      next = 'levelup'
    } else if (world.hitsTaken !== this.lastHits) {
      next = 'hurt'
    } else if (world.volleys !== this.lastVolleys && this.actorAnim === 'idle') {
      /* Only from rest. A dart fires six times a second, and restarting the
         swing on every volley would hold it on its first frame forever. */
      next = 'attack'
    }

    /* Advanced whether or not the pose changed, or the frame after a one-shot
       finishes would replay whatever happened while it was running. */
    this.lastVolleys = world.volleys
    this.lastHits = world.hitsTaken
    this.lastLevel = world.player.level

    if (next && next !== this.actorAnim) {
      this.actorAnim = next
      sprite.play(`${actor.key}-${next}`, true)
    } else if (this.actorAnim !== 'idle' && !sprite.anims.isPlaying) {
      this.actorAnim = 'idle'
      sprite.play(`${actor.key}-idle`)
    }

    /* Turned to face the way they are going, off the same value the minimap's
       arrow reads.

       The sheet is drawn facing right -- the attack row throws its arc to that
       side -- so the flip is for travelling left, and only past a quarter of
       the way round: a character who mirrors on the first pixel of sideways
       movement flickers while walking a diagonal. */
    const facing = Math.cos(this.facing)
    if (Math.abs(facing) > 0.25) {
      sprite.setFlipX(facing < 0)
    }
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

  /**
   * The ground, drawn once across the whole world.
   *
   * One Graphics for a 3200x1800 map is 51 vertical lines and 29 horizontal
   * ones -- geometry, built at boot and never touched again. Baking it into a
   * RenderTexture instead would be 92MB of video memory for the same picture,
   * which is the trap worth naming here rather than discovering later.
   *
   * The grid stops at the boundary and the boundary is drawn hard, because the
   * camera does not clamp: standing at the edge you see past it into nothing,
   * and nothing has to look deliberate.
   */
  private drawFloor(): void {
    const floor = this.add.graphics()
    floor.fillStyle(0x0b0512, 1)
    floor.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    floor.lineStyle(1, 0x1d0f28, 1)
    for (let x = 0; x <= WORLD_WIDTH; x += 64) {
      floor.lineBetween(x, 0, x, WORLD_HEIGHT)
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += 64) {
      floor.lineBetween(0, y, WORLD_WIDTH, y)
    }
    floor.lineStyle(3, 0xf4436c, 0.5)
    floor.strokeRect(1.5, 1.5, WORLD_WIDTH - 3, WORLD_HEIGHT - 3)
  }

  private publish(): void {
    const world = this.world
    const player = world.player
    publishRun({
      status: world.status,
      wave: world.wave,
      timeLeft: Math.max(
        0,
        world.status === 'break' ? world.breakTimeLeft : world.waveTimeLeft,
      ),
      hp: player.hp,
      maxHp: player.stats.maxHp,
      level: player.level,
      xp: player.xp,
      xpToLevel: player.xpToLevel,
      coins: player.coins,
      kills: world.kills,
      hitsTaken: world.hitsTaken,
      deaths: world.deaths,
      enemies: world.enemies.used,
      fps: Math.round(this.game.loop.actualFps),
      pendingLevels: world.pendingLevels,
      offers: world.offers,
      stats: { ...player.stats },
      weapons: player.weapons.map((slot) => ({ kind: slot.kind, tier: slot.tier })),
      items: [...world.ownedItems],
      shop: world.shopOffers,
      rerollPrice: rerollPrice(world.wave, world.rerolls),
      /* Positions for the minimap, packed as flat x,y pairs. Arriving enemies
         are included deliberately: the telegraph is a warning, and a warning
         the map hides is half a warning. */
      radar: this.radar,
      radarCount: pack(world.enemies.items, this.radar),
      loot: this.loot,
      lootCount: pack(world.pickups.items, this.loot),
      x: player.x,
      y: player.y,
      facing: this.facing,
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
