# Six Primary Attributes

## Goal
Give the game a primary attribute layer — STR, AGI, DEX, STA, INT, LUK, each
capped at 255 — that every derived number is computed from. Classes start with
different attributes and gain different amounts of each on level-up, and
levelling stops being a choice.

| Attribute | Feeds |
|---|---|
| STR | 近戰攻擊力 |
| AGI | 攻速, 閃避 |
| DEX | 命中, 遠程攻擊力 |
| STA | HP, 防禦 |
| INT | 魔法攻擊力 |
| LUK | 爆擊, 商品出現品階 |

## What already exists, and what this has to fit into
`game/data/content.ts` has a flat `PlayerStats` block of nineteen derived
numbers — `meleePower`, `attackSpeed`, `dodge`, `maxHp`, `armour`,
`critChance`, and so on. It is read by the simulation, the level-up cards, the
shop items, every weapon, the battle HUD, the equipment sheet and the character
select screen. It works, and it is the shape everything downstream is written
against.

Two of the six attributes name something that does not exist yet: there is no
hit or miss anywhere in the simulation, and `rollShop` reads nothing about the
player. Both are built here.

## Decisions, locked

1. **The attributes sit above the derived block, not instead of it.**
   One new `Attributes` record and one function that turns it into a
   `Partial<PlayerStats>`, folded into the base block at the start of a run and
   again whenever an attribute changes. Everything downstream keeps working
   unchanged, and there is exactly one file that says what a point of STR is
   worth. Replacing `PlayerStats` outright is a much larger piece of work for a
   result the player cannot tell apart.

2. **命中 is real accuracy against real evasion, and a miss is a miss.**
   Not the glancing-damage version that was offered: the stat is meant to
   matter, and enemies that dodge are coming. So the hit roll is
   `hit = acc / (acc + evasion)`, and a failed roll deals nothing.

   `ENEMY_KINDS` gains `evasion`, **zero on every kind that exists today**. That
   is the point of building it now rather than later: the rule, the stat, the
   display and the checks all land while nothing is affected by them, and an
   evasive enemy is then one number on one kind rather than a combat change
   shipped at the same time as the enemy that needs it.

3. **Levelling is not a choice any more.** No cards. A level applies the
   class's growth and the run does not stop.

   This is a removal, and a real one — worth stating plainly once before it is
   done. The level-up card is the only decision inside a wave, and the shop
   between waves becomes the only decision in a run. What is gained is that a
   class means something: two runs of the same character are the same curve,
   and two characters are visibly different ones. That is the trade being
   taken.

   Going: `UPGRADES`, `rollUpgradeOffers`, `getUpgrade`, the world's
   `pendingLevels` / `offers` / `chooseUpgrade`, `requestUpgrade`, the
   `levelup` run status and its whole overlay, and the 1/2/3 keys. Staying:
   `STAT_INFO` and `UpgradeId`, which are the stat *vocabulary* the equipment
   sheet and the shop are written in, not the card system.

4. **LUK buys the shelf, roughly, for now.** A luck term that raises the weapon
   tier `rollShop` will roll up to and nudges the item pick towards the
   expensive end. Deliberately coarse — the fine version is a later pass.

5. **Weapons are not touched.** Their damage, families, tiers, prices and
   fusing all stay exactly as they are. Attributes reach them only through the
   flat power stats they already read.

6. **A character's loadout is its attributes.** The four characters currently
   carry `mods` written straight into derived stats (`{ moveSpeed: 0.22, dodge:
   0.12, ... }`). Those become starting attributes plus growth per level, so
   there is one way to describe a character rather than two. The character
   select screen derives from the same place it does now, so it follows for
   free.

7. **The scale.** 255 is the cap; these are the values a single point is worth,
   and 255 is what it comes to:

   | | per point | at 255 |
   |---|---|---|
   | STR → meleePower | +0.12 | +30.6 flat |
   | AGI → attackSpeed | +0.004 | ×2.02 |
   | AGI → dodge | +0.0016 | +0.41 (`DODGE_CAP` is 0.6) |
   | DEX → rangedPower | +0.12 | +30.6 flat |
   | DEX → accuracy | +1 | 255 against evasion |
   | STA → maxHp | +1.6 | +408 (base is 100) |
   | STA → armour | +0.16 | +40.8 |
   | INT → elementalPower | +0.12 | +30.6 flat |
   | LUK → critChance | +0.0012 | +0.31 |
   | LUK → shop luck | +1 | 255 |

   Linear, not curved. A curve would make the last hundred points worthless and
   the cap decorative; linear makes 255 a real place to get to and keeps the
   arithmetic something a player can do in their head. Starting values land
   around 10–40 per attribute and growth is a few points a level, so a run moves
   through a fraction of the range — the cap is a ceiling, not a target.

## Planned steps

### 1. The attribute layer
New `src/game/data/attributes.ts` — data only, no Phaser and no simulation
import, the same rule the other `data/` files keep.

- `ATTRIBUTES` — the six ids, their labels, and what each one feeds, so the
  screens render from one table rather than a second hand-written one.
- `ATTRIBUTE_CAP = 255`.
- `Attributes` — a record of the six.
- `deriveStats(attributes): Partial<PlayerStats>` — the table above, in one
  place.
- `hitChance(accuracy, evasion)`.

### 2. The world carries them
`World` gains an `attributes` block beside `stats`, clamped to `0..255` on every
write, and `applyAttributes()` recomputes the derived block from base plus
attributes plus everything the run has bought, in that order.

The ordering is the thing most likely to go wrong: attributes are folded into a
*fresh* base each time rather than added to the live block, or a recompute
doubles every point already spent. That is what the verify check in step 7 is
for.

### 3. Levelling
`grantXp` already counts levels. Where it currently increments `pendingLevels`
and rolls offers, it adds the class's growth to the attributes and recomputes —
and the run carries on. `LEVEL_BONUS` goes; growth is what it was.

Growth is fractional and accumulated (`+1.4 STA` a level is a rate, not a
rounding to 1), so the attributes are stored as floats and rounded only where
they are shown.

### 4. Accuracy in the damage path
`ENEMY_KINDS` gains `evasion: 0`. The projectile hit resolves damage in one
place; the hit roll goes there, beside the crit roll, and a miss is counted so
the HUD can show one — a hit that does nothing with no feedback is a bug report.

### 5. Luck in the shop
`RollContext` gains `luck`. The tier ceiling becomes
`min(MAX_WEAPON_TIER, waveCeiling + luckBonus)` and the item pick is weighted
towards the expensive end rather than uniform.

### 6. Classes, and where the attributes show
`ArenaLoadout` gains `attributes` (the six starting values) and `growth` (per
level). `mods` keeps only what an attribute cannot say. Four characters, four
shapes — Haru into STR and STA, Hiyori into AGI and DEX, Mao into INT and LUK,
Rice into DEX and LUK — with equal sums at level 1, so the choice is a shape and
not a ranking.

- The equipment sheet (`I`) gets an attributes block above the derived stats:
  six rows, value against cap, and what each one feeds.
- The battle HUD does not. Six more numbers on a screen read at speed is six
  numbers nobody reads, and the sheet is where a player goes to look.
- The character select screen shows the six as the character's shape, replacing
  the derived rows it computes today. That screen is about choosing a class, and
  the attributes are what a class now is.

### 7. Verify
New checks in `scripts/verify.mjs`, which is where a rule like this belongs
rather than in a comment:

- every attribute clamps at 0 and at 255
- `deriveStats` at 255 gives exactly the table above
- recomputing twice gives the same block as recomputing once
- growth accumulates fractionally and rounds only for display
- a level applies growth and does not stop the run
- `hitChance` is 1 against zero evasion, and is the ratio against a value
- luck raises the tier ceiling; zero luck rolls what it rolls today

The existing 28 checks must still pass, minus any that test the card system,
which will be removed with it.

`npm run bench` as well: the recompute runs on level-up, not per step, so the
step time should not move.

## Out of scope
Attribute points the player spends by hand — this is growth by class, not a
build screen. Enemy attributes beyond the `evasion` field. Re-tuning the shop
items or the wave ramp against the new numbers beyond keeping them working. The
lobby's skill and level fiction.

## Risks
- **Two systems adding to the same numbers.** The shop items, the weapons and
  now the attributes all write into `PlayerStats`. The recompute order in step 2
  is the whole defence.
- **The run loses its inner decision.** Covered in decision 3 and accepted. If
  it turns out to want one back, the shop is the place to put it.
- **Balance drifts.** Attributes give damage and health the existing curves were
  tuned without, and the level-up card that used to be part of that curve is
  gone. Measurable with `npm run bench` and a run; a follow-up, not a blocker.

## Notes
Execution starts only after the user explicitly says start.

## Progress

Done. What was built, and where it differs from the plan.

**Step 1 — the layer.** `src/game/data/attributes.ts`: the six ids and their
labels, `ATTRIBUTE_CAP`, the per-point table, `deriveAttributes`, `hitChance`
and `statsFrom`. Data only, no Phaser and no simulation import, so the
character select screen reads it without pulling the arena in.

Two things came out of the table that the plan did not name. `accuracy` and
`shopLuck` are not entries in `PlayerStats` — nothing in the stat block
corresponds to either — so `deriveAttributes` returns them beside the block
rather than in it. And `statsFrom` returns a *fresh* base every call, which is
the discipline the whole layer rests on.

**Step 2 — the recompute.** `World.recomputeStats()` rebuilds the block from
base, then the class's leftover modifiers, then the attributes, then every item
in `ownedItems`, into a fresh copy every time. Called on load, on level and on
purchase, never per step.

Buying an item changed shape because of it: an item is now *recorded* and the
block recomputed, rather than added to the block directly. That is what makes a
rebuild reproduce the run exactly, and it is why `ownedItems` holds ids.

**Step 3 — levelling.** `grantXp` adds the class's growth, recomputes and heals
by exactly what the ceiling gained. Measured across the recompute rather than
assumed, because STA is not the only thing that can move `maxHp`.

**Step 4 — accuracy.** `EnemyKind.evasion`, zero on all three kinds. The roll
sits in `hit()` beside the crit roll and a miss is counted, so the HUD has
something to show the day one happens.

**Step 5 — luck.** `RollContext.luck`. `LUCK_PER_TIER` (85) points buy a tier of
ceiling, and the item shelf is sorted by price with luck skewing where the walk
starts — skewing the start rather than filtering the shelf keeps every item
reachable at every value, which is the difference between luck and a gate.

**Step 6 — classes and screens.** `ArenaLoadout` is now `start`, `growth`,
`mods`, `weapon`, `trait`. Equal sums per column, so a character is a shape and
never a rank. The equipment sheet gained a 主屬性 block above the derived stats;
the character screen shows the six with their per-level growth and a bar against
the cap, above the opening rows it already derived.

**The removal.** Gone with the card: `Upgrade`, `UPGRADES`, `UPGRADE_BY_ID`,
`getUpgrade`, `OFFER_COUNT`, `offerableFor`, `rollUpgradeOffers`, `LEVEL_BONUS`,
`World.applyUpgrade`, `pendingLevels`, `offers`, `requestUpgrade`,
`consumeUpgrade`, the snapshot's two fields, the whole `levelup` overlay and its
1/2/3 keys, the scene's `lastPending`, and the `.levelup` stylesheet block. Its
entrance animation stayed: the shop and the sheet were written against it.

The scene's freeze is now `status === 'shop'` alone, which is a simplification
it had been waiting for — the pause used to be two conditions that had to agree.

**Where the plan was wrong.** It said `hitChance` and the clamp would be checked
directly. They are not: this project's rule is that scripts reach the game
through the dev handle and nothing is added to the game for their benefit, and
a check on `hitChance` would pass whether or not anything called it. So the
clamp is driven through real level-ups against the cap, and accuracy through
the weapon — an evasion is set on a kind and the shots are fired. That needed
`ENEMY_KINDS` on the dev handle beside `__arenaWorld`, which is data the page
cannot otherwise reach rather than a hook in the game.

### Measured

`npm run verify`: **35/35**. Ten new checks, three old ones removed with the
card system they tested. The new ones:

- every attribute clamps at 0 and at 255 (through five levels of +40 from 250)
- recomputing the stat block twice changes nothing — the doubling bug
- a bought item survives a rebuild
- fractional growth accumulates instead of rounding away (ten levels of +0.4
  STR comes to exactly 4)
- a level applies growth and does not stop the run
- a level heals by what the ceiling gained
- a shot never misses an enemy that does not evade
- no accuracy against real evasion lands nothing, and says so
- accuracy beats evasion
- luck puts higher tiers on the shelf than the wave alone would

One existing check had to be adjusted rather than removed: the shelf check
zeroed `meleePower` and bought everything to see whether it moved, and STR now
puts a floor under it. It zeroes the *attributes* instead — the block is rebuilt
rather than edited, so a floor has to be removed at its source.

`npm run bench -- --enemies 700 --spread world`: 16.68ms, 59.1 fps, sim step
**0.259ms** against a 0.33–1.26ms range measured before any of this. The
recompute runs on level, not per step, and the step time did not move.

A live run, levelled to 20 through the dev handle: STR 34 → 64.4 at +1.6 a
level, STA 32 → 60.5 at +1.5, maxHp 151 → 197, melee power 4.08 → 7.73, status
`fighting` throughout. No console errors. Both screens shot and checked against
the arithmetic.

### Left where it was
Balance. Attributes give damage and health the wave ramp was tuned without, and
the card that used to be part of that curve is gone. Nothing in this pass
re-tuned the ramp, the shop prices or the enemy scaling, and it will want a
pass — that is a run to play, not a number to reason about.
