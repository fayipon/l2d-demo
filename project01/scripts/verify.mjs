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

    /* ---------- selling ---------- */

    world.wave = 1
    setRack([1, 1], [1, 1])
    const purse = world.player.coins
    const sold = world.sellWeapon(0)
    /* 碎裂刃 lists at 26, tier I sells at full rate, and wave 1 adds no
       markup -- so this number is the whole formula with nothing hidden in
       it. If the price list moves this fails, which is the point. */
    check(
      'a tier I weapon sells for its full list price',
      sold && rack.length === 1 && world.player.coins === purse + 26,
      `coins went ${purse} -> ${world.player.coins}, expected +26`,
    )

    setRack([1, 2], [1, 1])
    const purse2 = world.player.coins
    world.sellWeapon(0)
    check(
      'each tier above the first takes ten points off the price',
      // 26 * 1.9 = 49 at tier II, at 90% = 44.
      world.player.coins === purse2 + 44,
      `a tier II went for ${world.player.coins - purse2}, expected 44`,
    )

    setRack([1, 1])
    const purse3 = world.player.coins
    check(
      'the last weapon cannot be sold',
      !world.sellWeapon(0) && rack.length === 1 && world.player.coins === purse3,
      'the rack was emptied, which leaves the run unable to kill anything',
    )

    /* ---------- attack power reaches only its own family ---------- */

    /* Measured through a real shot rather than by calling the formula: what
       matters is the damage an enemy actually takes, and the formula is only
       one of the places that could get this wrong. */
    const damageOf = (weaponKind, mods) => {
      reset()
      Object.assign(world.player.stats, {
        attackPower: 0,
        meleePower: 0,
        rangedPower: 0,
        elementalPower: 0,
        damage: 1,
        critChance: 0,
        ...mods,
      })
      world.player.weapons.length = 0
      world.player.weapons.push({ kind: weaponKind, tier: 1, cooldown: 0 })
      world.spawnEnemy()
      const target = world.enemies.items.find((e) => e.active)
      target.arriving = 0
      target.x = world.player.x + 40
      target.y = world.player.y
      target.hp = 100000
      target.maxHp = 100000
      const before = target.hp
      steps(30)
      // Total dealt over the window, divided by how many shots landed, is not
      // knowable -- so compare two runs of the same length instead.
      return before - target.hp
    }

    // 碎裂刃 is melee, 貫穿槍 is ranged.
    const meleeBase = damageOf(1, {})
    const meleeWithMelee = damageOf(1, { meleePower: 10 })
    const meleeWithRanged = damageOf(1, { rangedPower: 10 })
    const rangedBase = damageOf(3, {})
    const rangedWithRanged = damageOf(3, { rangedPower: 10 })

    check(
      'melee attack power raises a melee weapon',
      meleeWithMelee > meleeBase,
      `${meleeBase} -> ${meleeWithMelee} over the same window`,
    )
    check(
      'melee attack power does nothing for a ranged weapon',
      damageOf(3, { meleePower: 10 }) === rangedBase,
      'a melee-only stat reached the railgun',
    )
    check(
      'ranged attack power does nothing for a melee weapon',
      meleeWithRanged === meleeBase,
      'a ranged-only stat reached the blades',
    )
    check(
      'ranged attack power raises a ranged weapon',
      rangedWithRanged > rangedBase,
      `${rangedBase} -> ${rangedWithRanged} over the same window`,
    )
    check(
      'the universal attack power reaches both',
      damageOf(1, { attackPower: 10 }) > meleeBase &&
        damageOf(3, { attackPower: 10 }) > rangedBase,
      'a stat that is supposed to apply everywhere did not',
    )

    /* A family's card is dead weight to a rack holding nothing of that family,
       and the elemental one has no weapon in the game to attach to at all. */
    reset()
    world.player.weapons.length = 0
    world.player.weapons.push({ kind: 3, tier: 1, cooldown: 0 }) // 貫穿槍, ranged
    /* Through real level-ups rather than a hook opened in the world for the
       benefit of this file: what is under test is what the player is shown,
       and a private path to the roll could drift from the one they get. */
    const drawn = new Set()
    for (let i = 0; i < 400; i++) {
      world.grantXp(100000)
      for (const id of world.offers) {
        drawn.add(id)
      }
      world.pendingLevels = 0
    }
    check(
      'a rack with no melee weapon is never offered melee attack power',
      !drawn.has('meleePower') && !drawn.has('elementalPower'),
      `offered ${[...drawn].filter((id) => id.endsWith('Power')).join(', ')} to a ranged-only rack`,
    )
    check(
      'the family it does hold is still offered',
      drawn.has('rangedPower'),
      'the ranged card never came up in four hundred draws',
    )

    /* The same rule on the shelf, where getting it wrong costs coins rather
       than one pick. */
    reset()
    world.player.weapons.length = 0
    world.player.weapons.push({ kind: 3, tier: 1, cooldown: 0 }) // ranged only
    /* Bought rather than inspected: the script cannot see the item table from
       in here, and buying everything the shelf offers is the same question
       asked in the only terms the player has -- if a melee charm was ever on
       sale, the stat it feeds moves. */
    world.player.stats.meleePower = 0
    world.player.stats.rangedPower = 0
    world.player.stats.elementalPower = 0
    for (let i = 0; i < 300; i++) {
      world.status = 'break'
      world.breakTimeLeft = 0
      world.openShop()
      world.player.coins = 99999
      for (let slot = world.shopOffers.length - 1; slot >= 0; slot--) {
        if (world.shopOffers[slot].sort === 'item') {
          world.buy(slot)
        }
      }
    }
    check(
      'a ranged-only rack is never sold melee or elemental attack power',
      world.player.stats.meleePower === 0 && world.player.stats.elementalPower === 0,
      `after buying every item on three hundred shelves: melee ` +
        `${world.player.stats.meleePower}, elemental ${world.player.stats.elementalPower}`,
    )
    check(
      'the family it does hold is still on sale',
      world.player.stats.rangedPower > 0,
      'the ranged charm never appeared across three hundred shelves',
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
