import { createReadStream } from 'node:fs'
import { cp, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.moc3': 'application/octet-stream',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.wav': 'audio/wav',
}

/**
 * Serves `fixtures/` at `/fixtures`.
 *
 * Vite takes one `publicDir` and this project's is project01's, deliberately --
 * see below. The bench's own test models therefore need a second static root,
 * and fifteen lines of middleware is a smaller price than either giving up the
 * shared public directory or pulling in a static-file dependency.
 *
 * Paths are normalised and checked to stay under the root before anything is
 * opened. This is a dev server on localhost and the threat is not real, but a
 * path handler that concatenates user input is a bad habit whatever it is
 * running on.
 */
function fixtures(): Plugin {
  // The config is ESM, so there is no __dirname to reach for.
  const root = normalize(fileURLToPath(new URL('fixtures', import.meta.url)))
  return {
    name: 'serve-fixtures',
    configureServer(server) {
      server.middlewares.use('/fixtures', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0])
        const file = normalize(join(root, rel))
        if (!file.startsWith(root)) {
          res.statusCode = 403
          res.end('outside the fixture root')
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
 * What the deployed site looks like, in one string.
 *
 * The bench is published beside the game rather than inside it -- `/l2d-demo/`
 * is the landing page, `project01/` the game, `l2d-viewer/` this -- and the two
 * halves of that layout have to agree: where this is served from, and where it
 * looks for the game's assets.
 *
 * This is the third file hardcoding the deploy path, after
 * project01/vite.config.ts and site/404.html. Three copies of one string is
 * worse than one, and a shared config file for one string that changes when the
 * repository is renamed is worse still. Change it here when it changes there.
 */
const SITE = '/l2d-demo/'

/**
 * The two things a build has to do differently from dev, kept together because
 * they are the same decision.
 *
 * The bench borrows `project01/public` as its `publicDir`, which in dev is
 * exactly right: what it tests is the game's own file, and no copy can drift.
 * On a build Vite would copy that whole directory -- 17 MB, of which 9.8 MB is
 * a backdrop video the bench never touches -- next to the copy project01
 * already publishes. So `publicDir` is off for builds and the two things
 * index.html takes from it -- the Cubism Core script and the favicon -- are
 * pointed at the game's published copies instead. There is still exactly one
 * Core file on the site, which is what the DO-NOT-UPGRADE note in
 * project01/index.html is protecting.
 *
 * The fixture is the other half: `fixtures/` reaches dev through the middleware
 * above, and a build copies nothing, so without this the published picker would
 * offer HARU改 and 404 on it. It is 1.5 MB and it is the only model in the list
 * whose answer is known in advance -- the bench's control. It ships.
 */
function publishBesideProject01(): Plugin {
  const here = (name: string) => fileURLToPath(new URL(name, import.meta.url))
  return {
    name: 'publish-beside-project01',
    apply: 'build',
    /* Both patterns allow any prefix, so they match whether Vite has already
       rewritten the URL with `base` or not, and neither depends on this hook
       running before or after that. */
    transformIndexHtml(html: string) {
      return html
        .replace(
          /src="[^"]*live2d\/live2dcubismcore\.min\.js"/,
          `src="${SITE}project01/live2d/live2dcubismcore.min.js"`,
        )
        .replace(/href="[^"]*favicon\.svg"/, `href="${SITE}project01/favicon.svg"`)
    },
    async closeBundle() {
      await cp(here('fixtures'), here('dist/fixtures'), { recursive: true })
    },
  }
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `${SITE}l2d-viewer/` : '/',
  plugins: [fixtures(), publishBesideProject01()],
  publicDir: command === 'build' ? false : '../../project01/public',
  server: {
    port: 5174,
    // The public directory is outside the project root, so Vite has to be told
    // that reading from up there is deliberate.
    fs: { allow: ['..', '../../project01'] },
  },
}))
