import { copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * GitHub Pages is a static host with no rewrite rule, so it answers any path
 * it has no file for with 404.html. Shipping a copy of index.html under that
 * name is what makes deep links work: /character served the app, the router
 * reads the URL and renders the right screen.
 *
 * Without it every route but / is a 404 on refresh or on a shared link --
 * which stays invisible during development, because navigating inside the app
 * never asks the server for those paths.
 *
 * Since the app moved under /project01/ this copy is no longer the only
 * fallback in the site: whether Pages consults a 404.html in a subdirectory or
 * only the one at the site root is not something we can rely on, so site/404.html
 * catches the other case and redirects back here. Both have to exist.
 */
function spaFallback() {
  return {
    name: 'spa-404-fallback',
    apply: 'build' as const,
    async closeBundle() {
      const dist = resolve(import.meta.dirname, 'dist')
      await copyFile(resolve(dist, 'index.html'), resolve(dist, '404.html'))
    },
  }
}

// https://vite.dev/config/
// GitHub Pages serves this repo from /l2d-demo/, where the root is now the
// repository's landing page (site/) and this app is one level down. Production
// assets need that whole prefix; site/404.html hardcodes the same string and
// has to change with it. Dev stays at / so localhost URLs are unchanged.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/l2d-demo/project01/' : '/',
  plugins: [react(), spaFallback()],
}))
