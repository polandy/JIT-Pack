import type { Page } from '@playwright/test'

import { test, expect, createTripViaWizard, openTripView, visiblePage } from '../../fixtures'
import { addBuyRowOnM4 } from '../../helpers/m4'
import { bootPage, uniq } from '../../serverMode'

/**
 * FR-30.4 against a real `jitpackd` (`single` project): a purchase names who
 * made it. The buyer is stamped by the server, never by the client
 * (invariant 3), so only a backend-backed run can show the name arriving —
 * the `local` cases see the time alone, which is right there (G-8).
 *
 * Single-User Mode has exactly one account, and the directory names it; that
 * is the name the stamp must carry. A second context reads the record fresh
 * from the server, so the assertion is about the stored purchase and not
 * about this tab's optimistic row.
 */
const m6 = (page: Page) => visiblePage(page).getByTestId('m6-page')

/** The directory's name for the Single-User account. */
async function accountName(page: Page): Promise<string> {
  const me = await page.request.get('/api/v1/me')
  return ((await me.json()) as { display_name: string }).display_name
}

test.describe('M6 — who bought it, and when (FR-30.4) @single @m6', () => {
  test('E2E-M6-29: a bought entry and a bought packing row name the buyer and the time', async ({
    context,
    browser,
  }) => {
    const page = await bootPage(context)
    const trip = `Einkauf ${uniq()}`
    const tripPath = await createTripViaWizard(page, { name: trip })
    const coffee = `Kaffee ${uniq()}`
    await addBuyRowOnM4(page, coffee, 'Buy before')

    await openTripView(page, 'shopping')
    await m6(page).getByTestId('m6-add-input').locator('input').fill('Milch')
    await m6(page).getByTestId('m6-add-submit').click()
    for (const name of ['Milch', coffee]) {
      const row = m6(page).getByTestId('m6-row').filter({ hasText: name })
      await row.locator('ion-checkbox').click()
      await expect(row).toHaveCount(0)
    }
    await expect(m6(page).getByTestId('m6-row')).toHaveCount(0)
    // Both were bought before departure, so its one line counts them both.
    await expect(m6(page).getByTestId('m6-before-fold')).toHaveText(
      'Before departure · nothing open · 2 bought',
    )

    const who = await accountName(page)
    const fresh = await bootPage(await browser.newContext(), `${tripPath}/shopping`)
    await m6(fresh).getByTestId('m6-before-fold').click()
    const stamps = m6(fresh).getByTestId('m6-bought-stamp')
    await expect(stamps).toHaveCount(2)
    for (const stamp of await stamps.all()) {
      await expect(stamp).toContainText(`bought by ${who} · today`)
    }
  })
})
