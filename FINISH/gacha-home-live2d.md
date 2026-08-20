# Gacha Home Screen with Live2D Character Plan

## Goal
Build a mobile-gacha-style home screen matching the provided mockup, with the
character rendered as a Live2D model that has idle animation, voice playback,
and lip sync.

## Decisions Locked By User
- Pixi route: downgrade to **Pixi 7 + stable** `pixi-live2d-display-advanced@1.1.0`
  (not the Pixi 8 beta).
- Character: Live2D official **Haru receptionist** sample model.
- UI widgets are decorative only — no real game systems behind them.
- Voice is required (added to scope mid-discussion).

## Research Findings (all verified by request, not from memory)

### Library
- `pixi-live2d-display-advanced@1.1.0` — peer `pixi.js ^7.0.0`, `@pixi/sound ^5.2.3`.
- It exposes `model.speak(sound, { volume, expression, resetExpression, onFinish, onError })`
  plus a `SoundManager` — audio playback and lip sync are built in, so voice does
  not need a hand-rolled WebAudio analyser.
- Confirmed unusable on Pixi 8: `pixi-live2d-display` (v6), `-lipsyncpatch` (v7),
  `-advanced@1.1.0` (v7). Only `-advanced@2.0.0-beta.2` targets Pixi 8, and the
  user chose to avoid the beta.

### Cubism Core
- `live2dcubismcore.min.js` is NOT on npm and must be loaded separately.
- Verified reachable: https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js (200, 207KB)
- Load via a `<script>` in index.html so `window.Live2DCubismCore` exists before
  the model loads.

### Model source — use CubismWebSamples, NOT haru_greeter_ja.zip
The user's linked page (haru-receptionist) downloads `haru_greeter_ja.zip` (40MB).
Inspected it: mostly editor sources (.cmo3, .can3, two .psd totalling ~55MB), and
its runtime payload is a poor fit:
- all 27 motions sit in a single **unnamed** group `""` — no Idle/TapBody grouping
- **no expressions**
- **no audio at all**, and no `Sound` fields in any motion3.json

The same character ships properly packaged in Live2D/CubismWebSamples under
`Samples/Resources/Haru/` — same receptionist, same `haru_g_*` motion files:
- Motion group `Idle` (2): haru_g_idle, haru_g_m15
- Motion group `TapBody` (4), **each with a voice wav**:
  haru_g_m26 -> haru_talk_13.wav, haru_g_m06 -> haru_Info_14.wav,
  haru_g_m20 -> haru_normal_6.wav, haru_g_m09 -> haru_Info_04.wav
- 8 expressions F01-F08
- HitAreas named `Head` and `Body`
- Total runtime assets ~4MB (moc3 376KB + 2 textures ~2.7MB + sounds 645KB)

This is the only source that satisfies the voice requirement, so use it.

## Licensing Note (resolved)
Haru is Live2D free sample material governed by
https://www.live2d.com/zh-CHS/learn/sample/model-terms/ . This was raised because
the repo is public. The user's call: this is a work-in-progress dev project, not a
released product, so **commit the assets directly** and keep the setup simple.
Revisit before any public release.

## Planned Steps

### 1. Swap Pixi 7 in
- Uninstall pixi.js 8; install `pixi.js@^7`, `pixi-live2d-display-advanced@^1.1.0`, `@pixi/sound@^5.2.3`
- Delete the placeholder orb demo (`src/pixi/PixiCanvas.tsx`) — it is superseded
- Keep strict mode on; fix any Pixi 7 typing fallout

### 2. Cubism Core + model assets
- Add the Cubism Core `<script>` tag to index.html
- Download the Haru runtime files from CubismWebSamples into
  `public/live2d/haru/` (model3 / moc3 / textures / motions / expressions / sounds,
  ~4MB) and commit them

### 3. Live2D runtime layer (`src/pixi/`)
- `live2dConfig.ts` — model path, scale, anchor, idle group, tap group,
  expression list, voice volume; swapping models should mean editing this file only
- `useLive2DModel.ts` / `Live2DStage.tsx` — Pixi 7 Application in a ref, model
  load, resize handling, full lifecycle cleanup (per AGENTS.md rules)
- Guard the async load against StrictMode double-mount, same pattern already
  applied to the orb demo

### 4. Voice + interaction
- Idle motion loops automatically from the `Idle` group
- Tap the character -> random `TapBody` motion; its bound wav plays with lip sync
  driven by the library's `LipSync` parameter group
- Expose a small imperative handle so UI buttons can trigger a line/expression
- Mute toggle, since autoplay-blocked audio contexts need a user gesture first

### 5. UI overlay (decorative)
Fixed-aspect 16:9 stage, letterboxed, Live2D full-bleed behind a CSS overlay:
- top-left: player card (LV, name, EXP bar)
- top-right: energy / coin / gem pills with `+` buttons
- center: 5 rotated-square menu tiles — STORY, CHARACTER, EXPLORE, STUDIO, GACHA,
  with the EVENT! ribbon
- right rail: mail, present, shop, friend, menu, with red badge dots
- bottom-left: MY ROOM, MISSION
- bottom-right: reload, settings
- speech bubble near the character, wired to the voice lines
- Route `/` renders this home screen; keep the existing router structure

### 6. Cleanup carried from the earlier analysis
- Fix the leftover `-tmp-vite-` title in index.html
- Remove the unused scaffold assets (hero.png, react.svg, vite.svg, icons.svg)

## Validation
- `npm run build` and `npm run lint`
- Run dev server, confirm: model renders, idle animation loops, tapping plays a
  motion with audible voice and moving mouth, layout matches the mockup shape
- Confirm Pixi/Live2D cleanup on route change (no leaked tickers or WebGL contexts)

## Out Of Scope
- Real game logic behind any UI element
- Reproducing the mockup's specific character illustration (that art is not ours;
  Haru stands in for it)
- Empty README, outdated AGENTS.md "repository is currently empty" section

## Completion Flow
- Move this plan from PLANS to FINISH, commit and push in the same flow.
