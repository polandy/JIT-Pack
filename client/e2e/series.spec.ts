import {
  test,
  expect,
  chooseInSelect,
  createTripViaWizard,
  visiblePage as visible,
} from './fixtures'
import type { Page } from '@playwright/test'

/**
 * M16 — Series & Destination Profile (UI-Test-Spec §4, unit "M16 series").
 *
 * The screen was built in July and, until this unit, had never been
 * rendered by a test at any layer — it carried no `data-testid` at all,
 * which is the signature the M20 pass named. Everything it offers is a
 * *write*: the series name (refused onto a taken one), the three
 * defaults M3 prefills from, a destination profile that does not exist
 * until something is typed into it, its checklist, and attach/detach on
 * the trip history. So each case here reads its result back somewhere
 * other than the control that made it — from the store after leaving the
 * screen, or from M3, which is what the defaults are *for*.
 */

const SERIES = 'Elba'
const OTHER_SERIES = 'Ticino'
/** `wizard.unset` — what a default that was never set reads as. */
const UNSET = '—'

/**
 * M2's series header is M16's only door today. It is one locator on
 * purpose: E2E-M2-15 has the grouping open with the owner, and when that
 * lands this helper is the whole of what changes.
 */
async function openSeries(page: Page, name: string) {
  await page.goto('/tabs/trips')
  await visible(page).getByTestId(`series-header-${name}`).click()
  await expect(page.getByTestId('header-title')).toHaveText(name)
}

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
    const seasonOf = (p: typeof page) => visible(p).getByTestId('m16-season').locator('.select-text')
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
    await page.goto('/tabs/trips')
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

  test('E2E-G9 coverage: back from the series profile renders the trip list', async ({ page }) => {
    await createTripViaWizard(page, { name: 'Elba 2026', series: SERIES })

    await openSeries(page, SERIES)
    await page.getByTestId('header-back').click()

    await expect(visible(page).getByTestId('trip-row-Elba 2026')).toBeVisible()
  })
})
