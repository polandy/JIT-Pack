import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

/**
 * Builds the FR-18.7 import command into one Node-runnable file.
 *
 * It is an SSR build on purpose: the command imports the app's own stores,
 * mutation builders and import rules, and the point of ADR-025 is that it
 * runs *that* code rather than a second copy of it. Nothing here is bundled
 * for a browser, so the web build (`vite.config.ts`) is left alone.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    ssr: 'cli/main.ts',
    outDir: 'dist-cli',
    emptyOutDir: true,
    target: 'node24',
    rollupOptions: {
      output: {
        entryFileNames: 'jitpack-import.mjs',
        banner: '#!/usr/bin/env node',
      },
    },
  },
})
