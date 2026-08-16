import { chromium } from '@playwright/test'
const BASE = 'http://localhost:4173'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
await page.addInitScript(() => localStorage.setItem('jitpack_mode', 'local'))
const vis = () => page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')

async function createTemplate(kind, name) {
  await page.getByTestId('m7-fab').click()
  await page.getByTestId(`m7-kind-${kind}`).click()
  await page.getByTestId('m7-name-field').locator('input').fill(name)
  await page.getByTestId('m7-create-commit').click()
  await vis().getByTestId('m8-scope-switch').waitFor()
}
async function addPosition(name) {
  const i = vis().getByTestId('quick-add-input')
  if (!(await i.isVisible().catch(() => false))) await vis().getByTestId('m8-fab').click()
  await i.locator('input').fill(name)
  await i.locator('input').press('Enter')
  await vis().locator('ion-item h2').filter({ hasText: name }).first().waitFor()
}
async function back() { await page.getByTestId('header-back').click(); await vis().getByTestId('m7-fab').waitFor() }
async function include(name) {
  await vis().getByTestId('m8-include-open').click()
  await vis().getByTestId('m8-group-picker').locator('.pick').filter({ hasText: name }).click()
}

await page.goto(`${BASE}/tabs/templates`)
await createTemplate('group', 'Makro Fotografie')
for (const n of ['Kamera', 'Makro-Objektiv', 'Ringlicht', 'Zwischenringe']) await addPosition(n)
await back()
await createTemplate('group', 'Wildlife Fotografie')
for (const n of ['Kamera', 'Teleobjektiv', 'Stativ']) await addPosition(n)
await back()
await createTemplate('template', 'Sommerferien')
await include('Makro Fotografie')
await include('Wildlife Fotografie')
await page.waitForTimeout(250)
await page.screenshot({ path: '/shots/m8-included-rows.png' })
await vis().locator('ion-item').filter({ hasText: 'Makro Fotografie' }).first().locator('button').first().click()
await page.waitForTimeout(400)
await page.screenshot({ path: '/shots/m8-peek-sheet.png' })
await page.keyboard.press('Escape')

await page.goto(`${BASE}/trips/new`)
await page.getByTestId('wizard-name').locator('input').fill('Fototour 2026')
await page.getByTestId('wizard-next').click()
await page.getByTestId('wizard-next').click()
await vis().getByTestId('wizard-step-3').waitFor()
await page.waitForTimeout(250)
await page.screenshot({ path: '/shots/m3-rows.png' })
await vis().getByTestId('wizard-section-groups').locator('ion-item').filter({ hasText: 'Makro' }).first().locator('button').click()
await page.waitForTimeout(400)
await page.screenshot({ path: '/shots/m3-peek-sheet.png' })
await b.close()
