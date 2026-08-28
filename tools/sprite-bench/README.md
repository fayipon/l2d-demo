# 精靈圖檢測台

A bench for answering three questions about a character sheet before it goes
near the arena: **where does it cut**, **does it read at the size the game
draws it**, and **what numbers does `actors.ts` need**.

```bash
npm --prefix tools/sprite-bench install
npm --prefix tools/sprite-bench run dev
```

http://localhost:5175 — 5173 is the game and 5174 the Live2D bench, so all
three can be open at once, which is the normal way to use this.

## Why it exists

The arena's sprite path has one failure mode and it is silent.
`project01/scripts/optimize-assets.mjs` lays a sheet out on
`SPRITE_FRAME 128 / SPRITE_MARGIN 2 / SPRITE_SPACING 4`, and
`project01/src/game/data/actors.ts` hands `load.spritesheet` its own copy of
those numbers. Nothing checks that the two agree, and nothing can: a loader
told the wrong frame size does not fail, it draws a quarter of one pose and a
sliver of the next. `npm run build` cannot see it. `npm run verify` cannot see
it.

The other half is tuning. `idle 8fps`, `attack 16`, `levelup 9`, `hurt 13` in
`actors.ts` were arrived at by editing that file, restarting the game, picking
a character, starting a run and getting hit on purpose to see `hurt`. Here they
are sliders.

## The three ways a sheet gets cut, and why there are three

**照量測 (measured).** Frames are found from the alpha channel: rows of fully
transparent pixels split the image into bands, then columns of fully
transparent pixels split a band into frames, each trimmed to its own bounds.
Nothing is assumed — not the frame size, not the pitch, not that the rows are
the same length.

**照格線 (grid).** Frames are cells of a grid the tool is told, and the
measurement becomes the evidence: every drawn pixel inside exactly one cell is
what "this grid cuts this sheet" means.

**照線 (rulings).** Frames are the boxes the artist *drew around them*. Offered
only when the sheet turns out to have a painted grid, which is not exotic — it
is what a generated contact sheet looks like. See the section on
`game_enemy_sprite_02.png` below; on that file it is not a nicety, it is the
only mode that works at all.

Three modes rather than one clever cut that switches strategies, because these
are three different questions asked of three different kinds of evidence, and
an answer whose method is not on screen is an answer nobody can check. The
verdict always names the mode that produced the numbers.

The second mode is not a convenience. **A packed sheet cannot be measured**,
and the numbers say why. On `project01/src/assets/actor-haru.webp`:

| gap | pixels |
|---|---|
| between frames | 4–5 |
| inside a frame (arm to body, between the legs) | 1–9 |

The two populations overlap completely, so no threshold separates them. Point
measured mode at that file and it reports five rows of 17 / 9 / 19 / 9 / 10
instead of four rows of 6. The bench picks grid mode by itself when the game's
own numbers cut the sheet cleanly, which is the case for every sheet
`optimize-assets.mjs` has written.

## The other number that cost an afternoon

**A grid cannot be recovered from content, only checked against it.** Art does
not touch its cell edges, so the cell boundaries are not observable — only the
pitch is. The 792×528 sheet is described equally well by
`frame 128, margin 2, spacing 4` and by `frame 132, margin 0, spacing 0`: every
drawn pixel is inside a cell under both readings, and no amount of looking
separates them.

So the bench does not answer "what grid is this". It answers "**does the
game's grid fit this**", which has one right answer, and lists the other
readings underneath so the ambiguity is visible rather than hidden.

## What the sheet it was built for turned out to be

`DESIGN/game_enemy_sprite_01.png` — a mushroom enemy, five labelled rows — is
the file this bench was commissioned for. Three things about it, none of which
were visible by looking:

**It has no alpha channel.** Three channels, and the transparency you see in a
viewer is *painted*: a checkerboard of two light greys, `#fefefe` and `#eeeeee`,
with compression noise wobbling both. Everything here measures alpha, so
without help the whole sheet reads as one band holding one frame. `src/mask.ts`
keys a mask off the colours instead — flood fill inward from the border, so the
mushroom's cream belly and the white spots on its cap survive — and it swallows
77.6% of the image. **The sheet cannot go into the game in this state**, and
the verdict says so above every other number.

**The captions are wrong.** The rows are labelled IDLE (12), MOVE (16), ATTACK
(18), HIT (10), DEATH (20) — 76 frames. What is actually drawn is
**13 / 18 / 19 / 10 / 17 = 77**, and three of the rows were counted by hand to
confirm it. The labels came from the same generator as the art and are
decoration, not data. A pipeline that trusted them would cut every row at the
wrong place.

**Its DEATH row cannot be split at the threshold that suits the rest.** Two
pairs of the lying-down frames are 4 px apart, and any threshold of 5 or more
welds each pair into one box.

## The second sheet, which broke it in a new way

`DESIGN/game_enemy_sprite_02.png` is the same mushroom redrawn — same five
actions, 1920×1080, and the same painted checkerboard instead of an alpha
channel. One change defeats everything above: **the generator drew a box around
every frame.**

The ruling grey measures `116,115,114` — luma 116, chroma 2. `mask.ts` keys
background at luma 200, so every ruling pixel is *foreground*, and the boxes
are closed. The border flood fill enters at the four corners, claims 40.9% of
the image and stops, leaving the checkerboard sealed inside every cell. With no
transparent column anywhere in the image, measured mode reads the sheet as
**one band holding one frame** — while grid mode is no better, because the
per-band pitch is 140 / 116 / 131 / 143 / 140 and no `frameWidth` describes
that.

So the sheet is *telling* the tool where every cut goes and both existing modes
ignore it. `src/rulings.ts` reads the lines instead, and `buildMask` grew an
optional seed list so the fill can start from each cell's own border rather
than from the image's — which is what unseals the cells. That takes the fill
from **40.9% to 62.7%** of the image; the shortfall against the first sheet's
77.6% is the ruling lattice itself, which is drawn ink and stays.

**The painted grid gets two things wrong, and both had to survive to the
screen.**

*A ruling can be hidden.* Art stands in front of the line and its coverage
drops below any threshold that is not also picking up drop shadows. What is
left is a gap that is an integer multiple of the pitch, so the interior lines
are interpolated — and drawn **dashed**, so a wrong guess looks wrong instead
of merely being wrong. Three of this sheet's lines are inferred that way: two
in the attack row, one in hurt.

*A ruling can be missing from the art.* The DEATH row's last cell is 188 px
against a 140 px pitch and holds two poses — the body, and the cap that has
rolled off it — with no line between them. Pitch interpolation cannot help:
188/140 rounds to 1. And measuring cannot help either, because the seam is not
empty: it carries 5 rows of the ground shadow both poses cast, against 44
through the art either side. So an over-wide cell is re-cut at its emptiest
interior column, on a *relative* floor rather than on a search for nothing.

**And a cell can be ruled and left blank.** The sheet is 1920 px wide and
14 × 140 is 1960, so the generator ruled a fourteenth IDLE cell and drew
nothing in it. It is a cell — which is why the grid reads 14 — but it is not a
frame, and counting it would play a blank every cycle. Blank cells are marked
`空` on the overlay and excluded from the counts.

What the three modes make of the same file:

| row | 照量測 | 照線, as cells | shipped |
|---|---|---|---|
| 0 · idle | — | 14 | **13** (one blank) |
| 1 · move | — | 16 | **16** |
| 2 · attack | — | 15 | **15** |
| 3 · hurt | — | 14 | **14** |
| 4 · death | — | 14 | **15** (one cell re-cut) |

Measured mode has no column at all here: it reads `1`. Drop the keying
threshold to 100 so the fill eats the rulings and it manages
14 / 16 / 14 / 14 / 15 — which is wrong in rows 2 and 4, and wrong in
*different* rows than the raw ruling count is. Neither is right alone. That is
the argument for the third mode in one line.

Two things it still does not fix: `ActorSheet` cannot hold 13 / 16 / 15 / 14 /
15 any more than it could hold the first sheet's rows, and `_02` still has no
alpha. Both are project01's problem and neither is solved here.

## The threshold that is not a coincidence

Which is what the last point is really about. Raising the split threshold can
only merge boxes, so the count falls in steps as it rises, and a *flat stretch*
is what a real measurement looks like: a range of thresholds that all give the
same answer. The bench sweeps 1 to 24 and takes the widest flat stretch. On the
mushroom that is 2–4 px, all reading 77; the first rule tried — half the median
gap — picks 5 px, which is inside the next step down.

Two things the sweep has to be told, both found by getting them wrong:

- **Ignore the caption bands.** Their letters merge into words and words into a
  line, so their count changes at nearly every threshold and no stretch is ever
  flat. With them included the mushroom's plateau was one threshold wide.
- **Ignore the collapsed readings.** The widest flat stretch of all is always
  the one at the top, where every row is a single box and nothing can merge
  further. A stretch only counts while it still holds at least half the boxes
  the finest threshold found. Without that floor the ragged fixture reported
  five rows of one frame.

## The fixtures

Two, both generated by `scripts/build-fixture.mjs`, both asserting their own
output — every box probed for its row's exact hue, every pixel outside a
declared box required to be alpha 0, and a leak fails the build rather than
warning.

```bash
npm --prefix tools/sprite-bench run fixture
```

`grid-6x4.webp` — the game's shape, 6×4 cells of 128 with margin 2 and spacing
4, **with the drawing inset by a different amount in every cell**. That last
part is the file's whole purpose: content that fills its cell makes the grid
check trivial and untested, and real art never fills its cell.

`ragged-5row.webp` — the demo sheet's shape without its art: rows of 12, 16,
18, 10 and 20, a different box size per row, left-aligned and ragged, each row
captioned above itself so the label-rejection pass has something to reject.

They exist because a bench needs subjects whose answer is known *before* the
tool is asked. The mushroom sheet's counts are known only because somebody
counted them by eye, and counting them by eye is the thing being automated.

## What it found on day one

**The game's data shape cannot describe a ragged sheet.** `ActorSheet` carries
one `columns`, and `ArenaScene.buildActorAnimations` derives every row from it
— `first = row * columns`, `end = first + columns - 1`. For rows of
12 / 16 / 18 / 10 / 20 there is no value that is right for two of them. The
bench says so on screen and emits, instead of a block that would compile and
draw garbage, the two ways forward: give each animation its own frame count, or
re-lay the sheet onto a uniform grid using the slice spec it also emits.

That edit belongs to project01 and is not made here.

## Two smaller things it learned to ignore

**Captions.** `IDLE (12)` is part of the image on sheets that label themselves,
and `game_char_sprite_01.png` has a label plaque `optimize-assets.mjs` dodges
by starting its grid at `left: 61`. Bands are sorted by height, the largest
ratio jump between neighbours is taken as the split, and short narrow bands
below it are proposed as captions. The first version compared each band against
the median instead, and on the ragged fixture — five captions of 18 px and five
rows of 48 to 80 — the median landed at 33 and every caption counted as a
one-frame animation. 81 frames instead of 76.

**Slivers.** The game's own sheet has a two-pixel band at y 398, a shadow edge
belonging to the row below. Anything under 12% of the tallest band is called
noise. Both judgements are checkboxes in the table, because a sheet whose first
animation is one small frame is indistinguishable from a caption by geometry.

## How it relates to project01

**Phaser is pinned exactly and must match project01's.** `4.2.1`, no caret. The
question this tool answers is whether a sheet will play in the game, and a
bench on a different Phaser answers for a Phaser the game is not running.

**Frames are registered with `Texture.add`, not `load.spritesheet`.** That is
the one thing here the game does not do, and it is deliberate:
`load.spritesheet` can only cut a uniform grid, and half the point is to play
sheets that have none. Everything after that — the animation manager, the frame
rate rounding, what `repeat: 0` does on the last frame — is the game's own code
path.

**It imports nothing from `project01/src`.** The four packing constants are
copied into `src/game.ts`, which is a third place that knows them, and the
comment there says why that is acceptable: those numbers are a *hypothesis*
printed on screen, not a number anything is loaded with, so drift produces a
loud wrong answer rather than a silent one.

**The game's own sheet is dev-only.** `actor-haru.webp` lives in `src/assets`
and Vite hashes it into project01's bundle, so unlike the Live2D models there
is no published URL to borrow. In dev the middleware in `vite.config.ts` serves
the real file from where it lies; the published bench has the two fixtures and
the drop target, and cannot offer it. That is the trade against shipping a copy
that goes stale — see the note in `tools/l2d-viewer/README.md`, which reaches
the same conclusion from the other direction.

## Not here yet

An onion-skin — the previous frame ghosted under the current one — is the
obvious next thing for judging whether a walk cycle actually loops. It waits
until the bench has been used enough to say whether it is wanted.
