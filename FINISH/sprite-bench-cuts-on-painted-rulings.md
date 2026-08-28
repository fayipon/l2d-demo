# 照線切 — the bench reads the grid the artist painted

## Goal

A third cut mode in `tools/sprite-bench`, beside **照量測** (split on transparent
gaps) and **照格線** (apply the game's four packing constants): **照線**, which
finds the cell rulings *drawn into the image* and cuts on those.

`DESIGN/game_enemy_sprite_02.png` is the subject. It is the same mushroom as
`_01` — same five actions — but the generator drew a box around every frame,
and that one change defeats both existing modes.

## Why the existing two modes cannot read this sheet

**照量測 measures alpha, and this sheet has none.** Same as `_01`: 1920×1080,
three channels, the checkerboard is painted. `mask.ts` already handles that by
keying a mask off the colours and flood-filling inward from the border.

**But the rulings wall the flood fill in.** Measured on the file: the ruling
grey is `116,115,114` — luma 116, chroma 2. `DEFAULT_MASK` is `luma: 200`, so
every ruling pixel is *foreground*, and the rulings form a closed box around
every cell. The fill enters at the four corners, hits the boxes, and stops:
**backgroundRatio 40.9%**, against 77.6% on `_01`. With no transparent column
anywhere in the image, the sheet reads as **1 band holding 1 frame**.

Dropping the luma threshold to 100 lets the fill eat the rulings and the sheet
does split — 65.1%, `14 / 16 / 14 / 14 / 15` — but two of those five rows are
wrong (see the table below), because once the rulings are gone the split falls
back to guessing from gaps between the art. That is the wrong instrument: the
sheet is *telling* us where the cuts are and we are ignoring it and measuring
shadows.

**照格線 needs a uniform pitch and there isn't one.** Measured pitch per band:
140 / 116 / 131 / 143 / 140. Five different numbers, and within band 4 the gaps
run 93 to 188. No `frameWidth` describes this sheet.

## What the rulings actually say

Measured with a throwaway script (`scratchpad/rulings.mjs`) before writing this
plan, so the plan is built on numbers rather than on a hope:

Horizontal rulings at **y = 0, 214, 413, 609, 806, 1078** — five bands. Two
false candidates at y 384 and y 580 are drop-shadow edges sitting 28–29 px
above a real ruling; clustering candidates within 40 px and keeping the
strongest kills both.

| band | y | pitch | cells | frames actually drawn |
|---|---|---|---|---|
| 0 · IDLE | 0..214 | 140 | 14 | **13** — cell 13 is empty |
| 1 · MOVE | 214..413 | 116 | 16 | **16** |
| 2 · ATTACK | 413..609 | 131 | 15 | **15** |
| 3 · HURT | 609..806 | 143 | 14 | **14** |
| 4 · DEATH | 806..1078 | 140 | 14 | **15** — one ruling is missing |

73 frames. Every band was cut and looked at frame by frame to get that last
column; the overlays are in the scratchpad.

Against the two things the current tool reports:

| row | 照量測 @ luma 100 | 照線 (cells) | true |
|---|---|---|---|
| 0 | 14 | 14 | 13 |
| 1 | 16 | 16 | 16 |
| 2 | **14** | 15 | 15 |
| 3 | 14 | 14 | 14 |
| 4 | 15 | **14** | 15 |

Neither is right on its own, and they are wrong in *different* rows. That is
the finding, and it is why the two exceptions below are part of the feature
rather than something to paper over.

**Exception 1 — an empty cell is still a cell.** IDLE's row is 13 poses and one
empty box; the sheet is 1920 px and 14 × 140 is 1960, so the generator ruled a
14th cell and drew nothing in it. 照線 must count it (it is a cell) and then
mark it empty (nothing opaque inside), because a 14-frame IDLE plays a blank
frame in the arena once a cycle.

**Exception 2 — a missing ruling welds two frames.** DEATH's last cell is
188 px against a ~120 px pitch and holds two things: the body with its cap, and
a detached cap that has rolled clear. There is no ruling between them. This is
the case where 照量測 is right and 照線 is wrong, and it is exactly what the
existing hand-editable splits are for — but the tool has to *say* the cell is
anomalously wide rather than leave it to be spotted.

## Decisions to confirm before start

**1. 照線 is a third mode, not a smarter 照量測.** Same reason the bench grew
照格線 rather than a better gap heuristic: these are different questions asked
of different evidence, and a mode that silently switches strategies is a mode
whose answer cannot be checked. The verdict names which mode produced the
numbers, as it does now.

**2. The mode is offered, not forced.** The bench proposes 照線 when it finds
rulings that partition the image (≥2 horizontal rulings spanning >80% of the
width), the same way it already proposes 照格線 when the game's constants cut
cleanly. The radio stays switchable.

**3. Ruling colour is a control, not a constant.** Default: grey (chroma ≤ 16),
luma 80–205 — above ink and below the checkerboard. Exposed as a min/max pair
beside the existing 亮度 field, because the next sheet's rulings will be some
other grey and hardcoding 116 makes the tool a one-file tool.

**4. Missing rulings are filled by pitch, and the fill is visible.** Where art
crosses a ruling its coverage drops below the threshold and the line is lost;
the gap is then an integer multiple of the pitch and the interior lines are
interpolated. Interpolated lines draw dashed in the overlay, so a wrong guess
is visible rather than merely wrong. This is what recovers band 1's 16 cells
from 13 detected lines.

**5. 照線 fixes the mask too.** Once the rulings are known, the flood fill runs
**per cell** instead of once from the image border, which is what the rulings
were blocking. Expected: `_02`'s backgroundRatio goes from 40.9% to something
near `_01`'s 77.6%. That number is the step's acceptance check.

**6. Nothing is written into `project01`.** Unchanged from the bench's original
rule: this emits text.

## Steps

1. **`src/rulings.ts`** — horizontal pass, shadow-candidate clustering, per-band
   vertical pass, pitch fill. Pure function over RGBA, no DOM. [the five bands
   and per-band cell counts on `_02`, against the table above]
2. **Wire it as a mode.** Third radio, the ruling-colour controls, the proposal
   rule, the verdict line naming the mode. The two fixtures and `actor-haru`
   must be unaffected — they have no rulings and must not grow any. [all four
   existing subjects re-read, unchanged]
3. **The two exceptions, on screen.** Empty cells marked and excluded from the
   emitted frame count with a note; cells wider than 1.4× the band pitch
   flagged as *possibly two frames*, with the hand-split already available.
   [`_02` reads 13 / 16 / 15 / 14 / 15 with one empty cell and one wide-cell
   flag]
4. **Per-cell masking.** `mask.ts` takes an optional cell list and fills from
   each cell's own border. [`_02` backgroundRatio, before and after]
5. **Play it.** The five rows named and played at both sizes, so the frame
   rates for a 13/16/15/14/15 mushroom are chosen by watching rather than
   guessed. [chosen fps per row, and the bench's own fps]
6. **Docs.** `README.md` gains the third mode and the two exceptions; the
   ruling-grey measurement goes in beside the caption and packed-sheet notes
   already there.

## Before calling it done

- `npm --prefix tools/sprite-bench run build` passes.
- `ragged-5row`, `grid-6x4` and `actor-haru` read exactly what they read today.
- `_02` reads **13 / 16 / 15 / 14 / 15**, and turning 照線 off returns the
  current 照量測 answer rather than the new one.
- A screenshot of `_02` playing DEATH.

## What this still does not do

`ActorSheet` still cannot hold 13 / 16 / 15 / 14 / 15, and `_02` still has no
alpha, so it still cannot go into the arena. Both remain the follow-up named at
the end of `PLANS/sprite-sheet-bench.md` — a project01 plan, written once the
numbers here are settled.

## Progress

Shipped as one commit — the bench was still entirely untracked when this
started, so there was no earlier state to land against.

1. **`src/rulings.ts`.** Horizontal pass, shadow clustering, per-band vertical
   pass, pitch fill. Reads `_02` as five bands at y **0 / 214 / 413 / 609 /
   806 / 1078**, pitch **140 / 116 / 131 / 143 / 140**, cells
   **14 / 16 / 15 / 14 / 15** — the table above, reproduced from the file
   rather than from the throwaway script.
2. **Wired as a third mode.** `照線`, its own radio, hidden until a sheet turns
   out to be ruled. The other four subjects re-read unchanged: `_01` measured
   13 / 18 / 19 / 10 / 17, `actor-haru` grid 6 / 6 / 6 / 6, `ragged-5row`
   measured 12 / 16 / 18 / 10 / 20, `grid-6x4` grid 6 / 6 / 6 / 6, and
   `findRulings` returns null on all four.
3. **The two exceptions.** IDLE's fourteenth cell reads empty and is dropped;
   DEATH's 188px cell is re-cut. `_02` reads **13 / 16 / 15 / 14 / 15**.
4. **Per-cell masking.** `buildMask` takes an optional seed list.
   `backgroundRatio` on `_02`: **40.9% → 62.7%**. Short of `_01`'s 77.6%, and
   the plan's guess that it would land near it was wrong — the ruling lattice
   is drawn ink and stays, which is the difference. Written down in the README
   rather than quietly dropped.
5. **Played.** Named idle / move / attack / hurt / death at 8 / 14 / 18 / 16 /
   12 fps — 1.63s idle loop, 1.14s walk cycle, 0.83s attack, 0.88s hurt, 1.25s
   death — and watched at native size and at the arena's 64px. These are
   starting points chosen from cycle length, not from a long look; the sliders
   are there.
6. **Docs.** `README.md` grew the third mode and a section on what `_02` turned
   out to be.

**One thing was designed differently from the plan.** Decision 4 said an
over-wide cell would be flagged and hand-split. It is re-cut automatically
instead, because the flag could not be raised the cheap way: the seam between
the body and the rolled-off cap is not empty, it carries 5 rows of the ground
shadow both cast against 44 through the art either side, so there is no
transparent column for a hand-split to snap to. A relative floor — emptiest
interior column, below a quarter of the cell's own median — finds it, and the
derived line draws dashed like the interpolated ones.

**What this still does not do**, unchanged: `ActorSheet` cannot hold
13 / 16 / 15 / 14 / 15, and `_02` still has no alpha. Both are project01's,
and both are still the follow-up named at the end of
`PLANS/sprite-sheet-bench.md`.
