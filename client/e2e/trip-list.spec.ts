import { test, expect, seed, createTripViaWizard } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * M2 — the trip list's row content (UI-Test-Spec §4, unit "M2 trip list").
 *
 * The suite runs in English, so the expected shapes are the `en` ones; the
 * German shapes are unit-owned in `lib/__tests__/format.spec.ts` — one
 * formatter serves every surface (UX-5).
 */

/** The visible page, per the working agreement: assert what is rendered. */
function visible(page: Page) {
  return page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')
}

test.describe('M2 trip list @local @m2', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, { mode: 'local' })
  })

  // E2E-M2-12 (FR-2.1, UX-5): the temporal line is a locale-formatted
  // range, not interpolated ISO strings. Intl collapses the shared year,
  // so the assertion also fails if the formatter is bypassed for a hand
  // written `start – end`.
  test('E2E-M2-12: a dated trip renders its dates in the locale, not as ISO', async ({ page }) => {
    await createTripViaWizard(page, {
      name: 'Elba',
      startDate: '2026-08-22',
      endDate: '2026-09-05',
    })

    await page.goto('/tabs/trips')
    // A fresh trip is *planning*, so the default Active filter hides it.
    await visible(page).getByTestId('trips-filter-planned').click()
    const when = visible(page).getByTestId('trip-row-Elba').getByTestId('trip-when')
    // Whitespace-tolerant: Intl is free to use thin spaces around the dash.
    await expect(when).toHaveText(/^Aug 22\s*–\s*Sep 5, 2026$/)
  })
})
