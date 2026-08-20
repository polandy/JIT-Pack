/**
 * Renders the PWA icon set from the one brand source, client/public/favicon.svg
 * (the "Packed Backpack" mark). Run when the mark changes, not on every build —
 * the PNGs are committed, because an install-time icon must exist as a static
 * file the manifest can point at.
 *
 * Run inside the pinned Playwright image (local Chromium does not run on the
 * NixOS dev host):
 *
 *   scripts/e2e.sh --help >/dev/null  # not this; use:
 *   docker run --rm -v "$PWD:/w" -w /w/client \
 *     "$(. scripts/playwright-image.sh; echo "$PLAYWRIGHT_IMAGE")" \
 *     node /w/scripts/generate-pwa-icons.mjs
 *
 * Three shapes, one source:
 *  - icon-192 / icon-512: the mark verbatim (rounded tile, transparent
 *    corners) — manifest purpose "any".
 *  - icon-maskable-512: full-bleed tile with the mark scaled into the 80 %
 *    safe zone — manifest purpose "maskable", so launchers that cut their own
 *    shape never clip the backpack.
 *  - apple-touch-icon (180): full-bleed — iOS applies its own corner radius
 *    and paints transparency black, so the tile must reach the edges.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// This script lives beside the shell scripts, not under client/ — resolve
// Playwright from the client package, the only place it is installed.
const { chromium } = createRequire(join(repoRoot, 'client', 'package.json'))('@playwright/test')
const publicDir = join(repoRoot, 'client', 'public')
const iconsDir = join(publicDir, 'icons')
mkdirSync(iconsDir, { recursive: true })

const markSvg = readFileSync(join(publicDir, 'favicon.svg'), 'utf8')

/** The favicon's tile colour (Catppuccin Mocha base), read from the source. */
const tile = markSvg.match(/rect width="512" height="512"[^/]*fill="(#[0-9a-f]{6})"/)?.[1]
if (!tile) throw new Error('favicon.svg no longer carries the expected 512px tile rect')

/** The mark's inner shapes without its own rounded tile. */
const inner = markSvg
  .replace(/^[\s\S]*?<rect width="512" height="512"[^/]*\/>/, '')
  .replace(/<\/svg>\s*$/, '')

/** Full-bleed variant: square tile to the edges, mark scaled to the safe zone. */
const fullBleedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${tile}"/>
  <g transform="translate(51.2 51.2) scale(0.8)">${inner}</g>
</svg>`

const outputs = [
  { file: 'icon-192.png', svg: markSvg, size: 192, transparent: true },
  { file: 'icon-512.png', svg: markSvg, size: 512, transparent: true },
  { file: 'icon-maskable-512.png', svg: fullBleedSvg, size: 512, transparent: false },
  { file: 'apple-touch-icon.png', svg: fullBleedSvg, size: 180, transparent: false },
]

const browser = await chromium.launch()
try {
  for (const { file, svg, size, transparent } of outputs) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    })
    await page.setContent(
      `<style>*{margin:0}body{background:transparent}img{display:block;width:${size}px;height:${size}px}</style>` +
        `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`,
    )
    // The <img> paints synchronously once loaded; waiting for the load event
    // is the deterministic seam, not a timeout.
    await page.waitForFunction(() => document.querySelector('img')?.complete)
    const png = await page.screenshot({ omitBackground: transparent })
    writeFileSync(join(iconsDir, file), png)
    console.log(`wrote client/public/icons/${file} (${png.length} bytes)`)
    await page.close()
  }
} finally {
  await browser.close()
}
