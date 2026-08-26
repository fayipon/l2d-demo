# A Front Door for the Repository

## Goal

`https://<user>.github.io/l2d-demo/` stops being the game and becomes a landing
page: one card for **project01**, a button that goes into it. The game moves
one directory down, to `/l2d-demo/project01/`, and is otherwise untouched.

Locked with the user before writing this:

- The homepage lives at the **repository root**, above `project01/` — not as a
  new route inside the app. It is the entry to a collection, so `project02` and
  `tools/l2d-viewer` can be added later as more cards.
- Content is **one entry card** — thumbnail, title, one line of description,
  a 進入 button — on a page laid out as a grid, so the second card costs no
  layout work.

## What is actually being changed

Three things, and only the third is interesting.

**1. The app's base path.** `vite.config.ts` sets `base` to `/l2d-demo/` for
builds; it becomes `/l2d-demo/project01/`. Nothing else in the app changes:
`main.tsx` already passes `import.meta.env.BASE_URL` as the router `basename`,
and every asset URL goes through Vite. Dev is untouched — `base` is `'/'` when
`command !== 'build'`, so `npm run dev`, `verify`, `bench` and `shot` keep
working against `http://localhost:5173/` exactly as now.

**2. The Pages artifact.** Today the workflow uploads `project01/dist` as the
whole site. It will assemble a `_site/` instead:

```
_site/
  index.html        <- the landing page
  style.css
  cover-project01.webp
  404.html
  project01/        <- the contents of project01/dist
```

**3. The landing page itself** — plain HTML and CSS in a new `site/` directory
at the repository root. No build step and no `npm ci` for it, so CI gains a
`cp` and not a second install. The page is ~150 lines total; a Vite project to
produce them would add a lockfile, a node_modules and a minute of CI for
nothing. If the homepage ever needs components, that is the moment to give it a
build, not now.

The link on the card is `./project01/`, relative — which resolves correctly
both in the deployed site and when the assembled `_site/` is served locally,
with no base placeholder to keep in sync.

## The one thing that can break: deep links

`spaFallback()` in `vite.config.ts` copies `index.html` to `404.html` inside
`dist`, because GitHub Pages has no rewrite rule and answers an unknown path
with `404.html`. That is what makes `/l2d-demo/character` work on refresh.

After the move there are two 404s in play — `_site/404.html` and
`_site/project01/404.html` — and whether Pages consults the one nearest the
requested path is not something this repository has ever tested. So:

- `project01/404.html` keeps being produced, unchanged.
- `_site/404.html` starts as a small page: if the path begins with
  `/l2d-demo/project01/`, it replaces itself with the app shell
  (`location.replace` onto `/l2d-demo/project01/` after stashing the intended
  path — the standard SPA-on-Pages redirect); otherwise it shows "找不到頁面"
  and a link home.

  Deep links into the app therefore work whichever 404 Pages picks.
- Verified **after deploy**, on the live URL, by loading
  `/l2d-demo/project01/character` cold. Local `preview` cannot answer this: the
  404 behaviour is the host's, not Vite's.

Everything else that is base-sensitive already goes through the pipeline:
`index.html`'s `<script src="/live2d/live2dcubismcore.min.js">` and
`href="/favicon.svg"` are rewritten by Vite's HTML build, and the texture
preloader reads `%BASE_URL%`. That is why they survived the move to `/l2d-demo/`
and why they will survive this one — but the built `dist/index.html` gets read
once to confirm all three now say `/l2d-demo/project01/`.

## The card's image

The cover wants to be the game, not a mock. `npm run shot -- /` against the dev
server captures the real lobby with Live2D on it; that PNG is converted to WebP
(sharp is already a devDependency) and lands in `site/` at roughly 1280×720.
Budget: **under 200 KB** — the whole point of the page is that it appears
instantly, and the 21 MB behind the button loads only once someone asks for it.

`DESIGN/game_screen_01.png` is the fallback if the shot comes out badly, but a
real screenshot is the better claim.

## Look

Dark, matching the app it introduces: `#05060f` ground and white text, the same
values `index.css` uses, so clicking 進入 is not a jarring change of world. Copy
is Traditional Chinese, like every other screen. A `<title>` of `l2d-demo`,
`lang="zh-Hant"`, and the existing `favicon.svg` copied next to it.

The card is a 16:9 thumbnail over a title and one line — 「PixiJS + Live2D 大廳
與 Phaser 戰鬥的瀏覽器 demo」 — in a CSS grid that is one column on a phone and
auto-fills wider. The second project is then a copied `<article>`.

## Planned steps

1. `site/index.html`, `site/style.css`, `site/404.html` — the landing page, the
   grid, and the 404 with the SPA redirect described above.
2. Capture the cover: `npm run dev`, `npm run shot -- /`, convert to WebP,
   check it is under 200 KB, place it in `site/`.
3. `vite.config.ts`: `base` becomes `/l2d-demo/project01/`.
4. `.github/workflows/*.yml`: after `npm run build`, assemble `_site/` from
   `site/` plus `project01/dist`, and upload `_site` instead of
   `project01/dist`. The `working-directory: project01` default means the
   assembly step needs its own `working-directory` or root-relative paths.
5. `npm run build` and `npm run lint`; read `dist/index.html` and confirm the
   three base-sensitive URLs.
6. Serve the assembled `_site/` locally and click through: landing → project01
   lobby → `/character` → `/battle`, then back.
7. `CLAUDE.md`: the **Deployment shape** paragraph now describes two levels,
   and the layout table gains `site/`.
8. Move this plan to `FINISH/` with a `## Progress` section, commit, push.
9. After the Pages deploy is green: load `/l2d-demo/`, then
   `/l2d-demo/project01/character` cold, and record the result in Progress. If
   the nested 404 turns out not to be consulted, the root 404 already covers it
   — that is what step 1 buys.

## Not in scope

- No change to any route, page or asset inside the app.
- `tools/l2d-viewer` is not published and gets no card yet.
- No analytics, no fonts fetched from a CDN.

## Progress

Done as planned, in one commit. Three things were measured rather than assumed.

**The whole landing page is 92 KB.** `index.html` 2.5 KB, `style.css` 4.4 KB,
`favicon.svg` 9.5 KB and the cover 75.6 KB — against a budget of 200 KB for the
cover alone. The cover is a real `npm run shot -- /` of the lobby, Live2D and
all, resized to 1280×720 and encoded at WebP q82. The 21 MB behind the button is
untouched until someone presses it.

**Both 404 worlds were tested, not reasoned about.** A 40-line static server in
the scratchpad served the assembled `_site/` twice: once answering every miss
with the root `404.html`, once preferring `project01/404.html` for paths under
the app. Cold-loading `/l2d-demo/project01/battle` and
`/l2d-demo/project01/character` worked in both — under the root fallback the
document 404s, the stash-and-bounce runs, and the URL is back to `/battle`
before the arena starts; under the nested fallback the stash stays `null` and
nothing bounces. So the live answer to the question this plan could not settle
no longer matters.

**`auto-fill` was the wrong grid.** With one card it left two tracks and pinned
the card to the left edge, which `justify-content: center` cannot fix because
the empty track still occupies the row. `auto-fit` collapses it; the 26rem
ceiling is what stops the collapse from stretching the lone card across 68rem
into a banner. Both halves are needed, and the CSS says so.

Verified: `npm run build` and `npm run lint` clean; `dist/index.html`'s four
base-sensitive URLs — favicon, cubism core, the texture preload's `%BASE_URL%`,
and the bundle — all read `/l2d-demo/project01/`; landing → project01 → 角色 →
戰鬥 clicked through with no console errors beyond the intended 404 of the
fallback document itself.

Not done here, because it needs the live host: step 9's check that Pages serves
the deployed site the same way. The two-fallback design means either behaviour
is already covered, so this is a confirmation rather than a risk.
