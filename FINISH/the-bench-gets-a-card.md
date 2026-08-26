# The Bench Gets a Card

## Goal

A second card on `/l2d-demo/` for **Live2D 檢測台**, published at
`/l2d-demo/l2d-viewer/`. The grid was built for this — the card itself is a
copied `<article>` — so almost none of the work is on the homepage.

## The number that decides everything

`npm --prefix tools/l2d-viewer run build` works today, unchanged. Its output is
**18 MB**, and the tool is 0.71 MB of that:

| | |
|---|---|
| `index.html` + JS + CSS | **0.71 MB** (702 kB JS, gzip 203 kB) |
| copied `live2d/` | 6.7 MB |
| copied `video/` | 9.8 MB |
| copied `favicon.svg` etc. | the rest |

The bench sets `publicDir: '../../project01/public'` so it tests against the
game's own models and the game's own pinned Cubism Core rather than a second
copy that could drift — a deliberate decision, and a good one in dev. On
**build** it means Vite copies all 17 MB of project01's public directory into
the bench's `dist`, including the 9.8 MB backdrop video the bench never touches.
Published as-is the site goes from 21 MB to about 39 MB, and roughly half of it
is a byte-for-byte duplicate of files already served from
`/l2d-demo/project01/`.

So the interesting part of this task is not the card. It is publishing the bench
without shipping the game's assets twice.

## Decisions to confirm before start

**1. In production the bench borrows project01's assets; in dev nothing
changes.**

`publicDir: false` for `command === 'build'` only. The four game models, and the
Core script, then come from `/l2d-demo/project01/live2d/...` — the copy the game
already publishes. Dev keeps the shared `publicDir` exactly as it is, so the
no-drift guarantee that motivated it still holds where it matters: what the
bench tests locally is literally the game's file.

One string in `tools/l2d-viewer/vite.config.ts` — `/l2d-demo/` — would then feed
both `base` (`/l2d-demo/l2d-viewer/`) and the asset root
(`/l2d-demo/project01/`). That is a third place hardcoding the deploy path,
after `project01/vite.config.ts` and `site/404.html`; the plan is to say so in
each of them rather than to invent a shared config file for one string.

*Alternative, if the duplication is preferred to the indirection:* leave
`publicDir` alone and ship 18 MB. It is simpler and it is 18 MB. Recommended
against — the video alone is half of it and has nothing to do with the bench.

**2. `src/sources.ts` has five hardcoded absolute URLs and they have to move.**

```
{ id: 'haru', url: '/live2d/haru/Haru.model3.json', ... }
```

`/live2d/...` resolves against the site root, so on the published site it would
be a 404 at `/l2d-demo/live2d/...`. Four of them become asset-root-relative; the
fifth is HARU改, below. This is a real edit to the tool's source, not a config
change — small, but it is why this is a plan rather than a card.

**3. HARU改 has to be copied into the build, or the bench loses its control.**

`fixtures/` is served by a `configureServer` middleware — dev only. A build
copies nothing, so the published bench would offer HARU改 in the picker and 404
on it. The fixture is **1.5 MB**, and it is the one model in the picker whose
answer is known in advance, which is the whole reason the bench can be trusted
about the others. Copy it in a `closeBundle` hook, the way project01 copies
`404.html`.

*Alternative:* hide HARU改 from the published build. Cheaper by 1.5 MB and it
makes the public bench worse at the job it exists for. Recommended against.

**4. The Core `<script>` in the bench's index.html is rewritten at build.**

`<script defer src="/live2d/live2dcubismcore.min.js">` is what Vite currently
rewrites with `base`; it must instead point at project01's copy. A
`transformIndexHtml` hook in the same plugin as the fixture copy, so the two
build-time rewrites sit together and the DO-NOT-UPGRADE note keeps meaning what
it says: there is still exactly one Core file on the site.

**5. Publishing the bench publishes nothing new.**

The four Live2D sample models are already on the deployed site, inside
project01. HARU改 is a recolour of one of them and is already in the repository.
The drop-a-folder feature reads files client-side, so it needs no server and
gains no upload endpoint. Nothing here changes what is publicly available; only
what is linked.

## What it costs in CI

A second `npm ci` and a second `vite build`, about a minute. `setup-node`'s
cache takes both lockfiles in one step. The bench's build also runs `tsc -b`,
so it becomes type-checked on every push — which it is not today.

## Planned steps

1. `tools/l2d-viewer/vite.config.ts`: the site-root constant, `base` for builds,
   `publicDir: false` for builds, and a plugin that copies `fixtures/` into
   `dist/fixtures` and rewrites the Core script tag. Comment why each exists.
2. `tools/l2d-viewer/src/sources.ts`: the four game-model URLs read the asset
   root; HARU改 reads `BASE_URL`, since its fixture now ships with the bench.
3. `npm --prefix tools/l2d-viewer run build`; confirm `dist` is about 2.2 MB
   rather than 18 MB, and that no `live2d/` or `video/` directory is in it.
4. Cover: `npm --prefix project01 run shot -- --base http://localhost:5174 --out
   viewer.png` against the bench on 5174, to WebP under 200 KB, into `site/`.
5. `site/index.html`: the second `<article>` — 「Live2D 檢測台」, 「丟一個模型
   進去，回答它跑不跑得起來、裡面有什麼、要什麼 config。」, link
   `./l2d-viewer/`.
6. `.github/workflows/deploy.yml`: install and build the bench, copy its `dist`
   to `_site/l2d-viewer`, cache both lockfiles.
7. Serve the assembled `_site/` locally under `/l2d-demo/` and load the bench:
   all five models in the picker load, the moc3 verdict appears, the emitted
   config block is right, and a dropped folder still works.
8. `CLAUDE.md`: the layout table gains `tools/l2d-viewer`, and the deployment
   paragraph gains the third hardcoded base and the borrowed-assets rule.
9. Retire this plan to `FINISH/` with a `## Progress`, commit, push, then check
   the live bench the way the last plan checked the live landing page.

## Not in scope

- No change to what the bench does or looks like.
- The bench's runtime pins stay exactly as they are; matching project01 is the
  point of them.
- No card for anything else.

## Progress

Done. The card was the easy half, as expected; three things are worth recording.

**2.2 MB instead of 18 MB, and the arithmetic is visible in the output.** The
bench's `dist` now holds `index.html`, one 702 kB JS chunk, one 3.7 kB CSS file
and the 1.5 MB HARU改 fixture — no `live2d/`, no `video/`. Every model request
on the assembled site resolves to `/l2d-demo/project01/live2d/...`, the copy the
game already publishes, and both a borrowed model (Mao, moc3 v5) and the shipped
fixture (HARU改) were loaded through the picker with every request returning 200.

**The homepage's grid was quietly one-column on a laptop.** With one card that
was invisible; the second card exposed it. The cause is in the grid spec rather
than in the CSS: auto-repeat counts repetitions from the track's **maximum**
when that is definite, so `minmax(22rem, 26rem)` asks for 2 × 416 + 28 = 860px
of grid before it will make two columns, and a 955px window gives 845. Fifteen
pixels. Lowering the ceiling to 24rem asks 796 instead. Measured after: 960px
window → two 384px columns; 375px phone → one 335px column; no horizontal
overflow at either.

**One thing was added that the plan said was out of scope: a favicon link.**
The bench's HTML declared no icon, so every visit fired a 404 for `/favicon.ico`
— pre-existing, and invisible while the tool only ran on localhost. Beside a
landing page that has one, a blank tab icon reads as unfinished, so the same
build hook that redirects the Core script now redirects a favicon link at
project01's copy. Two lines.

Left alone: one build warning, `<script src="/live2d/live2dcubismcore.min.js">
can't be bundled without type="module"`. It is Vite noticing that the file is
not in a `publicDir` any more, which is the point — the emitted tag is correct
and was read out of `dist/index.html` to be sure.

Not verified mechanically: dropping a real folder onto the bench. It is
client-side code this change does not touch, and driving a directory drop
through the automation is not something to trust more than the reasoning; the
drop target renders and the file-picker fallback is in the page.

`tsc -b` now runs on the bench on every push, which it did not before.

**Live, after the deploy.** `https://fayipon.github.io/l2d-demo/` shows both
cards; 進入檢測台 lands on `/l2d-demo/l2d-viewer/` with Haru rendering and the
config block filled in. Read in a fresh tab so nothing was carried over: no
console errors, and every request 200 — the bundle from `l2d-viewer/`, the Core
and the model from `project01/`, the fixture from `l2d-viewer/fixtures/`. The
published HTML says `href="/l2d-demo/project01/favicon.svg"` and
`src="/l2d-demo/project01/live2d/live2dcubismcore.min.js"`, which is the borrow
working end to end.
