# Regeneration as a Percentage, on a One-Second Clock

## Goal
Turn `regen` from flat health per second into a **fraction of maximum health**
per second, and move the payout from every five seconds to **every one second**.

## Why the stat has to change form

Flat regeneration is worth what the bar is small. Haru opens at 26 health, so
the 再生藥膏's +0.25/s is nearly a percent of the bar a second — a real purchase.
At maxed STA the same bar is 137, the same item is 0.18% a second, and the
coin spent on it has quietly become nothing. That is the shape of every flat
number measured against a bar that grows, and it is why the small-number
rescale left percentages alone: they mean the same thing at any scale.

The one-second clock is the other half. Five seconds was chosen so a tick would
be an event rather than a smear — but that argument was made when a tick had to
be large enough to *see*, because the rate was flat and tiny. A percentage of a
growing bar does not have that problem, and five seconds is long enough that a
player under pressure cannot feel the rhythm of it.

## Where the numbers are now

The payout, from `stepPlayer`:

```
every REGEN_INTERVAL (5s):  heal(stats.regen * REGEN_INTERVAL)
```

Three things write `regen`, and every one of them means health per second:

| source | now | as % of the bar it is bought against |
|---|---|---|
| `salve` 再生藥膏 (item, 28c) | +0.25/s | 0.96%/s at Haru's 26 |
| Mao's loadout mod | +0.5/s | 2.5%/s at Mao's 20 |
| Haru's `mending` 自然回復 (skill) | 0.1745/s at opening | 0.67%/s |

Haru's skill is `base 0.05 + armour × 0.008 + maxHp × 0.004`, which at opening
is armour 2.56 and maxHp 26.

## Decisions to confirm before start

**1. `fromMaxHp` has to be deleted from the `regenFrom` skill shape.**

This is the one part of the change that is not a rename. Once `regen` is a
fraction of maximum health, the healing a tick delivers is

```
maxHp × regen  =  maxHp × (… + maxHp × fromMaxHp)
```

— which is **quadratic in maxHp**. At Haru's opening that term alone is 2.7
health a second; at maxed STA it is 75. It is not a number that wants tuning,
it is a term that has stopped meaning anything.

Deleting it costs the skill nothing. The whole point of a percentage is that it
already scales with maximum health, so `fromMaxHp` was the manual version of a
thing the new form does by construction — keeping both is squaring it. 防禦專精
still feeds regeneration through the health half of what it doubles; it just
arrives through the percentage now instead of through a second term. "Defence
buys defence" is intact, and it is still the armour term that carries it.

Say so if you would rather keep the field and interpret it some other way,
because that is a different table.

**2. Both ends of Haru's skill cannot be preserved at once.**

`regen` is now multiplied by a bar that grew about five times over the course of
a run, so a linear armour term that matches the opening is five times too strong
at the top, and one that matches the top is a fifth of what it should be at wave
one. Something gives. The table below gives up a little of the opening (0.67% →
0.45%) to keep the late game somewhere short of immortality, on the argument
that a skill which gets better as the build comes together is the skill Haru is
written to have.

**3. Everything below the stat is a percentage now, including the labels.**
Four display sites and one shop string quote `/秒` or `/s` against a flat
number and would be lying the moment this lands. They are listed in the steps.

## The table

### The clock
| | now | after |
|---|---|---|
| `REGEN_INTERVAL` | 5 | **1** |
| payout per tick | `regen × 5` | `maxHp × regen × 1` |

### The sources
| | now | after | opening | maxed STA (137 hp) |
|---|---|---|---|---|
| `salve` 再生藥膏 | `0.25` | **`0.01`** (1%/s) | 0.26/s at Haru | 1.37/s |
| Mao's loadout | `0.5` | **`0.015`** (1.5%/s) | 0.30/s at Mao's 20 | 2.06/s |
| `mending` `base` | `0.05` | **`0.003`** | | |
| `mending` `fromArmour` | `0.008` | **`0.0006`** | | |
| `mending` `fromMaxHp` | `0.004` | **deleted** | | |

Haru's skill, worked through:

| | armour | rate | health/s |
|---|---|---|---|
| opening | 2.56 | 0.45%/s | 0.12 |
| STA 255, no items | 20.4 | 1.5%/s | 2.1 |
| STA 255, 3×護符 + 重甲板 (doubled) | 48.4 | 3.2%/s | 4.4 |

Against the current skill's 0.72%/s at that same top end, so the ceiling is
about four times what it was in relative terms — which is the change asked for,
and the number to turn if it plays too strong.

### What a player sees
Healing still pools to whole points before it is reported, and that rule does
more work now: at 10 health and 1%/s a tick is a tenth of a point, so the `+1`
arrives every ten seconds rather than every one. That is correct — the bar
still moves every second, and a number over the player's head every second is
the smear the pooling exists to prevent.

## Steps

1. **`sim/world.ts`** — `REGEN_INTERVAL` to 1, and rewrite the block comment
   above it: the five-second argument is the reason it *was* five, and leaving
   it there is leaving a lie at the top of the file. `stepPlayer` heals
   `stats.maxHp * stats.regen * REGEN_INTERVAL`. The note at the call site that
   says "the rate is unchanged … so nothing that quotes the stat has to be
   re-worded" is now exactly backwards and must go.

2. **`data/skills.ts`** — drop `fromMaxHp` from the `regenFrom` variant of
   `SkillEffect`, retune `mending`, and rewrite the paragraph that works the
   opening numbers out in health per second.

3. **`sim/world.ts` `recomputeStats`** — drop the `fromMaxHp` term from the
   `regenFrom` branch. The comment explaining why this runs *after* the items
   stays true and stays.

4. **`data/content.ts`** — `PlayerStats.regen`'s doc comment from
   `HP per second` to a fraction of maximum health per second, and say that the
   payout is on a one-second clock so the two files cannot drift.

5. **`data/shop.ts`** — `salve` to `0.01`, detail string to `生命回復 +1%/秒`.

6. **`data/loadouts.ts`** — Mao's `regen` to `0.015`.

7. **The four display sites** — `pages/GamePage.tsx:123` (`STAT_FORMAT.regen`),
   `features/arenaProfile.ts:149` (`MOD_TEXT.regen`), and
   `pages/Inventory.tsx:77` (the skill's live value) all format a flat number
   and want `(v * 100).toFixed(1)` and a `%`. `STAT_INFO.regen`'s label
   `生命回復` still reads correctly and stays.

8. **`scripts/verify.mjs`** — four checks are written against the old stat and
   the old clock and all four fail by construction, not by regression:
   - the healing-is-reported check sets `regen = 6`, which is now 600%/s
   - the fraction-of-a-point check sets `regen = 0.1` and waits two five-second
     intervals
   - the interval check hardcodes four seconds of nothing then a fifth second
     of everything, and asserts `≥ 9.9` from `regen = 2, maxHp = 500`
   - the full-health check sets `regen = 20`
   Its local copy of the mending skill at line 690 also carries `fromMaxHp` and
   has to lose it with the type.
   Add one check the old shape could not express: **the same rate heals more on
   a bigger bar**, which is the entire point of the change and the thing that
   would silently not happen if a `maxHp` factor were dropped somewhere.

9. **Verify and build** — `npm run build`, `npm run lint`, `npm run verify`.

## Out of scope
Lifesteal stays flat and stays off this clock. It is paid for landing a hit and
has to arrive when the hit does; that note is already in `world.ts` and this
change does not touch it.

## Progress

Done as planned. `fromMaxHp` was deleted, both proposed tunings went in
unchanged, and nothing in the plan turned out to be wrong.

**Steps 1–3 — the clock, the shape, the sum.** `REGEN_INTERVAL` is 1 and the
payout is `maxHp * regen * REGEN_INTERVAL`, so `maxHp` is read at payout rather
than at purchase — an item bought two waves ago is worth more now, which is the
whole reason the stat has this shape. `SkillEffect`'s `regenFrom` lost
`fromMaxHp` and `recomputeStats` lost the term with it. The three comments that
would have become lies — the five-second argument, the "the rate is unchanged …
nothing has to be re-worded" note at the call site, and Haru's worked opening
numbers — were rewritten rather than left.

**Steps 4–6 — the sources.** `PlayerStats.regen` documents the fraction and
points at `REGEN_INTERVAL` as the only place that turns it into health, so the
two files cannot drift. 再生藥膏 `0.25 → 0.01`, Mao `0.5 → 0.015`, `mending`
`base 0.003` and `fromArmour 0.0006`.

**Step 7 — the display.** Three formatters take `* 100` and a `%`. The
equipment sheet's passive quotes **both** halves now — `目前 0.5%/秒 · 0.1
HP/秒` — which was not in the plan. The rate is what the skill produces and the
health is what the player gets, and buying maximum health moves the second
without touching the first; quoting only the rate would hide exactly the thing
the change was made to expose.

**Step 8 — the checks.** Four were written against the old stat and the old
clock and all four were rewritten. The interval check now steps 59 frames and
then 2, because at 60 steps of 1/60 the sum is 0.9999999999999999 about as
often as it is 1.0000000000000002 — a one-second interval has no margin the
five-second one did not need.

### Measured

`npm run build` and `npm run lint` clean. `npm run verify`: **60/60**, two new.

- **the same rate restores more on a bigger bar** — 5%/s gave 4.00 on a 40 bar
  and 40.00 on a 400 one over the same two seconds. This is the point of the
  whole change, and the check that would notice a `maxHp` factor dropped
  anywhere between the stat and the heal. A flat stat passes every other check
  in this file and fails this one.
- **maximum health does not move the rate, only what it is worth** — buying
  鐵心 leaves the percentage exactly where it was. This is the guard on
  `fromMaxHp` ever creeping back into the sum.

Confirmed in the running app rather than only in the checks: the character
screen renders Mao's mod as `生命回復 +1.5%/秒`.

### What is worth watching

Haru's ceiling. Three 護符 and a 重甲板 through 防禦專精 put him at 3.2%/s,
which is a full bar in about thirty seconds and roughly four times what the same
build regenerated when the stat was flat. That is the change asked for, but it
has not been played — `fromArmour` in `data/skills.ts` is the number to turn.
