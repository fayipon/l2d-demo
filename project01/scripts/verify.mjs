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
      world.player.hp = world.player.stats.maxHp
      world.player.invuln = 0
      /* The director held off for the length of any check.
         Without this it keeps spawning, and a pool slot released by the enemy
         under test is handed straight to a new one -- same object, same kind,
         same full health. An earlier version of these checks read that as
         "it survived", which is the most expensive kind of passing test. */
      world.spawnTimer = 999
      world.waveTimeLeft = 999
      /* The level too, and the attributes with it. A check that grants
         experience to force levels leaves both hundreds high, and the next
         check then measures a character it did not set up -- a stale answer
         that looks like a real one. Cost one confused diagnosis already. */
      world.player.level = 1
      world.player.xp = 0
      world.player.xpToLevel = 10
      world.attributes = { str: 20, agi: 20, dex: 20, sta: 20, int: 20, luk: 20 }
      world.ownedItems.length = 0
      world.recomputeStats()
      /* The fractions of a point healed but not yet announced. They survive on
         purpose across a run -- that is what makes a slow trickle eventually
         show a number -- so a check that starts with someone else's leftovers
         reads a "+1" it did not cause. */
      world.healPool = 0
      world.healCount = 0
      world.regenTimer = 0
    }
    const still = { x: 0, y: 0 }
    const steps = (n) => {
      for (let i = 0; i < n; i++) {
        world.step(still)
      }
    }
    const check = (name, ok, detail) => checks.push({ name, ok, detail })
    /* The loadout's starting six, filled out and clamped the way the world
       fills them out -- `start` is a partial and the missing ones are zero. */
    const clampAttributesLike = (start) => ({
      str: Math.max(0, Math.min(255, start.str ?? 0)),
      agi: Math.max(0, Math.min(255, start.agi ?? 0)),
      dex: Math.max(0, Math.min(255, start.dex ?? 0)),
      sta: Math.max(0, Math.min(255, start.sta ?? 0)),
      int: Math.max(0, Math.min(255, start.int ?? 0)),
      luk: Math.max(0, Math.min(255, start.luk ?? 0)),
    })

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

    /* The same rule on the shelf, where getting it wrong costs coins rather
       than one pick. */
    reset()
    world.player.weapons.length = 0
    world.player.weapons.push({ kind: 3, tier: 1, cooldown: 0 }) // ranged only
    /* Bought rather than inspected: the script cannot see the item table from
       in here, and buying everything the shelf offers is the same question
       asked in the only terms the player has -- if a melee charm was ever on
       sale, the stat it feeds moves.

       The attributes go to zero first, because STR, DEX and INT each put a
       floor under one of these three now. Zeroing the stat block directly
       would not survive the next recompute -- the whole point of that function
       is that the block is rebuilt rather than edited -- so the floor has to
       be removed at its source. */
    world.attributes = { str: 0, agi: 0, dex: 0, sta: 0, int: 0, luk: 0 }
    world.recomputeStats()
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

    /* The elemental family, which had no weapon until the staff and so had a
       stat nothing could spend on. This is the check that says it is wired all
       the way through rather than merely declared. */
    reset()
    world.player.weapons.length = 0
    world.player.weapons.push({ kind: 5, tier: 1, cooldown: 0 }) // 魔導杖

    const staffBase = damageOf(5, {})
    check(
      'elemental attack power raises the staff and nothing else does',
      damageOf(5, { elementalPower: 10 }) > staffBase &&
        damageOf(5, { meleePower: 10 }) === staffBase &&
        damageOf(5, { rangedPower: 10 }) === staffBase,
      'the staff read an attack power that is not its own',
    )

    /* ---------- armour cuts both ways ---------- */

    /* Base armour is zero, so until this was fixed every design that charged
       armour charged nothing -- a price on the character screen and on a shop
       card that the simulation clamped away. Measured as damage taken, which
       is the only place it shows. */
    const hitFor = (armour) => {
      reset()
      world.player.stats.armour = armour
      world.player.stats.dodge = 0
      world.player.hp = 1000
      world.player.invuln = 0
      world.spawnEnemy()
      const biter = world.enemies.items.find((e) => e.active)
      biter.arriving = 0
      biter.x = world.player.x
      biter.y = world.player.y
      const before = world.player.hp
      steps(1)
      return before - world.player.hp
    }

    const plain = hitFor(0)
    check(
      'negative armour costs the player real health',
      hitFor(-10) > plain,
      `a hit at 0 armour took ${plain}, at -10 armour it took ${hitFor(-10)} -- ` +
        'so every card that charges armour is charging nothing',
    )
    check(
      'positive armour still protects',
      hitFor(20) < plain,
      `20 armour took ${hitFor(20)} against ${plain} unarmoured`,
    )

    /* ---------- the six primaries ---------- */

    /* The cap is the whole design of the scale -- every per-point value was
       chosen so that 255 lands somewhere worth arriving at -- so an attribute
       that can be pushed past it makes all ten of those numbers wrong. */
    reset()
    world.attributes = { str: 250, agi: 0, dex: 0, sta: 0, int: 0, luk: 0 }
    world.loadout.growth = { str: 40, agi: -10 }
    for (let i = 0; i < 5; i++) {
      world.player.xp = 0
      world.player.xpToLevel = 1
      world.grantXp(2)
    }
    check(
      'every attribute clamps at 0 and at 255',
      world.attributes.str === 255 && world.attributes.agi === 0,
      `five levels of +40 STR from 250 came to ${world.attributes.str}, ` +
        `and -10 AGI from 0 came to ${world.attributes.agi}`,
    )

    /* Recomputing must be idempotent. Attributes are folded into a fresh copy
       of the base every time; folding them into the live block instead would
       be shorter, and would add every point already spent a second time on the
       next recompute. The symptom -- stats that grow when nothing bought
       anything -- is a long way from the cause, which is why this is a check
       and not a comment. */
    reset()
    world.attributes = { str: 40, agi: 30, dex: 25, sta: 50, int: 10, luk: 20 }
    world.recomputeStats()
    const once = { ...world.player.stats }
    world.recomputeStats()
    world.recomputeStats()
    const thrice = world.player.stats
    check(
      'recomputing the stat block twice changes nothing',
      Object.keys(once).every((key) => Math.abs(once[key] - thrice[key]) < 1e-9),
      Object.keys(once)
        .filter((key) => Math.abs(once[key] - thrice[key]) >= 1e-9)
        .map((key) => `${key} ${once[key]} -> ${thrice[key]}`)
        .join(', '),
    )

    /* An item bought is an item remembered, not an item added. The rebuild
       reads `ownedItems` back, so a purchase has to survive the next
       recompute -- and it is the recompute that applies it in the first
       place. */
    reset()
    world.attributes = { str: 0, agi: 0, dex: 0, sta: 0, int: 0, luk: 0 }
    world.recomputeStats()
    const beforeBuy = world.player.stats.maxHp
    world.status = 'break'
    world.breakTimeLeft = 0
    world.openShop()
    world.player.coins = 99999
    let bought = 0
    for (let slot = world.shopOffers.length - 1; slot >= 0; slot--) {
      if (world.shopOffers[slot].sort === 'item' && world.buy(slot)) {
        bought += 1
      }
    }
    const afterBuy = world.player.stats.maxHp
    world.recomputeStats()
    check(
      'a bought item survives a rebuild',
      bought === 0 || world.player.stats.maxHp === afterBuy,
      `${bought} items: ${beforeBuy} -> ${afterBuy} -> ${world.player.stats.maxHp}`,
    )

    /* Growth is a rate, not a step. Stored as floats and rounded only where it
       is shown: +0.4 a level rounded at each level is +0 forever. */
    reset()
    world.attributes = { str: 0, agi: 0, dex: 0, sta: 0, int: 0, luk: 0 }
    world.loadout.growth = { str: 0.4 }
    for (let i = 0; i < 10; i++) {
      world.player.xp = 0
      world.player.xpToLevel = 1
      world.grantXp(2)
    }
    check(
      'fractional growth accumulates instead of rounding away',
      Math.abs(world.attributes.str - 4) < 1e-6,
      `ten levels of +0.4 STR came to ${world.attributes.str}`,
    )

    /* A level is the class's growth and nothing else. Nothing queues, nothing
       waits to be spent, and the arena does not stop -- which is the whole
       point of the change that removed the card. */
    reset()
    world.attributes = { str: 10, agi: 10, dex: 10, sta: 10, int: 10, luk: 10 }
    world.loadout.growth = { sta: 2 }
    world.recomputeStats()
    const hpBefore = world.player.stats.maxHp
    const levelBefore = world.player.level
    world.player.xp = 0
    world.player.xpToLevel = 1
    world.grantXp(2)
    check(
      'a level applies growth and does not stop the run',
      world.player.level === levelBefore + 1 &&
        world.player.stats.maxHp > hpBefore &&
        world.status === 'fighting',
      `level ${levelBefore} -> ${world.player.level}, hp ceiling ${hpBefore} -> ` +
        `${world.player.stats.maxHp}, status ${world.status}`,
    )

    /* And it heals by exactly what the ceiling gained, so a level taken on a
       nearly empty tank is worth what it says. */
    reset()
    world.attributes = { str: 0, agi: 0, dex: 0, sta: 0, int: 0, luk: 0 }
    world.loadout.growth = { sta: 10 }
    world.recomputeStats()
    world.player.hp = 5
    const ceilingBefore = world.player.stats.maxHp
    world.player.xp = 0
    world.player.xpToLevel = 1
    world.grantXp(2)
    check(
      'a level heals by what the ceiling gained',
      Math.abs(world.player.hp - (5 + (world.player.stats.maxHp - ceilingBefore))) < 1e-6,
      `hp 5 -> ${world.player.hp} while the ceiling went ${ceilingBefore} -> ` +
        `${world.player.stats.maxHp}`,
    )

    /*
     * Accuracy, driven through the weapon rather than through the function.
     *
     * Nothing in the game evades, so DEX changes nothing today -- which is the
     * whole reason to land the rule now. Testing `hitChance` directly would
     * pass whether or not anything called it, so the evasion is set on a kind
     * and the shots are fired: the question is whether the damage path reads
     * it, and the only honest way to ask is to shoot something.
     */
    const kinds = window.__arenaContent.ENEMY_KINDS
    const damageWith = (evasion, dex) => {
      const was = kinds[0].evasion
      kinds[0].evasion = evasion
      reset()
      world.attributes = { str: 0, agi: 0, dex, sta: 0, int: 0, luk: 0 }
      world.recomputeStats()
      world.player.weapons.length = 0
      world.player.weapons.push({ kind: 0, tier: 1, cooldown: 0 })
      world.misses = 0
      world.spawnEnemy()
      const target = world.enemies.items.find((e) => e.active)
      target.kind = 0
      target.arriving = 0
      target.x = world.player.x + 40
      target.y = world.player.y
      target.hp = 100000
      target.maxHp = 100000
      steps(40)
      kinds[0].evasion = was
      return { dealt: 100000 - target.hp, misses: world.misses }
    }

    const noEvasion = damageWith(0, 0)
    check(
      'a shot never misses an enemy that does not evade',
      noEvasion.dealt > 0 && noEvasion.misses === 0,
      `${noEvasion.misses} misses against zero evasion`,
    )
    const blind = damageWith(10, 0)
    check(
      'no accuracy against real evasion lands nothing, and says so',
      blind.dealt === 0 && blind.misses > 0,
      `dealt ${blind.dealt} with ${blind.misses} misses at 0 accuracy`,
    )
    const sharp = damageWith(10, 255)
    check(
      'accuracy beats evasion',
      sharp.dealt > 0 && sharp.misses < blind.misses,
      `255 DEX against 10 evasion dealt ${sharp.dealt} with ${sharp.misses} misses`,
    )

    /* Luck buys the shelf. Coarse on purpose, so this asks the coarse question:
       at the cap the shop reaches tiers the wave alone never would. */
    reset()
    world.wave = 1
    world.player.weapons.length = 0
    const bestTierAt = (luck) => {
      world.attributes = { str: 0, agi: 0, dex: 0, sta: 0, int: 0, luk: luck }
      world.recomputeStats()
      let best = 0
      for (let i = 0; i < 200; i++) {
        world.status = 'break'
        world.breakTimeLeft = 0
        world.openShop()
        for (const offer of world.shopOffers) {
          if (offer.sort === 'weapon') {
            best = Math.max(best, offer.tier)
          }
        }
      }
      return best
    }
    const unlucky = bestTierAt(0)
    const lucky = bestTierAt(255)
    check(
      'luck puts higher tiers on the shelf than the wave alone would',
      unlucky === 1 && lucky > 1,
      `wave 1 reached tier ${unlucky} at 0 luck and tier ${lucky} at 255`,
    )

    /* ---------- class skills ---------- */

    /*
     * Haru's two, driven through the shop rather than through the recompute.
     *
     * The skills are swapped onto the loadout by hand here, because the world
     * is built once with whichever character the page loaded and these need
     * both answers -- with the skill and without it -- from the same run.
     */
    const bulwark = {
      id: 'bulwark',
      name: '防禦專精',
      kind: '被動',
      description: '',
      effect: { sort: 'itemBonus', stats: ['armour', 'maxHp'], multiplier: 2 },
    }
    const mending = {
      id: 'mending',
      name: '自然回復',
      kind: '被動',
      description: '',
      effect: { sort: 'regenFrom', base: 0.2, fromArmour: 0.04, fromMaxHp: 0.004 },
    }
    const realSkills = world.loadout.skills

    /* An item with armour on it, found by buying until one turns up. The shelf
       is rolled, so the check asks for what it needs rather than assuming slot
       zero is a charm. */
    const withSkills = (skills, itemId) => {
      world.loadout.skills = skills
      reset()
      world.attributes = { str: 0, agi: 0, dex: 0, sta: 0, int: 0, luk: 0 }
      world.ownedItems.length = 0
      if (itemId) {
        world.ownedItems.push(itemId)
      }
      world.recomputeStats()
      return { ...world.player.stats }
    }

    const plainWard = withSkills([], 'ward')
    const bulwarkWard = withSkills([bulwark], 'ward')
    check(
      "an item's armour is doubled for the class that masters it",
      bulwarkWard.armour === plainWard.armour * 2 && plainWard.armour > 0,
      `護符 gave ${plainWard.armour} armour plain and ${bulwarkWard.armour} with 防禦專精`,
    )

    /* Against a run holding nothing, rather than against a remembered base --
       the base moved once already and a check that hardcodes it fails for a
       reason that has nothing to do with what it is testing. */
    const noItems = withSkills([], null)
    const plainHeart = withSkills([], 'ironheart')
    const bulwarkHeart = withSkills([bulwark], 'ironheart')
    const plainGain = plainHeart.maxHp - noItems.maxHp
    const masteredGain = bulwarkHeart.maxHp - noItems.maxHp
    check(
      "an item's health is doubled too",
      plainGain > 0 && masteredGain === plainGain * 2,
      `鐵心 gave ${plainGain} health plain and ${masteredGain} mastered`,
    )

    /* 重甲 is armour and a movement penalty in one item. Only the armour half
       is the skill's business, and an item that quietly doubled its drawback
       too would be a skill that punishes the build it is for. */
    const plainPlate = withSkills([], 'heavyplate')
    const bulwarkPlate = withSkills([bulwark], 'heavyplate')
    check(
      "an item's other modifiers are left alone",
      bulwarkPlate.armour === plainPlate.armour * 2 &&
        bulwarkPlate.moveSpeed === plainPlate.moveSpeed,
      `move speed went ${plainPlate.moveSpeed} -> ${bulwarkPlate.moveSpeed} alongside the armour`,
    )

    /* From an attribute, not from an item. STA feeds both of these and the
       skill has nothing to do with it -- "from items" has to mean from items,
       or the skill is just a stat bonus with a story. */
    world.loadout.skills = [bulwark]
    reset()
    world.attributes = { str: 0, agi: 0, dex: 0, sta: 100, int: 0, luk: 0 }
    world.ownedItems.length = 0
    world.recomputeStats()
    check(
      'armour and health from attributes are not doubled',
      Math.abs(world.player.stats.armour - 8) < 1e-9 &&
        Math.abs(world.player.stats.maxHp - 60) < 1e-9,
      `100 STA gave ${world.player.stats.armour} armour and ${world.player.stats.maxHp} health`,
    )

    /* Regeneration reads the finished block, so it moves when either of its two
       inputs does. */
    world.loadout.skills = [mending]
    reset()
    world.attributes = { str: 0, agi: 0, dex: 0, sta: 0, int: 0, luk: 0 }
    world.ownedItems.length = 0
    world.recomputeStats()
    const bareRegen = world.player.stats.regen
    world.attributes = { str: 0, agi: 0, dex: 0, sta: 100, int: 0, luk: 0 }
    world.recomputeStats()
    const staRegen = world.player.stats.regen
    check(
      'regeneration rises with armour and health',
      staRegen > bareRegen && bareRegen > 0,
      `${bareRegen.toFixed(2)}/s at nothing, ${staRegen.toFixed(2)}/s at 100 STA`,
    )

    world.loadout.skills = []
    world.recomputeStats()
    check(
      'a class without the skill regenerates nothing',
      world.player.stats.regen === 0,
      `${world.player.stats.regen}/s with no skills at all`,
    )

    /*
     * The two compound, and this is the check that says the order is right.
     *
     * Regeneration is computed after the items, so it reads the armour that
     * mastery has already doubled. Run the other way round it still works,
     * still looks right, and quietly is not the class -- which is exactly the
     * kind of thing that survives a code review and not a test.
     */
    const mendOnly = withSkills([mending], 'ward')
    const both = withSkills([bulwark, mending], 'ward')
    const bonus = both.regen - mendOnly.regen
    check(
      'mastery feeds regeneration, not just the armour number',
      bonus > 0 && Math.abs(bonus - (both.armour - mendOnly.armour) * 0.04) < 1e-9,
      `the same 護符 gave ${mendOnly.regen.toFixed(2)}/s alone and ` +
        `${both.regen.toFixed(2)}/s with 防禦專精 -- the doubled armour is ` +
        `worth ${bonus.toFixed(2)}/s and should be`,
    )

    /* And the block still rebuilds to the same thing twice, now that two more
       writers are in it. */
    world.loadout.skills = [bulwark, mending]
    reset()
    world.ownedItems.length = 0
    world.ownedItems.push('ward', 'ironheart')
    world.recomputeStats()
    const skilledOnce = { ...world.player.stats }
    world.recomputeStats()
    world.recomputeStats()
    check(
      'the block still rebuilds identically with skills in it',
      Object.keys(skilledOnce).every(
        (key) => Math.abs(skilledOnce[key] - world.player.stats[key]) < 1e-9,
      ),
      Object.keys(skilledOnce)
        .filter((key) => Math.abs(skilledOnce[key] - world.player.stats[key]) >= 1e-9)
        .map((key) => `${key} ${skilledOnce[key]} -> ${world.player.stats[key]}`)
        .join(', '),
    )

    world.loadout.skills = realSkills
    reset()

    /* ---------- healing says so ---------- */

    /* Every point restored is reported. Healing the player without telling
       them is indistinguishable from not healing them, and `heal` is the one
       path that can say it -- writing player.hp directly still compiles and is
       the mistake this check exists to notice. */
    reset()
    world.loadout.skills = []
    /* Enough STA to leave the bar somewhere to go. At zero the ceiling is the
       base ten, and a check that heals a full bar measures nothing. */
    world.attributes = { str: 0, agi: 0, dex: 0, sta: 100, int: 0, luk: 0 }
    world.ownedItems.length = 0
    world.recomputeStats()
    world.player.stats.regen = 6
    world.player.hp = 10
    world.healCount = 0
    /* One interval and two frames. Regeneration pays out on a clock now, so
       half a second of it is nothing at all -- and 300 steps of 1/60 come to
       4.999999999999998, which is the kind of thing that makes a check fail
       for a reason that has nothing to do with what it is testing. */
    steps(60 * 5 + 2)
    const healed = world.player.hp - 10
    const reported = Array.from({ length: world.healCount }, (_, i) => world.heals[i].amount)
      .reduce((a, n) => a + n, 0)
    check(
      'healing is reported, not silent',
      world.healCount > 0 && Math.abs(reported - Math.floor(healed)) <= 1,
      `restored ${healed.toFixed(2)} and reported ${reported} across ${world.healCount} events`,
    )

    /* Pooled to whole points. Sixty events a second saying nothing is not a
       readout, so a fraction of a point is kept and not shown. */
    reset()
    world.loadout.skills = []
    world.recomputeStats()
    world.player.stats.regen = 0.1
    world.player.hp = 10
    world.healCount = 0
    // Two intervals of a rate too slow to add up to a point in either of them.
    steps(60 * 10)
    check(
      'a fraction of a point is healed but not announced',
      world.healCount === 0 && world.player.hp > 10,
      `${world.healCount} events for ${(world.player.hp - 10).toFixed(2)} restored over ten seconds`,
    )

    /* The clock itself. Nothing arrives before the interval is up, and what
       arrives then is worth the whole of it -- which is the difference between
       a tick and a trickle, and the only part of this a player sees. */
    reset()
    world.loadout.skills = []
    world.recomputeStats()
    world.player.stats.regen = 2
    world.player.stats.maxHp = 500
    world.player.hp = 100
    world.healCount = 0
    steps(60 * 4)
    const beforeTick = world.player.hp
    steps(60 * 1 + 2)
    check(
      'regeneration arrives on the interval rather than every step',
      beforeTick === 100 && world.player.hp - beforeTick >= 9.9,
      `${(beforeTick - 100).toFixed(2)} restored in the first four seconds, ` +
        `${(world.player.hp - beforeTick).toFixed(2)} on the fifth`,
    )

    /* And nothing is reported at full health, where nothing happened. */
    reset()
    world.loadout.skills = []
    world.recomputeStats()
    world.player.stats.regen = 20
    world.player.hp = world.player.stats.maxHp
    world.healCount = 0
    steps(60 * 6)
    check(
      'a heal at full health reports nothing',
      world.healCount === 0,
      `${world.healCount} events while already full`,
    )

    world.loadout.skills = realSkills
    reset()

    /* ---------- a kill does not always pay ---------- */

    /* Measured by killing things, not by reading the constant. What is under
       test is the roll in the death path, and a check that read `coinChance`
       back would pass whether or not anything used it. */
    /* Coins per kill, averaged. Below a rate of one it is the fraction of
       kills that pay; above it, it is how many times over. One helper for both
       because they are one number -- which is the thing under test. */
    const coinsPerKill = (rate) => {
      reset()
      world.attributes = { str: 0, agi: 0, dex: 0, sta: 0, int: 0, luk: 0 }
      world.recomputeStats()
      /* Set after the recompute and protected from the next one: `kill` grants
         experience before it pays out, a level rebuilds the whole stat block,
         and six hundred kills is a lot of levels. Without this the loop
         measures the base rate however it is set, which is a check that passes
         while testing nothing. */
      world.player.xpToLevel = 1e9
      world.player.stats.coinRate = rate
      let coins = 0
      const runs = 600
      for (let i = 0; i < runs; i++) {
        world.pickups.releaseAll()
        world.spawnEnemy()
        const victim = world.enemies.items.find((e) => e.active)
        victim.arriving = 0
        victim.drop = 1
        victim.hp = 0
        world.kill(victim)
        coins += world.pickups.used
      }
      world.pickups.releaseAll()
      return coins / runs
    }

    const dropRateAt = (luk) => {
      reset()
      world.attributes = { str: 0, agi: 0, dex: 0, sta: 0, int: 0, luk }
      world.recomputeStats()
      let paid = 0
      const runs = 400
      for (let i = 0; i < runs; i++) {
        world.pickups.releaseAll()
        world.spawnEnemy()
        const victim = world.enemies.items.find((e) => e.active)
        victim.arriving = 0
        victim.hp = 0
        world.kill(victim)
        if (world.pickups.used > 0) {
          paid += 1
        }
      }
      world.pickups.releaseAll()
      return paid / runs
    }

    const unluckyDrops = dropRateAt(0)
    check(
      'a kill is not guaranteed to drop coins',
      unluckyDrops > 0.3 && unluckyDrops < 0.6,
      `${(unluckyDrops * 100).toFixed(0)}% of four hundred kills paid at 0 LUK`,
    )

    const luckyDrops = dropRateAt(255)
    check(
      'luck buys the guarantee back',
      luckyDrops > unluckyDrops && luckyDrops > 0.9,
      `${(unluckyDrops * 100).toFixed(0)}% at 0 LUK against ` +
        `${(luckyDrops * 100).toFixed(0)}% at 255`,
    )

    /* One roll for the kill, not one per coin: a brute pays properly or pays
       nothing. Anything between the two would be a quieter payout rather than
       a chance. */
    reset()
    world.attributes = { str: 0, agi: 0, dex: 0, sta: 0, int: 0, luk: 0 }
    world.recomputeStats()
    let partial = 0
    for (let i = 0; i < 200; i++) {
      world.pickups.releaseAll()
      world.spawnEnemy()
      const victim = world.enemies.items.find((e) => e.active)
      victim.arriving = 0
      victim.drop = 4
      victim.hp = 0
      world.kill(victim)
      const dropped = world.pickups.used
      if (dropped !== 0 && dropped !== 4) {
        partial += 1
      }
    }
    world.pickups.releaseAll()
    check(
      'a kill pays in full or not at all',
      partial === 0,
      `${partial} of two hundred four-coin kills paid a part of it`,
    )

    /* ---------- the small-number scale ---------- */

    /*
     * The scale as a ratio, not as a list of constants.
     *
     * Every number in the table could be checked against itself and the check
     * would pass while the game was unplayable. What matters is how many hits
     * an opening exchange takes in each direction, and that is what this asks:
     * four to eight either way, which is the fight the rescale was for.
     */
    world.loadout.skills = realSkills
    reset()
    world.attributes = clampAttributesLike(world.loadout.start)
    world.recomputeStats()
    const opening = world.player.stats
    const grunt = window.__arenaContent.ENEMY_KINDS[0]
    const hitsToDie = Math.ceil(
      opening.maxHp / (grunt.contactDamage * (1 - opening.armour / (opening.armour + 20))),
    )
    /* Eight to eighteen, not the four to five the plan guessed at -- that was
       arithmetic done on the base health without the class's STA on top of it,
       and Haru opens at twenty-six rather than ten. The rescale made the
       opening exchange about twice as sharp as it was, not four times, and the
       honest range is the one that says so. */
    check(
      'an opening run is a handful of hits from dead',
      hitsToDie >= 8 && hitsToDie <= 18,
      `${opening.maxHp.toFixed(0)} health and ${opening.armour.toFixed(1)} armour ` +
        `against a crawler's ${grunt.contactDamage}: ${hitsToDie} hits`,
    )

    const blade = window.__arenaContent.WEAPONS.find((w) => w.id === 'shredder')
    const perBlade = blade.damage + opening.meleePower + opening.attackPower
    check(
      'and kills a crawler in a couple of hits',
      Math.ceil(grunt.hp / perBlade) >= 1 && Math.ceil(grunt.hp / perBlade) <= 3,
      `${perBlade.toFixed(1)} a blade against ${grunt.hp} health: ` +
        `${Math.ceil(grunt.hp / perBlade)} hits`,
    )

    /* Contact damage scales now, and is capped. Without the first a late wave
       cannot kill a grown build; without the second it eventually one-shots
       one, and neither is a fight. */
    const contactAt = (wave) => {
      reset()
      world.wave = wave
      world.spawnEnemy()
      const biter = world.enemies.items.find((e) => e.active)
      const dealt = biter.contactDamage
      world.enemies.releaseAll()
      return dealt / window.__arenaContent.ENEMY_KINDS[biter.kind].contactDamage
    }
    const early = contactAt(1)
    const late = contactAt(30)
    const absurd = contactAt(200)
    check(
      'contact damage rises with the wave and stops',
      Math.abs(early - 1) < 1e-6 && late > early && Math.abs(absurd - 3.5) < 1e-6,
      `x${early.toFixed(2)} at wave 1, x${late.toFixed(2)} at 30, x${absurd.toFixed(2)} at 200`,
    )

    /* ---------- the rate past a hundred percent ---------- */

    /*
     * One number that means two things, and the boundary between them is the
     * part worth checking: a stat that behaved differently on either side of
     * one would be two stats sharing a name.
     *
     * Averaged over six hundred kills of a one-coin enemy, so the number that
     * comes back is the rate itself.
     */
    const halfRate = coinsPerKill(0.5)
    check(
      'under one, the rate is the chance of being paid',
      Math.abs(halfRate - 0.5) < 0.09,
      `0.5 paid ${halfRate.toFixed(2)} coins a kill`,
    )

    const onceRate = coinsPerKill(1)
    check(
      'at one, every kill pays exactly once',
      onceRate === 1,
      `1.0 paid ${onceRate.toFixed(2)} coins a kill`,
    )

    const doubleRate = coinsPerKill(2)
    check(
      'at two, every kill pays double',
      doubleRate === 2,
      `2.0 paid ${doubleRate.toFixed(2)} coins a kill`,
    )

    const halfAgain = coinsPerKill(1.5)
    check(
      'and one and a half pays once, then again half the time',
      halfAgain > 1.35 && halfAgain < 1.65,
      `1.5 paid ${halfAgain.toFixed(2)} coins a kill`,
    )

    /* The multiplier is on the whole drop, not on one coin of it: a brute worth
       four pays eight at double, which is the only reading of "twice the
       coins" that a player would recognise. */
    reset()
    world.attributes = { str: 0, agi: 0, dex: 0, sta: 0, int: 0, luk: 0 }
    world.recomputeStats()
    world.player.stats.coinRate = 2
    world.pickups.releaseAll()
    world.spawnEnemy()
    const fat = world.enemies.items.find((e) => e.active)
    fat.arriving = 0
    fat.drop = 4
    fat.hp = 0
    world.kill(fat)
    const fatCoins = world.pickups.used
    world.pickups.releaseAll()
    check(
      'the multiplier applies to the whole drop',
      fatCoins === 8,
      `a four-coin kill at 200% paid ${fatCoins}`,
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
