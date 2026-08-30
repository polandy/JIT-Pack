import { expect, test, visiblePage } from '../fixtures'
import { bootPage, uniq } from '../serverMode'

import type { Page } from '@playwright/test'

/**
 * E2E-M9-09 (FR-21.9) — an amount carries the currency the instance named.
 *
 * `single` rather than `local`, for the reason the feature has: the code
 * comes from the server, and Local Mode has none, so its amounts stay
 * unit-less by design. The backend for this project is started with
 * `JITPACK_CURRENCY=CHF` (playwright.config.ts).
 *
 * The assertion is made on the **rendered row**, not on a formatter: the
 * chain this case exists for is four links long — the operator's variable,
 * the endpoint, the client's fetch at boot, and `formatValue` — and a unit
 * test covers only the last of them.
 */
async function fillIonic(page: Page, testId: string, value: string) {
  const input = visiblePage(page).getByTestId(testId).locator('input')
  await input.click()
  await input.fill(value)
  await expect(input).toHaveValue(value)
}

test.describe('the instance currency, backend-backed @single @m9', () => {
  test('E2E-M9-09: an item price is shown with the currency the instance named', async ({
    browser,
  }) => {
    const name = `Regenjacke-${uniq()}`
    const page = await bootPage(await browser.newContext())

    // A master item with a price, through M10's own form (FR-24.5).
    await page.goto('/tabs/items')
    await visiblePage(page).getByTestId('m9-fab').click()
    await expect(visiblePage(page).getByTestId('m10-new-hint')).toBeVisible()
    await fillIonic(page, 'm10-name', name)
    await visiblePage(page).getByTestId('m10-more').click()
    await fillIonic(page, 'm10-price', '129.50')
    await visiblePage(page).getByTestId('m10-create').click()
    await expect(page.getByTestId('header-title')).toHaveText(name)

    // M9 keeps the price column off by default (the lean list), so the
    // case turns it on rather than assuming a layout it did not set.
    await page.goto('/tabs/items')
    // Unscoped: a header action lives in the one app bar (ADR-011), which
    // is outside the router outlet `visiblePage` narrows to.
    await page.getByTestId('m9-properties').click()
    await expect(page.getByTestId('m9-properties-sheet')).toBeVisible()
    await page.getByTestId('m9-property-price').click()
    // The backdrop, not Escape: an Ionic sheet modal ignores the key, and a
    // case that pressed it would assert against a sheet still on screen.
    await page.locator('ion-modal[data-testid="m9-properties-sheet"] ion-backdrop').click()
    // Hidden, not gone: the test id sits on the `ion-modal` host, which
    // Ionic keeps mounted and only empties — a count of 0 never arrives.
    await expect(page.getByTestId('m9-properties-sheet')).toBeHidden()

    // The rows share one test id, so the name is what picks this one out.
    const row = visiblePage(page).getByTestId('m9-row').filter({ hasText: name })
    await expect(row).toContainText('CHF')
    // The number itself, unchanged: naming a currency labels an amount and
    // never converts it — 129.50 stays 129.50 whatever the code says.
    await expect(row).toContainText('129.50')
  })
})
