import { test, expect, createTripViaWizard, visiblePage as visible } from './fixtures'

/**
 * M6 — shopping views (UI-Test-Spec §6).
 *
 * The first M6 case landed with FR-25.13d, which closed the composer gap M6
 * had carried since FR-25.13c: the shared component excluded nothing here
 * because the screen passed nothing. What this file pins is therefore M6's
 * *wiring*, not the composer's own rules — those are covered on M8 and in
 * the component's unit tests, and a dropped prop keeps all of them green.
 *
 * Local Mode throughout, like the M4 suite: everything here is client-side.
 */

const TRIP = { name: 'Samedan Einkauf', endDate: '2026-12-31', travelers: ['Andy'] }

test.describe('M6 shopping — the shared composer knows the trip @local @m6', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M6-21 (FR-25.13c/25.13d): what the trip already carries is offered
  // on no shopping tab either — not in the autocomplete, and in the
  // browse-sheet only as the "already in" state.
  test('E2E-M6-21: what the trip carries is not offered again on M6 (FR-25.13d)', async ({
    page,
  }) => {
    await page.goto('/tabs/items')
    await page.getByTestId('m9-fab').click()
    await page.getByTestId('m10-name').locator('input').fill('Sonnencreme')
    await page.getByTestId('m10-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Sonnencreme')

    // The trip carries the item through M4, with its master-item provenance.
    await createTripViaWizard(page, TRIP)
    await visible(page).getByTestId('m4-fab').click()
    const m4Input = visible(page).getByTestId('quick-add-input').locator('input')
    await m4Input.fill('Sonnen')
    await visible(page).getByTestId('quick-add-suggestion').filter({ hasText: 'Sonnencreme' }).click()
    await expect(page.getByTestId('m4-row-Sonnencreme')).toBeVisible()

    await visible(page).getByTestId('m4-nav-shopping').click()
    await expect(visible(page).getByTestId('quick-add-open')).toBeVisible()
    await visible(page).getByTestId('quick-add-open').click()

    // The autocomplete declines: the positive signal for the absent
    // suggestion is the free-text hint, rendered exactly when nothing is
    // offered (the E2E-M4-46 idiom).
    const input = visible(page).getByTestId('quick-add-input').locator('input')
    await input.fill('Sonnen')
    await expect(visible(page).locator('.no-match')).toContainText('Add “Sonnen” as a new item')
    await expect(visible(page).getByTestId('quick-add-suggestion')).toHaveCount(0)

    // And the browse-sheet states it rather than offering it.
    await input.fill('')
    await visible(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    await expect(
      sheet.getByTestId('browse-row-carried').filter({ hasText: 'Sonnencreme' }),
    ).toContainText('already in')
  })
})
