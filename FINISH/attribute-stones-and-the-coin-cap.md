# Attribute Stones, and a Ceiling on the Coin Rate

## Goal
Give the shop a way to sell the six primaries — three grades of each, priced so
the grades span the shelf LUK walks along — raise the opening coin rate, and cap
the coin rate at 200% so it stops being the one stat with no ceiling.

## The problem, stated exactly

LUK does three things: crit, coin rate, and the shelf. The shelf is the one
worth looking at, from `rollShop`:

```
bias   = min(1, luck / 255) * 0.7
cursor = floor((bias + (1 - bias) * roll) * shelf.length)   // shelf sorted cheap -> expensive
```

So LUK decides how far up a price-sorted shelf the walk starts. At luck 0 it is
uniform; at the cap it starts 70% of the way along.

**Nothing in the game raises LUK.** It comes from the class's `start` and its
`growth` and from no other source. Which means:

| | LUK at level 1 | at level 20 | bias |
|---|---|---|---|
| Rice | 30 | 57 | 0.16 |
| Hiyori | 16 | 24 | 0.07 |
| Mao | 18 | 26 | 0.07 |
| Haru | 10 | 16 | 0.04 |

Every run in the game plays at a bias between 0.04 and 0.16 — that is, at
effectively uniform. The 70% at the top of the range is unreachable, so the
expensive end of the shelf is never favoured by anything and the whole mechanism
is decoration. The same is true of the weapon-tier reach: `LUCK_PER_TIER` is 85,
and only Rice ever crosses even one step of it.

The other half is the coin rate. It has no ceiling at all. `ownedItems` is a
list that takes duplicates, so five 賞金袋 across a long run is `+2.75` on top of
a base of `0.45` and 255 LUK's `+0.51` — a rate over three, which is three
guaranteed payouts a kill and a stat that has stopped being a decision.

## Decisions to confirm before start

**1. Items get to write attributes, which they cannot do today.**

`ShopItem.mods` is `Partial<PlayerStats>`, and the six primaries are the layer
*above* that block, not entries in it. So this needs a second field —
`attrs?: Partial<Attributes>` — and a change to `recomputeStats`.

The trap is the one `recomputeStats` already documents. `World.attributes` is
accumulated, written by `grantXp` at every level; if items also added into it,
every point already bought would be added again on the next rebuild, and the
symptom (attributes that grow when nothing bought anything) is a long way from
the cause. So `World.attributes` stays **earned only** — loadout plus levels —
and the recompute sums the items into a *working copy* before deriving:

```
effective = clamp(earned + sum(item.attrs))   ->   deriveAttributes(effective)
```

**2. The sheet then has to show the effective six, not the earned six.**
`ArenaScene` publishes `{ ...world.attributes }` and the equipment sheet renders
it against `/255`. If items add attributes and this keeps publishing the earned
number, the sheet reports a number the run is not playing with. A run's
attributes become a derived value with one writer, same as the stat block.

**3. Uniform point values, per-attribute prices.**

A point is not worth the same in every column, and pretending otherwise makes
one stone strictly the best buy at every price. Against what the shelf already
charges for the same effect:

| | per point | from |
|---|---|---|
| STA | ~3.6c | 鐵心 4hp/24c and 護符 3護甲/22c |
| AGI | ~1.8c | 輕扳機 and 影步 |
| STR / DEX / INT | ~1.3c | 鐵手甲 1近戰攻擊力/26c |
| LUK | ~0.7c + premium | 鷹眼鏡 and 幸運符, plus the shelf it buys |

So every stone at a grade gives the **same number of points** and costs what
those points are worth in that column. A player reads "STA stones cost more
because STA does more", which is a true thing about the game rather than a
balance patch.

LUK carries a premium over its arithmetic for the reason 幸運符 already does:
it buys the shelf, which buys everything else. It is the only stat here that
compounds.

**4. LUK stops biasing a cursor and starts rolling a grade.**

The current mechanism is replaced, not extended. Today the shelf is sorted by
price and LUK moves where a walk along it begins — which means **price is
rarity**, the two are the same axis, and what a given LUK is actually worth is
not something anyone can state without simulating it.

Instead: every item carries a **grade**, LUK falls in a **band**, and the band is
a distribution over grades.

| LUK band | 1階 | 2階 | 3階 |
|---|---|---|---|
| **I** — 0–59 | 75% | 25% | — |
| **II** — 60–139 | 50% | 35% | 15% |
| **III** — 140+ | 25% | 45% | 30% |

Each of the four shop slots rolls a grade from the run's row, then takes a
uniform pick among the items of that grade that suit the rack and are not
already on the shelf.

Two things this buys beyond legibility:

*Price and rarity come apart.* An item can be cheap and rare or expensive and
common, which is design space the price-sorted walk did not have. 分裂彈 is the
example — 68 coins and build-defining, and it should be rare because of the
second thing and not the first.

*The bands are where a stone lands.* Haru opens at 10 LUK and reaches 15 by
level 20; one grade-II LUK stone is +45 and puts him in band II. That is a single
purchase visibly changing what the shop offers for the rest of the run, which is
the progression loop the stat has never had. Band III at 140 needs a 神髓 or
several 結晶 — genuinely late.

**The fallback rule.** A rolled grade can come up empty: 3階 is seven items and
four of them may already be on the shelf. The rule is **fall to the next grade
down**, and only ever down — falling upward would hand a low-LUK run the rare
shelf it did not earn, which is the one thing this table exists to prevent.

**Weapons use the band, not the table.** `rollShop`'s weapon branch has its own
tier ceiling with `LUCK_PER_TIER = 85` hardcoded in it. That constant goes and
the band index (0/1/2) replaces it — `ceiling = min(4, 1 + floor((wave-1)/5) +
band)` — so there is one definition of what a LUK band is. Weapons do not get a
distribution table of their own in this pass; tiers run to 4 and grades to 3, and
forcing them onto one axis is a decision that should wait until the item side has
been played.

## The table

### Stones
| grade | points | STR/DEX/INT | AGI | LUK | STA |
|---|---|---|---|---|---|
| I 原石 | **+12** | 24 | 30 | 26 | 42 |
| II 結晶 | **+45** | 110 | 135 | 125 | 180 |
| III 神髓 | **+120** | 400 | 440 | 420 | 500 |

Eighteen items. Grade I sits among the cheap existing items (18–34), grade II
alone above the current top of 68, grade III in a band nothing else on the shelf
occupies.

### What grade III costs, honestly

At 400 a STR 神髓 is about **2.5× the coin cost of the same melee power bought
as 鐵手甲** — 120 points is 6 attack power, and six 鐵手甲 is 156 coins. The
gap is not an accident and it is worth writing down, because it is the argument
for the whole grade:

**The scarce resource in this shop is slots, not coins.** Four offers a visit,
items do not repeat within a layout, and the shelf is rolled — so six 鐵手甲 is
not a 156-coin purchase, it is six separate visits that each have to *offer* one.
A stone converts coins, which a good run has, into shop bandwidth, which no run
has. That is what the premium buys.

Where it stops working is the two columns that feed exactly one derived number:

| | per point | the whole column, 0 to 255 |
|---|---|---|
| STA — 生命 and 護甲 | 3.6c | 918c |
| AGI — 攻速 and 閃避 | 1.8c | 459c |
| LUK — 暴擊, 金幣 and the shelf | ~1.5c | 382c |
| **STR / INT** — one stat each | **1.3c** | **331c** |

So a 400-coin STR stone is priced above what the entire attribute is worth if
bought from zero to the cap. **STA carries 500 comfortably, AGI and LUK sit on
the line, and STR and INT do not reach it.** Three ways out, and this is the one
decision in the plan I have not made:

- **Take it as written.** STR and INT stones are the weakest of the six, which is
  already true of STR and INT. The slot argument covers some of the gap and the
  card stays readable. *Recommended* — and if it reads as bad value in play, the
  lever is the point count (+120 → +160) rather than the price, because points
  are free and the 255 cap is still four levels away for most builds.
- **Price by column.** STR/INT 神髓 at ~300 instead of 400. Honest, and an uneven
  top row on the shelf.
- **Raise `PER_POINT.meleePower` and `elementalPower`.** Fixes the cause rather
  than the symptom, and changes every class, every existing balance number and
  the whole damage curve. Not in this pass.

**The prices are still a guess against income.** `npm run bench` for what a wave
actually pays is a prerequisite for trusting the top row — a 400 base is 1300
coins at wave 15 after the markup, and if that is four waves of saving the grade
is decoration.

### Grading the shelf that already exists

A grade is a new field on all 27 existing entries, and the assignment is a
judgement about how transformative an item is rather than a restatement of its
price — that separation is the whole point of the axis.

**3階 (1)** — 分裂彈. Cheap for what it is at 68, and +1 projectile changes every
weapon on the rack at once. Nothing else on the current shelf does that.

**2階 (5)** — 賞金袋, 貪婪之印, 智慧之書, 抽取器, 琉璃鏡. The two coin items and
the experience one because they compound into every later purchase; the two
trades because a real drawback is a build decision rather than a top-up.

**1階 (21)** — everything else: the staples, the flat powers, the cheap trades.

With the stones the shelf becomes:

| grade | existing | stones | total |
|---|---|---|---|
| 1階 | 21 | 6 | **27** |
| 2階 | 5 | 6 | **11** |
| 3階 | 1 | 6 | **7** |

Worth noting what falls out: at band I a run sees 3階 **never** — 神髓 and 分裂彈
are not merely rarer, they are unavailable until LUK is bought or grown into.
That is a stronger gate than the current mechanism has ever applied, and it is
the reason the 25% in band I's 2階 column matters: without a route to the middle
grade, a low-LUK run would have nothing to climb with.

### The coin rate
| | now | after |
|---|---|---|
| `BASE_COIN_CHANCE` | 0.45 | **0.70** |
| ceiling | none | **`COIN_RATE_CAP = 2`** |

0.70 keeps a missed payout an event — which is the whole argument for the stat
being under one — while making the opening less punishing. Coins are experience
as well as money, so this speeds levelling by about the same amount; that is the
curve to watch if runs start feeling fast.

The cap is applied in `recomputeStats`, not at the roll in `kill`. `DODGE_CAP`
is applied at the roll, which means the sheet can show 80% dodge on a run that
dodges 60% — a readout that lies. Clamping at the recompute means the number on
the sheet is the number the run plays with, and a purchase that does nothing
visibly does nothing. **Aligning `DODGE_CAP` to the same rule is deliberately
out of scope** — say so if it should come along.

## Steps

1. **`data/attributes.ts`** — nothing to add; `clampAttributes` already does what
   the sum needs.

2. **`data/shop.ts`** — `attrs?: Partial<Attributes>` on `ShopItem`, a required
   `grade`, the eighteen stones, and a note on why a stone is a different shape
   from every other entry.

2b. **`data/shop.ts` `rollShop`** — the replacement. `LUCK_ITEM_BIAS`,
   `LUCK_PER_TIER`, the price sort and the cursor walk all go; a band lookup, a
   weighted grade roll and a uniform pick within the grade replace them. The
   band index feeds the weapon branch's tier ceiling. Keep the `usedItems` rule
   and the `itemSuits` filter — neither has anything to do with what is being
   replaced.

3. **`sim/world.ts` `recomputeStats`** — sum `attrs` from `ownedItems` into a
   working copy of `this.attributes`, clamp, derive from that. `this.attributes`
   is not written. Expose the effective six (a getter, so there is one name for
   the thing every reader wants).

4. **`sim/world.ts` `kill`** and **`data/content.ts`** — `BASE_COIN_CHANCE` to
   0.70, `COIN_RATE_CAP = 2`, clamped in the recompute.

5. **`runStore` / `ArenaScene`** — publish the effective six.

6. **Two places assume an item has `mods`.** `glyphForItem` in `GamePage.tsx` and
   the owned-item row in `Inventory.tsx` both read `Object.keys(item.mods)[0]`,
   which is `undefined` for a stone. Both need an attribute branch and the
   stones want their own glyph rather than falling through to `sigil`.

7. **Shelf dilution.** 27 items become 45 and `SHOP_SLOTS` is 4, so any
   particular item is roughly a third less likely to be on a given shelf. The
   LUK bias concentrates the walk rather than spreading it, so this is smaller in
   practice than it looks — but it is real, and if a shop stops feeling like it
   offers what a build needs, `SHOP_SLOTS` is the dial. Not changed in this pass.

8. **`scripts/verify.mjs`** — the new checks:
   - an attribute stone raises the derived stat it feeds
   - buying the same stone twice is worth twice as much, and rebuilding the block
     three times does not make it worth six — the double-count trap, which is the
     one failure this design exists to avoid
   - a stone's points stop at `ATTRIBUTE_CAP`
   - the coin rate stops at 2 however many 賞金袋 are held
   - the published six are the effective six, not the earned six
   - **band I never rolls a 3階 item.** Over a few thousand layouts, not one.
     This is the gate, and a gate that leaks occasionally is not one.
   - **each band's mix is the mix the table declares**, to within sampling
     error over a few thousand layouts. The table is the design; a roll that
     quietly disagrees with it is the bug this whole change exists to make
     impossible.
   - **the fallback only ever falls downward.** Fill the shelf so the rolled
     grade is exhausted and check what arrives is never a higher grade.
   - LUK from a stone moves the band: the same seed offers a different mix with
     the stone held than without it

9. **Build, lint, verify, and bench** — `bench` because step 4 changes income and
   the grade III prices are a guess until something measures a wave's take.

## Out of scope
`DODGE_CAP`'s readout, `LUCK_PER_TIER` (85 becomes reachable once LUK is
purchasable, which is the point — retuning it should wait until the stones have
been played), and `SHOP_SLOTS`.

## Progress

Done. The structure landed as planned; the prices did not, and two bugs the plan
did not know about turned up on the way.

**The bands.** `LUCK_ITEM_BIAS`, `LUCK_PER_TIER`, the price sort and the cursor
walk are gone, replaced by `LUCK_BANDS` and a weighted grade roll. The weapon
branch takes the band index for its tier ceiling, so there is one definition of
what a step of LUK is worth. `verify` asserts the rolled mix against the
declared row rather than merely checking it leans the right way.

**The stones.** Eighteen, generated from a points-and-prices table per column.
`ShopItem.mods` became optional and `attrs` joined it; `recomputeStats` sums
`attrs` into a working copy of the earned six and derives from that, never
writing back. `World.effectiveAttributes` is the new public read and the scene
publishes it, so the sheet shows the six the run is actually playing.

**Where the plan was wrong: the grade III prices.**

The plan said 400–500 base and flagged that it was a guess against income. It
was, and it was wrong by a factor of three. Measured with an unkillable bot that
buys nothing:

| wave | earned | banked | 力量神髓 at 400 base |
|---|---|---|---|
| 10 | 112 | 581 | 976 |
| 15 | 129 | 1213 | 1296 |
| 20 | 123 | 1844 | 1616 |

**Income plateaus around wave 12** at roughly 130 a wave while `priceAtWave`
keeps climbing, so the shop gets *less* affordable as a run goes on. A 神髓 at
wave 15 was ten waves of income, and the 體魄 one at wave 20 cost more than the
entire run had earned. The grade would have been decoration.

Repriced so the card reads 400–600 in the window a run would buy one — waves 12
to 18 — which is 155–215 base. That forced the rest of the ladder down with it
(grade II from 110 to 58–80, or III would have been better value per coin than
II) and forced one exception: **STA stones carry half the points**, because a
point of STA is worth about three times a point of STR and an equal-point 體魄
神髓 would have been the only stone anybody saved for.

| grade | points | STA points | STR/DEX/INT | AGI | LUK | STA |
|---|---|---|---|---|---|---|
| I 原石 | +12 | +6 | 16 | 22 | 18 | 22 |
| II 結晶 | +45 | +22 | 58 | 80 | 68 | 79 |
| III 神髓 | +120 | +58 | 155 | 215 | 180 | 209 |

Confirmed against the same measurement: 力量神髓 is 378 at wave 10, 502 at 15,
626 at 20, against 581 and 1213 banked.

**Two bugs the plan did not know about.**

*`itemSuits` could not see a stone's family.* It read `mods`, and a 力量神髓
raises 近戰攻擊力 without naming it — it moves STR and the derivation does the
rest. So a ranged-only rack was being sold melee damage it could not use, which
is exactly the trap that function exists to close, at ten times the old price.
Caught by an existing check going red, not by a new one. `ATTR_FAMILY` now maps
the three columns that have a family and `itemSuits` tests both routes.

*`buy` healed by the wrong number.* It read `item.mods.maxHp` to raise current
health with the ceiling, which misses a 體魄 stone entirely and was **already**
wrong before this change: an `itemBonus` class doubles what an item's health is
worth, so Haru buying 鐵心 gained eight of ceiling and was handed four of water.
Now measured across the recompute, the way `grantXp` has always done it.

**One thing the lint caught that was worth fixing properly.** `TONE_BY_GRADE`
and `itemGlyph` started life exported from `Inventory.tsx`, which breaks React
fast refresh for any file exporting a non-component. They live in
`pages/itemLook.ts` now, which is the better home anyway: the shop card and the
sheet row are the same item and must not disagree about its rank or its glyph.

### Measured

`npm run build` and `npm run lint` clean. `npm run verify`: **70/70**, thirteen
new. `npm run bench`: 59.2 fps, 1.437ms simulation step at 1200 enemies —
unchanged, as expected, since nothing here runs while the world is stepping.

The checks worth naming:

- **the lowest band is never offered a 3階 item** — 0.00% of 1500-odd items
  across 600 shelves. This is the gate, and a gate that leaks occasionally is
  not one.
- **each band rolls the mix its row declares** — all three within a percent of
  75/25/0, 50/35/15 and 25/45/30. The table is the design; a roll that quietly
  disagreed with it is the whole class of bug this change was made to remove.
- **two stones are worth two, and rebuilding does not compound them** — the
  double-count trap, which is why `effectiveAttributes` is a separate field.
- **the effective six carry the stones and the earned six do not.**
- **the coin rate stops at twice** — base, 255 LUK and ten 賞金袋 come to
  exactly 2.

`verify` reaches the item table by importing `/src/game/data/shop.ts` from the
page. Vite serves it and the browser already has it cached from the game's own
import, so it is the same array the shop rolls from — worth noting because the
alternative was a hook in the game put there to be measured by, which the repo
rules forbid.

### What is worth watching

**Income plateaus at wave 12 and prices do not.** This change did not cause it
and does not fix it; it only made it visible, because pricing an item honestly
required measuring what a wave pays. Everything on the shelf gets harder to
afford after wave 12, and the levers are `priceAtWave`'s 16% or the spawn curve
that stops growing. That is its own pass.

**STR and INT stones are still the weakest of the six**, on the same arithmetic
that priced them: they feed one derived number each. If they read as a trap in
play the lever is `points` in `STONE_COLUMNS`, not the prices.

**The 3階 pool is seven items** against four slots. `takeFromGrade` falls
downward when it runs dry, and `verify` asserts it never hands out more of a
grade than exists — but a band III run will see the same few 3階 cards often.
More of them, or fewer slots, is the fix if that gets stale.
