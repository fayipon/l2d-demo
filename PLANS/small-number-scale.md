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
