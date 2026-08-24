# A Live2D Model Bench

## Goal
A small tool, in its own directory, that loads a Live2D model and answers the
three questions this project asks of every new one: **will it load at all**,
**what is in it**, and **what config does it need**.

## Why it is worth building

Adding a character today is a manual loop with a slow failure mode. You put a
model under `public/live2d`, hand-write a `Live2DModelConfig` — motion group
names, expression ids, `heightRatio`, `position` — reload the lobby, and find
out what you got wrong by looking at it. Framing in particular is two numbers
tuned by editing a file and refreshing a game.

And the first question is the one that costs the most to get wrong. The Core is
pinned to **moc3 ≤ 5** (see `index.html`), Mao is already at 5, and any model
authored in a current Cubism Editor is likely to be 6. That is a purchase or a
commission that cannot be used, discovered after the money is spent. The check
is one byte — `moc3[4]` — and `fetch-models.mjs` already applies it, but only to
models fetched from Live2D's own sample repository. Anything acquired any other
way has nothing looking at it.

So: a bench that takes a model from **anywhere**, tells you immediately whether
it runs on the Core this project is pinned to, lets you exercise it, and hands
back the config block to paste.

## Decisions to confirm before start

**1. Where, and with its own dependencies.**
`tools/l2d-viewer/`, with its own `package.json`, `vite.config.ts` and
`node_modules`.

The versions of `pixi.js` and `pixi-live2d-display-advanced` must be **pinned to
exactly what `project01` uses** — 7.4.3 and 1.1.0 — because the entire point is
to test what production runs. A bench on a newer runtime would cheerfully load a
model the game then refuses. That is a comment in its `package.json` and a note
in the README, not a mechanism; npm workspaces would enforce it but would also
restructure `project01`, which every command in CLAUDE.md is written against.

**2. It serves `project01/public`, and copies nothing.**
`publicDir` points at `../../project01/public`, so the tool gets the pinned
`live2dcubismcore.min.js` and all four existing models for free and can never
drift from them. Copying the Core file into the tool would create exactly the
second copy the pinning note exists to prevent.

**3. It imports no code from `project01/src`.**
Tempting — the art-bounds measurement in `Live2DStage` is the good part and this
would use it. But the tool has to survive models that the game would throw on:
a broken `model3.json`, a moc3 the Core rejects, a model with no motions. Its
loading path is deliberately more defensive than production's, and sharing one
would mean either weakening the game's or making the tool lie about what the
game does. The measuring maths is duplicated, in a simplified form, and the
duplication is noted at both ends.

**4. Drag-and-drop a folder is the headline input.**
Confirmed workable against the pinned library:
`ModelSettings.replaceFiles((file, path) => string)` rewrites every declared
resource path, so a dropped folder becomes blob URLs and
`Live2DModel.from(settings)` takes it. `Cubism4ModelSettings` is exported from
the `/cubism4` entry point. No server, no copying a model into the repo to find
out it does not work.

## What it does

**Compatibility, first and loudest.** Before anything renders:

| | read from |
|---|---|
| moc3 version, and a verdict against the pinned Core | byte 4 of the `.moc3` |
| textures, and their total weight | the settings' `Textures` |
| drawable count, canvas size, `pixelsPerUnit` | the loaded core model |
| motion groups and their counts | `FileReferences.Motions` |
| which motions carry a `Sound` | the motion entries |
| expression ids | `FileReferences.Expressions` |

A model that fails the version check is reported as *why* it failed rather than
as a blank canvas — the failure the pinning note describes is
`Failed to CubismMoc.create()`, which says nothing to anyone who has not read
that note.

**Exercise it.** Every motion group listed with its indices, click to play;
every expression, click to apply; the hit areas drawn as boxes, because
`Live2DStage` has to wire `hit` to a motion group by hand and the reason is that
the names never match.

**Frame it, then copy the config out.** Sliders for `heightRatio` and
`position`, with the measured art bounds and the model's own canvas drawn as
overlays so it is visible *why* a model sits off-centre — Mao's two detached
meshes are the case that produced `MAO_NUDGE`, and on this screen they would
have been obvious rather than deduced.

Then a panel emitting the literal, in the shape `live2dConfig.ts` already uses:

```ts
const natori: Live2DModelBase = {
  modelPath: `${import.meta.env.BASE_URL}live2d/natori/Natori.model3.json`,
  idleMotionGroup: 'Idle',
  tapMotionGroup: 'TapBody',
  expressions: numbered(['exp_01', ...]),
  voiceVolume: 0.9,
  tapLines: [{ motionIndex: 0, caption: '' }],
}
```

Captions are left blank — those are writing, not data, and a tool that invented
them would be inviting placeholder Chinese into the game.

## Steps

1. **Scaffold.** `tools/l2d-viewer/`: `package.json` with the two pinned deps,
   `vite.config.ts` with `publicDir` pointed at project01's, `index.html`
   carrying the same deferred Core script tag and the same DO-NOT-UPGRADE note
   pointing at the original.
2. **The stage.** A Pixi `Application` and a load path that reports failures
   instead of throwing them. Roughly `Live2DStage` with the framing effects
   removed and the error handling grown.
3. **Sources.** A picker over the four models in `project01/public/live2d`, and
   a drop target that turns a folder into blob URLs via `replaceFiles`.
4. **The report.** The compatibility table above, and the moc3 byte read before
   the loader is given anything.
5. **Playback.** Motion groups, expressions, hit areas.
6. **Framing and emit.** Sliders, overlays, and the config block with a copy
   button.
7. **A README** in the tool's directory: what it is for, why the versions are
   pinned to project01's, and the one sentence about moc3 ≤ 5 that anyone
   commissioning a model needs to have read.

## Out of scope
A parameter inspector — live sliders over every Cubism parameter — is the
obvious next thing and is deliberately not in this pass. It is the deepest
testing feature and also the one with the most UI in it; it should wait until
the bench has been used enough to say whether it is wanted.

Nothing in `project01` changes. If the bench turns out to want the art-bounds
measurement extracted into a shared module, that is a second change with its
own argument.

## Progress

Built as planned. One decision was made during rather than before, and one bug
in the library turned up that would have shipped the headline feature broken.

**Steps 1–3 — scaffold, stage, sources.** `tools/l2d-viewer/`, own
`package.json` with the three runtime versions pinned exactly and no caret,
`publicDir` pointed at `../../project01/public`, port 5174. Plain TypeScript and
no framework: the tool's `node_modules` holds pixi, the Live2D runtime and the
sound package it depends on, and nothing else, so when a model misbehaves here
there is nothing else to suspect. It is one screen and the state is five
variables.

`@pixi/sound` is a hard dependency of the runtime, not an optional one — it is
imported at the top of `cubism4.es.js` — so it is installed rather than skipped,
and voiced motions play on the bench the way they do in the lobby.

**Steps 4–6 — report, playback, emit.** As planned.

### The bug

`ModelSettings.resolveURL` **corrupts blob URLs**:

```
blob:http://localhost:5174/abc-123  ->  blob:http//localhost:5174/abc-123
```

The path-joining routine normalises the `//` and eats the scheme's colon. Every
texture and motion then 404s and the model arrives as an untextured mesh with no
stated cause — which would have made the dropped-folder path, the one feature
this tool exists for, silently useless.

Found by testing it rather than by reading it. The fix is one line: every
declared path has already been replaced with an absolute blob URL, so there is
nothing left to resolve and `resolveURL` is overridden to identity.

Worth recording that the plan called this risk and then nearly let it through —
"`resolveURL` should leave an absolute URL alone" was an assumption written down
as a likelihood, and it was wrong.

### Measured

`npx tsc -b` clean. Verified in the running tool rather than only by reading it:

- **Haru emits the config that is already in `live2dConfig.ts`** — same idle and
  tap group, same eight expression ids, same `HOME_FRAMING` with no nudge. The
  bench reproducing a hand-written config it has never seen is the strongest
  check available that it reads a model correctly.
- **Mao reports moc3 v5** — the ceiling, and not theoretical.
- **Mao's TapBody carries no Sound**, which the emitter says out loud. That
  matches the note in `live2dConfig.ts` about only Haru's motions being voiced,
  arrived at independently.
- **Mao's artwork box is 4348×7513 starting at x=50 in a 5800-wide canvas** —
  the measured centre sits 676px left of the canvas centre. That is `MAO_NUDGE`,
  as a number on screen rather than as a deduction in a comment.
- **The dropped-folder path works end to end.** Tested by synthesising `File`
  objects with `webkitRelativePath` from a served model and running them through
  `loadFolder`: 24 files in, blob URL intact through `resolveURL`, texture
  decoded at 2048×2048.

### What is worth watching

**Drag-and-drop itself is still untested by hand.** `loadFolder` and the blob
plumbing are verified, but `filesFromDrop` — the `webkitGetAsEntry` walk — was
exercised only through the file-input path. The batching loop in it exists
because Chrome returns at most a hundred entries per `readEntries` call; that is
the line to suspect if a large model ever arrives with files missing.

**The built-in model list is hardcoded** in `sources.ts` and mirrors `MODELS` in
`fetch-models.mjs`. HTTP has no directory listing and `publicDir` is not part of
the module graph, so there is nothing to glob. A stale entry is a 404 in the
picker and nothing worse.
