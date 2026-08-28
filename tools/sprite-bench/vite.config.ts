import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

/**
 * What the deployed site looks like, in one string.
 *
 * `/l2d-demo/` is the landing page, `project01/` the game, `l2d-viewer/` the
 * Live2D bench and `sprite-bench/` this. Four places now hardcode that string
 * -- project01/vite.config.ts, site/404.html, tools/l2d-viewer/vite.config.ts
 * and here. A shared config file for one string that changes when the
 * repository is renamed is still worse than four notes saying so.
 */
const SITE = '/l2d-demo/'

const TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
}

/**
 * Serves a directory outside the project root, in dev only.
 *
 * Used twice: `project01/src/assets` at `/game-assets`, and `DESIGN` at
 * `/design`.
 *
 * The game's sprite sheet is the one subject whose answer is already known --
 * it is drawn on screen in the arena today -- so the bench should be able to
 * open it. But unlike the Live2D models it is not a published file: it lives
 * in `src/assets`, Vite hashes it into project01's bundle, and there is no URL
 * on the site that serves it standing alone.
 *
 * So it is read where it lies rather than copied. A copy in this directory
 * would be 238 kB that goes stale the first time the sheet is re-exported,
 * and a bench testing last month's art against this month's numbers is the
 * exact failure this tool exists to catch.
 *
 * The consequence is that the PUBLISHED bench cannot offer it, and that is
 * deliberate -- see README.md. What ships is the two fixtures and the drop
 * target.
 *
 * Paths are normalised and checked to stay under the root before anything is
 * opened. This is localhost and the threat is not real, but a path handler
 * that concatenates request input is a bad habit whatever it runs on. Copied
 * in shape from tools/l2d-viewer/vite.config.ts, which needs the same thing
 * for a different directory.
 */
function serveDirectory(mount: string, from: string): Plugin {
  const root = normalize(fileURLToPath(new URL(from, import.meta.url)))
  return {
    name: `serve${mount.replace(/\//g, '-')}`,
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(mount, (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0])
        const file = normalize(join(root, rel))
        if (!file.startsWith(root)) {
          res.statusCode = 403
          res.end('outside the asset root')
          return
        }
        stat(file).then(
          (s: import('node:fs').Stats) => {
            if (!s.isFile()) return next()
            res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
            createReadStream(file).pipe(res)
          },
          () => next(),
        )
      })
    },
  }
}

/**
 * Unlike the Live2D bench, this one keeps its own `public/`.
 *
 * That bench borrows project01's public directory because what it tests IS the
 * game's 17 MB of models and its pinned Cubism Core, and a second copy could
 * drift from the file the game actually loads. Nothing here needs that: the
 * fixtures are this tool's own, the one game file it wants is served by the
 * middleware above, and a sheet under test arrives by drag-and-drop. So
 * `public/` is the ordinary Vite one, the fixtures live in it and get copied on
 * build for free, and this config has no `publicDir` line at all.
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? `${SITE}sprite-bench/` : '/',
  plugins: [
    serveDirectory('/game-assets', '../../project01/src/assets'),
    /* And DESIGN/, where the source art lives -- CLAUDE.md says to look there
       first, and a bench that cannot open the folder the art is in makes
       people copy files around to use it. */
    serveDirectory('/design', '../../DESIGN'),
  ],
  server: {
    // 5173 is the game, 5174 the Live2D bench. Having all three open at once
    // is the normal way to use this.
    port: 5175,
    // The middleware reads from outside the project root, so Vite has to be
    // told that reaching up there is deliberate.
    fs: { allow: ['..', '../..'] },
  },
}))
