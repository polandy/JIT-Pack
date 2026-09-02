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
  visiblePage,
} from './fixtures'
import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { PATH } from './routes'

/**
 * M2 — the trip list's row content (UI-Test-Spec §4, unit "M2 trip list").
 *
 * The suite runs in English, so the expected shapes are the `en` ones; the
 * German shapes are unit-owned in `lib/__tests__/format.spec.ts` — one
 * formatter serves every surface (UX-5).
 */

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

    await page.goto(PATH.trips)
    // A fresh trip is *planning*. Since FR-2.8 the list opens there by
    // itself; the tap stays, so this case keeps testing the dates alone.
    await visiblePage(page).getByTestId('trips-filter-planned').click()
    const when = visiblePage(page).getByTestId('trip-row-Elba').getByTestId('trip-when')
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
      visiblePage(page).getByTestId(`trips-filter-${segment}`).locator('.segment-count'),
    ).toHaveText(`(${value})`)
  }

  /** Planning → active → archived, the way the app does it (FR-9.3). */
  async function archiveTrip(page: import('@playwright/test').Page) {
    await tripAction(page, 'start')
    await expectTripActionOffered(page, 'archive')
    await tripAction(page, 'archive')
    await page.getByTestId('m4-pass-finish').click()
    await expect(visiblePage(page).getByTestId('m4-template-from-trip')).toBeVisible()
  }

  test('E2E-M2-13: an empty Active is left for the planned trip, and each segment states its count', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Elba' })

    await page.goto(PATH.trips)

    // No tap on a segment anywhere in this case: the row being visible is
    // the assertion, since *Active* is where the list used to open.
    await expect(visiblePage(page).getByTestId('trip-row-Elba')).toBeVisible()
    await expectCount(page, 'active', '0')
    await expectCount(page, 'planned', '1')
    await expectCount(page, 'archived', '0')
  })

  test('E2E-M2-13b: with nothing active or planned, the list falls through to the archive', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Kreta' })
    await archiveTrip(page)

    await page.goto(PATH.trips)

    await expect(visiblePage(page).getByTestId('trip-row-Kreta')).toBeVisible()
    await expectCount(page, 'archived', '1')
  })

  test('E2E-M2-13c: a segment the user chose is not taken away on the way back', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Kreta' })
    await archiveTrip(page)
    await createTripViaWizard(page, { name: 'Elba' })

    // Opens on *Planned* — Active is empty — and the user goes to the archive.
    await page.goto(PATH.trips)
    await expect(visiblePage(page).getByTestId('trip-row-Elba')).toBeVisible()
    await visiblePage(page).getByTestId('trips-filter-archived').click()
    await expect(visiblePage(page).getByTestId('trip-row-Kreta')).toBeVisible()

    // Away and back: this is the re-entry the walk runs on, and *Archived*
    // holds a trip, so it is left alone. Through the trip and the ADR-011
    // chevron rather than the tab bar, which the desktop projects do not
    // render — the re-entry is the point, not which door it came through.
    await visiblePage(page).getByTestId('trip-row-Kreta').click()
    await expect(visiblePage(page).getByTestId('m4-header')).toBeVisible()
    await page.getByTestId('header-back').click()

    await expect(visiblePage(page).getByTestId('trip-row-Kreta')).toBeVisible()
    await expect(visiblePage(page).getByTestId('trip-row-Elba')).toHaveCount(0)
  })

  test('E2E-M2-13d: a caller naming the segment outranks the walk', async ({ page }) => {
    // M18's restore and M15's migration land where their own result is —
    // even when that is an empty segment (ADR-024).
    await createTripViaWizard(page, { name: 'Elba' })

    await page.goto(`${PATH.trips}?status=active`)

    // The count first: it is the settled signal, and an absence asserted
    // against a screen that is still loading passes for the wrong reason.
    await expectCount(page, 'planned', '1')
    await expect(visiblePage(page).getByTestId('trip-row-Elba')).toHaveCount(0)
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
    await expect(visiblePage(page).getByTestId(`m4-row-${ITEM}`)).toBeVisible()
    await visiblePage(page)
      .getByTestId(`m4-row-${ITEM}`)
      .getByTestId('row-check')
      .locator('ion-checkbox')
      .click()
    // The row leaves the working list once it is done (FR-25.2) — which is
    // this case's settled signal for the write having landed.
    await expect(visiblePage(page).getByTestId(`m4-row-${ITEM}`)).toHaveCount(0)
    await page.goto(PATH.trips)
    await expect(visiblePage(page).getByTestId(`trip-row-${TRIP}`)).toBeVisible()
  }

  // E2E-M2-06 (G-8/FR-17.3): without a session there is nobody to share
  // with, so the entry is absent rather than disabled. The positive half is
  // E2E-FLOW-01's, on the `server` project — this is the same list, read on
  // a device that has no second account.
  test('E2E-M2-06: a device with no second account is offered no Share', async ({ page }) => {
    await createTripViaWizard(page, { name: TRIP })
    await page.goto(PATH.trips)

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
    await visiblePage(page).getByTestId(`m2-export-${TRIP}`).click()
    await page.locator('ion-action-sheet').getByText('With pack progress').click()
    const carried = await withProgress
    expect(carried.suggestedFilename()).toBe('Elba.yaml')
    const full = await readFile((await carried.path())!, 'utf8')
    expect(full).toContain(`name: ${ITEM}`)
    expect(full).toContain('packed_count: 1')

    await openTripSwipe(page, TRIP)
    const clean = page.waitForEvent('download')
    await visiblePage(page).getByTestId(`m2-export-${TRIP}`).click()
    await page.locator('ion-action-sheet').getByText('Clean list (unpacked)').click()
    const bare = await readFile((await (await clean).path())!, 'utf8')
    // The same trip, the same row — and no record of anyone having packed it.
    expect(bare).toContain(`name: ${ITEM}`)
    expect(bare).not.toContain('packed_count')
  })
})

/**
 * M2's two unbuilt row promises, built 2026-08-31 on the owner's ruling.
 *
 * Both stood in UI-Spec M2 and in E2E-M2-03/08 since the screen shipped: the
 * *„Importiert"* chip had a column written by M15 and read by nothing, and the
 * participant avatars were words left standing beside the presence facepile
 * when that was removed on 2026-08-28.
 */
test.describe('M2 — what the row says about a trip @local @m2', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, { mode: 'local' })
  })

  /**
   * E2E-M2-08 (FR-16.2): an imported trip says so, and one made in the app
   * does not.
   *
   * The imported trip is created through M15, which is the only writer of
   * `trips.imported` — a fixture setting the column directly would assert the
   * chip against a state the app cannot produce, which is the shape this whole
   * audit keeps finding.
   */
  test('E2E-M2-08: an imported trip carries the chip and a hand-made one does not', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Von Hand' })

    await page.goto(PATH.importSpreadsheet)
    await visiblePage(page)
      .getByTestId('import-paste')
      .locator('textarea')
      .fill(['Artikel,2016', 'Wanderschuhe,1'].join('\n'))
    await visiblePage(page).getByTestId('import-analyze').click()
    await visiblePage(page).getByTestId('import-next').click()
    await visiblePage(page).getByTestId('import-commit').click()

    // The commit lands on the archived segment, where the imported trip is.
    await expect(visiblePage(page).getByTestId('m2-imported-chip-2016')).toBeVisible()

    // …and the trip made in the app carries no chip. The positive signal
    // against it is the row itself, on the segment it lives on.
    await visiblePage(page).getByTestId('trips-filter-planned').click()
    await expect(visiblePage(page).getByTestId('trip-row-Von Hand')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m2-imported-chip-Von Hand')).toHaveCount(0)
  })

  /**
   * E2E-M2-03's fourth part (FR-2.1/8.1): the trip's travellers on the row.
   *
   * These are the *roster*, not who is connected — the presence facepile is
   * G-10's and lives in the app bar. The row shows who the trip is for.
   */
  test('E2E-M2-03: the row shows the trip’s travellers, and folds the rest into a count', async ({
    page,
  }) => {
    await createTripViaWizard(page, {
      name: 'Zu viert',
      travelers: ['Andy', 'Sia', 'Leonardo', 'Mia'],
    })
    await page.goto(PATH.trips)

    const faces = visiblePage(page).getByTestId('m2-travelers-Zu viert')
    await expect(faces).toBeVisible()
    // Two faces and a +2, not four faces. Measured: three faces plus „+1" is
    // 64 px and wraps a long trip name onto a second line at 390 px; two plus
    // „+2" is 61 px and it stays on one.
    await expect(faces.getByTestId('m2-traveler-face')).toHaveCount(2)
    await expect(faces.getByTestId('m2-traveler-more')).toHaveText('+2')

    // A trip with nobody on it shows nothing rather than an empty pile — the
    // positive signal is the row, which is there either way.
    await createTripViaWizard(page, { name: 'Allein' })
    await page.goto(PATH.trips)
    await expect(visiblePage(page).getByTestId('trip-row-Allein')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m2-travelers-Allein')).toHaveCount(0)
  })

  /*
   * E2E-M2-02 (FR-13.1): the list groups under series headers, and the
   * header leads to M16.
   *
   * Writable only since 2026-08-31: the 2026-08-08 concept review had chosen
   * a flat list, so for a year this id described the option the screen had
   * *not* taken and no case could be written against it. The owner ruled the
   * built screen wins (E2E-M2-15 struck), and this is the first test of the
   * grouping the app has always done.
   *
   * ~~destination~~: the header carries the series name and a trip count and
   * no destination, so the clause is corrected in the spec rather than
   * asserted here.
   */
  test('E2E-M2-02: trips sit under their series header, which leads to M16', async ({ page }) => {
    test.slow()
    await createTripViaWizard(page, { name: 'Ostern 25', series: 'Ostern' })
    await createTripViaWizard(page, { name: 'Ostern 26', series: 'Ostern' })
    await createTripViaWizard(page, { name: 'Einzelreise' })

    await page.goto(PATH.trips)
    const header = visiblePage(page).getByTestId('series-header-Ostern')
    await expect(header).toBeVisible()
    // The count is the group's, not the list's — the third trip is in no
    // series and must not be counted here.
    await expect(header).toContainText('2 trips')

    // Grouping, not merely a heading: the two series trips are inside the
    // header's own group and the loose one is not.
    const grouped = visiblePage(page)
      .locator('.trip-card')
      .filter({ has: page.getByTestId('trip-row-Ostern 26') })
    await expect(grouped.getByTestId('trip-row-Ostern 25')).toBeVisible()
    await expect(grouped.getByTestId('trip-row-Einzelreise')).toHaveCount(0)
    // …and the loose trip is on the screen, so its absence above is about
    // the group rather than about the trip.
    await expect(visiblePage(page).getByTestId('trip-row-Einzelreise')).toBeVisible()

    await header.click()
    await expect(visiblePage(page).getByTestId('m16-name')).toBeVisible()
  })

  /*
   * E2E-M2-16 (G-7): M2's empty state, which had no test id at all and so
   * could not be asserted from anywhere — E2E-G7-01 names all four list
   * screens and only ever tested the Dashboard's. A number of its own rather
   * than a second definition of that id: the gate allows one, and a shared id
   * is what the M5 audit spent a day undoing. It carries no CTA — the owner
   * ruled that on 2026-08-31, for M7's reason: create is the FAB and it is on
   * screen either way.
   */
  test('E2E-M2-16: M2 states that a segment is empty, and the FAB is the way out', async ({
    page,
  }) => {
    await page.goto(PATH.trips)
    const empty = visiblePage(page).getByTestId('m2-empty')
    await expect(empty).toBeVisible()
    await expect(visiblePage(page).getByTestId('trips-new')).toBeVisible()

    // It goes away when there is something to show — without this the case
    // would pass against an empty state that is always on screen.
    await createTripViaWizard(page, { name: 'Elba' })
    await page.goto(PATH.trips)
    await expect(visiblePage(page).getByTestId('trip-row-Elba')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m2-empty')).toHaveCount(0)
  })
})
