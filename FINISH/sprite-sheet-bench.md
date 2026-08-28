# 精靈圖檢測台 — a bench for sprite sheets

## Goal

A third tool beside `tools/l2d-viewer`, at `tools/sprite-bench/`, that answers
three questions about a character sheet **before** it goes near the arena:
**is it cut on the right grid**, **does it read as animation at the size the
game draws it**, and **what `ActorSheet` block does `game/data/actors.ts`
need**.

Published like the Live2D bench: its own Vite project, its own card on
`/l2d-demo/`, served from `/l2d-demo/sprite-bench/`.

## Decisions locked by the user

1. **Scope is character sheets: one image, one row per animation.** Effect
   sequences, loose PNG folders and the `psd-to-spine` skeletons are **out**;
   see *Not in scope*. Note that "uniform grid" is *not* part of this — see
   *The demo sheet*, which is ragged and is the subject the user supplied.
2. **Runtime is Phaser 4, pinned exactly** to project01's installed `4.2.1`,
   no caret — the l2d-viewer argument, unchanged: a bench on a different
   runtime that cheerfully plays a sheet the game then mis-slices is worse than
   no bench.
3. **It ships.** Third card on the landing page, third build in the Pages
   workflow.

## Why this tool, and what it is guarding

The arena's sprite path has exactly one failure mode and it is silent.
`project01/scripts/optimize-assets.mjs` lays the sheet out —

```
SPRITE_FRAME = 128   SPRITE_MARGIN = 2   SPRITE_SPACING = 4   cols 6 x rows 4
```

— and `src/game/data/actors.ts` hands `load.spritesheet` the same four numbers
from its own copy. The comment in `actors.ts` already names the hazard: a
loader told the wrong frame size does not fail, it draws a quarter of one pose
and a sliver of the next. Nothing checks that the two agree. `npm run build`
cannot; `npm run verify` cannot — the arena renders happily either way.

Today that pair is right because one person set both. It stops being right the
first time a second sheet arrives with a different cell size, or art comes back
from an upscaler at 1.5x, or a commission is delivered 5 columns wide. The
bench is where that is found out in one screen, instead of in a build where a
character walks with half a leg.

The second thing it buys: **the playback numbers are guesses right now.**
`idle 8fps`, `attack 16`, `levelup 9`, `hurt 13` were tuned by editing
`actors.ts` and reloading the whole game — boot Phaser, pick a character, start
a run, get hit on purpose to see `hurt`. A bench plays any row at any rate on a
slider, which is the difference between tuning a sheet in a minute and tuning
it in twenty.

## The demo sheet, and the three things it breaks

The sheet the user supplied — a mushroom enemy, to live in `DESIGN/` — is what
the bench is built against, and it is *not* the shape `actors.ts` assumes.

| row | frames |
|---|---|
| IDLE | 12 |
| MOVE | 16 |
| ATTACK | 18 |
| HIT | 10 |
| DEATH | 20 |

**1. Rows have different lengths, so `ActorSheet` cannot describe it.**
`columns` is one number, and `ArenaScene.buildActorAnimations` derives every
row from it — `first = row * columns`, `end = first + columns - 1`. Feed it a
sheet of 12 / 16 / 18 / 10 / 20 and there is no value of `columns` that is
right for more than one row. Haru's sheet is 6x4 and hid this.

So the bench's emitted block carries **per-row frame counts**, and the game's
data shape has to grow one field to accept it — `frames` per animation, or an
explicit `start`/`end` pair. That edit belongs to a separate task in
`project01`; this plan's job is to produce the numbers and to say plainly, on
screen, that the current shape cannot hold them. **This is the bench earning
its keep on day one**: the mismatch is a five-minute read here and a
half-drawn mushroom there.

**2. The row labels are part of the image.** `IDLE (12)` and friends are baked
in, exactly like the label plaque `optimize-assets.mjs` already dodges by
starting Haru's grid at `left: 61`. Detection has to find the frame bands and
reject the label bands rather than count a caption as frame zero.

**3. The frames are not on a uniform pitch and not one size.** The rows are
left-aligned and ragged; ATTACK's poses break out of the box the IDLE poses sit
in, and DEATH ends lying down, which is wider than it is tall. Any detector
that assumes a constant cell pitch reads this sheet wrong.

Which turns the tool's centre of gravity: measuring **per-row bands, then
per-frame boxes inside a band**, from the alpha channel, is the feature. A
uniform grid is then just the easy case of that, and Haru's sheet stays a
regression test for it.

## Not in scope (and why that is written down)

- **Effect / skill sequences** (the slash in `PLANS/melee-becomes-a-slash.md`).
  Same grid mechanics, different questions — anchor point, one-shot timing, how
  it sits over a body. If the slash lands as a sheet, this tool grows a mode; it
  is not designed for one now.
- **Loose PNG sequences.** Would need packing, which is `optimize-assets.mjs`'s
  job, not a viewer's.
- **`tools/psd-to-spine` output.** Skeletal, not sprite — a different player and
  a different tool. Deliberately not folded in here.

## Shape

```
tools/sprite-bench/
  index.html
  package.json          phaser 4.2.1 exact; vite, typescript as devDeps
  vite.config.ts        base, the dev middleware, the fixture copy
  tsconfig.json
  fixtures/
    grid-6x4.webp       the control sheet
  scripts/
    build-fixture.mjs   generates it, with sharp
  src/
    main.ts             wiring and layout
    sheet.ts            load an image, measure it, propose a grid
    stage.ts            the Phaser side: one Scene, one Sprite, the anims
    emit.ts             the ActorSheet block
    style.css
```

Dev server on **5175** — 5173 is the game, 5174 the Live2D bench, and all three
being open at once is the normal way to work.

`src/` imports nothing from `project01/src`, for the reason the Live2D bench
does not: a bench has to survive input the game would throw on, so its loading
path is deliberately more defensive than the game's.

## What the screen does

**Takes a sheet from anywhere.** Drag a PNG/WebP onto the drop target, or pick
the fixture. In dev the picker also lists the game's real `actor-haru.webp`
(see decision 2), so "the thing that works today" is one click away.

**Finds the frames, then draws what it found.** Two passes over the alpha
channel, because the demo sheet is ragged and a single grid guess cannot read
it:

- **Bands.** Rows of fully transparent pixels split the image into horizontal
  bands. A band far shorter than the median, or one whose content is a single
  narrow blob against the left edge, is proposed as a **label** and excluded —
  that is `IDLE (12)` and Haru's plaque, and the exclusion is a checkbox, not a
  verdict.
- **Frames inside a band.** Columns of fully transparent pixels split a band
  into frame boxes, each with its own tight bounding box. That gives a count
  per row — 12 / 16 / 18 / 10 / 20 on the demo sheet — with no assumption of a
  constant pitch or a shared cell size.

Everything measured stays editable, and a band or a split can be added or
removed by hand. What decides is the overlay over the actual image: boxes,
band names, per-frame indices. A wrong number is then visible rather than
argued about.

**Says whether it is uniform.** If every band has the same count and every box
the same size and pitch, the bench says so and reports the classic
`frameWidth / frameHeight / margin / spacing / columns / rows` — which is what
`load.spritesheet` wants and what Haru's sheet is. If it is *not* uniform, it
says that too, with the numbers that differ, because that is the finding rather
than an error.

**Plays it at the size the game draws it.** A Phaser `Sprite` per row,
`generateFrameNumbers` on the same `start`/`end` arithmetic `ArenaScene` uses,
with `frameRate` and `repeat` on controls. Two sizes side by side: **1:1**, and
**arena scale** — `displayHeight` (64 world px) under the camera's
`RENDER_SCALE` zoom. A sheet that reads beautifully at 128px and is mush at 64
is the normal outcome, and the whole reason to show both.

**Says when the sheet disagrees with the game.** The four packing constants are
compiled into the bench as *the game's current geometry*, and a loaded sheet
whose measured grid differs is called out by name — `frameWidth 96, game
expects 128`. Ragged sheets get the blunter version of the same line: *this
sheet has 12 / 16 / 18 / 10 / 20 frames per row; `ActorSheet` has one `columns`
and cannot express it.* This makes a third place that knows those numbers,
which is the cost; each of the three carries a note, as `actors.ts` and
`optimize-assets.mjs` already do for each other.

**Emits two things.** A pasteable `ActorSheet` literal — rows in the order they
appear, **per-row frame counts**, frame rates as set on the sliders — and a
**slice spec**: the measured band and frame boxes as JSON, in the form
`optimize-assets.mjs` would need to cut a ragged source into a uniform sheet
the loader can take. The second is what makes the demo sheet usable at all; the
first is what goes in the game once `actors.ts` grows the field.

Row names are asked for, not invented. The tool can read that a band has twelve
frames; it cannot read that the band is 待機 — though when the sheet labels
itself, as this one does, the excluded label band is shown beside the field so
the name can be typed off it.

## Decisions to confirm before start

**1. Two fixtures, both generated, and one of them ragged.**

Built by `scripts/build-fixture.mjs`, each cell carrying **its own index
painted large**, one hue per row, a 1px inset border. Cheap, and it makes
mis-slicing self-evident — cut wrong and the screen shows two half numbers and
two colours inside one box, rather than something merely "off".

- `fixtures/grid-6x4.webp` — uniform: 6x4 at 128px, 2px margin, 4px gutter.
  The game's own shape, and the easy case.
- `fixtures/ragged-5row.webp` — the demo sheet's shape without its art: rows of
  **12 / 16 / 18 / 10 / 20**, left-aligned and ragged, each row a different box
  size, each row captioned above itself so the label-rejection pass has
  something to reject.

They ship with the build (a few kB each), they are the published bench's only
guaranteed subjects, and they are the control: when the tool says something
surprising about a real sheet, the fixtures are what say whether the tool is the
suspect. The ragged one exists because its answer is known *by construction* —
the demo sheet's counts are known only by counting them by eye, which is
exactly the job being automated.

*Alternative:* copy `project01/src/assets/actor-haru.webp` (238 kB) in as the
sample. Recommended against — it is the subject, not a control, and a copy
drifts the moment the sheet is re-exported.

**1b. The demo sheet lands in `DESIGN/` and is the bench's headline subject.**

`DESIGN/game_enemy_sprite_01.png`, beside `game_char_sprite_01.png`, following
the existing naming. It is where the two-pass detector's numbers get checked
against a real, awkward file rather than against something the bench generated
for itself. **The user needs to save the file there before step 3** — it was
supplied as an image in conversation, not on disk.

**2. The game's real sheet is a dev-only source, served by middleware.**

`actor-haru.webp` lives in `src/assets` and is hashed into project01's bundle,
so unlike the Live2D models there is no published URL to borrow. In dev the
bench serves `project01/src/assets` at `/game-assets` with the same shape of
middleware `l2d-viewer/vite.config.ts` uses for its fixtures — the real file,
no copy, no drift. The build serves the fixture and drag-and-drop only.

Consequence, stated plainly: **the published bench cannot show the game's own
sheet.** That is the honest trade against shipping a duplicate that goes stale.

**3. Playback is Phaser's, including its warts.**

Frame rate, `repeat`, and the one-shot-falls-back-to-idle behaviour run through
the real animation manager rather than a `requestAnimationFrame` loop over
frames. It costs ~1.3 MB of Phaser in the bundle, and it is the only way the
answer transfers to the game.

**4. `emit.ts` writes text, not files.**

A copy-paste block, like the Live2D bench's config block. Nothing in this tool
writes into `project01/`.

## Steps

Each step ends with something checkable; the bracket is what gets recorded in
*Progress*.

1. **Project skeleton.** `tools/sprite-bench/` with package.json (phaser pinned
   exact), tsconfig, vite.config (base + port 5175), index.html, an empty
   `main.ts`. `npm run build` passes — which, as with the Live2D bench, is also
   this project's only type check. [dist size]
2. **The fixtures.** `scripts/build-fixture.mjs` plus `npm run fixture`, both
   the uniform and the ragged sheet. The script asserts its own output: every
   box's centre pixel is its row's hue, every gutter pixel is alpha 0, and the
   per-row counts are what were asked for — failing the build rather than
   warning. [asserted box and gutter counts]
3. **Measure.** `sheet.ts`: image in, band pass, frame pass, label rejection,
   uniformity verdict. Three subjects, three known answers — the uniform
   fixture, the ragged fixture, and `actor-haru.webp` (128 / 2 / 4, 6x4) — then
   the demo sheet, where the target is **12 / 16 / 18 / 10 / 20 with five label
   bands rejected**. [each subject: proposed counts vs. actual]
4. **The overlay.** Boxes, band names and indices over the image; bands and
   splits addable and removable by hand; every field rewriting it live.
5. **The Phaser stage.** Rows playing as animations, 1:1 and arena scale side by
   side, frame-rate and repeat controls. Ragged rows play from their own frame
   list, which is the part `generateFrameNumbers` on a single `columns` cannot
   do. [the bench's own fps, so a stage that stutters is not mistaken for a
   sheet that does]
6. **Disagreement check and emit.** The compiled game geometry, the mismatch
   line (including the blunt one about `columns`), the `ActorSheet` block and
   the slice spec.
7. **Publish.** `base: '/l2d-demo/sprite-bench/'`, a build step and a copy in
   `.github/workflows`, a card in `site/index.html`, and
   `site/cover-sprite-bench.webp` at 1280x720 to match the other two covers.
   [built dist size, and the site total before and after]
8. **Docs.** `tools/sprite-bench/README.md` in the shape of the Live2D bench's —
   what it answers, the fixture, the pinned-version rule, the sharp edges. Then
   `CLAUDE.md`: the layout table gains a row, and the "bench borrows the game's
   assets" rule gains this middleware variant.

## Before calling it done

- `npm --prefix tools/sprite-bench run build` (the type check) passes, and both
  `npm --prefix tools/l2d-viewer run build` and project01's `npm run build`
  still pass — nothing here touches them, and that is worth proving.
- Both fixtures round-trip: the proposed boxes equal the geometry the script
  wrote, ragged counts included.
- `actor-haru.webp` proposes exactly the numbers in `actors.ts`, and editing one
  of them makes the overlay visibly wrong.
- The demo sheet reads 12 / 16 / 18 / 10 / 20 with its five captions rejected,
  and the screen says why `ActorSheet` cannot hold it.
- A screenshot of the bench playing all four Haru rows, and one of the mushroom
  playing DEATH.
- The site still assembles: the `_site` layout resolves with a fourth
  directory, and the new card's relative link works from a plain static server.

## The follow-up this will create, and does not do

The demo sheet says `ActorSheet` needs per-row frame counts. Making that change
means touching `game/data/actors.ts`, `ArenaScene.buildActorAnimations` and
`scripts/optimize-assets.mjs`, all inside project01, all under `npm run verify`
— a separate plan, written after the bench has actually measured the sheet
rather than before. Doing it inside this task would mean changing the game on
the strength of a tool that has not been used yet.

## Progress

Uncommitted so far — one check still needs a file only the user has.

**1. Skeleton.** `tools/sprite-bench/`, Phaser pinned to `4.2.1` (verified equal
to project01's installed version), dev on 5175, its own `public/` rather than
project01's — nothing here needs the game's 17 MB, so the borrowed-publicDir
trick the Live2D bench needs is not repeated. Build passes; `dist` is **1.4 MB**
(JS 1,394 kB, gzip 366 kB — Phaser is essentially all of it).

**2. Fixtures.** Both generated and both self-asserting:

```
grid-6x4.webp      792x528   7.3 kB  rows [6, 6, 6, 6]        24 boxes probed  213,552 clear pixels
ragged-5row.webp  2050x540   3.0 kB  rows [12,16,18,10,20]    76 boxes probed  732,876 clear pixels
```

The assertion is stronger than planned: rather than "the gutters are empty" it
checks that *every pixel outside a declared box or caption* is at alpha 0, and
probes each box in its flat lower-right quadrant for the row's exact hue. The
digits are seven segments of SVG rectangle, not text, so the output does not
depend on the fonts installed on the machine that ran it.

**3. Measurement.** Three subjects, three known answers:

| subject | expected | read |
|---|---|---|
| `ragged-5row` | 12 / 16 / 18 / 10 / 20, 5 captions dropped | ✔ same, 76 frames |
| `grid-6x4` | 6 × 4 | ✔ grid mode, 24 frames |
| `actor-haru.webp` | 6 × 4 | ✔ grid mode, 24 frames |

Two rules had to be found by pointing the tool at real files, and both are
written up in the README because they are the interesting part:

*Captions.* The planned rule — "shorter than half the median band" — does not
work. On the ragged fixture the bands are 18, 64, 18, 72, 18, 80, 18, 48, 18,
60; five captions and five rows put the median at 33, and 18 is more than half
of it. Every caption counted as a one-frame animation: **81 frames instead of
76**. Replaced by a two-population split — sort the heights, take the largest
ratio jump between neighbours as the boundary — which also does nothing on a
sheet whose bands are all alike.

*Packed sheets cannot be measured at all.* Measured on the game's own
`actor-haru.webp`: gaps **between** frames are 4–5 px, gaps **inside** a frame
are 1–9 px. The populations overlap completely, so no threshold separates them
and the first version read the sheet as five rows of 17 / 9 / 19 / 9 / 10
instead of four of 6. This is why the tool grew a second cut mode rather than a
better heuristic — and the bench now picks grid mode itself when the game's own
numbers cut the sheet cleanly. It also learned to drop slivers: that sheet has
a 2 px band at y 398 which was being counted as a fifth animation.

*And one thing that cannot be answered at all:* a grid is not recoverable from
content, only checkable against it. `frame 128, margin 2, spacing 4` and
`frame 132, margin 0, spacing 0` describe the same 792 px sheet and no pixel
distinguishes them. The verdict says which readings fit and answers the one
question that has an answer: does the game's grid.

**4–6. Overlay, stage, emit.** Cells or measured boxes drawn over the image
with per-frame indices and band tags on chips; rows played through the real
animation manager via `Texture.add`, at native size and at
`ARENA.displayHeight` (64 px) side by side; frame rate, repeat and anchor on
controls, with the loop duration on each row's tooltip.

Two lines were added to the verdict after driving the screen rather than
reading it: the grid **currently on screen** is checked separately once a field
is edited (setting frame width to 96 on Haru's sheet reports *30 blocks over
the line, 6 columns comes to 600px, the sheet is 792px*), and the ragged
warning is suppressed in grid mode — otherwise a packed sheet showed a clean
6×4 verdict directly above the over-split measurement that contradicts it.

The round-trip the plan asked for holds: `actor-haru.webp` emits

```
frameWidth: 128, frameHeight: 128, margin: 2, spacing: 4, columns: 6,
idle 8/-1, attack 16/0, levelup 9/0, hurt 13/0, displayHeight: 64
```

which is `game/data/actors.ts` exactly.

**7. Publish.** `base: '/l2d-demo/sprite-bench/'`, a build and a copy in the
Pages workflow, a third `<article>` on the landing page, and
`site/cover-sprite-bench.webp` at 1280×720, **76.6 kB** (budget was 200 kB).
The assembled `_site/` was served locally and checked: three cards, no broken
images, the bench loads under `/l2d-demo/sprite-bench/` with its two fixtures,
plays, reports 12 / 16 / 18 / 10 / 20, has no `__bench` handle (stripped from
the production bundle) and logs no console errors. Site total 21 MB → **22.6
MB**.

**8. Docs.** `tools/sprite-bench/README.md`; `CLAUDE.md` gains the layout row,
a fourth published directory in the deployment paragraph, and the
middleware variant of the borrowed-assets rule.

`npm run build` and `npm run lint` in project01, and the Live2D bench's build,
all still pass.

**9. The demo sheet, once it was on disk.** `DESIGN/game_enemy_sprite_01.png`,
1920×1080. It failed the check in the plan, and the check was wrong, not the
sheet:

*It has no alpha channel.* Three channels. What looks like transparency is
painted — a checkerboard of `#fefefe` and `#eeeeee` with compression noise on
both. Every measurement in this bench reads alpha, so the sheet arrived as one
band holding one frame. Added `src/mask.ts`: a mask keyed off the colours by
flood fill inward from the border, which takes the checkerboard and leaves the
mushroom's cream belly and the white spots on its cap. It claims **77.6%** of
the image. The verdict now leads with *this sheet cannot go into the game as it
is*, above every other number, and the keying is a checkbox with a luminance
threshold beside it. Also mounted `DESIGN/` at `/design` in dev, so the folder
CLAUDE.md says to look in first is one click rather than a copy.

*The captions do not match the art.* Labelled 12 / 16 / 18 / 10 / 20 = 76.
Actually drawn: **13 / 18 / 19 / 10 / 17 = 77**. Three of the five rows were
cropped and counted by hand to confirm the tool rather than the label — IDLE
has 13, MOVE has 18, DEATH has 17. The captions came out of the same generator
as the art. Anything that trusted them would cut every row in the wrong place,
and the plan's own acceptance criterion was one of the things that trusted
them.

*The automatic threshold was picking a number that only worked by luck.* Two
pairs of the lying-down DEATH frames are 4 px apart, so at 5 px each pair welds
into one box; half-the-median-gap chose exactly 5. Replaced with a sweep: the
count can only fall as the threshold rises, so take the widest run of
thresholds that all give the same answer. On the mushroom that is **2–4 px, all
reading 77**. Two corrections were needed before it worked — the sweep must
ignore the caption bands, whose letters merge into words at nearly every
threshold and flatten no plateau (with them in, the mushroom's plateau was one
threshold wide), and it must ignore the collapsed readings at the top, which
are always the widest run of all (without that floor the ragged fixture
reported five rows of one frame).

Final read on all four subjects:

| subject | mode | frames | threshold |
|---|---|---|---|
| `game_enemy_sprite_01` | measured, keyed | 13 / 18 / 19 / 10 / 17 | 2 (plateau 2–4) |
| `ragged-5row` | measured | 12 / 16 / 18 / 10 / 20 | 1 (plateau 1–6) |
| `grid-6x4` | grid | 6 × 4 | — |
| `actor-haru` | grid | 6 × 4 | — |

The DEATH row plays at 17 frames with a feet anchor, and the cover was
re-shot on the mushroom: 116.5 kB.

### Still open

- The mushroom sheet still needs cutting out properly before any of it can
  reach the arena, and `ActorSheet` still cannot hold a ragged sheet. Both are
  project01 edits and belong to the follow-up plan above.

The bench shipped alongside `FINISH/sprite-bench-cuts-on-painted-rulings.md`,
which is the third cut mode a second sheet turned out to need — the whole tool
went into version control in that one commit, which is why the two plans retire
together.
