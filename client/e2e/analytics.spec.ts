import {
  test,
  expect,
  createTripViaWizard,
  openQuickAdd,
  tripAction,
  expectTripActionOffered,
} from './fixtures'
import type { Page } from '@playwright/test'

/**
 * M12 — Analytics (UI-Test-Spec §4, unit "M12 analytics").
 *
 * Local Mode throughout: every derivation here is client-side
 * (invariant 4). Weighted rows come in through the app's own paths —
 * a master item created in M10's minimal form, quick-added via its
 * suggestion so the trip row carries the master weight.
 */

const TRIP = { name: 'Veloferien Elba', travelers: ['Andy', 'Sia'] }

/** The visible page, per the working agreement: assert what is rendered. */
function visible(page: Page) {
  return page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')
}

/** Ionic inputs hydrate late; filling before that goes nowhere. */
async function fillIonic(field: ReturnType<Page['locator']>, value: string) {
  await expect(field).toHaveClass(/hydrated/)
  const input = field.locator('input')
  await input.click()
  await input.fill('')
  await input.pressSequentially(value)
  await expect(input).toHaveValue(value)
}

/** A master item with weight (and optionally a price), created in M10's minimal form (FR-24.5). */
async function createMasterItem(page: Page, name: string, weightGrams: number, price?: string) {
  await page.goto('/tabs/items')
  await visible(page).getByTestId('m9-fab').click()
  await expect(visible(page).getByTestId('m10-new-hint')).toBeVisible()
  await fillIonic(visible(page).getByTestId('m10-name'), name)
  await visible(page).getByTestId('m10-more').click()
  await fillIonic(visible(page).getByTestId('m10-weight'), String(weightGrams))
  if (price) await fillIonic(visible(page).getByTestId('m10-price'), price)
  await visible(page).getByTestId('m10-create').click()
  await expect(page.getByTestId('header-title')).toHaveText(name)
}

/** Quick-add via the suggestion, so the row carries the master weight. */
async function quickAddFromMaster(page: Page, name: string) {
  await openQuickAdd(page)
  await page.getByTestId('quick-add-input').locator('input').fill(name.slice(0, 4))
  await page.getByTestId('quick-add-suggestion').filter({ hasText: name }).click()
  await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-add-input')).toBeHidden()
}

/** Quick-add verbatim — no master item, so the row has no weight. */
async function quickAddVerbatim(page: Page, name: string) {
  await openQuickAdd(page)
  await page.getByTestId('quick-add-input').locator('input').fill(name)
  await page.getByTestId('quick-add-confirm').click()
  await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-add-input')).toBeHidden()
}

/** M4 → M12 via the 📊 button on the trip line (E2E-M4-01's entry). */
async function openAnalytics(page: Page) {
  await visible(page).getByTestId('m4-nav-analytics').click()
  await expect(visible(page).getByTestId('analytics-dim-person')).toBeVisible()
  await expect(visible(page).getByTestId('m4-nav-analytics')).toHaveCount(0)
}

/**
 * Assign the item to a traveler through M5's popover select — the
 * app's one way of making a row somebody's (FR-25.1).
 */
async function assignTraveler(page: Page, itemName: string, travelerName: string) {
  await page.getByTestId(`m4-row-${itemName}`).click()
  await expect(page.getByTestId('m5-sheet')).toBeVisible()
  await page.getByTestId('m5-details').click()
  await page.getByTestId('m5-traveler').click()
  const popover = page.locator('ion-popover ion-select-popover')
  await popover.locator('ion-item', { hasText: travelerName }).click()
  await expect(page.locator('ion-popover')).toHaveCount(0)
  await page.getByTestId('m5-close').click()
  await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
}

/**
 * Drive the trip through its lifecycle to *archived* (E2E-M4-43's step).
 * Each expectation is the settled signal that the status write landed — the
 * pair of actions swaps, which a fixed wait could only probably catch.
 */
async function startTrip(page: Page) {
  await tripAction(page, 'start')
  await expectTripActionOffered(page, 'archive')
}

/** Pack a row, which is what a trend column actually counts. */
async function packRow(page: Page, name: string) {
  await page.getByTestId(`m4-row-${name}`).getByTestId('row-check').locator('ion-checkbox').click()
  // The row leaves the open list once it is done (FR-25.2) — the rendered
  // evidence that the pack was written rather than merely clicked.
  await expect(page.getByTestId(`m4-row-${name}`)).toHaveCount(0)
}

test.describe('M12 analytics @local @m12', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M12-01 (FR-8.1/8.2): dimension switcher and packed-vs-planned
  // bars, with the trip totals beside them.
  test('E2E-M12-01: bars per dimension value with packed/planned weight and totals', async ({
    page,
  }) => {
    await createMasterItem(page, 'Zelt', 5000)
    await createTripViaWizard(page, TRIP)
    await quickAddFromMaster(page, 'Zelt')

    // Pack it, so packed and planned diverge visibly from zero.
    await page.getByTestId('m4-row-Zelt').getByTestId('row-check').locator('ion-checkbox').click()

    await openAnalytics(page)

    // Category view (default): one bucket, the uncategorized one.
    const slice = visible(page).getByTestId('analytics-slice-none')
    await expect(slice).toBeVisible()
    await expect(slice).toContainText('5.0 kg')

    await expect(visible(page).getByTestId('analytics-kpi-weight')).toContainText('5.0 kg / 5.0 kg')

    // The switcher reaches every dimension (FR-8.2).
    await visible(page).getByTestId('analytics-dim-container').click()
    await expect(visible(page).getByTestId('analytics-slice-none')).toBeVisible()
  })

  // E2E-M12-02 (FR-8.2): items without weight aggregate as an honest
  // count beside the chart, never as a zero-weight bar.
  test('E2E-M12-02: an unweighted item is counted beside the bars, not drawn as one', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await quickAddVerbatim(page, 'Handcreme')

    await openAnalytics(page)

    await expect(visible(page).getByTestId('analytics-unweighted')).toContainText('1')
    // No weighted rows → no bars, and the empty state says why.
    await expect(visible(page).getByTestId('analytics-empty')).toBeVisible()
    // UX-11: with the explainer up, no zero tiles restate the absence —
    // "0 g / 0 g" and a unit-less "0.00" under it doubled the empty state.
    // The two visible assertions above are the settled positive signal.
    await expect(visible(page).getByTestId('analytics-kpi-weight')).toHaveCount(0)
    await expect(visible(page).getByTestId('analytics-kpi-value')).toHaveCount(0)
  })

  // E2E-M12-07 (FR-8.1, UX-11): the value KPI exists only when something
  // actually carries a value, and renders it in the locale's number format
  // rather than a bare toFixed.
  test('E2E-M12-07: the value tile appears with a value and stays away without one', async ({
    page,
  }) => {
    await createMasterItem(page, 'Zelt', 5000, '120.50')
    await createTripViaWizard(page, TRIP)
    await quickAddFromMaster(page, 'Zelt')

    await openAnalytics(page)

    await expect(visible(page).getByTestId('analytics-kpi-weight')).toBeVisible()
    await expect(visible(page).getByTestId('analytics-kpi-value')).toContainText('120.50')
  })

  // E2E-M12-03 (FR-14.3), the absence half: a series with no archived
  // history shows no trend section — an absent section, not an empty
  // chart. The positive half is the case below it.
  test('E2E-M12-03: without archived series history there is no trend section', async ({
    page,
  }) => {
    await createMasterItem(page, 'Zelt', 5000)
    await createTripViaWizard(page, { name: 'Elba 2026', series: 'Elba', travelers: ['Andy'] })
    await quickAddFromMaster(page, 'Zelt')

    await openAnalytics(page)

    await expect(visible(page).getByTestId('analytics-slice-none')).toBeVisible()
    await expect(visible(page).getByTestId('analytics-trend')).toHaveCount(0)
    await expect(visible(page).getByTestId('analytics-flagged')).toHaveCount(0)
  })

  // E2E-M12-03 (FR-14.3), the positive half — owed since 2026-08-19 and
  // written 2026-08-21. It was never a test gap: the trend reads the
  // *archived* trips of a series, and until M21 needed the same step nothing
  // user-facing moved a trip out of *planning*, so the precondition could not
  // be built through the app at all (spec §2.4 forbids injecting it). With
  // M4's start action in place the whole history is now reachable: pack a
  // weighted row, start the trip, type the thing that was missing, archive.
  test('E2E-M12-03: an archived trip in the series draws the trend and its flags', async ({
    page,
  }) => {
    // The world is two whole trips built through M3/M4/M5, which on WebKit
    // lands near the budget.
    test.slow()
    await createMasterItem(page, 'Zelt', 5000)

    // Last year's trip, taken all the way to archived.
    await createTripViaWizard(page, {
      name: 'Elba 2025',
      series: 'Elba',
      startDate: '2025-07-01',
      travelers: ['Andy'],
    })
    await quickAddFromMaster(page, 'Zelt')
    await startTrip(page)
    await packRow(page, 'Zelt')
    // On a running trip a typed row is what nobody had packed — the app
    // stamps FR-9.1 *missing* on it, which is the only flag writer M4 has.
    await quickAddVerbatim(page, 'Powerbank')
    // Read the flag back off the stored row before archiving. The trend's
    // flag list is the assertion this case is about, and it would report an
    // empty list just as quietly if nothing had ever been flagged.
    await page.getByTestId('m4-row-Powerbank').getByRole('heading').click()
    await expect(page.getByTestId('m5-glance')).toContainText('Missing')
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    await tripAction(page, 'archive')
    // FR-9.3: the archive action opens the closing pass; *Fertig* archives.
    await page.getByTestId('m4-pass-finish').click()

    // This year's trip, in the same series.
    await createTripViaWizard(page, {
      name: 'Elba 2026',
      series: 'Elba',
      startDate: '2026-07-01',
      travelers: ['Andy'],
    })

    await openAnalytics(page)

    // The trend counts the weight actually *carried*: one column, the year
    // it was carried in, and the packed kilos rather than the planned ones.
    const trend = visible(page).getByTestId('analytics-trend')
    await expect(trend).toBeVisible()
    await expect(trend.locator('.col')).toHaveCount(1)
    await expect(trend).toContainText('2025')
    await expect(trend).toContainText('5.0')

    // And the series' flags are named with their count, not merely counted.
    const flagged = visible(page).getByTestId('analytics-flagged')
    await expect(flagged).toContainText('Powerbank')
    await expect(flagged).toContainText('1× missing')

    // The other half of the case still holds beside it: this trip's own
    // slices are the trip's, not the series' — a trend that leaked into the
    // bars would show last year's tent here.
    await expect(visible(page).getByTestId('analytics-empty')).toBeVisible()
  })

  // E2E-M12-04 (FR-8.2/25.11): tapping a bar lands on M4 *filtered* to
  // that value — the facet is set, the removable chip names it, the
  // grouping matches the dimension, and rows outside the slice are gone.
  // Regression guard: setting only the grouping (the pre-2026-08-08
  // behaviour) fails every one of these assertions but the last.
  test('E2E-M12-04: a tapped bar becomes the facet M4 opens with', async ({ page }) => {
    await createMasterItem(page, 'Zelt', 5000)
    await createMasterItem(page, 'Sonnenbrille', 100)
    await createTripViaWizard(page, TRIP)
    await quickAddFromMaster(page, 'Zelt')
    await quickAddFromMaster(page, 'Sonnenbrille')
    await assignTraveler(page, 'Sonnenbrille', 'Sia')

    await openAnalytics(page)
    await visible(page).getByTestId('analytics-dim-person').click()
    await visible(page)
      .locator('[data-testid^="analytics-slice-"]')
      .filter({ hasText: 'Sia' })
      .click()

    // The chip row names the filter (FR-25.11a)…
    const chip = page.locator('[data-testid^="m4-chip-person-"]')
    await expect(chip).toBeVisible()
    await expect(chip).toContainText('Sia')
    // …the list is actually narrowed to the tapped number…
    await expect(page.getByTestId('m4-row-Sonnenbrille')).toBeVisible()
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)
    // …and removing the chip reveals the grouping that came along.
    await page.getByTestId('m4-chip-reset').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(page.getByTestId('m4-filter-bar')).toContainText(/Person/i)
  })

  // E2E-M12-05 (FR-8.2/25.1): rows assigned per traveler are one
  // contribution each in the Person view — never an `undefined` bucket —
  // and sum back into one bucket by category, so the totals match.
  test('E2E-M12-05: per-traveler rows contribute per person and sum back by category', async ({
    page,
  }) => {
    await createMasterItem(page, 'Zelt', 5000)
    await createMasterItem(page, 'Sonnenbrille', 100)
    await createMasterItem(page, 'Kocher', 1000)
    await createTripViaWizard(page, TRIP)
    await quickAddFromMaster(page, 'Zelt')
    await quickAddFromMaster(page, 'Sonnenbrille')
    await quickAddFromMaster(page, 'Kocher')
    await assignTraveler(page, 'Sonnenbrille', 'Sia')
    await assignTraveler(page, 'Kocher', 'Andy')

    await openAnalytics(page)
    await visible(page).getByTestId('analytics-dim-person').click()

    const slices = visible(page).locator('[data-testid^="analytics-slice-"]')
    await expect(slices).toHaveCount(3)
    await expect(slices.filter({ hasText: 'Andy' })).toContainText('1.0 kg')
    await expect(slices.filter({ hasText: 'Sia' })).toContainText('100 g')
    await expect(slices.filter({ hasText: 'Shared' })).toContainText('5.0 kg')
    await expect(visible(page)).not.toContainText('undefined')

    // The same rows, summed back into one bucket: totals match.
    const total = '6.1 kg'
    await expect(visible(page).getByTestId('analytics-kpi-weight')).toContainText(total)
    await visible(page).getByTestId('analytics-dim-category').click()
    await expect(visible(page).getByTestId('analytics-slice-none')).toContainText(total)
    await expect(visible(page).getByTestId('analytics-kpi-weight')).toContainText(total)
  })
})
