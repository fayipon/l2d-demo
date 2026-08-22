/**
 * Asserts the arena's invariants against the running dev server.
 *
 * Separate from bench.mjs on purpose: that one measures and reports, this one
 * passes or fails. Both reach the game the same way, through the dev-only
 * window handle, and neither puts a hook in the game to do it.
 *
 *   npm run verify
 *
 * The scene is paused and the simulation stepped by hand, so every check is
 * deterministic -- a rule about what happens within 0.6 seconds is not
 * something to establish by watching a frame rate.
 *
 * Each check states what would be wrong if it failed, because a red line
 * saying "arrival: false" is not worth reading.
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

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:5173'

const executablePath = CHROME_CANDIDATES.find((p) => p && existsSync(p))
if (!executablePath) {
  throw new Error('no Chrome or Edge found')
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--enable-unsafe-swiftshader'],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
  await page.goto(`${base}/battle`, { waitUntil: 'networkidle2', timeout: 30000 })
  await page.waitForFunction(
    () => window.__arena?.scene?.getScene('arena')?.world !== undefined,
    { timeout: 30000 },
  )

  const results = await page.evaluate(async () => {
    const game = window.__arena
    const scene = game.scene.getScene('arena')
    const world = scene.world
    const checks = []

    /* Paused, so the scene's own update loop is not stepping the world
       underneath these checks. Everything below advances it by hand. */
    game.scene.pause('arena')
    await new Promise((r) => requestAnimationFrame(r))

    const reset = () => {
      world.enemies.releaseAll()
      world.projectiles.releaseAll()
      world.pickups.releaseAll()
      world.status = 'fighting'
      world.pendingLevels = 0
      world.player.hp = world.player.stats.maxHp
      world.player.invuln = 0
      /* The director held off for the length of any check.
         Without this it keeps spawning, and a pool slot released by the enemy
         under test is handed straight to a new one -- same object, same kind,
         same full health. An earlier version of these checks read that as
         "it survived", which is the most expensive kind of passing test. */
      world.spawnTimer = 999
      world.waveTimeLeft = 999
    }
    const still = { x: 0, y: 0 }
    const steps = (n) => {
      for (let i = 0; i < n; i++) {
        world.step(still)
        // Level-ups freeze the scene, not the world, so stepping by hand is
        // unaffected -- but they would change the stats mid-check.
        world.pendingLevels = 0
      }
    }
    const check = (name, ok, detail) => checks.push({ name, ok, detail })

    /* ---------- the arrival telegraph is inert ---------- */

    reset()
    world.spawnEnemy()
    const arriving = world.enemies.items.find((e) => e.active)
    // Directly on top of the player: if contact damage were live during the
    // telegraph, this is the arrangement that would show it.
    arriving.x = world.player.x
    arriving.y = world.player.y
    const startHp = world.player.hp
    const enemyHp = arriving.hp
    const at = { x: arriving.x, y: arriving.y }

    /* A shot put through it by hand rather than one the player fired.
       Auto-fire will not aim at an arriving enemy -- that is a separate rule,
       and relying on it here would make this check pass without ever testing
       whether a bullet that does arrive can land. */
    const shot = world.projectiles.spawn()
    Object.assign(shot, {
      x: arriving.x - 40,
      y: arriving.y,
      vx: 600,
      vy: 0,
      radius: 6,
      damage: 999,
      knockback: 0,
      pierce: 4,
      life: 2,
      lastHit: -1,
      kind: 0,
    })

    /* One step first, purely so the grid has been rebuilt once with this enemy
       in play. Asserted here rather than at the end because by then the shot
       above may have killed it, and a dead enemy is out of the grid for
       reasons that have nothing to do with arriving. */
    steps(1)
    check(
      'an arriving enemy is out of the collision grid',
      world.grid.cells.every((cell) => !cell.includes(arriving.index)),
      'it was inserted, so separation and the projectiles can both see it',
    )

    // On to one step short of the full window, still arriving throughout.
    steps(Math.floor(0.6 * 60) - 3)

    check(
      'an arriving enemy cannot hurt the player',
      world.player.hp === startHp,
      `player went ${startHp} -> ${world.player.hp} with an arriving enemy inside them`,
    )
    check(
      'an arriving enemy cannot be hit',
      arriving.hp === enemyHp && arriving.active,
      `enemy went ${enemyHp} -> ${arriving.hp} with a shot driven straight through it`,
    )
    check(
      'an arriving enemy does not move',
      arriving.x === at.x && arriving.y === at.y,
      `moved to (${arriving.x.toFixed(1)}, ${arriving.y.toFixed(1)})`,
    )

    // Past the window: it has to become a real enemy, or the telegraph is a
    // permanent invulnerability rather than a warning.
    const wasActive = arriving.active
    steps(30)
    check(
      'the telegraph ends',
      arriving.arriving <= 0 &&
        (!arriving.active || arriving.hp < enemyHp || world.player.hp < startHp),
      wasActive && arriving.active && arriving.hp === enemyHp
        ? 'it survived half a second at point blank untouched -- still inert'
        : 'countdown did not reach zero',
    )

    /* ---------- break loot is credited, not flown ---------- */

    const magnet = 108 * world.player.stats.lootRange * 10
    const far = magnet + 400

    reset()
    const control = world.pickups.spawn()
    Object.assign(control, {
      x: world.player.x + far,
      y: world.player.y,
      vx: 0,
      vy: 0,
      value: 5,
      age: 1,
    })
    const coinsBefore = world.player.coins
    steps(2)
    check(
      'a distant drop is left alone while the wave is running',
      control.active && world.player.coins === coinsBefore,
      'it was collected mid-wave, so the break is not what credits it',
    )

    /* The clock as well as the status. stepDirector runs before stepPickups
       within a step, so a break with no time left on it is promoted to the
       shop before the drops are ever looked at -- which is a real ordering,
       just not the one under test. */
    world.status = 'break'
    world.breakTimeLeft = 3
    steps(1)
    check(
      'a distant drop is credited during the break',
      !control.active && world.player.coins === coinsBefore + 5,
      `${far.toFixed(0)}px away, coins went ${coinsBefore} -> ${world.player.coins}; ` +
        'homing cannot cover that inside a 3s break, so it would have been lost',
    )

    /* ---------- the merge rule ---------- */

    /* Every clause of it, because four of the five are refusals and a merge
       that quietly accepts one of them is a rule the player will learn wrong.
       The rack is written directly here: going through the shop to arrange a
       specific pair would be testing the shop. */
    const rack = world.player.weapons
    const setRack = (...slots) => {
      rack.length = 0
      for (const [kind, tier] of slots) {
        rack.push({ kind, tier, cooldown: 0 })
      }
    }

    setRack([1, 1], [1, 1])
    const fused = world.mergeWeapons(0, 1)
    check(
      'two of the same weapon at the same tier fuse',
      fused && rack.length === 1 && rack[0].kind === 1 && rack[0].tier === 2,
      `expected one tier-2 slot, got ${JSON.stringify(rack.map((s) => [s.kind, s.tier]))}`,
    )

    setRack([1, 1], [1, 2])
    check(
      'the same weapon at different tiers does not fuse',
      !world.mergeWeapons(0, 1) && rack.length === 2,
      'a tier I fused with a tier II -- the case players expect to work',
    )

    setRack([1, 1], [3, 1])
    check(
      'different weapons at the same tier do not fuse',
      !world.mergeWeapons(0, 1) && rack.length === 2,
      'two unrelated weapons fused because their tiers matched',
    )

    setRack([1, 1])
    check(
      'a slot does not fuse with itself',
      !world.mergeWeapons(0, 0) && rack.length === 1 && rack[0].tier === 1,
      'dropping a weapon back onto its own slot promoted it for free',
    )

    setRack([1, 4], [1, 4])
    check(
      'the top tier does not fuse further',
      !world.mergeWeapons(0, 1) && rack.length === 2,
      'a pair at the ceiling fused past it',
    )

    game.scene.resume('arena')
    return checks
  })

  let failed = 0
  for (const { name, ok, detail } of results) {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}`)
    if (!ok) {
      console.log(`        ${detail}`)
      failed++
    }
  }
  console.log(`${results.length - failed}/${results.length} checks passed`)
  process.exitCode = failed ? 1 : 0
} finally {
  await browser.close()
}
