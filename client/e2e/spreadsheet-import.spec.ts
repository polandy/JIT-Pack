import { test, expect, seed, visiblePage } from './fixtures'

/**
 * M15 — the mapping step's two category layouts (FR-16.1), Local Mode.
 *
 * The `single` unit owns whether an import reaches the server (E2E-M15-05).
 * What it cannot show is the *choice* between the two layouts, because it
 * drives the detected default: a sheet whose category is a column, imported
 * as if it were not, is a different plan — and a "Notes" column that the
 * detector mistakes for a category is exactly the case the picker exists for.
 */

/**
 * Two header rows, a category column, two trip columns. Written out rather
 * than shared with the `single` unit: one fixture across two projects couples
 * suites that are meant to fail independently.
 */
const CSV = [
  ',,2016,2017',
  ',,Laos,Moskau',
  'Schuhe,Wanderschuhe,1,1',
  ',Sandalen,1,',
  'Unterwäsche,Socken,9,9',
].join('\n')

async function openMapping(page: import('@playwright/test').Page) {
  await seed(page, { mode: 'local' })
  await page.goto('/import')
  await visiblePage(page).getByTestId('import-paste').locator('textarea').fill(CSV)
  await visiblePage(page).getByTestId('import-analyze').click()
  await expect(visiblePage(page).getByTestId('import-trip-2')).toBeVisible()
}

test.describe('M15 mapping — category column or category rows @local @m15', () => {
  test('E2E-M15-06: the detected category column files the items under it', async ({ page }) => {
    await openMapping(page)

    await expect(
      visiblePage(page).getByTestId('category-column').locator('.segment-button-checked'),
    ).toHaveText('Col 1')

    await visiblePage(page).getByTestId('import-next').click()
    // Two categories from the column, and no item became one: the sheet has
    // three item rows, and "Sandalen" is packed on only one of the two trips.
    await expect(visiblePage(page).getByTestId('import-summary-line')).toContainText('2 categories')
    await expect(visiblePage(page).getByTestId('import-summary-line')).toContainText('3 new items')
  })

  test('E2E-M15-07: setting the picker back to none drops the column again', async ({ page }) => {
    await openMapping(page)

    await visiblePage(page)
      .getByTestId('category-column')
      .locator('ion-segment-button')
      .first()
      .click()
    await expect(
      visiblePage(page).getByTestId('category-column').locator('.segment-button-checked'),
    ).toHaveText('None')

    await visiblePage(page).getByTestId('import-next').click()
    // Nothing ticks the category rows in their place, so the plan carries no
    // category at all — the override is honoured rather than re-detected.
    await expect(visiblePage(page).getByTestId('import-summary-line')).toContainText('0 categories')
  })
})
