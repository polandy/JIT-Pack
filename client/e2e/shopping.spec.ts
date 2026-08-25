import type { Page } from '@playwright/test'

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
    await visible(page)
      .getByTestId('quick-add-suggestion')
      .filter({ hasText: 'Sonnencreme' })
      .click()
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

/**
 * FR-25.11j: checking a row off a shopping list must stay reversible.
 *
 * The reveal is the only way back for a BUY_BEFORE row — buying it changes
 * its mode, so it is gone from both tabs — which makes every "it disappeared"
 * assertion here worth a positive one beside it: the bar that counts what
 * disappeared, and the row it names once revealed.
 */
test.describe('M6 shopping — what was bought can be found and put back @local @m6', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * M6 alone. ADR-012 leaves M4 mounted and *visible* behind it, so the
   * visible-page locator resolves to two pages here and every shared testid
   * — the composer's above all — is ambiguous without this.
   */
  function m6(page: Page) {
    return visible(page).getByTestId('m6-page')
  }

  async function addOnShoppingTab(page: Page, name: string) {
    await m6(page).getByTestId('quick-add-open').click()
    await m6(page).getByTestId('quick-add-input').locator('input').fill(name)
    await m6(page).getByTestId('quick-add-confirm').click()
    await m6(page).getByTestId('quick-add-close').click()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: name })).toBeVisible()
  }

  // E2E-M6-17 (FR-25.11i/j): the BUY_BEFORE case, where checking off changes
  // the item's mode and would otherwise make the row unreachable from the
  // shopping side. The reveal is hidden by default, states its count, names
  // where the row went, and gives it back.
  test('E2E-M6-17: a purchase before departure is revealable and reversible (FR-25.11j)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await visible(page).getByTestId('m4-nav-shopping').click()
    await addOnShoppingTab(page, 'Kaffee')

    // Nothing bought yet: the bar is absent, and the open row is the signal
    // that the list itself is rendered.
    await expect(m6(page).getByTestId('m6-bought-bar')).toHaveCount(0)

    await m6(page)
      .getByTestId('m6-row')
      .filter({ hasText: 'Kaffee' })
      .locator('ion-checkbox')
      .click()

    // Gone from the open list — and counted by the bar, which is what makes
    // the disappearance an outcome rather than a loss.
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toHaveCount(0)
    const bar = m6(page).getByTestId('m6-bought-bar')
    await expect(bar).toHaveText('Show 1 bought')
    await expect(m6(page).getByTestId('m6-bought-list')).toHaveCount(0)

    await bar.click()
    const bought = m6(page).getByTestId('m6-bought-row')
    await expect(bought).toContainText('Kaffee')
    // FR-25.11j: the revealed row says where it went.
    await expect(bought.getByTestId('m6-bought-note')).toHaveText('on the packing list')
    await expect(bar).toHaveText('Hide 1 bought')

    // And the way back: it returns to the list it was bought from.
    await bought.locator('ion-checkbox').click()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toBeVisible()
    await expect(m6(page).getByTestId('m6-bought-bar')).toHaveCount(0)
  })

  // E2E-M6-22 (FR-3.3/25.11j): the destination tab's half. A BUY_LOCAL row
  // never changes mode — being bought there *is* its packed state — so the
  // record has to name that list too, or the two tabs share one reveal.
  test('E2E-M6-22: a purchase at the destination is revealed on its own tab (FR-25.11j)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await visible(page).getByTestId('m4-nav-shopping').click()
    await addOnShoppingTab(page, 'Brot vor Ort')

    // The button, not the label inside it — the segment button swallows a
    // click aimed at its own `ion-label` (packing-list.spec.ts pays for this).
    await m6(page).getByTestId('m6-tab-local').click()
    await addOnShoppingTab(page, 'Milch')
    await m6(page)
      .getByTestId('m6-row')
      .filter({ hasText: 'Milch' })
      .locator('ion-checkbox')
      .click()

    await m6(page).getByTestId('m6-bought-bar').click()
    await expect(m6(page).getByTestId('m6-bought-row')).toContainText('Milch')
    await expect(m6(page).getByTestId('m6-bought-note')).toHaveText('packed')

    // The other tab has its own reveal, and nothing in it.
    await m6(page).getByTestId('m6-tab-before').click()
    await expect(m6(page).getByTestId('m6-bought-bar')).toHaveCount(0)
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Brot vor Ort' })).toBeVisible()
  })
})
