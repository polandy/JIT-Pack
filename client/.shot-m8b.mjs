/* Minimal re-shoot: the three frames the first pass caught mid-transition.
 * One context, seconds — per the owner's rule, everything larger runs on CI. */
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:4173'
const OUT = process.env.OUT || '/shots'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
await page.addInitScript(() => {
  localStorage.setItem('jitpack_mode', 'local')
  localStorage.setItem('jitpack_theme', 'mocha')
})
page.on('pageerror', (e) => console.error('PAGEERROR', e.message))

const vis = () => page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')

/** Ionic's settled signal: exactly one visible page in the outlet. */
async function settled() {
  await page.waitForFunction(() => {
    const outlet = document.querySelector('ion-router-outlet')
    if (!outlet) return false
    const pages = outlet.querySelectorAll(':scope > .ion-page:not(.ion-page-hidden)')
    return pages.length === 1
  })
}

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('shot', name)
}

async function createTemplate(kind, name) {
  await vis().getByTestId('m7-fab').click()
  await page.getByTestId(`m7-kind-${kind}`).click()
  await page.getByTestId('m7-name-field').locator('input').fill(name)
  await page.getByTestId('m7-create-commit').click()
  await page.getByTestId('m7-kind-chooser').waitFor({ state: 'hidden' })
  await vis().getByTestId('m8-scope-switch').waitFor()
  await settled()
}

async function addPosition(name) {
  const input = vis().getByTestId('quick-add-input')
  if (!(await input.isVisible().catch(() => false))) await vis().getByTestId('m8-fab').click()
  await input.locator('input').fill(name)
  await input.locator('input').press('Enter')
  await vis().locator('ion-item h2', { hasText: name }).first().waitFor()
}

async function clearToasts() {
  await page.evaluate(async () => {
    for (const el of document.querySelectorAll('ion-toast')) {
      try {
        await el.dismiss()
      } catch {
        /* already gone */
      }
    }
  })
  await page.locator('ion-toast').first().waitFor({ state: 'detached' }).catch(() => {})
}

async function backToList() {
  await page.getByTestId('header-back').click()
  await vis().getByTestId('m7-fab').waitFor()
  await settled()
}

await page.goto(`${BASE}/tabs/templates`)
await vis().getByTestId('m7-fab').waitFor()

await createTemplate('group', 'Makro Fotografie')
await addPosition('Kamera')
await addPosition('Ringlicht')
await clearToasts()
await backToList()

await createTemplate('group', 'Wildlife Fotografie')
await addPosition('Kamera')
await addPosition('Teleobjektiv')
await clearToasts()
await backToList()

await createTemplate('template', 'Fototage Engadin')
await vis().getByTestId('m8-include-open').click()
await vis().locator('[data-testid^="m8-pick-"]', { hasText: 'Makro Fotografie' }).click()
await vis().getByTestId('m8-include-open').click()
await vis().locator('[data-testid^="m8-pick-"]', { hasText: 'Wildlife Fotografie' }).click()
await addPosition('Reiseapotheke')
await clearToasts()

// Guarded demotion — the toast now anchors above the FAB.
await vis().getByTestId('m8-scope-group').click()
await page.locator('ion-toast').waitFor()
await shot('07-scope-guard-toast')
await clearToasts()

// A planning trip generated from the Vorlage → blast-radius note.
await page.goto(`${BASE}/trips/new`)
await page.getByTestId('wizard-name').locator('input').fill('Engadin 2027')
await page.getByTestId('wizard-next').click()
await page.getByTestId('wizard-step-2').waitFor()
await page.getByTestId('wizard-next').click()
await page.getByTestId('wizard-step-3').waitFor()
await page.locator('ion-item', { hasText: 'Fototage Engadin' }).locator('ion-checkbox').click()
await page.getByTestId('wizard-next').click()
await page.getByTestId('wizard-step-4').waitFor()
await page.getByTestId('wizard-create').click()
await page.getByTestId('header-title').waitFor()

await page.goto(`${BASE}/tabs/templates`)
await vis().getByTestId('m7-fab').waitFor()
await settled()
await vis().locator('ion-item', { hasText: 'Fototage Engadin' }).first().click()
await vis().getByTestId('m8-blast-note').waitFor()
await settled()
await shot('08-blast-radius')

// The group: reached through the include, and it names its consumer.
await backToList()
await vis().getByTestId('m7-scope-group').click()
await vis().locator('ion-item', { hasText: 'Makro Fotografie' }).first().click()
await vis().getByTestId('m8-blast-note').waitFor()
await vis().getByTestId('m8-included-in').waitFor()
await settled()
await shot('09-group-blast-and-included-in')

await browser.close()
console.log('done')
