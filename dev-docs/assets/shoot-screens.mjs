/**
 * Regenerates the screenshots embedded in UI_Concept_Overview.html.
 *
 * Screenshots of a prototype go stale the moment the prototype changes, and a
 * stale screenshot is worse than none — it documents a design that no longer
 * exists. So they are generated, never hand-made: re-run this after any change
 * to UI_Concept_Prototype.html and commit the result alongside it.
 *
 *   cd client && node ../dev-docs/assets/shoot-screens.mjs
 *
 * Requires the Playwright Chromium that the client dev-dependency installs
 * (`npx playwright install chromium`). Writes dev-docs/assets/screens/*.png.
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import pw from '../../client/node_modules/@playwright/test/index.js'

const { chromium } = pw
const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, 'screens')
const proto = 'file://' + resolve(here, '..', 'UI_Concept_Prototype.html')

/** Each shot: a file name, the screen to land on, and an optional setup step. */
const SHOTS = [
  { id: 'm1-dashboard', go: 'dashboard' },
  { id: 'm2-trips', go: 'trips' },
  { id: 'm3-wizard', go: 'wizard' },
  { id: 'm4-packliste', go: 'pack' },
  {
    id: 'm4-filter',
    go: 'pack',
    setup: () => {
      openFilters(CTX_PACK)
      document.querySelector('[data-fgtoggle="trav"]')?.click()
    },
  },
  {
    id: 'm4-gefaltet',
    go: 'pack',
    setup: () => document.getElementById('pkFoldBtn').click(),
  },
  {
    id: 'm5-sheet',
    go: 'pack',
    setup: () => openItem(P.items.find((i) => i.name === 'Badehose').id),
  },
  { id: 'm6-einkauf', go: 'shop' },
  {
    id: 'm6-hinzufuegen',
    go: 'shop',
    setup: () => {
      fabAction()
      document.getElementById('shQaInput').value = 'Sonnencreme'
      document.getElementById('shQaDesc').value = '50+, ohne Duft'
    },
  },
  { id: 'm7-vorlagen', go: 'templates' },
  { id: 'm8-vorlagen-editor', go: 'templateedit' },
  { id: 'm9-inventar', go: 'items' },
  { id: 'm10-artikel-editor', go: 'itemedit' },
  { id: 'm11-gepaeck', go: 'containers' },
  { id: 'm12-auswertung', go: 'analytics' },
]

mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
// Scale 1 on purpose: these are orientation thumbnails, and every regeneration
// rewrites all of them. At 2× the set was 2.8 MB of churn per prototype change.
const page = await browser.newPage({ viewport: { width: 520, height: 1000 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

for (const shot of SHOTS) {
  await page.goto(proto)
  await page.evaluate((v) => go(v), shot.go)
  await page.waitForTimeout(250)
  if (shot.setup) {
    await page.evaluate(shot.setup)
    await page.waitForTimeout(450) // sheets animate in
  }
  await page.locator('.device').screenshot({ path: resolve(outDir, `${shot.id}.png`) })
  console.log('✓', shot.id)
}

console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors')
await browser.close()
