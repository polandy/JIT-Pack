import {
  test,
  expect,
  createTripViaWizard,
  openQuickAdd,
  tripAction,
  expectTripOpen,
  visiblePage as visible,
} from './fixtures'
import type { Page } from '@playwright/test'
import { PATH } from './routes'

/**
 * M1 — Dashboard (UI-Test-Spec §4, unit "M1 dashboard").
 *
 * The **populated** dashboard, which until the 2026-08-30 audit of backlog
 * item 6 no test had ever rendered: three `data-testid`s stood on the
 * screen, all three in its empty state, and the visual baseline is taken on
 * a fresh Local Mode with no trips. Every case here therefore needs an
 * *active* trip — the wizard leaves one in `planning`, which M1 does not
 * show at all, so the trip is started through M4's own menu.
 *
 * Local Mode throughout: what M1 aggregates is read out of the stores, and
 * the two clauses of its spec that need a server (delegation highlighting,
 * live badge counts — E2E-M1-03) describe a surface that is not built.
 */

const TRIP = { name: 'Samedan Sommer', endDate: '2026-12-31', travelers: ['Andy'] }

/** Four rows: the smallest list on which "three and a remainder" is visible. */
const ITEMS = ['Zelt', 'Schlafsack', 'Kocher', 'Stirnlampe']

/** Adds rows through the quick-add, which is the only add path M4 has. */
async function quickAdd(page: Page, names: string[]) {
  await openQuickAdd(page)
  for (const name of names) {
    await page.getByTestId('quick-add-input').locator('input').fill(name)
    await page.getByTestId('quick-add-confirm').click()
    await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
  }
  await page.keyboard.press('Escape')
}

/** An active trip with the given rows on it, left on M4. */
async function activeTripWith(page: Page, items: string[]) {
  await createTripViaWizard(page, TRIP)
  await tripAction(page, 'start')
  await quickAdd(page, items)
}

test.describe('M1 dashboard @local @m1', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M1-01 (FR-6.1), with the built half of E2E-M1-04 (FR-6.3/G-4).
   *
   * The card counts what is open and previews **three** of it, which is the
   * one number on this screen that can be wrong without looking wrong:
   * a preview of everything and a preview of the first three are the same
   * picture on a short list. Four rows is the smallest list that tells them
   * apart, and the "+1 more" line is where the remainder has to show up.
   *
   * The empty state is asserted absent beside it — not for its own sake but
   * because it is the positive signal that the trip is *active*: M1 filters
   * on the status, so a wizard trip nobody started renders exactly the same
   * screen as no trip at all.
   */
  test('E2E-M1-01: an active trip is a card counting what is open and previewing three of it', async ({
    page,
  }) => {
    await activeTripWith(page, ITEMS)
    await page.goto(PATH.dashboard)

    const card = visible(page).getByTestId(`dashboard-trip-${TRIP.name}`)
    await expect(card).toBeVisible()
    await expect(visible(page).getByTestId('dashboard-empty')).toHaveCount(0)

    const summary = visible(page).getByTestId(`dashboard-summary-${TRIP.name}`)
    await expect(summary).toContainText('0/4 packed')
    await expect(summary).toContainText('4 open')

    // Three of the four, and the fourth counted rather than dropped.
    // *Which* three is deliberately not asserted: the preview is the first
    // three of the store's own array, whose order after a reload is
    // IndexedDB's key order over random ids — so "the next 3" in the spec
    // names an ordering neither this screen nor the store defines (found
    // 2026-08-30; the case flaked on it before it asserted the rule the
    // screen actually keeps).
    await expect(card.locator('[data-testid^="dashboard-preview-"]')).toHaveCount(3)
    const previewed = await card
      .locator('[data-testid^="dashboard-preview-"]')
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute('data-testid')!.replace('dashboard-preview-', '')),
      )
    expect(ITEMS).toEqual(expect.arrayContaining(previewed))
    await expect(card.getByTestId(`dashboard-more-${TRIP.name}`)).toHaveText('+1 more')

    // E2E-M1-04's built half: the card is the way into the trip. (Landing
    // *at the item* is not built — the preview rows are not links.)
    await card.click()
    await expectTripOpen(page, TRIP.name)
  })

  /**
   * E2E-M1-02 (FR-7.3): the prep card, and that ticking a todo on it is a
   * real resolution rather than a row leaving the screen.
   *
   * The card disappearing proves only that this view stopped listing the
   * todo, which is also what a purely local toggle would look like. So the
   * case follows the card into the trip it came from and reads M4's prep
   * badge, which counts *open* preparation off the todos themselves
   * (FR-7.3's "derived, never stored") — the row still on the list is the
   * positive signal beside that absence.
   */
  test('E2E-M1-02: the prep card lists open todos by item, and ticking one resolves it', async ({
    page,
  }) => {
    const TODO = 'Akku laden'
    await activeTripWith(page, ['Kamera'])

    await visible(page).getByTestId('m4-row-Kamera').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId('m5-todo-input').locator('input').fill(TODO)
    await page.getByTestId('m5-todo-add').click()
    await expect(page.getByTestId(`m5-todo-${TODO}`)).toBeVisible()
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    await page.goto(PATH.dashboard)

    const prep = visible(page).getByTestId('dashboard-prep')
    await expect(prep).toContainText('Prep to do (1)')
    // Grouped by item (the FR's own word), not a flat list of task bodies.
    await expect(prep.getByTestId('dashboard-prep-item-Kamera')).toBeVisible()
    await expect(prep.getByTestId(`dashboard-todo-${TODO}`)).toBeVisible()

    await prep.getByTestId(`dashboard-todo-${TODO}`).locator('ion-checkbox').click()

    // The trip's only open todo is resolved, so the card has nothing left.
    await expect(visible(page).getByTestId('dashboard-prep')).toHaveCount(0)

    // And it resolved it *on the trip*: M4's badge counts open preparation.
    await visible(page).getByTestId(`dashboard-trip-${TRIP.name}`).click()
    await expectTripOpen(page, TRIP.name)
    await expect(visible(page).getByTestId('m4-row-Kamera')).toBeVisible()
    await expect(visible(page).getByTestId('m4-prep-badge-Kamera')).toHaveCount(0)
  })

  /**
   * E2E-M1-08 (FR-6.1): the lookahead — a trip that is planned but not yet
   * started is on the dashboard, and it is on it *as* something planned.
   *
   * Both halves matter and neither is enough alone. Asserting the section
   * only would pass on a screen that had simply stopped filtering by status
   * and listed the trip twice; asserting the absence of the active card only
   * would pass on the screen this case was written against, which showed the
   * trip nowhere at all. Starting the trip at the end is the positive signal
   * behind that absence: the same trip changes sides, so the section is
   * keyed on the status rather than on being a leftover.
   */
  test('E2E-M1-08: a planned trip is listed as planned, and starting it moves it', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Elba', startDate: '2027-05-01' })
    await page.goto(PATH.dashboard)

    const planned = visible(page).getByTestId('dashboard-planned')
    await expect(planned).toContainText('Planned (1)')
    // The one thing this card says about the trip besides its name: when it
    // leaves, through the app's single temporal formatter.
    await expect(planned.getByTestId('dashboard-planned-Elba')).toContainText('from')
    // Not also a trip card, and not the empty state — a planned trip is
    // neither running nor nothing.
    await expect(visible(page).getByTestId('dashboard-trip-Elba')).toHaveCount(0)
    await expect(visible(page).getByTestId('dashboard-empty')).toHaveCount(0)

    // The row leads to the trip, the way an active card does.
    await planned.getByTestId('dashboard-planned-Elba').click()
    await expectTripOpen(page, 'Elba')

    await tripAction(page, 'start')
    await page.goto(PATH.dashboard)
    await expect(visible(page).getByTestId('dashboard-trip-Elba')).toBeVisible()
    await expect(visible(page).getByTestId('dashboard-planned')).toHaveCount(0)
  })
})

/**
 * M1's three unbuilt promises, built 2026-08-31 on the owner's ruling.
 *
 * `DashboardPage.vue` read neither `packer_user_id` nor the Late-Packer flag,
 * and its prep card's item name was a `<p>`. All three had stood in UI-Spec M1
 * since the concept round.
 */
test.describe('M1 — the three promises @local @m1', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M1-06 (FR-5.1): the Late-Packer section, on the departure day and on
  // no other. The date is computed by the case rather than waited for —
  // "today" is an input here, not a race.
  test('E2E-M1-06: the last things to pack appear on the departure day only', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)
    await createTripViaWizard(page, { name: 'Abfahrt heute', startDate: today })
    await tripAction(page, 'start')
    await quickAdd(page, ['Zahnbürste', 'Zelt'])

    // Flagged through M5's own toggle, which is the only path the app has.
    await visible(page).getByTestId('m4-row-Zahnbürste').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    // The flag lives behind M5's *Details ▾* (§3.25's progressive disclosure).
    await page.getByTestId('m5-details').click()
    await page.getByTestId('m5-late').click()
    await page.getByTestId('m5-close').click()

    await page.goto(PATH.dashboard)
    const late = visible(page).getByTestId('dashboard-late')
    await expect(late).toBeVisible()
    await expect(late.getByTestId('dashboard-late-Zahnbürste')).toBeVisible()
    // Only the flagged row — a section listing everything is a second copy of
    // the trip card above it.
    await expect(late.getByTestId('dashboard-late-Zelt')).toHaveCount(0)

    // And the row leads to itself, which is what a list of things to do now is for.
    await late.getByTestId('dashboard-late-Zahnbürste').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
  })

  // E2E-M1-06b (FR-5.1): the same trip on a day that is not its departure day
  // shows no section. The positive signal is the trip card, which is on screen
  // either way — an absence read off a page that failed to load says nothing.
  test('E2E-M1-06b: a trip departing later contributes no last-things section', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Abfahrt später', startDate: '2027-06-01' })
    await tripAction(page, 'start')
    await quickAdd(page, ['Zahnbürste'])
    await visible(page).getByTestId('m4-row-Zahnbürste').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId('m5-details').click()
    await page.getByTestId('m5-late').click()
    await page.getByTestId('m5-close').click()

    await page.goto(PATH.dashboard)
    await expect(visible(page).getByTestId('dashboard-trip-Abfahrt später')).toBeVisible()
    await expect(visible(page).getByTestId('dashboard-late')).toHaveCount(0)
  })

  // E2E-M1-07 (FR-7.3): the prep card's item name is the way into its row.
  // It was a `<p>` with no handler; UI-Spec M1 has promised the jump since the
  // screen shipped, and M4's own prep section has always had it.
  test('E2E-M1-07: the prep card’s item name opens the row it names', async ({ page }) => {
    await activeTripWith(page, ['Kamera'])
    await visible(page).getByTestId('m4-row-Kamera').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId('m5-todo-input').locator('input').fill('Akku laden')
    await page.getByTestId('m5-todo-add').click()
    await page.getByTestId('m5-close').click()

    await page.goto(PATH.dashboard)
    await visible(page).getByTestId('dashboard-prep-item-Kamera').click()

    // The row's own sheet, not merely the trip: the name names a row.
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await expect(page.getByTestId(`m5-todo-Akku laden`)).toBeVisible()
  })

  // E2E-M1-03b (FR-6.1, G-8): the delegation section is *absent* in a mode
  // with no accounts, rather than present and empty. The identity half is
  // E2E-M1-03, in the `server` project — one browser cannot delegate.
  test('E2E-M1-03b: Local Mode carries no delegation section, and still lists everything', async ({
    page,
  }) => {
    await activeTripWith(page, ['Zelt'])
    await page.goto(PATH.dashboard)
    // The positive signal: the aggregation is there and unfiltered, which is
    // the whole reason FR-6.1's personal *filter* was struck.
    await expect(visible(page).getByTestId('dashboard-preview-Zelt')).toBeVisible()
    await expect(visible(page).getByTestId('dashboard-delegated')).toHaveCount(0)
  })
})
