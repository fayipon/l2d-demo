/**
 * Measures the arena under load, from the running dev server.
 *
 * Exists because the standing rule on this project is that a claim without a
 * number is not a claim, and every number quoted about the arena so far was
 * gathered by hand in a console -- which means nobody else can re-run it, and
 * a regression between two stages would be invisible.
 *
 * Reaches the game through `window.__arena`, the dev-only handle GameCanvas
 * publishes. Everything else is done from the outside: the enemy pool is
 * filled through the simulation's own spawn, `World.step` is wrapped to time
 * itself, and the render count comes from Phaser's own visibility test. No
 * measurement hook is added to the game for this.
 *
 *   npm run bench
 *   npm run bench -- --enemies 1200 --seconds 6
 *   npm run bench -- --spread world      (scatter across the map, not the view)
 *
 * --spread view  puts the crowd inside the camera, which is what the arena has
 * always been; --spread world scatters it over the whole map, which is the
 * case the camera and the off-screen culling exist for. Before the world and
 * the viewport were split these are the same thing.
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

const args = process.argv.slice(2)
const flags = new Map()
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    flags.set(args[i].slice(2), args[++i])
  }
}
const flag = (name, fallback) => flags.get(name) ?? fallback

const base = flag('base', 'http://localhost:5173')
// Defaults to the enemy pool's capacity, so a bare run measures the ceiling
// the game can actually reach rather than a number that used to be it.
const enemies = Number(flag('enemies', 1200))
const seconds = Number(flag('seconds', 6))
const spread = flag('spread', 'view')
/*
 * --hold KeyD runs away instead of measuring a load: the pool is left to the
 * simulation's own spawn rate and nothing is topped up, so the enemy count is
 * free to tell the truth. The player outruns every enemy in the game, so
 * without recycling the stragglers this is the run where the count climbs to
 * the cap and the wave in front goes empty.
 */
const hold = flag('hold')
const width = Number(flag('width', 1280))
const height = Number(flag('height', 720))

const executablePath = CHROME_CANDIDATES.find((p) => p && existsSync(p))
if (!executablePath) {
  throw new Error('no Chrome or Edge found; pass one with --chrome')
}

const browser = await puppeteer.launch({
  executablePath: flag('chrome', executablePath),
  headless: true,
  args: [
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    // Headless Chrome falls back to SwiftShader without these, and a software
    // rasteriser measures the CPU cost of a driver rather than the game.
    '--enable-gpu',
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
  ],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1 })

  const problems = []
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))

  await page.goto(`${base}/battle`, { waitUntil: 'networkidle2', timeout: 30000 })

  // The scene is created inside a React effect after a lazy chunk loads, so
  // there is no load event that means "the arena is running".
  await page.waitForFunction(
    () => window.__arena?.scene?.getScene('arena')?.world !== undefined,
    { timeout: 30000 },
  )

  if (hold) {
    // The canvas has to have the focus or Phaser's keyboard plugin never sees
    // the event, and a headless page starts with the focus on nothing.
    await page.click('canvas')
    await page.keyboard.down(hold)
  }

  const report = await page.evaluate(
    async ({ enemies, seconds, spread, hold }) => {
      const game = window.__arena
      const scene = game.scene.getScene('arena')
      const world = scene.world
      const camera = scene.cameras.main

      const bounds =
        spread === 'world' && window.__arenaWorld
          ? window.__arenaWorld
          : { width: camera.width, height: camera.height }

      /* Fill the pool through the simulation's own spawn, so every enemy is a
         real one -- the right kind for the wave, the right health, in the
         pool slot it would really occupy. Then move them where the test wants
         them; a crowd that has to walk in from the perimeter first would spend
         the sample arriving rather than being measured. */
      const place = (enemy) => {
        if (spread === 'world') {
          enemy.x = Math.random() * bounds.width
          enemy.y = Math.random() * bounds.height
        } else {
          enemy.x = world.player.x + (Math.random() - 0.5) * bounds.width
          enemy.y = world.player.y + (Math.random() - 0.5) * bounds.height
        }
        // Nearly all of the crowd damaged, so the health bars -- which only
        // draw for an enemy that has been hit -- are part of what is measured.
        if (Math.random() < 0.95) {
          enemy.hp = enemy.maxHp * (0.1 + Math.random() * 0.85)
        }
      }

      const live = (pool) => pool.items.filter((e) => e.active).length

      /* Started against the far wall, so the whole map is ahead. From the
         middle a run east reaches the boundary in 1585px and spends the rest
         of the sample pressed against it, which is not the thing being
         measured. */
      const map = window.__arenaWorld
      if (hold && map) {
        const start = {
          KeyD: { x: 80, y: map.height / 2 },
          KeyA: { x: map.width - 80, y: map.height / 2 },
          KeyS: { x: map.width / 2, y: 80 },
          KeyW: { x: map.width / 2, y: map.height - 80 },
        }[hold]
        if (start) {
          world.player.x = start.x
          world.player.y = start.y
        }
      }

      /* Holds the crowd at the target. Without it the count falls as fast as
         the player can kill, and the sample slides off the load it was asked
         to measure.

         Slot-indexed rather than a Set of objects, and two flat passes rather
         than one clever one: this runs inside the frame being measured, so it
         has to allocate nothing. */
      const wasActive = new Uint8Array(world.enemies.items.length)
      const topUp = () => {
        const items = world.enemies.items
        for (let i = 0; i < items.length; i++) {
          wasActive[i] = items[i].active ? 1 : 0
        }
        const missing = enemies - live(world.enemies)
        for (let i = 0; i < missing; i++) {
          world.spawnEnemy()
        }
        let added = 0
        for (let i = 0; i < items.length; i++) {
          if (items[i].active && !wasActive[i]) {
            place(items[i])
            added++
          }
        }
        return added
      }
      /* Filled in both modes, and in the running one deliberately: starting at
         the cap is the state the recycling has to be able to get out of. Left
         alone from here -- nothing is topped up while running, so the count is
         free to say what really happens. */
      topUp()

      /* Wrapped on the instance, which shadows the prototype method and is put
         back at the end. Timing it from inside the class would mean shipping a
         stopwatch in the simulation. */
      const original = world.step.bind(world)
      let stepTotal = 0
      let stepCount = 0
      world.step = (input) => {
        const t0 = performance.now()
        original(input)
        stepTotal += performance.now() - t0
        stepCount++
      }

      /* The frame interval is pinned to vsync at 60Hz, so it says nothing
         about headroom until the game is already too slow to hold it. What
         actually moves as the arena grows is the work inside the frame:
         `scene.update` covers the simulation steps and everything that walks
         an entity list to move a sprite, which is precisely what off-screen
         culling is meant to cut. */
      /* Patched on `sys.sceneUpdate`, not on `scene.update`: Phaser caches the
         scene's update function at boot and calls the cached reference, so
         replacing the method on the instance afterwards is silently ignored
         and reports a flat zero. */
      const originalUpdate = scene.sys.sceneUpdate
      let updateTotal = 0
      let updateCount = 0
      scene.sys.sceneUpdate = function (time, delta) {
        const t0 = performance.now()
        originalUpdate.call(this, time, delta)
        updateTotal += performance.now() - t0
        updateCount++
      }

      const frames = []
      const screenPositions = []
      let renderedSum = 0
      let renderedSamples = 0
      let barsSum = 0
      let levelsSkipped = 0
      let toppedUp = 0
      const enemyCounts = []
      const startedAt = { x: world.player.x, y: world.player.y }

      const started = performance.now()
      let last = started
      await new Promise((resolve) => {
        const tick = () => {
          const now = performance.now()
          frames.push(now - last)
          last = now

          // Immortal for the duration. Seven hundred enemies kill the player in
          // about a second, and a benchmark that measures the death screen
          // measures nothing.
          world.player.hp = world.player.maxHp

          /* The scene freezes the simulation outright while a level is unspent
             or the shop is open, so a benchmark that ignores this measures a
             still frame: at this kill rate the first level-up lands within a
             second and the sample never steps again. Levels are dropped rather
             than spent, because applying upgrades would move the stats the run
             is being measured at. */
          if (world.pendingLevels > 0) {
            levelsSkipped += world.pendingLevels
            world.pendingLevels = 0
          }
          if (world.status === 'shop') {
            world.leaveShop()
          }
          if (hold) {
            enemyCounts.push(live(world.enemies))
          } else {
            toppedUp += topUp()
          }

          const sprite = scene.playerSprite
          screenPositions.push({
            x: sprite.x - camera.scrollX,
            y: sprite.y - camera.scrollY,
          })

          // Every tenth frame: walking the display list is itself expensive
          // enough to move the number it is measuring.
          if (frames.length % 10 === 0) {
            const visible = scene.cameras.getVisibleChildren(scene.children.list, camera)
            renderedSum += visible.length
            renderedSamples++
            barsSum += scene.barFills.filter((b) => b.visible).length
          }

          if (now - started < seconds * 1000) {
            requestAnimationFrame(tick)
          } else {
            resolve()
          }
        }
        requestAnimationFrame(tick)
      })

      world.step = original
      scene.sys.sceneUpdate = originalUpdate

      /* Which GPU actually drew this. Headless Chrome quietly falls back to
         SwiftShader, and a frame time from a software rasteriser is not a
         frame time -- better to print it than to have someone compare two runs
         that were never on the same renderer. */
      let renderer = 'unknown'
      try {
        const gl = game.renderer?.gl
        const info = gl?.getExtension('WEBGL_debug_renderer_info')
        renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : (gl ? 'webgl' : 'canvas')
      } catch {
        renderer = 'unavailable'
      }

      // The first frame's delta spans the setup above, not a rendered frame.
      const deltas = frames.slice(1).sort((a, b) => a - b)
      const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
      const percentile = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(xs.length * p))]

      const first = screenPositions[0]
      const drift = Math.max(
        ...screenPositions.map((p) => Math.hypot(p.x - first.x, p.y - first.y)),
      )

      return {
        status: world.status,
        wave: world.wave,
        frameMean: mean(deltas),
        frameP95: percentile(deltas, 0.95),
        fps: game.loop.actualFps,
        frameCount: deltas.length,
        stepMean: stepCount ? stepTotal / stepCount : 0,
        stepCount,
        updateMean: updateCount ? updateTotal / updateCount : 0,
        // What the view costs per frame: everything `update` did minus the
        // simulation it drove.
        viewMean: updateCount ? (updateTotal - stepTotal) / updateCount : 0,
        renderer,
        objects: scene.children.list.length,
        rendered: renderedSamples ? renderedSum / renderedSamples : 0,
        bars: renderedSamples ? barsSum / renderedSamples : 0,
        enemies: live(world.enemies),
        projectiles: live(world.projectiles),
        pickups: live(world.pickups),
        view: { width: camera.width, height: camera.height },
        world: window.__arenaWorld ?? null,
        drift,
        levelsSkipped,
        toppedUp,
        enemyLow: enemyCounts.length ? Math.min(...enemyCounts) : 0,
        enemyHigh: enemyCounts.length ? Math.max(...enemyCounts) : 0,
        capacity: world.enemies.capacity,
        // Anything close enough to be a fight rather than a rumour. If this is
        // zero after a run, the wave in front of the player is empty.
        nearby: world.enemies.items.filter(
          (e) => e.active && Math.hypot(e.x - world.player.x, e.y - world.player.y) < 900,
        ).length,
        travelled: Math.hypot(world.player.x - startedAt.x, world.player.y - startedAt.y),
        at: { x: Math.round(world.player.x), y: Math.round(world.player.y) },
      }
    },
    { enemies, seconds, spread, hold },
  )

  if (hold) {
    await page.keyboard.up(hold)
  }

  const n = (v, places = 1) => v.toFixed(places)
  const worldSize = report.world
    ? `${report.world.width}x${report.world.height}`
    : `${report.view.width}x${report.view.height} (not split yet)`

  console.log(`arena benchmark -- ${spread} spread, wave ${report.wave}, ${report.status}`)
  console.log(`  view       ${report.view.width}x${report.view.height}`)
  console.log(`  world      ${worldSize}`)
  console.log(
    `  frame      ${n(report.frameMean, 2)}ms mean, ${n(report.frameP95, 2)}ms p95, ` +
      `${n(report.fps)} fps over ${report.frameCount} frames`,
  )
  console.log(`  gpu        ${report.renderer}`)
  console.log(
    `  per frame  ${n(report.updateMean, 3)}ms in update -- ` +
      `${n(report.viewMean, 3)}ms view, ${n(report.updateMean - report.viewMean, 3)}ms simulation`,
  )
  console.log(`  sim step   ${n(report.stepMean, 3)}ms mean over ${report.stepCount} steps`)
  console.log(
    `  objects    ${report.objects} in the display list, ` +
      `${n(report.rendered, 0)} rendered, ${n(report.bars, 0)} health bars`,
  )
  console.log(
    `  entities   ${report.enemies} enemies, ${report.projectiles} shots, ` +
      `${report.pickups} drops`,
  )
  console.log(`  centre     ${n(report.drift, 2)}px max player drift`)
  if (hold) {
    console.log(
      `  running    ${hold} held, ${n(report.travelled, 0)}px travelled ` +
        `to (${report.at.x}, ${report.at.y})`,
    )
    console.log(
      `  crowd      ${report.enemyLow}-${report.enemyHigh} enemies alive ` +
        `against a pool of ${report.capacity}, ` +
        `${report.nearby} still within 900px at the end`,
    )
  } else {
    console.log(
      `  held       ${report.toppedUp} respawned to hold the load, ` +
        `${report.levelsSkipped} level-ups skipped`,
    )
  }

  if (problems.length) {
    console.log(`page reported ${problems.length} problem(s):`)
    problems.forEach((p) => console.log(`  ${p}`))
  }
} finally {
  await browser.close()
}
