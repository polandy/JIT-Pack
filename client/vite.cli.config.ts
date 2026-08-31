import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

/**
 * Builds the `jitpack` command line into one Node-runnable file.
 *
 * It is an SSR build on purpose: the commands import the app's own stores,
 * mutation builders and domain rules, and the point of ADR-025 is that they
 * run *that* code rather than a second copy of it. Nothing here is bundled
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
        entryFileNames: 'jitpack.mjs',
        banner: '#!/usr/bin/env node',
      },
    },
  },
})
