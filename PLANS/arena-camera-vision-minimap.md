# Arena: Bigger Map, Following Camera, Vision Stat, Telegraphed Spawns, Minimap

## Goal
Turn the arena from a single fixed screen into a world larger than the viewport:
the camera follows the player, how much of it can be seen becomes a stat,
enemies appear inside the map with a warning instead of walking in from
outside, and a minimap shows what the viewport no longer can.

## Decisions Locked By User
1. The map gets bigger.
2. Vision range becomes a stat — lower value, smaller visible area.
3. Enemies respawn at random positions **inside** the map, never outside it
   walking in. They blink/fade in before becoming real.
4. There is a minimap.
5. The player is **always dead centre**; the map moves under the camera.
6. **Weapons are not limited by vision.** Targeting stays exactly as it is:
   `nearestEnemy()` over every live enemy, each slot compared against its own
   `weapon.range * stats.range`. A player with low vision fires into the dark
   and hits what is there. Vision is a visual cost, not a mechanical one — it
   takes away information, not reach, and `range` keeps its full value at any
   vision.
7. **The world stays 3200 x 1800 for now.** Bigger was considered and set
   aside: past this size the whole-map minimap degrades into a blob, and the
   map has nothing on it to go and find, so more ground is distance rather
   than content. Revisit if map-placed objectives ever land.

## Progress

- **Step 0 done** (`24c96ab`). `scripts/bench.mjs`, run with `npm run bench`.
  It found two things immediately: an unspent level freezes the simulation, so
  a naive sample measures a still frame (21 steps in six seconds), and the
  crowd dies as fast as it is made, so the load has to be held rather than set.
- **Step 1 done** (`6c5e525`). World and window split, camera on the player,
  off-camera sprites hidden, break loot credited, and — brought forward from
  step 2 because the map is not playable without them — the spawn ring around
  the player and the recycling of enemies left behind.
  - 700 enemies spread across the world: **698 of 3258 objects rendered**, 224
    health bars, 60fps, 0.00px drift. Packed into the window: 2038 rendered.
  - Simulation step **1.35-2.23ms** against **1.87-2.25ms** on the old map,
    three interleaved runs each. Six times the grid cells cost nothing
    measurable.
  - The recycling was checked by holding D for a full crossing with it
    disabled: the pool sits at 661-700 with four enemies near the player.
    With it, 697 drains to 52.
- **Correction to a number quoted below**: the 0.45ms simulation step is not
  reproducible, and neither is the 0.999ms the harness first recorded. Spread
  on this machine is about ±0.4ms, so only interleaved A/B in one sitting
  counts.

## Decisions I Need Confirmed Before Building

These change the work materially, so they are called out rather than assumed.
The recommendation is what gets built if nothing is said.

- **How vision shrinks the view.** Two readings of "smaller screen area":
  - *Recommended:* a **vignette plus a sight limit** — the world renders at the
    same scale, and past the vision radius it goes dark and enemies fade out.
    That reads as "cannot see far".
  - *Alternative:* **camera zoom** — less world on screen, everything drawn
    bigger. Simpler (one line), but it reads as "zoomed in", not as blindness,
    and it makes the sprites change size as a stat moves, which is odd.
- **What the base vision radius is.** With targeting untouched this is a
  look-and-feel number, not a balance one. Recommend **560** against a 1280x720
  view (half-height 360, half-width 640, half-diagonal 734): at vision 1.0 the
  dark only reaches in at the corners and along the sides, so the baseline
  feels like today with an atmosphere; 0.7 is 392 and just past half-height,
  which is where it starts to hurt; 0.5 is 280 and is genuine blindness. Every
  point below 1.0 takes ground the player can feel losing.
- **Does the camera stop at the world edge?** Point 5 says always centred, so
  the recommendation is **no clamp**: at the edge you see past the boundary
  into nothing. That needs the outside to look deliberate — a hard border line
  and dead ground beyond it — or it reads as a bug. Clamping instead would keep
  the view full but break "always centred". The vignette hides most of this for
  free: while the vision radius is smaller than half the viewport height, the
  void past the boundary is already dark. Only a high-vision build sees the
  empty ground, which is the cheap case to make look deliberate.
- **What the minimap shows.** Recommend the whole map with everything on it,
  because a minimap that only shows what you can already see is decoration. If
  it should be limited by the vision stat too, say so — it is a one-line
  filter, but combined with the range clamp above it makes vision punishing
  enough that nobody would take the minus.
- **Where the minimap sits, and what moves out of its way.** The mock puts it
  top-right. `.game-hint` is already there (`top: 1.4rem; right: 1.2rem`), so it
  has to move — recommend under the wave readout. The deeper issue is that the
  DOM HUD deliberately hugs the *viewport* while the canvas is *letterboxed*,
  so a scene-drawn minimap sits at the arena's corner and the DOM sits at the
  window's corner. At 16:9 they coincide; at anything else they visibly
  disagree. Recommend accepting the arena-corner position — the minimap is
  arena information — and leaving the HUD's rule intact.

## What This Breaks

`ARENA_WIDTH` / `ARENA_HEIGHT` currently mean two different things at once —
the size of the simulated world *and* the size of the canvas. **44 occurrences
over 31 lines in three files** read them. Splitting them is the first step and
everything else depends on it:

- `WORLD_WIDTH` / `WORLD_HEIGHT` — the simulation. Clamps, spawns, the spatial
  grid, pickup bounds, the floor.
- `VIEW_WIDTH` / `VIEW_HEIGHT` — the canvas Phaser scales to fit. The camera
  viewport, the vignette, the minimap's corner.

Also affected:
- **The break magnet stops working, and widening it is not the fix.**
  `BREAK_LOOT_MULTIPLIER = 10` over a base radius of 108 is 1080 — which does
  cover most of a 1280x720 arena, exactly as its comment claims. On a 3200x1800
  map the diagonal is 3672, so coins dropped away from the player are silently
  lost when the three-second break ends, and its whole reason for existing is
  that anything on the floor when the wave ends was already earned. The obvious
  fix — a bigger radius — does not work either: homing runs from `HOMING_MIN`
  190 px/s at the edge of the magnet to `HOMING_MAX` 1020 on top of the player,
  and even at the full 1020 a corner-to-corner drop needs 3.6s against a 3s
  break. At the speed a distant drop actually travels it is far worse. **So the
  fix is to settle, not to fly:** during `break`, drops beyond the magnet are
  credited directly rather than animated, and only the ones close enough to
  read as flying in get the homing. The comment goes with it.
- `SpatialGrid` is built from the arena size. At 3200x1800 with 64px cells that
  is 1450 cells instead of 240 — more empty cells to clear each step, still far
  cheaper than the pairs it saves.
- `perimeterPoint()` goes away entirely; it exists only to place enemies
  outside the map. What replaces it needs a recycling rule as well as a
  placement rule, or the enemy pool starves — see step 2, and note that this is
  a dead wave rather than a tuning issue.
- `SPAWN_MARGIN` loses its meaning for enemies and keeps it only as slack on
  the clamp and as the projectile despawn bound.
- Every entity is now potentially off-camera, which is new: sprites outside the
  view are still transformed and submitted today because nothing was ever off
  screen.
- **Comments that become false**, which on this project is work rather than
  tidying: the `SpatialGrid` class comment ("Entities spawn outside the arena
  and are clamped in"), the clamp comment in `stepEnemyMovement` ("so one that
  has just spawned can still walk in"), `BREAK_LOOT_MULTIPLIER`, and "Design
  resolution" above the constants themselves.
- **The stat is not only simulation data.** `UpgradeId = keyof PlayerStats`, so
  adding `vision` forces entries in `STAT_INFO` *and* in `STAT_FORMAT` and
  `STAT_ICON` in `GamePage.tsx` — both are `Record<UpgradeId, …>` — plus a new
  glyph in `icons.tsx`. TypeScript catches all of it, but it is four files, not
  one.

## Planned Steps

### 0. A way to measure, before anything is measured against
The validation below asks for frame time under load, sprite counts at full
alpha, and the player's screen position sampled over time. `scripts/` has
`screenshot.mjs` and nothing else, and the numbers quoted in this plan were
gathered by hand. Add a small puppeteer harness alongside it that drives the
arena and reads the live scene, so every claim below is a command someone else
can re-run. Without it the validation section is an intention.

### 1. Split world from viewport, and move the camera
- Introduce `WORLD_*` and `VIEW_*`; update all 31 lines.
- `GameCanvas` keeps the Phaser config at `VIEW_*`.
- Fix the break magnet (see above) in the same pass — it is a one-line change,
  and it is this step that breaks it, not a later one.
- The floor is drawn across the world, with a hard boundary line and no grid
  beyond it.
- Camera centres on the player **in `syncSprites`, from the simulation
  position**, in the same pass that moves the player sprite. Using Phaser's
  `startFollow` on the sprite instead would put the camera a frame behind the
  entity it is following, and the player would visibly drift off centre while
  moving.
- **Watch for judder, which this step introduces.** There is no render
  interpolation: sprites take the fixed-60Hz simulation position directly. On a
  144Hz display some frames repeat a position — today that is one small sprite
  stuttering and nobody notices, but a camera locked to the same value makes
  the whole floor grid and every enemy stutter together. The "player never
  leaves centre" test passes either way, because what judders is the world, not
  the player. If it shows on a high-refresh display, interpolate the camera
  position between steps rather than reaching for a full interpolation pass.
- **Hide entities outside the camera rect plus a margin — `visible = false`,
  not merely a skipped update.** Skipping the update alone freezes each sprite
  at the last position it held on screen, which leaves a ring of motionless
  enemies parked at the view boundary and still submits every one of them to
  the batch, so it costs the same and looks wrong. `willRender` is what
  actually short-circuits. Each enemy owns three display objects:
  `enemySprites`, `barTracks`, `barFills`.
- Not premature: most of the crowd is now off screen, and it is one distance
  test against work that is otherwise done for every one of them.

### 2. Spawn inside the map, with a telegraph
*Placement and recycling landed in step 1 — the map is unplayable without
them. What is left here is the arrival state and where the ring sits.*
- Enemy gains an arrival state: a countdown during which it **does not move,
  does not collide, cannot be hit, and cannot hurt the player**. Damageable
  during the telegraph and the spawn becomes a farm; harmful during it and the
  warning is not a warning.
- The sprite blinks and fades up over that window.
- Position: a random point at a chosen distance band from the player, clamped
  into the world, rejecting anything too close. Prefer just past the vision
  edge so the telegraph is what you see first; when the player is cornered and
  there is nowhere outside, allow it closer — that is exactly the case the
  warning exists for.
- **Enemies left far behind have to be recycled, or the pool starves.** This
  falls out of relative spawning and it is not a tuning problem, it is a dead
  run. The player moves at 232 px/s and the fastest enemy is 132 at
  `speedScale`'s 1.45 cap — **191**, so the player outruns every enemy in the
  game, and move speed upgrades widen the gap. Today that does not matter
  because 1280x720 puts a wall 2.8 seconds away; on 3200x1800 a straight line
  runs for 15.8 seconds. Stragglers never catch up and never despawn, so they
  accumulate to the 700 cap, and at that point `spawnEnemy`'s "pool full, drop
  the spawn" branch takes over: **the player is trailed by 700 enemies that can
  never reach them, and no new ones appear in front.** The wave goes empty.
  - Fix: an enemy past some distance from the player — three times the vision
    radius is a reasonable first number — is released back to the pool and
    respawns ahead. It costs one distance test in a loop that already computes
    that distance for the chase.
  - It also has to not eat a fight the player is running from on purpose, so
    the cull distance wants to sit well outside anything they could still shoot.
- Density is worth watching: the same spawn rate over four times the area feels
  empty. Because spawns are now relative to the player rather than the map, the
  rate should hold — to be checked by playing it, not by arithmetic.

### 3. Vision as a stat
- Add `vision` to `PlayerStats` (multiplier over a base radius), `BASE_STATS`,
  `STAT_INFO`, `STAT_FORMAT`, `STAT_ICON`, a new icon, an upgrade card, and a
  shop item.
- **Give it a home on the minus side too.** A stat that only ever goes up
  cannot deliver "lower value, smaller visible area", and the project already
  has the mechanism: character traits in `loadouts.ts`, where every plus is
  paid for by a minus, and the `recklessblade` group of trades in the shop.
  Vision is a natural minus for a character built around damage or speed. Which
  character, if any, is a design call — flag it rather than assume.
- **`stepWeapons`, `nearestEnemy` and the projectiles are not touched.** Locked
  decision 6: weapons shoot past the vision edge. Tracers flying off into the
  dark is the correct read of "shooting at something you cannot see", and it
  costs nothing to build because it is what the code already does.
- **But the things that hang off a hit have to respect the dark.** Two of them
  would otherwise draw over black nothing and give away exactly what vision is
  supposed to hide:
  - Damage numbers, spawned at the hit position in `drainHits`. A number
    floating over unlit ground is the enemy's position, rendered in a readable
    font. Fade them by the same vision band the sprites use — `stepNumbers`
    already writes alpha every frame, so it is one more term.
  - Enemy health bars, which are sprites like any other and fall out of the
    same band as the enemy they belong to.
  - The kill itself stays audible and the coin it drops still appears when the
    player walks into range, so a kill in the dark is not a silent one.
- A radial-gradient texture baked at boot, alongside the sprite atlas and the
  digit font — transparent at the centre, opaque past the radius.
- Drawn with `scrollFactor: 0`, centred on the viewport. **Because the player
  is always dead centre, the vignette is a static screen-space overlay** — no
  per-frame positioning, one draw call, and it costs nothing.
- Sprites fade out across a band at the vision edge rather than popping, which
  is one alpha write per entity in a loop that is already running.
- Base radius set so vision 1.0 shows most of the viewport, and every point
  below it takes real ground away.

### 4. Minimap
- **Drawn in the scene, not in the DOM.** The HUD rule is that React owns
  everything that is not the arena, and this is the exception that proves it:
  hundreds of dots redrawn every frame is exactly what the DOM is worst at.
- Sized and placed to match `DESIGN/game_screen_01.png`, which puts a circular
  minimap top-right with red dots and a white player arrow. `.game-hint` moves
  out of that corner first.
- Two candidate implementations, and the second is what to reach for if the
  first measures badly:
  - One `Graphics` with `scrollFactor: 0`, cleared and refilled each frame: the
    world frame, the player marker, enemy dots, the wave's coins. Simple, but
    it re-triangulates several hundred circles every frame.
  - **A pool of tiny `scrollFactor: 0` sprites from the existing atlas** —
    precisely the approach the arena already runs at 700 objects without
    dropping a frame, and it stays inside the same batch. Preferred over a
    stamped `RenderTexture` as the fallback, because it needs no new concept.
- Cost to be measured, not assumed.

## Validation

Measured against the running game, as with every previous stage — the standing
rule on this project is that a claim without a number is not a claim. All of it
through the harness from step 0.

- **Frame time at full load.** The existing benchmark says 60 FPS with 700
  enemies, 664 health bars and 3258 display objects on one screen. Re-run it on
  the bigger map with the camera, vignette and minimap live, and report what
  each of the three costs.
- **Simulation step cost.** Currently 0.45ms against a 16.67ms budget at the
  700-enemy cap. The grid gets six times the cells; confirm the step does not.
- **The player never leaves centre.** Sample the player's screen position over
  a few seconds of movement including at the world edge; it should not move.
- **The world does not judder.** Separately from the above, on a display faster
  than 60Hz: move in a straight line and confirm the floor grid slides
  smoothly. This is the failure the centre test cannot see.
- **Off-camera entities are actually hidden.** Count rendered objects with the
  crowd spread across the world; it should fall well below the live entity
  count, and no frozen sprites should sit at the view edge.
- **The floor still clears during the break.** Drop coins at the far corner of
  the world, let the wave end, and confirm the count reaches zero before the
  shop opens.
- **Spawns land inside the world**, never on top of the player, and the
  telegraph window is genuinely inert — no damage dealt or taken during it.
- **Vision changes what is visible**: at a low value, count the sprites drawn
  at full alpha and confirm it falls.
- **The dark gives nothing away.** With vision low and a fight running at the
  sight edge, confirm no damage number and no health bar is drawn at full
  alpha outside the radius — and that weapons still fire and still kill out
  there, which is the point of decision 6.
- **The pool does not starve.** Run away in a straight line for a full wave and
  confirm the live enemy count stays near the spawn rate rather than climbing
  to 700, and that enemies keep arriving in front of the player throughout.
- **The minimap agrees with the world**: put enemies at known corners and check
  the dots land in the right places.

## Out Of Scope
- The isometric view and drawn character art in `DESIGN/game_screen_01.png`.
  That is a different renderer and a different asset pipeline; this plan makes
  the *layout* of that mock possible, not its look.
- The six-card upgrade screen in `DESIGN/game_screen_02.png`.
- The mission-objective panel from the same mock.
- Anything in the lobby.

## Completion Flow
- Step 1 lands as its own commit, with no behaviour change beyond the magnet
  fix, benchmarked before and after. Every later step builds on it, and a
  bisect through a combined commit would be miserable.
- Move this plan from PLANS to FINISH, commit and push in the same flow.
