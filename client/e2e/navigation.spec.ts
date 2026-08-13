import { test, expect } from './fixtures'
import { createTripViaWizard } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * G-9 / ADR-011 — the one header bar and the back-target contract.
 *
 * These exist because the previous arrangement shipped a correct
 * IonBackButton on seventeen screens that no user could reach: a second
 * header sat underneath the global one, so the control was occluded.
 * `toBeVisible()` passed throughout — Playwright does not test
 * occlusion — which is why every case here **clicks** and asserts where
 * it landed rather than asserting the control looks present.
 */

/**
 * Ionic throws this while animating from a root-outlet page back to a
 * route inside the tabs outlet. It is **not ours**: the same message
 * appears on the build before ADR-011, reproduced with the browser back
 * button, so it predates the single header bar. Filtered rather than
 * asserted, so these tests still catch any *new* runtime error instead
 * of being disabled by a known one. See the implementation log.
 */
// Matched on the *whole* dereference, not just the property name: the
// two engines word it differently, and a bare /classList/ would also
// swallow a genuine error of ours that merely mentions the property.
const KNOWN_IONIC_TRANSITION_ERRORS = [
  /Cannot read properties of undefined \(reading '(classList|ionPageElement)'\)/,
  /undefined is not an object \(evaluating '[^']*\.(classList|ionPageElement)'\)/,
]

/**
 * Collect uncaught page errors, minus the known Ionic noise above.
 * Navigation can "work" — the URL changes and the page renders — while
 * something throws mid-transition, which a URL assertion cannot see.
 */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => {
    if (!KNOWN_IONIC_TRANSITION_ERRORS.some((known) => known.test(e.message))) {
      errors.push(e.message)
    }
  })
  return errors
}

// E2E-G9-03: a drill-down shows exactly one bar, with back and a title.
test('G9: a drill-down carries one header bar with back and title @local @g9', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto('/trips/new')

  await expect(page.locator('ion-header')).toHaveCount(1)
  await expect(page.getByTestId('header-title')).toHaveText('New trip · step 1/4')
  await expect(page.getByTestId('header-logo')).toHaveCount(0)
})

// E2E-G9-04: a tab root shows the logo and offers no back.
test('G9: a tab root shows the logo instead of back @local @g9', async ({ page, seedMode }) => {
  await seedMode({ mode: 'local' })
  await page.goto('/tabs/trips')

  await expect(page.locator('ion-header')).toHaveCount(1)
  await expect(page.getByTestId('header-logo')).toBeVisible()
  await expect(page.getByTestId('header-back')).toHaveCount(0)
})

// E2E-G9-05: the control is reachable, not merely rendered — this is the
// assertion the occluded build failed.
test('G9: back is clickable and lands on the declared parent @local @g9', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  const errors = collectPageErrors(page)
  await page.goto('/trips/new')

  await page.getByTestId('header-back').click()

  await expect(page).toHaveURL(/\/tabs\/trips$/)
  expect(errors).toEqual([])
})

// E2E-G9-06 (Navigation_Concept §7): the cold-start deep link. Landing
// on a nested screen with a one-entry history must still lead to the
// parent trip — the reason the target comes from the route and not from
// history.
test('G9: back from a deep-linked child reaches its parent trip @local @g9', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  const errors = collectPageErrors(page)
  const tripPath = await createTripViaWizard(page, {
    name: 'Samedan 2026',
    endDate: '2026-09-21',
    travelers: ['Andy'],
  })

  // A fresh context: no history behind this navigation at all.
  await page.goto(`${tripPath}/containers`)
  await expect(page.getByTestId('header-title')).toHaveText(/Luggage/)

  await page.getByTestId('header-back').click()

  await expect(page).toHaveURL(new RegExp(`${tripPath}$`))
  // The transition itself must be clean, not merely the destination.
  expect(errors).toEqual([])
})

// E2E-G9-07 (G-2/G-1): the right-hand group survives the drill-down —
// the reason a bar per screen was rejected. Inside a trip the sync glyph
// is the only route to the conflict log.
test('G9: sync and settings stay present on a drill-down @local @g9', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto('/trips/new')

  await expect(page.locator('ion-header').getByLabel('Settings')).toBeVisible()
  await expect(page.locator('ion-header .sync-indicator')).toBeVisible()
})

// E2E-G9-08: the everyday round trip — list → detail → back. Nothing
// else in this file exercises entering through the list, which is how
// most navigation actually happens and the only path that reaches
// Ionic's cross-outlet transition.
test('G9: list → trip → back returns to the trip list @local @g9', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  const errors = collectPageErrors(page)
  await createTripViaWizard(page, {
    name: 'Samedan 2026',
    endDate: '2026-09-21',
    travelers: ['Andy'],
  })

  await page.goto('/tabs/trips')
  await page.locator('ion-segment-button').filter({ hasText: /planned/i }).click()
  const row = page.locator('ion-item, ion-card').filter({ hasText: 'Samedan 2026' }).first()
  await row.click()
  await expect(page).toHaveURL(/\/trips\/[^/]+$/)

  await page.getByTestId('header-back').click()

  await expect(page).toHaveURL(/\/tabs\/trips$/)
  expect(errors).toEqual([])
})
