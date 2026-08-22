# Scene 01: A Tiled Arena Floor, a Numbered Scene, and a Wall Around It

## Goal
Build the arena's first real map out of `DESIGN/game_map_01.png`, replacing the
procedural floor grid drawn in `ArenaScene.drawFloor`.

Three things come with it:
1. The map is a **numbered scene** — it has a code, a name, and a data entry, so
   a second map is an entry rather than an edit to the scene class.
2. The world edge gets a **drawn boundary**, because the simulation already
   clamps everything to `0..WORLD_WIDTH / 0..WORLD_HEIGHT` and nothing on
   screen says so.
3. The tileset enters the asset pipeline the same way the character sheet did,
   through `npm run assets:optimize`.

## What the source actually contains
`DESIGN/game_map_01.png`, 1536x1024. Read off it:

- **Floor tiles** — top-left, 5 columns x 5 rows of square stone tiles, pitch
  ~110px, tile ~95px. Plain cobble, cracked cobble, lava-cracked, blood-splat,
  and one summoning circle. Below them two rows of rounded / cut-corner edge
  tiles for a floor that ends.
- **Boundary pieces** — spiked iron fence on a stone base, a low stone wall,
  candle-lit pillars, corner posts, and hanging banners. Drawn **front-facing**,
  in 3/4, not top-down.
- **Props** — crates, barrels, skull piles, rocks, dead trees, candelabra,
  lecterns, a chest, a winged statue.
- **Ground decals** — two large magic circles, scorch marks, rubble, a lava
  fissure, and cliff/ledge strips with lava glow underneath.

The mixed projection is not a defect and does not need fixing: the arena's actor
art (`src/assets/actor-haru.webp`) is front-facing chibi standing on a top-down
floor. Top-down tiles plus front-facing props is exactly that convention, and
the sheet was drawn for it.

## Decisions to confirm before start
1. **The wall stands outside the play field, not inside it.** The simulation
   clamps the player to `radius..WORLD_WIDTH - radius` today, spawn rejection
   uses `SPAWN_MARGIN`, and the `bench` / `verify` baselines are measured
   against that. So the boundary is drawn in the negative space *outside*
   `0,0 - 3200,1800` and changes no number in `sim/`. It explains the existing
   invisible wall instead of moving it. (The alternative — a wall band inside
   the field, with collision — is a simulation change and a re-baseline.)
2. **Decor is scenery only.** Crates, rocks and statues are drawn, not
   simulated: no collision, no blocking, no pathing. Enemies walk over them.
   A prop that blocks movement means obstacle avoidance in the grid, which is
   separate work.
3. **The layout is deterministic, seeded from the scene number.** A place with a
   number should be the same place every run — the same cracked tile in the same
   corner, the same statue. Re-randomising per run makes it noise with a name.
4. **The number is shown as `SCENE 1-1 · 血色祭壇`** in the battle HUD, beside
   the wave readout, and echoed on the minimap header. It is also what `/battle`
   is entered with: `features/story.ts` already numbers its stages `1-1`, so a
   stage row can hand its code to the arena. Home's start button passes nothing
   and gets scene 01.

## Planned steps

### 1. Slice the tileset into a shipped atlas
`scripts/optimize-assets.mjs` gains a `TILES` job next to `SPRITES`, under the
same rule: the geometry is read off the source once, and written down in exactly
two places that are wrong together or right together.

- Output `src/assets/tiles-abyss.webp` (`TEXTURE_WEBP`, alpha preserved), frames
  laid out on a padded grid with a gutter — same reason as the sprite sheet:
  linear filtering and lossy WebP both bleed across frame edges.
- 128px cells for floor tiles; boundary and prop frames keep their source aspect
  and are fitted into a padded cell.
- Named frames, not indices: `floor-00..floor-24`, `edge-*`, `wall-*`,
  `pillar-*`, `banner-*`, `prop-*`, `decal-*`.
- Output is committed, so a normal build never runs sharp.

### 2. A scene data module
New `src/game/data/scenes.ts` — data only, no Phaser import, same arrangement as
`content.ts` and `actors.ts`:

```ts
interface ArenaMap {
  id: 'scene-01'
  code: '1-1'        // shown in the HUD, matches features/story.ts
  index: 1           // the 場景編號
  name: '血色祭壇'
  seed: number       // layout determinism, derived from index
  floorWeights: ...  // how often each floor variant appears
  decor: ...         // prop budget and where props may stand
  boundary: 'fence' | 'wall'
}
```

A small seeded RNG (mulberry32) lands in `src/game/sim/rand.ts`: the layout
builder has to be reproducible and `Math.random` is not.

### 3. Draw the floor as a tilemap layer
Replace `drawFloor`. A tilemap layer over a 25 x 15 grid at 128 world px covers
3200x1920 — the 120px of overhang past the bottom edge sits under the boundary
band and is never seen.

Why a tilemap layer and not the two alternatives the scene's own comments
already rule out: a `RenderTexture` of the whole world is tens of megabytes of
video memory for a static picture, and 576 individual sprites are 576 more
display-list entries for the culler to walk every frame. A tilemap layer is one
object, one texture, and Phaser culls it by tile.

Mostly plain cobble. The cracked, lava and blood variants are accents at a low
weight — a floor where every tile is dramatic reads as noise, and the arena is
watched at speed, not studied.

### 4. The boundary
Built once at boot, as sprites outside the play rect:

- Corner posts at the four corners, pillars at a fixed interval along each edge,
  fence or low-wall segments spanning between them, banners on some pillars.
- **Depth is the thing to get right.** The top, left and right walls draw *below*
  the entity layer, so a character at the edge stands in front of them. The
  bottom wall draws *above* it, because a wall between the camera and the field
  is what the front-facing art means.
- The candle glow on the pillars is a tint pulse on an additive sprite, not a
  light: the arena has no lighting pass and is not getting one for a border.
- The current hard pink `strokeRect` goes away. The wall is the edge now.

### 5. Decals and props
Seeded placement inside the field: the two large magic circles near the centre —
the player starts at `WORLD_WIDTH/2, WORLD_HEIGHT/2`, so one of them is underfoot
at wave 1 and gives the map a middle — scorch and rubble scattered, rocks and
dead trees clear of the spawn ring, the statue off-centre as the map's one
landmark. All below the entity layer, all inert.

### 6. Wire the scene number through
- `GameCanvas` takes a `mapId` alongside `loadout` and `characterId`, read once
  at mount for the same reason those are.
- `ArenaScene` builds floor, boundary and decor from the `ArenaMap` it is handed.
  Nothing in the scene is hardcoded to scene 01.
- `GamePage` shows `SCENE 1-1 · 血色祭壇`; `Minimap` carries the code in its
  header.
- `StoryPage`'s start button passes the stage's `code`; `HomePage` passes nothing.

### 7. Verify
- `npm run build`, `npm run lint`.
- `npm run bench -- --enemies 700 --spread world`, against the numbers already
  recorded in `FINISH/arena-camera-vision-minimap.md`. The claim to hold: the
  tilemap layer and the boundary add nothing measurable to the step time, and
  the render count rises only by the tiles and props actually inside the camera.
- `npm run verify` must pass unchanged — that is the point of decision 1.
- `npm run shot -- battle`, including a shot at a map edge and one at a corner,
  which is where the depth rule shows.

## Out of scope
Collision on props. A second map — the second entry in `scenes.ts` is what
proves the shape, and it can come after. Per-scene enemy sets or music. Anything
in the lobby beyond passing the stage code.

## Risks
- **Tile seams.** Neighbouring 128px tiles under linear filtering can show a hair
  line between them. Mitigated by the gutter in the atlas, and by extruded tile
  edges if it still appears; checked with `shot`.
- **The overhang row.** 1800 is not a multiple of 128. If the bottom wall is ever
  moved, the uncovered strip becomes visible.
- **Two atlases.** The tiles are a second texture beside the baked shape atlas,
  so a frame is two batches rather than one. Acceptable — the floor draws first
  and entirely, then the entities. It stops being acceptable if props are ever
  interleaved with entities by depth.

## Notes
Execution starts only after the user explicitly says start.

## Progress

Done, in one pass. What was built, and where it differs from the plan above.

**Step 1 -- the slicer.** `scripts/tilejob.mjs`, wired into `assets:optimize`.
The source turned out to be cut already: every piece on the sheet is an island
of alpha, so the geometry came off a connected-component pass over that alpha
rather than off a ruler. The floor block is the one part that is not a
component -- the flagstones touch -- and its five columns and five rows were
measured as bands, because the source's cells drift by up to six pixels across
the block and a uniform grid fitted to them clips an edge in the middle.

Two images out, not one, which is the plan's first correction. A Phaser tileset
addresses tiles by index off a fixed pitch, so the floor has to be a strict
grid; the scenery is every size there is and wants shelf packing. Serving both
from one image would mean padding every prop out to a tile cell.

- `src/assets/tiles-abyss-floor.webp` -- 320x320, 25 tiles, 57 kB.
- `src/assets/tiles-abyss.webp` + `.json` -- 1024x318, 38 named frames, 142 kB.

Everything is baked at one scale, 0.64 source pixels to the world pixel, set by
the floor tile: 64 world px, which is one character tall and the same pitch the
procedural floor's grid used.

**Step 2 -- the scene.** `src/game/data/scenes.ts` and `src/game/sim/rand.ts`
(mulberry32). Landmarks are given in fractions of the world rather than pixels,
so `data/` still imports nothing from `sim/`.

**Step 3 -- the floor.** A `TilemapGPULayer` over 50 x 29 tiles at 64 world px.
Phaser 4 has this layer type and it is a better answer than the plan's: one
quad, a cost per pixel on screen rather than per tile, and a shader that draws
the borders between tiles without bleeding -- which is what removed the seam
risk the plan listed, so the atlas needs no gutter around floor cells. It is
WebGL-only, so the flexible layer is the fallback on a canvas context.

**Step 4 -- the boundary.** Post and span cut out of the one drawn wall unit, so
a run is post, span, post, span. The edge is divided into a whole number of
units and the spans stretched by the remainder rather than laid at their exact
width and left to overhang the corner. The far wall stands with its feet on
`y = 0` and its body entirely outside the field; the near wall laps the last
20px and is lifted over the crowd once the crowd exists (`raiseNearWall`). The
side edges are the same span turned a quarter turn into a continuous band, with
lit pillars standing upright on it -- upright because a pillar lying on its side
reads as a pillar lying on its side.

**Step 5 -- decals and props.** Seeded, ~210 pieces, rejection against a
clearance radius round the player's start. Standing props are sorted by `y`
once at boot, so their overlap is right without the renderer sorting anything.

**Step 6 -- the number.** `/battle?scene=1-1`, read with `useSearchParams`; the
story screen hands over the code it already prints on the row, the home screen
passes nothing and gets scene 01. The HUD shows `SCENE 1-1 · 血色祭壇` above the
wave clock and the minimap header carries the code.

**Also.** `npm run shot` gained `--at x,y`, which teleports the player through
the same dev-only handle bench and verify use. Without it the boundary cannot be
photographed at all: the camera never leaves the character, and the wall is
1600px away from where a run starts. `resolveJsonModule` is on, for the frame
table.

### Measured

`npm run verify`: **28/28 unchanged**, which was the point of decision 1 -- the
wall explains the edge the simulation already had and moves nothing.

`npm run bench -- --enemies 700 --spread world`, three interleaved runs each
side:

|  | before | after |
|---|---|---|
| sim step | 0.86 / 0.88 / 1.26 ms | 0.33 / 0.80 / 0.96 ms |
| update | 1.58 / 1.60 / 2.12 ms | 0.61 / 1.53 / 1.71 ms |
| display list | 4759 | 5174 |
| rendered | 527 / 545 / 593 | 925 / 971 / 973 |
| frame | 16.86-16.88 ms, ~59 fps | 16.82-16.88 ms, ~59 fps |

The two step-time ranges overlap completely and the after runs sit slightly
lower, which is run-to-run noise rather than a speed-up: nothing in `sim/`
changed. The display list is 415 objects longer -- the props, the decals and the
wall pieces -- and about 400 more objects are rendered, which is those of them
that are inside the camera. Frame time is unmoved.

Screens checked with `npm run shot -- battle` at the centre, at each edge and at
a corner. No console errors.

### Two corrections after looking at it

**The side wall had a hole in it.** The span was cut at the post's height, and
the wall between two posts is 31 source rows shorter than they are. In a
horizontal run that padding is invisible -- both pieces stand on the same
ground -- but the side bands are the same piece turned a quarter turn, and there
the padding became a 20px gap between the wall and the floor down the whole
edge. The span is now cut to the wall's own top; both slices still share a
bottom, which is what keeps the horizontal run aligned. The bands also run past
both ends of the field by a wall's height, so they reach the corners instead of
stopping level with the floor and leaving a notch.

**The art was being flattened twice.** Baking each frame to its world size threw
away a third of every pixel the artist drew -- and then the canvas, a fixed
1280x720 buffer stretched by the scale manager to fill the window, magnified
what was left. Two losses, one on top of the other, and the result looked
exactly as rough as that sounds.

Both ends are fixed:

- The pipeline no longer resizes anything. Frames are baked at the size they
  were drawn and `WORLD_SCALE` is written into the frame table for the scene to
  apply; the floor tileset keeps the source's own 104px cell and the layer is
  scaled by `TILE / FLOOR_CELL`. The two sheets grow from 200 kB to 400 kB.
- `RENDER_SCALE`, new in the scene: the canvas is `VIEW * 2` and the camera is
  zoomed by 2, so the window is still 1280x720 of world and is drawn with four
  times the pixels. The character sheet had been drawn at twice its world size
  since it landed and was already waiting for this.

Three things had to follow the zoom. Camera scroll is now half the *camera's*
size rather than half the window's, because Phaser measures scroll in canvas
pixels and applies zoom afterwards; culling reads `camera.worldView` instead of
adding the window to the scroll; and the vignette moved from a screen-pinned
object to one that rides the player, since a scroll-factor-zero object is still
transformed by the zoom and landed off-centre and double size. The player is
always dead centre, so the two placements are the same picture.

Re-measured after both: `verify` **28/28**, `bench` at 700 enemies **16.88 /
16.94 ms, ~59 fps**, sim step 0.90 / 0.98 ms. Four times the fill rate costs
nothing measurable on this machine -- it is a discrete GPU and the frame is
vsync-bound either way, so this is the number to re-check first if the arena
ever runs badly on a laptop.

### And a third: the side walls were facing the wrong way

Both of them, mirrored, which is why it read as wrong rather than as broken.
The span is drawn face-on -- the stone face is the lower part of the frame and
the capping course the upper part -- so whichever way the frame's bottom points
after a quarter turn is the way the wall faces. Clockwise sends it left,
anticlockwise sends it right, and the two edges had them the wrong way round:
both walls were facing out into the dark with their caps toward the arena, so
the field read as the outside of a building rather than the inside of one.
Swapped, and the pillars now stand against a face rather than a roof.
