import { test, expect, createTripViaWizard } from './fixtures'
import type { Locator, Page } from '@playwright/test'

/**
 * Colour anchors (UI-Test-Spec §3, G-11; Addendum FR-21.7).
 *
 * The unit suite reads the stylesheet; these assert what a browser
 * actually painted, which is the only place a cascade mistake shows. The
 * regression they guard is the one this PR fixes: Ionic paints its own
 * primary on tabs, FABs and checkboxes unless told otherwise, so the app
 * drifts back to a default-blue look one component at a time.
 *
 * Roles are compared against the role token rather than against a hex, so
 * the cases hold in Latte as well as Mocha — a literal here would assert
 * the flavour, not the rule.
 */

/** G-9's breakpoint: below it the tab bar carries the anchors, above it the rail. */
const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 900 }

/** A computed property of an element, as the browser resolved it. */
function computed(el: Locator, prop: string) {
  return el.evaluate((node, p) => getComputedStyle(node).getPropertyValue(p).trim(), prop)
}

/**
 * What a role token resolves to right now, in the active flavour, in the
 * same notation a real property computes to.
 *
 * The conversion is not incidental: a custom property computes to the
 * token text it was given — the palette's `#fab387` — while `color`
 * computes to `rgb(250, 179, 135)`. Comparing the two raw is how the
 * first version of this case failed against a correct page.
 */
async function rolePainted(page: Page, token: string): Promise<string> {
  return page.evaluate((t) => {
    const probe = document.createElement('span')
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(t).trim()
    document.body.appendChild(probe)
    const resolved = getComputedStyle(probe).color
    probe.remove()
    return resolved
  }, token)
}

/** The token's own text, for comparing against another custom property. */
function roleToken(page: Page, token: string) {
  return page.evaluate(
    (t) => getComputedStyle(document.documentElement).getPropertyValue(t).trim(),
    token,
  )
}

// E2E-G11-02 (G-11/FR-21.7): the brand marks where you are — in both
// presentations of the anchors, which are one rule and must not drift.
test('G-11: the anchor you are on is the brand, in bar and rail alike @local @g11', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize(MOBILE)
  await page.goto('/')

  const brand = await rolePainted(page, '--jp-brand')
  expect(brand).not.toBe('')

  const activeTab = page.getByTestId('tab-dashboard')
  await expect(activeTab).toBeVisible()
  expect(await computed(activeTab, 'color')).toBe(brand)

  // The anchor you are *not* on must not be brand-coloured too — without
  // this the assertion above would pass on a bar painted entirely peach,
  // which states nothing about where you are.
  expect(await computed(page.getByTestId('tab-trips'), 'color')).not.toBe(brand)

  await page.setViewportSize(DESKTOP)
  const activeRail = page.getByTestId('rail-dashboard')
  await expect(activeRail).toBeVisible()
  expect(await computed(activeRail, 'color')).toBe(brand)
})

// E2E-G11-03 (G-11/FR-21.7): done is green and the FAB carries the brand
// gradient, rather than both being Ionic's flat primary.
test('G-11: the FAB is the brand and a packed box is done, never the action colour @local @g11', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize(MOBILE)
  await createTripViaWizard(page, { name: 'Farbtest', travelers: ['Andy'] })

  const action = await roleToken(page, '--jp-action')
  const done = await roleToken(page, '--jp-done')

  const fab = page.getByTestId('m4-fab')
  const fabBackground = await computed(fab, '--background')
  expect(fabBackground).toContain('linear-gradient')
  expect(fabBackground).not.toContain(action)

  await fab.click()
  await page.getByTestId('quick-add-input').locator('input').fill('Zelt')
  await page.getByTestId('quick-add-confirm').click()
  await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

  const box = page.getByTestId('m4-row-Zelt').getByTestId('row-check').locator('ion-checkbox')
  expect(await computed(box, '--checkbox-background-checked')).toBe(done)
})

// E2E-G11-04 (G-11/FR-21.7): the anchors are roles, so they survive the
// flavour switch. Mocha's peach and Latte's are different hues entirely
// (#fab387 vs #fe640b) — a rule written against a hex would pass here by
// accident or fail here for the wrong reason.
test('G-11: the roles hold in Latte, on different hues @local @g11', async ({ page, seedMode }) => {
  await seedMode({ mode: 'local', theme: 'latte' })
  await page.setViewportSize(MOBILE)
  await page.goto('/')

  // Prove the flavour actually switched before asserting anything about
  // it — the seed key is device-local and easy to get silently wrong.
  await expect(page.locator('html')).toHaveClass(/jitpack-latte/)

  const brand = await rolePainted(page, '--jp-brand')
  const activeTab = page.getByTestId('tab-dashboard')
  await expect(activeTab).toBeVisible()
  expect(await computed(activeTab, 'color')).toBe(brand)
  expect(await computed(page.getByTestId('tab-trips'), 'color')).not.toBe(brand)
})
