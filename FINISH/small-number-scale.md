# The Small-Number Rescale

## Goal
Start the game at numbers a player can count — around 10 health, 2–3 damage a
hit — and keep the top of the curve near 1000 damage with room left over for
content that does not exist yet.

## Where the numbers are now
The formula, from `stepWeapons`:

```
hit = (weapon.damage + attackPower + familyPower) * stats.damage * tierDamageScale(tier)
crit = hit * critDamage
```

| | now |
|---|---|
| opening: Haru's 碎裂刃 | **5 a blade** against a 12-health crawler |
| opening: player health | **151** against 6 contact damage |
| ceiling: railgun IV, DEX 255, a shelf of items, on a crit | **886** |

So the top of the curve is already about where it should be. The problem is
entirely at the bottom: the game opens at three figures of health and a
two-figure hit, and everything in between is scaled to that.

That is the shape of this change. **Divide the opening, leave the ceiling** —
and since the ceiling is already 886 with nothing left over, the growth
multipliers have to come down a little as well, so that finished content lands
near 350 and the remaining 3× is there for the weapons, tiers and skills that
come later.

## Decisions to confirm before start

1. **The target table.** Opening around 10 health and 2–3 damage; current
   content tops out near **350**; 1000 is the design ceiling nothing reaches
   yet. Every number below is derived from those three.

2. **Health and damage do not shrink by the same factor.** Health goes from 151
   to about 14 — an order of magnitude — and a hit from 5 to 2. That is not an
   oversight: it means the opening fight is four or five hits either way instead
   of the twenty-five it is now, which is what "small numbers" actually buys.
   A run gets shorter and sharper at the start. Say so if the intent was to keep
   the current pacing and only relabel the numbers, because that is a different
   table.

3. **Contact damage starts scaling with the wave.** It does not today, and the
   rescale makes that visible: at wave 40 a brute hits for 14 against 151
   health, which is survivable; at the new scale it would hit for 4 against 137
   and be harmless. So `damageScale(wave)`, matching the health curve at a
   gentler slope. Without it the late game stops being able to kill anyone, and
   that is a consequence of this change rather than a feature added alongside it.

4. **Percentages are untouched.** `damage`, `attackSpeed`, `critChance`,
   `critDamage`, `range`, `moveSpeed`, `dodge` and the items that sell them are
   multipliers over a base of 1 and mean the same thing at any scale. Only flat
   numbers move.

## The table

### Player
| | now | after |
|---|---|---|
| `BASE_STATS.maxHp` | 100 | **10** |
| STA → maxHp, per point | 1.6 | **0.5** (255 → +127) |
| STA → armour, per point | 0.16 | **0.08** (255 → +20) |
| STR/DEX/INT → flat power, per point | 0.12 | **0.05** (255 → +12.8) |
| LUK → critChance, AGI → attackSpeed/dodge | — | unchanged, they are percentages |

Haru opens at **10 + 32 × 0.5 = 26 health** and 3 armour. At maxed STA, 137.

### Weapons
Divided by three and rounded to something readable, keeping their order.

| | now | after |
|---|---|---|
| 手槍 pistol | 6 | **2** |
| 碎裂刃 shredder | 5 | **2** |
| 散彈槍 shotgun | 4 | **1.5** |
| 貫穿槍 railgun | 26 | **9** |
| 飛鏢 dart | 2 | **0.8** |
| 魔導杖 firestaff | 14 | **5** |
| 收割鐮 reaper | 7 | **2.5** |

Cooldowns, counts, ranges, pierce and knockback are untouched — none of them is
a damage number.

### Enemies
| | hp now | hp after | contact now | contact after |
|---|---|---|---|---|
| 爬行者 grunt | 12 | **4** | 6 | **2** |
| 疾走者 runner | 7 | **2** | 5 | **1** |
| 巨獸 brute | 58 | **18** | 14 | **4** |

`healthScale` is unchanged at `1 + 0.24(w-1)`. New: `damageScale(wave) =
min(3.5, 1 + 0.055(w-1))`, so a wave-40 brute hits for 13 rather than 4.

### Items
Only the flat ones.

| | now | after |
|---|---|---|
| 磨刀石 all attack power | +2 | **+1** |
| 鐵手甲 / 瞄具 / 燼石 family power | +3 | **+1** |
| 鐵心 maxHp | +25 | **+4** |
| 護符 armour | +6 | **+3** |
| 再生藥膏 regen | +0.8/s | **+0.25/s** |
| 血晶 lifesteal | +0.5 | **+0.15** |
| 重甲板 armour | +12 | **+5** |

### Haru's 自然回復
`0.2 + armour × 0.04 + maxHp × 0.004` is 1 HP/s at the current scale and would
be 0.16 against 26 health — proportionally *four times* what it is now. Rescaled
to `0.05 + armour × 0.008 + maxHp × 0.004`, which at Haru's opening is
**0.16/s against 26 health**, the same fraction of the bar per second that it is
today.

### Where the ceiling lands
Railgun IV, DEX 255, a shelf of items, on a crit:

```
(9 + 12.8 + 3 items) * 1.6 damage * 3.1 tier * 2.9 crit  =  357
```

Against **886** now, and **1000** as the ceiling. Two and a half times the
headroom, which is what "room for later" means in numbers.

## Planned steps

1. `data/content.ts`: `BASE_STATS.maxHp`, every `WEAPONS[].damage`, every
   `ENEMY_KINDS[].hp` and `.contactDamage`, and a new `damageScale`.
2. `data/attributes.ts`: three entries in `PER_POINT`, and the comment block
   above it, which quotes the ceiling values and would otherwise be a lie.
3. `data/shop.ts`: the seven flat items, and their `detail` strings, which print
   the number.
4. `data/skills.ts`: the regeneration constants.
5. `sim/world.ts`: apply `damageScale` where `contactDamage` is read.
6. Re-check every number quoted in a comment. Several files describe the balance
   in prose -- `BASE_VISION`'s note about the window, the capacity comment's
   measured frame times, `xpForLevel` -- and a rescale turns a comment that
   explains a number into a comment that contradicts it.

## Verify
The existing 46 checks are mostly ratios and should pass unchanged; the ones
that assert an absolute (`100 STA gives 260 health`) move with the table. Two
new ones:

- an opening run is four to six hits from dead, and kills a crawler in two —
  the check that says the *ratio* landed, not just the numbers
- contact damage rises with the wave, and is capped

Then `npm run bench` for the step time, which should not move, and a run played
to wave 10 to see whether it is still a game.

## Out of scope
Coins, prices and the experience curve. They are their own economy and nothing
about them is a damage number.

## Risks
- **This is a balance change wearing a rescale's clothes.** Decision 2 is the
  real one: the opening fight gets four times shorter. Everything else is
  arithmetic, and that is not.
- **Comments that quote numbers.** Step 6 is the one most likely to be done
  badly, because nothing fails when it is.

## Notes
Execution starts only after the user explicitly says start.

## Progress

Done, to the table, with one correction to the plan's own arithmetic.

**Steps 1–5 — the numbers.** Base health 100 → 10; the three flat power
attributes 0.12 → 0.05 a point; STA 1.6 → 0.5 health and 0.16 → 0.08 armour;
seven weapons divided by three; three enemy kinds' health and contact damage;
eleven shop items and the `detail` strings that print their numbers; Haru's
regeneration constants. `damageScale(wave) = min(3.5, 1 + 0.055(w-1))` is new,
and applied where `contactDamage` is read at spawn, beside the health scale that
was already there.

**Step 6 — the prose.** Four comments quoted numbers that had moved: `PER_POINT`
said "on a base of 100", the armour curve cited Rice's -3 and a -4 glass lens
(Rice's armour is an attribute now and the lens is -2), the regeneration tick
said a tick was worth five points, and the crit note still referred to an
upgrade card that was removed two changes ago. All four fixed. Two were found by
reading rather than by anything failing, which is what the step is for.

The measured performance comments in `world.ts` are left alone: they are a
frame-time budget rather than a balance number, and re-measuring them is not
this change.

### Where it landed

| | before | after |
|---|---|---|
| Haru opens | 151 health, 5 a blade | **26 health, 3.7 a blade** |
| a crawler | 12 health, 6 contact | **4 health, 2 contact** |
| a crawler at wave 30 | 6 contact | **5.2 contact** |
| ceiling: railgun IV, DEX 255, items, crit | 886 | **342** |

Against a design ceiling of 1000, that is 2.9× of headroom.

**Where the plan was wrong.** It claimed the opening exchange would go from
twenty-five hits to "four or five". That was arithmetic done on the base health
alone, forgetting that a class puts its STA on top: Haru opens at 26 rather than
10, so the exchange is about *twice* as sharp, not four times. The check asserts
the honest range and says why in a comment, rather than the numbers being bent
to match a claim I got wrong.

### Measured

`npm run verify`: **53/53**, three new and three repaired.

New:
- an opening run is a handful of hits from dead — the ratio, not the constants:
  every number in the table could be checked against itself and pass while the
  game was unplayable
- and kills a crawler in a couple of hits
- contact damage rises with the wave and stops

Repaired, and each one is a small lesson about checks that hardcode a scale:
- *an item's health is doubled too* measured against a remembered base of 100.
  It measures against a run holding nothing now.
- *healing is reported, not silent* filled a bar with no room in it: at zero STA
  the ceiling is the base ten and the check was healing a full bar.
- *armour and health from attributes are not doubled* asserted 16 and 260, which
  are now 8 and 60.

`npm run bench -- --enemies 700 --spread world`: 16.69ms, 59.2 fps, sim step
0.588ms. Unmoved, as expected — none of this is work, all of it is constants.

### Left where it was
Coins, prices and the experience curve, as scoped. They now want a look for a
reason this change did not create but did sharpen: a kill pays 45% of the time
since the drop roll landed, and coins are experience.
