import { test, expect, createTripViaWizard } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * M14 — Post-Trip Review Assistant (UI-Test-Spec §4, unit "M14 review").
 *
 * What this unit can and cannot reach, honestly: every *positive* M14
 * case needs a trip that carries FR-9.1 flags, and a flag needs an
 * *active* trip (the quick-add stamps Missing only then) — but no UI
 * path moves a trip from planning to active (the same gap that blocks
 * E2E-M12-03's positive half; see dev-docs/e2e-tests.md). So this unit
 * pins the reachable surface: the screen renders as a *list* with an
 * open count and the honest empty state, and back leads out (G-9).
 * The list semantics — marked rows, groups-only picker, pair-scoped
 * dismissal — are pinned in views/trips/__tests__/ReviewPage.spec.ts.
 */

const TRIP = { name: 'Herbst Tessin', travelers: ['Andy'] }

/** The visible page, per the working agreement: assert what is rendered. */
function visible(page: Page) {
  return page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')
}

test.describe('M14 review assistant @local @m14', () => {
  test('E2E-M14-06: no flags → the honest empty state, framed as a list', async ({
    page,
    seedMode,
  }) => {
    await seedMode({ mode: 'local' })
    const tripPath = await createTripViaWizard(page, TRIP)

    await page.goto(`${tripPath}/review`)

    // A list with a count, not a card stack (FR-27.11): the header says
    // how much is open even when that is nothing.
    await expect(visible(page).getByTestId('m14-open-count')).toContainText('0')
    await expect(visible(page).getByTestId('m14-empty')).toBeVisible()
    await expect(visible(page).getByTestId('m14-row')).toHaveCount(0)
  })

  test('E2E-G9 coverage: back from the review renders the packing list', async ({
    page,
    seedMode,
  }) => {
    await seedMode({ mode: 'local' })
    const tripPath = await createTripViaWizard(page, TRIP)

    await page.goto(`${tripPath}/review`)
    await expect(visible(page).getByTestId('m14-empty')).toBeVisible()

    await page.getByTestId('header-back').click()

    // Rendered, not just routed (the rule every navigation case follows).
    await expect(visible(page).getByTestId('m4-fab')).toBeVisible()
  })
})
