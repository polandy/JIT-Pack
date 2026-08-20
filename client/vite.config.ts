import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

import { E2E_API_PORT } from './e2e/backendPort'

// The backend the e2e `single` project boots (playwright.config.ts). The
// port is named once in e2e/backendPort.ts so the two files cannot drift.
const E2E_API_TARGET = `http://localhost:${E2E_API_PORT}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  /*
   * `vite preview` is the server the Playwright suite drives. The API sets
   * no CORS headers — same-origin is a hard requirement of every real
   * deployment (see src/config.ts and nginx.conf) — so the backend-backed
   * e2e project reaches its jitpackd *through* the preview origin, exactly
   * the way nginx routes a production instance: /api and /health proxied,
   * /ws upgraded. Harmless to the backend-free projects: Local Mode never
   * requests these paths, so the proxy target's absence is never observed.
   */
  preview: {
    proxy: {
      '/api': E2E_API_TARGET,
      '/health': E2E_API_TARGET,
      '/ws': { target: E2E_API_TARGET, ws: true },
    },
  },
})
