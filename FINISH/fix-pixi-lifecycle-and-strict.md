# Fix Pixi Ticker Bug, Destroy Race, and Strict Mode Plan

## Goal
Fix the three highest-severity issues found in the project analysis:
ticker callback misuse, async init/destroy race under StrictMode, and
missing TypeScript strict mode.

## Scope
- project01/src/pixi/PixiCanvas.tsx
- project01/tsconfig.app.json

Out of scope (reported but deferred): stale index.html title, empty README,
unused assets, outdated AGENTS.md state section, missing folders, lazy routes,
test tooling.

## Planned Steps

### 1. Fix ticker callback (animation is currently frozen)
PixiJS v8 passes a `Ticker` instance to ticker callbacks, not a number.
The current callback types the parameter as `unknown` and checks
`typeof time === 'number'`, which is always false, so the orb never moves.
- Import the `Ticker` type from pixi.js
- Type the callback as `TickerCallback` / `(ticker: Ticker) => void`
- Accumulate `ticker.deltaTime` into a local elapsed counter and drive the
  sine/cosine motion from it

### 2. Fix async init / destroy race under StrictMode
Cleanup calls `app.destroy(...)` unconditionally even when `app.init()` is
still pending, and the init path destroys a second time after resolving.
- Track an `initialized` flag set after `await app.init(...)` resolves
- Only destroy from cleanup when initialized
- When disposed before init completes, destroy exactly once inside init
- Keep ticker callback removal before destroy

### 3. Enable TypeScript strict mode
AGENTS.md requires strict mode; the Vite scaffold config omits it.
- Add `"strict": true` to project01/tsconfig.app.json
- Add `"DOM.Iterable"` to `lib`
- Fix any new type errors surfaced by strict mode

## Validation
- npm run build (tsc -b + vite build) from project01
- npm run lint from project01
- Confirm the Pixi orb actually animates and cleanup paths remain intact

## Completion Flow
- Move this plan from PLANS to FINISH
- Commit and push in the same flow
