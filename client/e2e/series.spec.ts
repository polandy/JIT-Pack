import {
  test,
  expect,
  chooseInSelect,
  createTripViaWizard,
  fillIonic,
  setClock,
  visiblePage as visible,
  writesLanded,
} from './fixtures'
import { PATH } from './routes'
import { openSeries } from './helpers/m16'

/**
 * M16 — Series & Destination Profile (UI-Test-Spec §4, unit "M16 series").
 *
 * Everything the screen offers is a *write*: the series name (refused onto a
 * taken one), the three defaults M3 prefills from, a destination profile that
 * does not exist until something is typed into it, its checklist, and
 * attach/detach on the trip history. So each case here reads its result back
 * somewhere other than the control that made it — from the store after leaving
 * the screen, or from M3, which is what the defaults are *for*.
 */

const SERIES = 'Elba'
const OTHER_SERIES = 'Ticino'
/** `wizard.unset` — what a default that was never set reads as. */
const UNSET = '—'
/** A week before 2 November 2026, in the short form a task's day takes. */
const SERIES_TASK_DAY = 'Mon, 26.10'

test.describe('M16 series & destination profile @local @m16', () => {
  // Each case builds its world through M3, which on WebKit lands near the
  // 30 s default budget.
  test.slow()

  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M16-01: the name and the defaults are editable, and a taken name is refused', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Elba 2026', series: SERIES })
    await createTripViaWizard(page, { name: 'Ticino 2026', series: OTHER_SERIES })

    await openSeries(page, SERIES)
    await chooseInSelect(page, 'm16-season', 'Summer')
    await chooseInSelect(page, 'm16-transport', 'Train')

    // Read back off the store rather than off the selects that were just
    // clicked: leave the screen and come back, so the value on display is
    // one that survived the write.
    //
    // `.select-text` and not the host: an `ion-select`'s own text is every
    // option it carries, so `toContainText('Summer')` is true of a season
    // select that has never been touched — the second series below is what
    // caught that, and it is why the untouched value is asserted first.
    const seasonOf = (p: typeof page) =>
      visible(p).getByTestId('m16-season').locator('.select-text')
    await openSeries(page, OTHER_SERIES)
    await expect(seasonOf(page)).toHaveText(UNSET)
    await openSeries(page, SERIES)
    await expect(seasonOf(page)).toHaveText('Summer')
    await expect(visible(page).getByTestId('m16-transport').locator('.select-text')).toHaveText(
      'Train',
    )

    // FR-13.1: the name is UNIQUE instance-wide, so a rename onto a taken
    // one is refused here rather than by a push — and the field goes back
    // to what the series is still called, because G-5's auto-save has no
    // other acknowledgement and a refused spelling left in it reads as
    // saved.
    const field = visible(page).getByTestId('m16-name').locator('input')
    await field.fill(OTHER_SERIES)
    await field.press('Enter')
    await expect(page.locator('ion-toast')).toContainText(OTHER_SERIES)
    await expect(field).toHaveValue(SERIES)
    await expect(page.getByTestId('header-title')).toHaveText(SERIES)

    // A free name is taken, and the header — which renders off the series,
    // not off the field — is what says so.
    await field.fill('Elba Sommer')
    await field.press('Enter')
    await expect(page.getByTestId('header-title')).toHaveText('Elba Sommer')
  })

  test('E2E-M16-02: notes and checklist land on a profile that did not exist', async ({ page }) => {
    await createTripViaWizard(page, { name: 'Elba 2026', series: SERIES })

    await openSeries(page, SERIES)
    // FR-13.3: the profile is created lazily — nothing has written one, so
    // the checklist states its own emptiness rather than rendering rows.
    await expect(visible(page).getByTestId('m16-checklist-empty')).toBeVisible()
    await expect(visible(page).getByTestId('m16-checklist-row')).toHaveCount(0)

    const notes = visible(page).getByTestId('m16-notes').locator('textarea')
    await notes.fill('Waschmaschine vorhanden')
    await notes.blur()

    await visible(page).getByTestId('m16-checklist-input').locator('input').fill('Sonnencreme')
    await chooseInSelect(page, 'm16-checklist-mode', 'Buy there')
    await visible(page).getByTestId('m16-checklist-add').click()
    await expect(visible(page).getByTestId('m16-checklist-row')).toHaveCount(1)

    // Both writes went to a profile row `ensureDestinationProfile` had to
    // create first, so the read-back is what proves it exists: leave and
    // return, and the notes and the entry — with its mode — are still there.
    await openSeries(page, SERIES)
    await expect(visible(page).getByTestId('m16-notes')).toContainText('Waschmaschine vorhanden')
    const entry = visible(page).getByTestId('m16-checklist-row')
    await expect(entry).toContainText('Sonnencreme')
    await expect(entry).toContainText('Buy there')
    await expect(visible(page).getByTestId('m16-checklist-empty')).toHaveCount(0)

    await visible(page).getByTestId('m16-checklist-remove').click()
    await expect(visible(page).getByTestId('m16-checklist-row')).toHaveCount(0)
    await expect(visible(page).getByTestId('m16-checklist-empty')).toBeVisible()
  })

  test('E2E-M16-03: the history counts its trips, and detach and attach move one', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Elba 2026', series: SERIES })
    await createTripViaWizard(page, { name: 'Elba 2027', series: SERIES })
    await createTripViaWizard(page, { name: 'Wochenende', travelers: ['Andy'] })

    await openSeries(page, SERIES)
    await expect(visible(page).getByTestId('m16-trip-Elba 2026')).toBeVisible()
    // FR-13.2: the row carries the trip's own numbers, not just its name.
    await expect(visible(page).getByTestId('m16-trip-Elba 2027')).toContainText('packed')
    // A trip in no series is not history — it is what attach offers.
    await expect(visible(page).getByTestId('m16-trip-Wochenende')).toHaveCount(0)

    // Detach sits on a row that is itself a link to the trip: the gesture
    // has to remove the trip from the series *without* opening it, which is
    // why the assertion is that M16 is still the rendered page.
    await visible(page).getByTestId('m16-detach-Elba 2027').click()
    await expect(visible(page).getByTestId('m16-trip-Elba 2027')).toHaveCount(0)
    await expect(page.getByTestId('header-title')).toHaveText(SERIES)

    await chooseInSelect(page, 'm16-attach', 'Wochenende')
    await expect(visible(page).getByTestId('m16-trip-Wochenende')).toBeVisible()

    // Read back on M2, the screen that groups by series: the attach wrote
    // the trip's `series_id`, not a list local to this page.
    await page.goto(PATH.trips)
    await expect(visible(page).getByTestId(`series-header-${SERIES}`)).toContainText('2 trips')
  })

  test('E2E-M16-04: the series hands its defaults to a new trip, and its trends to M12', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Elba 2026', series: SERIES })

    // Before the default exists, the wizard's optional summary names the
    // series and nothing else — the state the prefill assertion below would
    // otherwise be indistinguishable from.
    await openSeries(page, SERIES)
    await visible(page).getByTestId('m16-new-trip').click()
    await expect(visible(page).getByTestId('wizard-step-1')).toBeVisible()
    await expect(visible(page).getByTestId('wizard-more-summary')).toContainText(SERIES)
    await expect(visible(page).getByTestId('wizard-more-summary')).not.toContainText('Winter')

    await openSeries(page, SERIES)
    await chooseInSelect(page, 'm16-season', 'Winter')
    await visible(page).getByTestId('m16-new-trip').click()

    // FR-15.1: the defaults are the wizard's prefill source, and the
    // summary is where M3 states what the folded step is carrying.
    await expect(visible(page).getByTestId('wizard-more-summary')).toContainText(SERIES)
    await expect(visible(page).getByTestId('wizard-more-summary')).toContainText('Winter')

    // The trends shortcut opens M12 on the series' most recent trip —
    // rendered, not merely routed.
    await openSeries(page, SERIES)
    await visible(page).getByTestId('m16-trends').click()
    await expect(visible(page).getByTestId('analytics-dim-person')).toBeVisible()
  })

  /**
   * E2E-M16-05 (FR-13.4, ADR-106), the local leg: a series task is written
   * through the profile nothing has created yet, its line names the lead, and
   * the sheet names the day that lead gives the series' next trip. The clock
   * is set because the next trip is the soonest one still ahead of today.
   */
  test('E2E-M16-05: a series task is written through the lazy profile and keeps its lead', async ({
    page,
  }) => {
    await setClock(page, '2026-10-05T09:00:00+02:00')
    await createTripViaWizard(page, {
      name: 'Elba 2027',
      series: SERIES,
      startDate: '2026-11-02',
      endDate: '2026-11-08',
    })
    await openSeries(page, SERIES)

    const add = visible(page).getByTestId('m16-task-add')
    await expect(add).toBeVisible()
    await expect(visible(page).getByTestId('m16-task-row')).toHaveCount(0)

    await add.click()
    const sheet = page.getByTestId('m16-task-sheet')
    await expect(sheet).toBeVisible()
    await sheet.getByTestId('m16-task-sheet-lead-7').click()
    await expect(sheet.getByTestId('m16-task-sheet-next-day')).toHaveText(
      `${SERIES_TASK_DAY} for “Elba 2027”`,
    )
    await fillIonic(sheet.getByTestId('m16-task-sheet-text'), 'Book the ferry')
    await sheet.getByTestId('m16-task-sheet-text').locator('input').press('Enter')
    await sheet.getByTestId('m16-task-sheet-close').click()
    await expect(sheet).toBeHidden()

    const row = visible(page).getByTestId('m16-task-row').filter({ hasText: 'Book the ferry' })
    await expect(row.getByTestId('m16-task-lead')).toHaveText('1 week before departure')

    // An edit changes the lead on the same line rather than adding one.
    await row.click()
    await expect(sheet).toBeVisible()
    await sheet.getByTestId('m16-task-sheet-lead-14').click()
    await sheet.getByTestId('m16-task-sheet-close').click()
    await expect(sheet).toBeHidden()
    await expect(row.getByTestId('m16-task-lead')).toHaveText('2 weeks before departure')
    await expect(visible(page).getByTestId('m16-task-row')).toHaveCount(1)

    // Typed and then a chip at once: the chip's own press is what blurs the
    // field and writes the task, and the chip still lands.
    await add.click()
    await expect(sheet).toBeVisible()
    await fillIonic(sheet.getByTestId('m16-task-sheet-text'), 'Reserve the ibex hike')
    await sheet.getByTestId('m16-task-sheet-lead-28').click()
    await expect(sheet.getByTestId('m16-task-sheet-lead-28')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await sheet.getByTestId('m16-task-sheet-close').click()
    await expect(sheet).toBeHidden()
    const typed = visible(page)
      .getByTestId('m16-task-row')
      .filter({ hasText: 'Reserve the ibex hike' })
    await expect(typed.getByTestId('m16-task-lead')).toHaveText('4 weeks before departure')
    await expect(visible(page).getByTestId('m16-task-row')).toHaveCount(2)

    // Read back from the store after leaving the screen. Local Mode has no
    // directory, so the line carries no seat — read against its lead text.
    await writesLanded(page)
    await openSeries(page, SERIES)
    await expect(row.getByTestId('m16-task-lead')).toHaveText('2 weeks before departure')
    await expect(row.getByTestId('m16-task-seat')).toHaveCount(0)
  })

  test('E2E-G9 coverage: back from the series profile renders the trip list', async ({ page }) => {
    await createTripViaWizard(page, { name: 'Elba 2026', series: SERIES })

    await openSeries(page, SERIES)
    await page.getByTestId('header-back').click()

    await expect(visible(page).getByTestId('trip-row-Elba 2026')).toBeVisible()
  })
})
