import { defineConfig } from 'vite'

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
  publicDir: '../../project01/public',
  server: {
    port: 5174,
    // The public directory is outside the project root, so Vite has to be told
    // that reading from up there is deliberate.
    fs: { allow: ['..', '../../project01'] },
  },
})
