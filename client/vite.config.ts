import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin, type ResolvedConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

/**
 * Injects the app-shell precache manifest into the built service worker
 * (NFR-4.13, ADR-019): every file the build emitted, plus a content hash
 * naming the version, prepended to dist/sw.js as the globals the worker
 * reads. Hand-rolled rather than vite-plugin-pwa — the tradeoff is ADR-019.
 */
function swPrecache(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'jitpack-sw-precache',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    // closeBundle runs after the bundle *and* the public/ copy are on disk,
    // which is what makes sw.js and the icons visible here.
    closeBundle() {
      const outDir = join(config.root, config.build.outDir)
      const files: string[] = []
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name)
          if (entry.isDirectory()) walk(path)
          else files.push(path)
        }
      }
      walk(outDir)

      const swPath = join(outDir, 'sw.js')
      const urls = files
        .filter((file) => file !== swPath)
        .map((file) => '/' + relative(outDir, file).split('\\').join('/'))
        .sort()

      // Hash the contents, not the names: public/ files (favicon, manifest)
      // change without renaming, and the version must change with them.
      const hash = createHash('sha256')
      for (const url of urls) {
        hash.update(url)
        hash.update(readFileSync(join(outDir, url)))
      }
      const version = hash.digest('hex').slice(0, 12)

      const prologue =
        `self.__JITPACK_PRECACHE = ${JSON.stringify(urls)};\n` +
        `self.__JITPACK_VERSION = ${JSON.stringify(version)};\n`
      writeFileSync(swPath, prologue + readFileSync(swPath, 'utf8'))
      config.logger.info(`jitpack-sw-precache: ${urls.length} files, version ${version}`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools(), swPrecache()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
