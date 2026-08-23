# Class Skills, Starting With Haru

## Goal
Give a class real passives that the simulation reads, and wire Haru's two:

1. **防禦專精** — armour and HP gained *from items* count double.
2. **自然回復** — innate health regeneration, sized by armour and HP.

Everyone else gets the mechanism and no skills. That is the whole scope: the
other three are left exactly as they are.

## What this fits into
`World.recomputeStats()` already rebuilds the stat block from four sources in a
fixed order — base, the class's leftover modifiers, the attributes, then every
item in `ownedItems` — into a fresh copy every time.

That is the reason skill 1 is a small change rather than a large one. "From
items" is already a distinguishable source; the recompute is the one place that
knows which numbers came from where, and it is where the doubling belongs. Any
other arrangement would need the item contribution tracked a second time.

Skill 2 needs somewhere to run *after* the block is otherwise finished, because
armour and maxHp are its inputs — including the armour and maxHp that skill 1
has just doubled.

There is also a second, fictional skill list already on screen: `Character.skills`
in `features/character.ts` gives Haru four named skills with levels and
cooldowns, none of which the arena has ever heard of. See decision 4.

## Decisions to confirm before start

1. **"額外加成 2 倍" is read as ×2 total, not ×3.** A 護符 giving +6 armour gives
   Haru +12, and 鐵心's +25 HP gives +50. Say so if it should be ×3 — it is one
   number either way, and it is worth being certain before it is tuned around.

   Only `armour` and `maxHp` double, and only from items. An item's other
   modifiers are untouched, and armour or HP from attributes, from the class's
   own modifiers or from the base block are untouched — the skill is about what
   the shop sold you.

2. **自然回復 is a formula on the finished block, not a flat number.**
   `regen = base + armour * fromArmour + maxHp * fromMaxHp`, proposed at
   `0.2 + armour * 0.04 + maxHp * 0.004`. At Haru's opening — 5 armour, 151 HP
   — that is **1.0 HP/s**; at a late-run 40 armour and 400 HP it is **3.4 HP/s**,
   against a grunt's 6 contact damage. Tunable in one place, and worth playing
   before it is trusted.

   It stacks with the `regen` an item sells rather than replacing it, because
   the two are the same stat and a skill that quietly cancelled a purchase would
   be a skill that made an item worthless without saying so.

   The two skills compound on purpose: skill 1 doubles the armour and HP that
   skill 2 then reads. That is the class — defence buys defence — and it is the
   ordering requirement the implementation has to respect.

3. **Skills are declared, not written as functions.** `data/` in this project is
   data: no Phaser, no simulation. So a skill is a record with an id, a label, a
   description and a typed effect — `itemBonus` and `regenFrom` are the only two
   shapes there are — and the world knows how to apply each shape. A skill that
   was an arbitrary function would put simulation logic in the data layer and
   make the recompute impossible to reason about in one read.

   The cost is that a third skill of a genuinely new kind needs a new shape here
   and a branch in the recompute. That is the right cost: it keeps every skill
   visible in one table.

4. **The real skills go on the screens beside the fictional ones, not instead
   of them.** The character screen already lists 緋刃 / 落月斬 / 蝕月·終焉 / 夜巡
   with levels and cooldowns, and none of them exist. Replacing them is a bigger
   piece of work than this — three characters' worth of fiction and a screen
   built around it — and deleting Haru's alone would leave the roster
   inconsistent.

   So the two real ones appear as their own group, labelled as what they are:
   職業技能, marked as in effect during a run. The fiction stays until there is
   something real to replace all of it with. This is the "two sets of numbers,
   one of them invented" problem the stat block already went through once, and
   it is worth naming rather than letting it pass unremarked.

## Planned steps

### 1. The skill layer
New `src/game/data/skills.ts` — data only, the same rule the rest of `data/`
keeps.

```ts
type SkillEffect =
  | { sort: 'itemBonus'; stats: ('armour' | 'maxHp')[]; multiplier: number }
  | { sort: 'regenFrom'; base: number; fromArmour: number; fromMaxHp: number }

interface ClassSkill { id, name, kind, description, effect }
```

`CLASS_SKILLS: Record<string, ClassSkill[]>`, keyed by character id, with only
`haru` populated. A character with no entry has no skills, which is the same
shape `loadoutFor` already uses for a character with no loadout.

### 2. The recompute applies them
`recomputeStats` gains two things in a fixed order:

- while summing `ownedItems`, an `itemBonus` skill multiplies the named stats
  before they are added;
- after everything else is summed, a `regenFrom` skill adds to `regen` from the
  finished `armour` and `maxHp`.

Both read the skill list once, held on the world beside the loadout. The order
is the whole correctness of the pair and gets a comment saying so.

### 3. Where they show
- The equipment sheet (`I`) gets a 職業技能 group above the primaries: name,
  what it does, and — for the regen one — what it is currently worth, because a
  passive whose value moves is a passive worth watching.
- The character screen shows the same two in the skill tab, in their own group
  above the fictional four, labelled 職業技能 · 生效中.
- Nothing on the battle HUD. A passive that never changes during a wave is not
  something to read at speed.

### 4. Verify
- an item's armour and HP are doubled for Haru and not for a character without
  the skill
- an item's *other* modifiers are not doubled
- armour and HP from attributes are not doubled
- regen rises when armour rises and when maxHp rises, and is zero for a
  character without the skill
- the two compound: buying an armour item raises regen by more for Haru than
  the same item raises it for a character with only the regen skill
- recomputing twice still changes nothing — the existing check, which now has
  two more writers to survive

## Out of scope
The other three characters' skills. Active skills, cooldowns, or anything the
player presses. Replacing the fictional skill list. Re-tuning the wave ramp
against a class that now heals.

## Risks
- **A healing class breaks the ramp.** Regen at 3.4/s against wave-scaled
  contact damage is either irrelevant or decisive and there is no way to know
  which without playing it. The formula is one line in one file, which is the
  mitigation.
- **The compounding is easy to get backwards.** If the regen is computed before
  the item doubling, Haru's signature interaction silently does not happen and
  everything still looks fine. That is what the fifth check is for.

## Notes
Execution starts only after the user explicitly says start.

## Progress

Done, for Haru. The other three have the mechanism and no skills, which was the
scope.

**Step 1 — the layer.** `src/game/data/skills.ts`: `SkillEffect` in two shapes,
`ClassSkill`, `HARU_SKILLS` and a shared `NO_SKILLS`. Declared, not written as
functions, so `data/` stays data and every skill in the game is one table.

**Where the plan was wrong.** It said `CLASS_SKILLS`, keyed by character id.
That would have been a second table describing a character beside the loadout,
and the two can disagree. The skills are on `ArenaLoadout.skills` instead, and
`skills.ts` declares what they are — one place says which character has which,
which is the same argument that moved the stat mods onto the loadout in the
first place.

**Step 2 — the recompute.** Two additions to `recomputeStats`, in a fixed order:
an `itemBonus` scales the named stats as each item is summed, and a `regenFrom`
reads the finished block afterwards. It was a small change because the
recompute already knew which source each number came from — "from items" was
already distinguishable, and that is the whole reason skill 1 is four lines
rather than a tracking system.

**Step 3 — the screens.** The sheet gets a 職業技能 group above the primaries,
with the regeneration one quoting what it is currently worth. The character
screen's skill tab gets the same two in a gold-bordered group labelled
`職業技能 · 生效中`, above the four fictional ones, which stay.

### Measured

`npm run verify`: **43/43**, eight new.

- an item's armour is doubled for the class that masters it
- an item's health is doubled too
- an item's other modifiers are left alone — 重甲板 is armour *and* a movement
  penalty, and a skill that doubled the drawback would punish the build it is for
- armour and health from attributes are not doubled — "from items" has to mean
  from items, or the skill is a stat bonus with a story
- regeneration rises with armour and health
- a class without the skill regenerates nothing
- **mastery feeds regeneration, not just the armour number**
- the block still rebuilds identically with two more writers in it

The seventh is the one the plan called for, and it was tested by breaking it:
moving the `regenFrom` loop above the item loop makes it fail and leaves every
other check passing — which is exactly the failure it exists to catch, since
that ordering still works, still looks right, and quietly is not the class.

A live run confirms the arithmetic end to end. Haru opens at **5.1 armour, 151
health, 1.01 HP/s** — the plan predicted 1.0. After buying 護符, 鐵心 and 重甲板:
**41.1 armour** (12 + 24 doubled onto 5.1), **201 health** (50 doubled), and
**2.65 HP/s**, which is `0.2 + 41.1 × 0.04 + 201 × 0.004` exactly. No console
errors; both screens shot.

### Left where it was
Balance, again. Regeneration at 2.65/s after three items is either irrelevant or
decisive against a wave-scaled crowd and there is no way to know which without
playing it. Three numbers in one file is the mitigation, not an answer.

### And then the fiction came out

The plan kept the four written skills — 緋刃 Lv.6/10, 落月斬 冷卻 12 秒, and the
rest — on the argument that removing them was a bigger job than this one. They
went the next day anyway, and the argument for going was the one already in the
file: two sets of numbers for one character, one of them invented, and the
invented half is the one people read before choosing. The stat block went for
exactly that reason, and leaving the skills was the same mistake a second time.

So `Character.skills` and `CharacterSkill` are gone from `features/character.ts`
— 88 lines of it — and the skill tab is the class skills alone. The card is the
one the fiction was wearing, which was always the better half of it. Two lines
did not survive with it: a passive has no rank to show and nothing to wait for,
so the level slot says 生效中 and the cooldown line is gone.

The icon and colour come from the skill's *effect*, not from a table keyed by
skill id — the same arrangement the shop's medallions use, so a new skill of an
existing kind is drawn sensibly without a second list to keep in step.

Three of the four characters have no skills yet, so the tab says so rather than
being empty: a blank panel reads as a screen that failed to load.
