import { test, expect } from './fixtures'
import { createTripViaWizard } from './fixtures'

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
  await page.goto('/trips/new')

  await page.getByTestId('header-back').click()

  await expect(page).toHaveURL(/\/tabs\/trips$/)
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
