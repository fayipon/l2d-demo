import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
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
 * The static directory is project01's, not one of this tool's own.
 *
 * That gets the bench the pinned `live2dcubismcore.min.js` and all four
 * existing models for free, and -- the actual reason -- makes it impossible for
 * them to drift. A copy of the Core file in this directory would be exactly the
 * second copy that the DO-NOT-UPGRADE note in project01/index.html exists to
 * prevent: two files, one of them upgraded, and a bench that no longer tests
 * what the game runs.
 *
 * Its own port, so this and the game can be open at once -- which is the normal
 * way to use it, with the model on one screen and the lobby on the other.
 */
export default defineConfig({
  plugins: [fixtures()],
  publicDir: '../../project01/public',
  server: {
    port: 5174,
    // The public directory is outside the project root, so Vite has to be told
    // that reading from up there is deliberate.
    fs: { allow: ['..', '../../project01'] },
  },
})
