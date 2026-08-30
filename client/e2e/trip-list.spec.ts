import {
  test,
  expect,
  seed,
  createTripViaWizard,
  openQuickAdd,
  openTripSwipe,
  tripAction,
  tripSwipeActions,
  expectTripActionOffered,
} from './fixtures'
import { readFile } from 'node:fs/promises'
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
    // A fresh trip is *planning*. Since FR-2.8 the list opens there by
    // itself; the tap stays, so this case keeps testing the dates alone.
    await visible(page).getByTestId('trips-filter-planned').click()
    const when = visible(page).getByTestId('trip-row-Elba').getByTestId('trip-when')
    // Whitespace-tolerant: Intl is free to use thin spaces around the dash.
    await expect(when).toHaveText(/^Aug 22\s*–\s*Sep 5, 2026$/)
  })
})

/**
 * E2E-M2-13 (FR-2.8): the opening segment is derived from what the list
 * holds. `local` because the walk needs a device whose whole trip world the
 * test built — in `single` the master partition is shared by the run.
 */
test.describe('M2 opening segment @local @m2', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, { mode: 'local' })
  })

  /**
   * The count under a segment's label. An assertion rather than a getter: in
   * Local Mode the list is hydrated from IndexedDB, so a plain read races the
   * hydration and answers for a screen that is not finished yet.
   */
  async function expectCount(
    page: import('@playwright/test').Page,
    segment: string,
    value: string,
  ) {
    await expect(
      visible(page).getByTestId(`trips-filter-${segment}`).locator('.segment-count'),
    ).toHaveText(`(${value})`)
  }

  /** Planning → active → archived, the way the app does it (FR-9.3). */
  async function archiveTrip(page: import('@playwright/test').Page) {
    await tripAction(page, 'start')
    await expectTripActionOffered(page, 'archive')
    await tripAction(page, 'archive')
    await page.getByTestId('m4-pass-finish').click()
    await expect(visible(page).getByTestId('m4-template-from-trip')).toBeVisible()
  }

  test('E2E-M2-13: an empty Active is left for the planned trip, and each segment states its count', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Elba' })

    await page.goto('/tabs/trips')

    // No tap on a segment anywhere in this case: the row being visible is
    // the assertion, since *Active* is where the list used to open.
    await expect(visible(page).getByTestId('trip-row-Elba')).toBeVisible()
    await expectCount(page, 'active', '0')
    await expectCount(page, 'planned', '1')
    await expectCount(page, 'archived', '0')
  })

  test('E2E-M2-13b: with nothing active or planned, the list falls through to the archive', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Kreta' })
    await archiveTrip(page)

    await page.goto('/tabs/trips')

    await expect(visible(page).getByTestId('trip-row-Kreta')).toBeVisible()
    await expectCount(page, 'archived', '1')
  })

  test('E2E-M2-13c: a segment the user chose is not taken away on the way back', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Kreta' })
    await archiveTrip(page)
    await createTripViaWizard(page, { name: 'Elba' })

    // Opens on *Planned* — Active is empty — and the user goes to the archive.
    await page.goto('/tabs/trips')
    await expect(visible(page).getByTestId('trip-row-Elba')).toBeVisible()
    await visible(page).getByTestId('trips-filter-archived').click()
    await expect(visible(page).getByTestId('trip-row-Kreta')).toBeVisible()

    // Away and back: this is the re-entry the walk runs on, and *Archived*
    // holds a trip, so it is left alone. Through the trip and the ADR-011
    // chevron rather than the tab bar, which the desktop projects do not
    // render — the re-entry is the point, not which door it came through.
    await visible(page).getByTestId('trip-row-Kreta').click()
    await expect(visible(page).getByTestId('m4-header')).toBeVisible()
    await page.getByTestId('header-back').click()

    await expect(visible(page).getByTestId('trip-row-Kreta')).toBeVisible()
    await expect(visible(page).getByTestId('trip-row-Elba')).toHaveCount(0)
  })

  test('E2E-M2-13d: a caller naming the segment outranks the walk', async ({ page }) => {
    // M18's restore and M15's migration land where their own result is —
    // even when that is an empty segment (ADR-024).
    await createTripViaWizard(page, { name: 'Elba' })

    await page.goto('/tabs/trips?status=active')

    // The count first: it is the settled signal, and an absence asserted
    // against a screen that is still loading passes for the wrong reason.
    await expectCount(page, 'planned', '1')
    await expect(visible(page).getByTestId('trip-row-Elba')).toHaveCount(0)
  })
})

/**
 * M2's row actions (UI-Test-Spec §4, unit "M2 row actions", 2026-08-30).
 *
 * The whole slide menu was unoperated until this block: E2E-FLOW-01 asserts
 * *Share* is in the DOM and nothing had ever opened the row. What is written
 * here is what the screen actually offers — the wording of the spec's cases
 * („long-press → context menu") describes a gesture M2 has never had.
 */
test.describe('M2 row actions @local @m2', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, { mode: 'local' })
  })

  const TRIP = 'Elba'
  const ITEM = 'Schnorchel'

  /** A planning trip with one packed row, so an export has progress to carry. */
  async function tripWithAPackedRow(page: Page) {
    await createTripViaWizard(page, { name: TRIP })
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill(ITEM)
    await page.getByTestId('quick-add-confirm').click()
    await expect(visible(page).getByTestId(`m4-row-${ITEM}`)).toBeVisible()
    await visible(page)
      .getByTestId(`m4-row-${ITEM}`)
      .getByTestId('row-check')
      .locator('ion-checkbox')
      .click()
    // The row leaves the working list once it is done (FR-25.2) — which is
    // this case's settled signal for the write having landed.
    await expect(visible(page).getByTestId(`m4-row-${ITEM}`)).toHaveCount(0)
    await page.goto('/tabs/trips')
    await expect(visible(page).getByTestId(`trip-row-${TRIP}`)).toBeVisible()
  }

  // E2E-M2-06 (G-8/FR-17.3): without a session there is nobody to share
  // with, so the entry is absent rather than disabled. The positive half is
  // E2E-FLOW-01's, on the `server` project — this is the same list, read on
  // a device that has no second account.
  test('E2E-M2-06: a device with no second account is offered no Share', async ({ page }) => {
    await createTripViaWizard(page, { name: TRIP })
    await page.goto('/tabs/trips')

    const offered = await tripSwipeActions(page, TRIP)
    // Against a populated list: an empty menu would satisfy the absence.
    expect(offered).toContain('Export trip')
    expect(offered).not.toContain('Share')
  })

  // E2E-M2-07 (FR-18.3): the export asks progress-or-clean and the answer
  // reaches the file. Both branches, because one of them alone cannot tell
  // a working choice from a constant.
  test('E2E-M2-07: the export writes the trip, and the clean list leaves its progress out', async ({
    page,
  }) => {
    await tripWithAPackedRow(page)

    await openTripSwipe(page, TRIP)
    const withProgress = page.waitForEvent('download')
    await visible(page).getByTestId(`m2-export-${TRIP}`).click()
    await page.locator('ion-action-sheet').getByText('With pack progress').click()
    const carried = await withProgress
    expect(carried.suggestedFilename()).toBe('Elba.yaml')
    const full = await readFile((await carried.path())!, 'utf8')
    expect(full).toContain(`name: ${ITEM}`)
    expect(full).toContain('packed_count: 1')

    await openTripSwipe(page, TRIP)
    const clean = page.waitForEvent('download')
    await visible(page).getByTestId(`m2-export-${TRIP}`).click()
    await page.locator('ion-action-sheet').getByText('Clean list (unpacked)').click()
    const bare = await readFile((await (await clean).path())!, 'utf8')
    // The same trip, the same row — and no record of anyone having packed it.
    expect(bare).toContain(`name: ${ITEM}`)
    expect(bare).not.toContain('packed_count')
  })
})
