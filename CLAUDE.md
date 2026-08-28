# CLAUDE.md

Guidance for Claude Code working in this repository. Repo-level agent rules
also live in AGENTS.md; where the two disagree, this file is current.

## What this is

`l2d-demo` — a browser gacha-game demo. Two halves that never share a screen:

- **Lobby** (`/`, `/character`, `/story`, `/achievements`) — React DOM over a
  **PixiJS + Live2D** canvas. Cubism 4 models, voiced tap motions, head-crop
  portraits.
- **Battle** (`/battle`) — a **Phaser 4** survivors arena with its own
  simulation, lazy-loaded because Phaser is ~1.3 MB.

UI copy is Traditional Chinese (`<html lang="zh-Hant">`); code and docs are
English.

## Repository layout

| Path | Role |
|---|---|
| `project01/` | the application — run every app command from here |
| `site/` | the published site's landing page — hand-written HTML/CSS, no build |
| `tools/l2d-viewer/` | the Live2D bench — its own Vite project, published beside the app |
| `tools/sprite-bench/` | the sprite-sheet bench — same shape, Phaser instead of Pixi |
| `PLANS/` | plan for work not yet finished (`xxxx.md`) |
| `FINISH/` | plans retired after the work shipped |
| `DESIGN/` | source art and mocks — check here **before** inventing visuals |
| `AGENTS.md` | repo-level agent instructions (its "repository is empty" section is stale) |

## Task workflow protocol

1. For each new implementation request, first write a plan file in `PLANS/`
   named `xxxx.md` (goal, scope, decisions locked by the user, planned steps).
2. **Do not start execution until the user explicitly says start.**
3. Record progress against the plan as steps land — the existing FINISH docs
   carry a `## Progress` section with the commit sha and the measured result of
   each step.
4. On completion: move the plan from `PLANS/` to `FINISH/`, then commit and
   push in the same flow.
5. Need reference material? Look in `DESIGN/` first.

## Commands (`cd project01`)

Only run scripts that exist in `package.json`. There is no test runner.

```
npm run dev              # Vite dev server, http://localhost:5173
npm run build            # tsc -b && vite build  (the type check)
npm run lint             # oxlint
npm run preview          # serve dist/
npm run verify           # puppeteer: assert the arena's invariants (dev server must be up)
npm run bench            # puppeteer: measure the arena under load
npm run shot -- story    # puppeteer: screenshot a route, for checking a screen against a mock
npm run assets:optimize  # DESIGN/ art -> src/assets + public WebP
npm run models:fetch     # one-off Live2D sample-model fetch
```

`verify`, `bench` and `shot` drive the Chrome already installed on the machine
via `puppeteer-core`, and reach the game through `window.__arena`, a dev-only
handle. Do not add measurement hooks into game code for them.

## Source map (`project01/src`)

```
app/        selected-character provider (localStorage-backed)
routes/     AppRoutes — all route definitions, battle is lazy
pages/      one file + one css per screen
components/ shared UI (StageShell letterbox, Emblem, icons)
features/   lobby domain data & stores: character roster, profile, portraits,
            story, achievements, arenaProfile
pixi/       Live2DStage (Pixi Application lifecycle), live2dConfig, portrait crop
game/       the arena
  data/     content, actors, loadouts, shop — numbers only, no Phaser import
  sim/      world, pool, grid — pure simulation, no renderer
  scenes/   ArenaScene — Phaser display list driven from the sim
  view/     atlas — sprite sheet baked on a 2D canvas at boot
  runStore  one-way channel sim -> React HUD
```

## Rules that are load-bearing

**One renderer per screen.** Phaser and Pixi/Live2D never share a WebGL context
and never share a route. Do not try to put Live2D inside Phaser.

**Pixi/Phaser instances live in refs, never React state.** Create and destroy
inside effect lifecycles; clean up tickers, textures and listeners on unmount.
Re-rendering `GameCanvas` tears down the Phaser game — that is why run state
goes through `runStore` (module holds the truth, React subscribes via
`useSyncExternalStore`) rather than through props or context.
`Live2DStage` keys its whole WebGL lifecycle off **config object identity**, so
model configs must be built at module scope, never during render.

**Simulation is renderer-free.** `game/sim/*` imports no Phaser; `game/data/*`
imports neither Phaser nor the world. Tuning is an edit in `data/`, not a hunt
through the simulation.

**Arena performance is by construction, not optimisation.** Fixed-capacity
pools (`sim/pool.ts`) because a survivors game would otherwise stutter on GC; a
uniform grid (`sim/grid.ts`) for enemy separation; one white-shape atlas
(`view/atlas.ts`) tinted at runtime, because a texture change flushes Phaser's
batch. Keep new entities inside these.

**Do not upgrade `public/live2d/live2dcubismcore.min.js`.** It is Core 5, pinned
to the framework `pixi-live2d-display-advanced@1.1.0` bundles; Core 6 loads and
renders nothing. Consequence: models must be moc3 version ≤ 5 —
`scripts/fetch-models.mjs` rejects anything higher.

**Deployment shape.** GitHub Pages serves from `/l2d-demo/`, and that root is
the landing page in `site/`; each project is published one directory down —
`/l2d-demo/project01/`, `/l2d-demo/l2d-viewer/` and `/l2d-demo/sprite-bench/` —
so each sets `base` for builds only, and project01's router uses
`import.meta.env.BASE_URL`. The Pages workflow assembles all four into `_site/`
rather than uploading a `dist` — a file added to `site/` ships, a file added
anywhere else does not.

**The bench borrows the game's assets rather than copying them.** In dev its
`publicDir` *is* `project01/public`, so it tests the game's own models and the
game's own pinned Cubism Core. A build would copy all 17 MB of that beside the
copy project01 already publishes, so builds turn `publicDir` off and point the
model URLs, the Core script and the favicon at `/l2d-demo/project01/...`
instead; its own fixture is copied into its `dist`. Consequence: **the bench's
published build depends on project01 being published beside it**, and its
`dist` is 2.2 MB rather than 18 MB.

`tools/sprite-bench` borrows the same way and lands somewhere else, because
what it wants is not published at all: `actor-haru.webp` lives in
`project01/src/assets` and Vite hashes it into the game's bundle, so there is
no URL to point at. Dev serves the real file through middleware at
`/game-assets`; the build ships only the tool's own fixtures, and **the
published sprite bench cannot open the game's sheet**. That is deliberate — the
alternative is a copy that goes stale, which is the failure this bench exists
to catch.

Deep links are served by **`site/404.html`**, the one at the site root: measured
on the live site, Pages ignores the `404.html` in a subdirectory, so a request
for `/l2d-demo/project01/character` gets the root page and not the app shell.
That page stashes the intended path and bounces to the app, where a script in
`index.html` restores it before the router reads the URL. It hardcodes the base
string, so it changes whenever `base` does. The build plugin still writes
`dist/404.html` — it costs nothing and covers a host that does look there.
Breaking any of this is invisible in dev.

**Persisted keys are namespaced and versioned:** `l2d-demo:selected-character`,
`l2d-demo:profile:v1`, `l2d-demo:portraits:v2`. Bump the suffix when the shape
or the rule behind cached data changes.

## Style

TypeScript strict, plus `noUnusedLocals`, `noUnusedParameters`,
`erasableSyntaxOnly`, `verbatimModuleSyntax`. No semicolons, single quotes.
Small composable modules over large mixed ones.

Every non-trivial module opens with a block comment explaining **why it exists
and what would go wrong otherwise** — not what it does. Match that: prose, no
bullet lists of the obvious, and a note wherever two files must agree (e.g.
`data/actors.ts` and `scripts/optimize-assets.mjs` share a frame geometry).

A claim without a number is not a claim: performance statements come from
`npm run bench`, behavioural ones from `npm run verify`.

Commits are Conventional-Commit prefixed with a lowercase declarative subject
describing the outcome, e.g.
`feat: the arena's damage numbers are the painted font`,
`fix: aim the bonus projectiles, and stop everything while the shop is open`,
`docs: retire the arena plan to FINISH`.

## Before calling a task done

- `npm run build` (this is the type check) and `npm run lint`
- `npm run verify` for arena changes; `npm run bench` when performance is claimed
- `npm run shot -- <route>` when a screen was tuned against a mock in `DESIGN/`
- Confirm Pixi/Phaser cleanup paths still run, and that router navigation works
