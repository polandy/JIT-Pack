import { test, expect } from './fixtures'
import { createTripViaWizard } from './fixtures'
import type { Page } from '@playwright/test'
import { PATH } from './routes'

/**
 * G-9 / ADR-011 — the one header bar and the back-target contract.
 *
 * A correct IonBackButton can still be unreachable — a second header
 * underneath the global one occludes it, and `toBeVisible()` passes throughout
 * because Playwright does not test occlusion — which is why every case here
 * **clicks** and asserts where it landed rather than asserting the control
 * looks present.
 */

/**
 * Collect uncaught page errors. Navigation can "work" — the URL changes
 * and the page renders — while something throws mid-transition, which a
 * URL assertion cannot see.
 *
 * **Nothing is filtered.** Ionic's `classList`/`ionPageElement` error is
 * thrown animating from a root-outlet page back into a tabs outlet, and
 * ADR-012 has only the one outlet, so an exemption would only hide the next
 * error.
 */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

// E2E-G9-03: a drill-down shows exactly one bar, with back and a title.
test('E2E-G9-03: a drill-down carries one header bar with back and title @local @g9', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto(PATH.newTrip)

  await expect(page.locator('ion-header')).toHaveCount(1)
  await expect(page.getByTestId('header-title')).toHaveText('New trip')
  // The step is the head's second line (ADR-050), not part of its name.
  await expect(page.getByTestId('header-meta')).toHaveText('Step 1 of 4')
  await expect(page.getByTestId('header-logo')).toHaveCount(0)
})

// E2E-G9-04: a tab root shows the logo and offers no back.
test('E2E-G9-04: a tab root shows the logo instead of back @local @g9', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto(PATH.trips)

  await expect(page.locator('ion-header')).toHaveCount(1)
  await expect(page.getByTestId('header-logo')).toBeVisible()
  await expect(page.getByTestId('header-back')).toHaveCount(0)
})

// E2E-G9-05: the control is reachable, not merely rendered — this is the
// assertion the occluded build failed.
test('E2E-G9-05: back is clickable and lands on the declared parent @local @g9', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  const errors = collectPageErrors(page)
  await page.goto(PATH.newTrip)

  await page.getByTestId('header-back').click()

  await expect(page).toHaveURL(/\/tabs\/trips$/)
  expect(errors).toEqual([])
})

// E2E-G9-06 (Navigation_Concept §7): the cold-start deep link. Landing
// on a nested screen with a one-entry history must still lead to the
// parent trip — the reason the target comes from the route and not from
// history.
test('E2E-G9-06: back from a deep-linked child reaches its parent trip @local @g9', async ({
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
  await expect(page.getByTestId('header-title')).toHaveText('Luggage')

  await page.getByTestId('header-back').click()

  await expect(page).toHaveURL(new RegExp(`${tripPath}$`))
  // The transition itself must be clean, not merely the destination.
  expect(errors).toEqual([])
})

// E2E-G9-07 (G-2/G-1): the right-hand group survives the drill-down —
// the reason a bar per screen was rejected. Inside a trip the sync glyph
// is the only route to the conflict log.
test('E2E-G9-07: sync and settings stay present on a drill-down @local @g9', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto(PATH.newTrip)

  await expect(page.locator('ion-header').getByLabel('Settings')).toBeVisible()
  await expect(page.locator('ion-header .sync-indicator')).toBeVisible()
})

// E2E-G9-08: the everyday round trip — list → detail → back. Nothing
// else in this file exercises entering through the list, which is how
// most navigation actually happens and the only path that reaches
// Ionic's cross-outlet transition.
test('E2E-G9-08: list → trip → back returns to the trip list @local @g9', async ({
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

  await page.goto(PATH.trips)
  await page
    .locator('ion-segment-button')
    .filter({ hasText: /planned/i })
    .click()
  const row = page.locator('ion-item, ion-card').filter({ hasText: 'Samedan 2026' }).first()
  await row.click()
  await expect(page).toHaveURL(/\/trips\/[^/]+$/)

  await page.getByTestId('header-back').click()

  await expect(page).toHaveURL(/\/tabs\/trips$/)
  expect(errors).toEqual([])
})
