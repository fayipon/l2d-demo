import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// GitHub Pages serves this repo from /l2d-demo/, so production assets need that
// prefix. Dev stays at / so localhost URLs are unchanged.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/l2d-demo/' : '/',
  plugins: [react()],
}))
