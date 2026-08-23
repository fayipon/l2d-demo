# The Battle HUD, Rebuilt on the Painted UI Kit

## Goal
Re-skin the arena's HUD with `DESIGN/game_ui_01.png` — the frames, plates, bars,
pills, buttons and icons the CSS is currently imitating with gradients and
one-pixel borders.

A re-skin, not a redesign. Every panel keeps its place, its contents and its
states; what changes is what it is drawn with.

## What the source contains
`DESIGN/game_ui_01.png`, 1448x1086, alpha-cut, 23 pieces. Read off the alpha:

| Piece | Source rect | Where it goes |
|---|---|---|
| portrait frame + name plate | `20,45,610,215` (one component, cut at x≈232) | `.pilot-face`, `.pilot-name` |
| orb bar (socket + red fill) | top of `15,256,613,262`, cut at y≈415 | `.pilot-bar.is-hp` |
| ring bar (socket + empty track) | bottom of the same | `.pilot-bar.is-xp` |
| coin pill, gem pill | `1148,89,272,73` / `1148,190,272,73` | `.purse-row` |
| mail / gear / pause buttons | `1105,295` / `1216,295` / `1324,294`, ~105² | pause and back controls |
| coin / gem / skull icons | `1208,426` / `1209,541` / `1207,654`, ~105² | `.purse-icon`, `.counter-icon` |
| big panel with header | `657,380,446,589` | `.goals`, `.shop`, `.game-over` |
| circular frame | `20,519,334,342` | `.minimap-plate` |
| square frame, medium | `365,568,253,257` | `.card-plate` (level-up and shop cards) |
| circle / square / circle, small | `37,864` / `234,869` / `446,870` | `.rack-slot`, `.stat-icon` |
| dividers, three widths | `664,57,451,109` / `651,194,476,65` / `691,274,391,39` | section rules |
| corner ornaments, flourishes | `1124,772` / `1300,901` / `1321,793` / `1188,918` | panel corners |

## Decisions to confirm before start
1. **The battle HUD only.** `遊戲 UI 層` is `.game-overlay` and what it contains:
   the pilot panel, the purse, the wave readout, the minimap, the objectives
   panel, the weapon rack, the counters, and the three full-screen panels —
   level-up, shop, game over. The lobby screens were built against their own
   mocks and already have a consistent look; re-skinning them with this kit is a
   second, larger piece of work and is out of scope here. Say so if that reading
   is wrong.
2. **Stretchable frames are CSS 9-slice, not images at fixed sizes.** Every
   frame in this kit has ornate corners and a plain middle, which is exactly
   what `border-image` was made for: the four corners are drawn as-is and the
   four edges repeat. That is what lets one panel image serve the objectives
   list, the shop and the death screen at three different sizes.
   The consequence, and the reason for the next decision: `border-image` takes
   a whole image and cannot address a rectangle inside a sheet. Frames have to
   be their own files.
3. **One file per piece, about twenty of them.** Not a sprite sheet. The
   9-sliced ones cannot come from a sheet at all, and splitting the rest across
   two delivery mechanisms to save a dozen cached requests on a static host is
   not a trade worth making. Total is expected to be well under 200 kB.
4. **Baked at the size they were drawn.** Same lesson as the terrain: the pieces
   are used at roughly half their source size, and flattening them in the
   pipeline throws away the detail the display then asks for back. The pipeline
   emits native resolution and the CSS sizes them.
5. **The painted icons replace the drawn ones only on this screen.** Coin, gem
   and skull become the kit's art in the HUD; `components/icons.tsx` keeps
   serving the lobby and everything else. Two icon vocabularies in one app is
   worse than one, so this is the thing most worth overruling if the intent is
   to take the kit everywhere.

## Planned steps

### 1. Slice the kit
`scripts/uijob.mjs`, wired into `assets:optimize` next to the terrain job, with
the same rule about geometry: the rects above came off a connected-component
pass over the source's alpha and are written down once, here.

- Output to `src/assets/ui/`, one WebP per piece, native resolution, alpha
  preserved.
- Two of the components are two pieces that touch and get cut apart: the
  portrait frame from the name plate, and the orb bar from the ring bar.
- The orb bar needs a third cut. The kit draws it full, so a bar that can be
  anything other than 100% needs its socket, its empty track and a repeatable
  strip of the red fill as separate files.
- Emits `src/assets/ui/slices.json`: for each 9-sliced frame, the four
  `border-image-slice` insets, measured in the same pass. Hand-tuning nine
  numbers per frame in CSS and keeping them in step with the image is the kind
  of table that goes stale, and this project already has two files that say so.

### 2. A stylesheet for the kit
New `src/styles/ui-kit.css`, imported by `GamePage.css`: one class per piece
(`.ui-frame`, `.ui-plate`, `.ui-panel`, `.ui-ring`, `.ui-slot`, `.ui-pill`,
`.ui-divider`, `.ui-btn`), each a `border-image` or a `background-image` and
nothing else. The HUD's own stylesheet keeps the layout and drops the
gradients, inset shadows and 1px borders those classes now supply.

Kept in its own file rather than folded into `GamePage.css` because the lobby is
the obvious next user of it, and because it is the file that has to be read
beside the pipeline.

### 3. The pilot panel
Portrait frame round the head crop, name plate behind the name and level, orb
bar for health, ring bar for experience. The bars are three layers: track,
fill clipped by `width`, frame on top — which is also what finally makes the
existing `--fill` transition read as a bar draining rather than a box shrinking.

### 4. The panels
`.goals`, `.shop`, `.game-over` and the equipment sheet take the big frame,
9-sliced, with its drawn header strip holding the title each of them already
has. Section rules become the divider ornaments at the width that fits.

### 5. The round things
The minimap gets the circular frame — it is currently a CSS plate with a rim,
and the kit's ring is the same idea drawn properly. Weapon slots and stat chips
take the small square and circle frames.

### 6. The strip along the bottom, and the buttons
The purse becomes the two pills, which is what they are drawn as, including the
`+` the kit already has. The back button and a pause control take the round
buttons.

### 7. Verify
- `npm run build`, `npm run lint`.
- `npm run shot -- battle` for the HUD, plus one shot per overlay state:
  `--click` into the level-up card row, the shop, and the equipment sheet.
- `npm run verify` must still pass — none of this touches the simulation, and if
  it does, something has gone in the wrong file.
- Checked at more than one window size. The whole point of 9-slice is that a
  panel is right at any height, and a fixed-size image that happens to fit at
  1600x900 is the failure this is meant to avoid.

## Out of scope
The lobby screens. New HUD information or new controls — nothing gains a
feature here. Sound. The arena itself: this is all DOM, and Phaser draws none
of it.

## Risks
- **`border-image` and rounded interiors.** The name plate's interior is a
  rounded rectangle, not a rectangle. 9-slicing it gives straight edges between
  the drawn corners, which is correct for the frame but means the interior fill
  behind it has to match — a `border-radius` on the element under the frame, or
  a visible mismatch at the ends.
- **These frames are heavy.** Ornate corners at the size of a stat chip turn
  into mush. Some of the smaller elements may be better left as they are, and
  the shot at step 7 is what decides which.
- **Contrast.** The kit is near-black with red ornament, and so is the arena it
  will be sitting on top of. Panels that currently read against the floor by
  being darker than it may stop reading at all; the backdrop behind each panel
  is likely to need lifting.

## Notes
Execution starts only after the user explicitly says start.

## Progress

Done. What was built, and where it differs from the plan.

**Step 1 -- the slicer.** `scripts/uijob.mjs`, wired into `assets:optimize`. The
sheet is alpha-cut, so the rectangles came off a connected-component pass, and
each frame's nine-slice insets were measured by walking out from the centre of
the piece until the interior stopped -- a filled frame until its flat backing
ends, a hollow one until the alpha comes back. Output is
`src/assets/ui/`: fifteen WebP pieces and a generated `kit.css`, about 310 kB.

Two things the plan did not anticipate.

*Fifteen pieces, not twenty-five.* `kit.css` names every file it cuts, so the
bundler cannot drop one nobody uses -- an unused piece is bytes in the bundle
with nothing pointing at it. The gem pill, the gem icon, the three round
buttons, the second round slot, the corner ornaments and the flourish are all
left in the sheet, because the honest uses for them would have been invented
features: there is no pause, no settings and no mail in this game. Adding one
back is a line in `uijob.mjs`.

*The generated file is CSS, not JSON.* CSS cannot import JSON, and the numbers
are only ever consumed by CSS. Each rule writes its border widths as
`calc(<inset>px * var(--uk))`, so a caller sets one number -- `--uk: 0.46` --
and the whole frame lands at that fraction with its corners undistorted. The
ring also carries its hole as four percentages, measured the same way, so the
minimap canvas is positioned *into* the frame rather than behind it.

**Steps 2-6 -- the HUD.** `src/styles/ui-kit.css` holds what the generated file
cannot know, and `GamePage.css` keeps the layout with its gradients and
one-pixel borders removed.

- **The pilot panel** is the kit's own composition, which turned out to be a
  pilot panel already: portrait frame beside name plate, orb health bar under
  them, ring experience bar under that. The four are placed at their source
  widths times `--uk`, including the small left offsets the sheet draws them
  with -- the plate and the two bars do not start at the same x, and copying
  that is the difference between a drawn panel and four pieces in a column.
- **The bars** are the drawn piece with its middle dropped, so the element's
  content box *is* the channel and the fill is an ordinary block child needing
  no positioning. The health fill is a strip of the artist's own lit red taken
  from the middle of the drawn bar; the experience bar is drawn empty in the
  kit and keeps a gradient.
- **The purse** is the coin pill, which is drawn with its coin in it -- so the
  icon element is gone.
- **The minimap** is the ring, with the canvas in the hole.
- **The objectives panel** is the big frame, and its heading moved up into the
  frame's own drawn title bar.
- **The cards** are the medium frame. Rarity used to be the border colour and
  the border is now one painted image for every card, so the tone moved inside:
  the interior gradient it already had, a glow, and a brightness lift on hover.
- **The kills counter** is the kit's skull.

**Where the plan was wrong.** It said the panel frame goes on `.shop` and
`.game-over` as well. Those two are not panels -- they are full-screen scrims
with centred content, and a frame stretched across 1600px is a frame nobody
drew. They keep their scrim; their cards carry the kit instead. The death
screen's payout row also stays gold: it is the one element on that screen meant
to be the brightest thing on it, and re-skinning it in near-black would be
re-skinning away its job.

**One cascade trap, worth writing down.** A card is a `<button>`, and the
overlay's reset had `.game-overlay button { border: none }`. That selector is
more specific than `.uk-frame-md`, so the frame drew nothing at all -- which
looks exactly like a missing image and is not. The reset's border clause now
excludes anything wearing a kit class, and the kit is imported by the component
after `GamePage.css` rather than by an `@import` at the top of it.

**Also.** `npm run shot` gained `--key`, which presses keys before the shot. The
equipment sheet opens on I and has no button, so it was otherwise
unphotographable. `optimize-assets` learned two small things: a job whose named
output is not an image, and a subdirectory that is itself a job's output.

### Measured

- `npm run build`, `npm run lint`: clean.
- `npm run verify`: **28/28**. None of this is within reach of the simulation,
  and that is the check that says so.
- `npm run shot -- battle` at 1600x900 and at 1280x720, plus the level-up cards,
  the shop, the equipment sheet and the death screen -- the last three reached
  through the dev handle. Nothing clips, nothing stretches, and no frame's
  corners are distorted at either size. No console errors.
- `src/assets/ui/` is about 310 kB across fifteen pieces; the largest is the panel at
  48 kB.

### Two after the first look

**Coins and experience are the medallions, not the pill.** The purse was the
kit's coin pill, and experience was a caption under its own bar. They are now
the pair of round medallions with a number each: the two are read together, and
one of them is a fraction -- a pill is a fixed shape with a fixed amount of room
in it, so the two would have had to disagree about how wide they were. The coin
pill leaves the cut; the gem icon joins it, and the count stays fifteen pieces.

**The cards had a see-through strip under their top rail.** The frame's top
slice is deeper than the rail drawn in it -- the centre diamond reaches the full
depth and the rail does not -- so with the interior clipped to the padding box
there was a gap all the way across between the ornament and the card. The card's
interior now runs under the border instead, with a radius so that does not
square off corners whose silhouette is spikes. The ornament draws over it, and
what shows through the gaps in the ornament is the card rather than the screen.

**And the experience bar came out.** Once experience was a medallion carrying
`2 / 10`, the bar under the health bar was a second, quieter way of saying the
same thing. The kit's smaller bar leaves the cut with it -- thirteen pieces and
a fill strip now, 281 kB.

**The scene label moved to the minimap.** It sat above the wave clock, which
put two unrelated answers in one column -- which fight this is, and how far into
it you are -- and only one of them ever changes. The minimap is the panel that
is about the place, so `SCENE 1-1 · 血色祭壇` is its header now, and the clock has
the middle of the screen back.

### The minimap became an instrument

Three changes, in the order they were asked for.

**Pale ground on a dark field.** A near-black map inside a near-black HUD on a
near-black arena was three dark things stacked, and the dots were the only
thing on it with any contrast -- so it read as a scatter of dots rather than a
picture of a place. The arena is now filled pale with a lit edge, the enemy dots
are red circles rather than dark-red squares, and the grid came off: at this
scale the floor's 64px ruling is a grey wash, and every tenth line read as graph
paper.

**Bounded by vision, which reverses what the file used to say.** Its old comment
argued that vision already takes the screen away and taking the map with it
would make every point of the stat a catastrophe rather than a trade. What that
produced was a whole-world map that never changed -- a picture, not an
instrument -- and a stat whose only expression was the dark closing in. The map
is now a window on the world, `VISION_MARGIN` (1.4) wider than what the player
can actually see, centred on them and sliding under them. Buy vision and the
window opens. Near a wall the ground stops inside it, which is the only thing on
the map that says which way is out.

The margin is the whole value: at 1.0 the map would show exactly the lit circle
and be a smaller copy of the screen. The ring drawn on it is the line between
the two, and it lands in the same place every frame because the window is that
circle times a constant.

**Circular frame, kept.** It was squared off for a round of this and put back.
Fitting a 16:9 world into a circle threw away the corners of the world to show
the corners of a circle -- but the map is not the world any more, it is a radius,
and a circular window on a circular quantity throws away nothing.
