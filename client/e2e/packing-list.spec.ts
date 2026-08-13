import { test, expect, createTripViaWizard } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * M4 — packing list (UI-Test-Spec §4, unit "M4 packing list").
 *
 * Local Mode throughout: M4's own behaviour is client-side, so it needs no
 * backend, and the cases that genuinely need one (remote pack attribution,
 * delegation notifications) are marked `server` in the spec and are not
 * here.
 *
 * What is deliberately *not* covered yet, and why — the ledger repeats it:
 * every facet case beyond the panel's own structure needs rows that carry
 * a category, a traveler or a buy mode, and none of those can be set from
 * M4 today. They land with M5 and the M9/M10 rebuild, which is what
 * produces such rows through the app's own paths (spec §2.4).
 */

const TRIP = { name: 'Samedan Sommer', endDate: '2026-12-31', travelers: ['Andy', 'Sia'] }

/** Adds rows through the quick-add, which is the only add path M4 has. */
async function quickAdd(page: Page, names: string[]) {
  await page.getByTestId('m4-fab').click()
  for (const name of names) {
    await page.getByTestId('quick-add-input').locator('input').fill(name)
    await page.getByTestId('quick-add-confirm').click()
    await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
  }
}

test.describe('M4 packing list @local @m4', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M4-01 (FR-8.1/7.3, G-12): the header line counts the whole trip,
  // whatever the list below it is showing. A short list that also shortened
  // the header would make a filtered trip look further along than it is.
  test('E2E-M4-01: the header line stays unfiltered while the search narrows the list', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt', 'Schlafsack', 'Kocher'])

    await expect(page.getByTestId('m4-progress')).toContainText('0/3')

    await page.getByTestId('m4-search').click()
    await page.getByTestId('m4-search-input').fill('Zelt')

    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(page.getByTestId('m4-row-Kocher')).toHaveCount(0)
    // The point of the case: the count did not follow the list.
    await expect(page.getByTestId('m4-progress')).toContainText('0/3')
  })

  // E2E-M4-04 (FR-5.6, FR-25.13a): the visible confirm button is the commit,
  // and the form stays open for the next row.
  test('E2E-M4-04: the FAB opens the quick-add, which commits by button and stays open', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)

    await page.getByTestId('m4-fab').click()
    const input = page.getByTestId('quick-add-input').locator('input')
    await input.fill('Zelt')
    await page.getByTestId('quick-add-confirm').click()

    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    // Still open and empty, ready for the next one.
    await expect(page.getByTestId('quick-add-input')).toBeVisible()
    await expect(input).toHaveValue('')
  })

  // E2E-M4-18 (FR-25.11e): "Alles gepackt" may appear only when nothing is
  // narrowing the list. The regression this guards actually happened: the
  // check looked at the filter count alone, so an unmatched *search*
  // announced completion.
  test('E2E-M4-18: an unmatched search says "no matches", not "all packed"', async ({ page }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt'])

    await page.getByTestId('m4-search').click()
    await page.getByTestId('m4-search-input').fill('Kajak')

    const empty = page.getByTestId('packing-empty')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText('Kajak')
    await expect(empty).not.toContainText('🎉')

    // The reset clears everything narrowing, not only part of it — a reset
    // that leaves the search behind re-renders the same empty screen.
    await page.getByTestId('m4-reset').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
  })

  test('E2E-M4-18: everything packed does celebrate, because nothing is narrowing', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt'])

    await page.getByTestId('m4-row-Zelt').getByTestId('row-check').click()

    await expect(page.getByTestId('packing-empty')).toContainText('🎉')
  })

  // E2E-M4-23 (FR-25.16/25.2): doneness removes a group entirely — header
  // and all — and the reveal bar brings it back. Folding is a different
  // concept and must not stand in for it.
  test('E2E-M4-23: a fully packed group disappears and returns with the reveal bar', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt', 'Kocher'])

    await page.getByTestId('m4-row-Zelt').getByTestId('row-check').click()
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)
    await expect(page.getByTestId('m4-group-none')).toBeVisible()

    await page.getByTestId('m4-row-Kocher').getByTestId('row-check').click()
    // Both done: the group is gone, not merely empty.
    await expect(page.getByTestId('m4-group-none')).toHaveCount(0)

    await page.getByTestId('m4-done-bar').click()
    await expect(page.getByTestId('m4-group-none')).toBeVisible()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
  })

  // E2E-M4-22 (FR-25.16): a folded group is its header line alone, and that
  // line answers what the hidden rows would have.
  test('E2E-M4-22: folding a group leaves its header carrying the open count', async ({ page }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt', 'Kocher'])

    const group = page.getByTestId('m4-group-none')
    await expect(group).toContainText('0/2')

    await group.click()
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)
    await expect(group).toContainText('2')
    await expect(group).toBeVisible()

    await group.click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
  })

  test('E2E-M4-22: fold-all collapses every group, and folding survives packing a row', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt', 'Kocher'])

    await page.getByTestId('m4-fold-all').click()
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)

    await page.getByTestId('m4-fold-all').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    // The fold is per group key, so a re-render of the list must not
    // unwind it — packing a row somewhere else is exactly such a render.
    await page.getByTestId('m4-row-Zelt').getByTestId('row-check').click()
    await page.getByTestId('m4-group-none').click()
    await expect(page.getByTestId('m4-row-Kocher')).toHaveCount(0)

    await page.getByTestId('m4-done-bar').click()
    await expect(page.getByTestId('m4-group-none')).toBeVisible()
    await expect(page.getByTestId('m4-row-Kocher')).toHaveCount(0)
  })

  // E2E-M4-15 (FR-25.11a/b): one filter row, and the grouping lives inside
  // the sheet rather than as a second bar in the header.
  test('E2E-M4-15: the filter sheet holds the grouping and the facets, and the header has no second bar', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt'])

    // With nothing filtered the row states the grouping instead of chips,
    // and the grouping switcher is nowhere but inside the sheet.
    await expect(page.getByTestId('m4-filter-bar')).toBeVisible()
    await expect(page.getByTestId('group-person')).toHaveCount(0)

    await page.getByTestId('m4-filter').click()
    await expect(page.getByTestId('filter-sheet')).toBeVisible()
    await expect(page.getByTestId('group-category')).toBeVisible()
    await expect(page.getByTestId('group-person')).toBeVisible()
  })

  // E2E-M4-02 (FR-8.2/25.18): the grouping is durable per trip — it arranges
  // rows rather than hiding them, so nothing can be lost behind it.
  test('E2E-M4-02: the grouping choice survives a reload', async ({ page }) => {
    const path = await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt'])

    await page.getByTestId('m4-filter').click()
    await page.getByTestId('group-person').click()
    await page.getByTestId('filter-close').click()

    await page.goto(path)
    await expect(page.getByTestId('m4-filter-bar')).toContainText(/Person/i)
  })

  // E2E-M4-28 (FR-25.18): the *filter* side is session state. A forgotten
  // filter hides rows, and a hidden row on a packing list reads as "nothing
  // left to do" — so a fresh session starts from the default.
  // Leaving M4 and coming back is the interruption the requirement is
  // about; the *fresh session* half is unit-tested in usePackingFilter,
  // because reaching it here needs a reload, and Local Mode does not
  // restore trip items across one (see the ledger).
  test('E2E-M4-28: the Erledigte switch survives leaving M4 and coming back', async ({ page }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt'])
    await page.getByTestId('m4-row-Zelt').getByTestId('row-check').click()

    await page.getByTestId('m4-done-bar').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    await page.getByTestId('m4-search').click() // any in-app detour and back
    await page.getByTestId('header-back').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
  })
})
