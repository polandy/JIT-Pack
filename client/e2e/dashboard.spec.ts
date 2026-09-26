import {
  addInComposer,
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
import { addBuyRowOnM4, addTripTodo, openTasks, packRow } from './helpers/m4'
import { expectFiguresPaired, writesLanded } from './helpers/page'

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

/** A small phone, where M1's hero is too narrow for two figures side by side (FR-7.4). */
const PHONE = { width: 360, height: 780 }

/** Four rows: the smallest list on which "three and a remainder" is visible. */
const ITEMS = ['Zelt', 'Schlafsack', 'Kocher', 'Stirnlampe']

/** Adds rows through the quick-add, which is the only add path M4 has. */
async function quickAdd(page: Page, names: string[]) {
  await openQuickAdd(page)
  for (const name of names) {
    await addInComposer(page, name)
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
  test('E2E-M1-01: the active trip is the hero, counting what is open and previewing three of it', async ({
    page,
  }) => {
    await activeTripWith(page, ITEMS)
    await page.goto(PATH.dashboard)

    const card = visible(page).getByTestId(`dashboard-trip-${TRIP.name}`)
    await expect(card).toBeVisible()
    await expect(visible(page).getByTestId('dashboard-empty')).toHaveCount(0)

    // The counts are the hero's two lines now, not one summary sentence
    // (FR-21.13): the share in words beside the ring, and what is still
    // owed under it.
    await expect(card.getByTestId('hero-progress')).toHaveText('0/4 packed')
    await expect(card.getByTestId('hero-detail')).toHaveText('4 open')
    await expect(card.getByTestId('progress-ring')).toHaveAttribute('aria-label', '0%')

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

  /*
   * E2E-M1-09 (FR-21.13): one hero, and it is the trip departing soonest.
   *
   * The promise is a *singular*, so a screen with one trip cannot check it —
   * it would be green whether the rule said "the one" or "every one". Two
   * active trips is the smallest list that tells those apart.
   *
   * Both carry a departure date, and that is the case rather than the
   * fixture: the first version seeded two dateless trips and asserted which
   * one was the hero, which is an ordering *nothing defined* — it passed on
   * Chromium and failed on WebKit, where IndexedDB handed the rows back the
   * other way round. The fix was in the screen (`byDepartureSoonestFirst`),
   * not in the assertion.
   */
  test('E2E-M1-09: the trip departing soonest is the hero; the next is a card', async ({
    page,
  }) => {
    await createTripViaWizard(page, { ...TRIP, name: 'Elba 2026', startDate: '2026-11-02' })
    await tripAction(page, 'start')
    await createTripViaWizard(page, { ...TRIP, name: 'Samedan 2026', startDate: '2026-09-20' })
    await tripAction(page, 'start')
    await page.goto(PATH.dashboard)

    const heroes = visible(page).getByTestId('hero-name')
    await expect(heroes).toHaveCount(1)
    await expect(heroes).toHaveText('Samedan 2026')

    // The positive signal beside the absence: the later trip is on the
    // screen, as a card, so "no second hero" is a shape rather than a
    // missing trip.
    const later = visible(page).getByTestId('dashboard-trip-Elba 2026')
    await expect(later).toBeVisible()
    await expect(later.getByTestId('hero-name')).toHaveCount(0)
  })

  /**
   * E2E-M1-02 (FR-7.3/7.6): a row's preparation is a task of the trip on M1
   * too — it is listed in the *Tasks* card, named by the chip of the row it
   * prepares, and reported without anything to tick, because M1 takes no
   * actions. Resolving it where it lives is what clears
   * the card, which is the positive signal that the card reads the todos
   * rather than a copy of them.
   *
   * Until FR-7.6 this was a card of its own (*Prep to do*), grouped by item.
   * One card now, and the chip is what the grouping became.
   */
  test('E2E-M1-02: a row’s preparation is listed among the trip’s tasks, with nothing to tick', async ({
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

    const card = visible(page).getByTestId('dashboard-trip-todos')
    // The name is the section's head and the number its count (G-13), and
    // the block under it is the app's card rather than Ionic's (G-14,
    // FR-21.28) — M1 was the last screen drawing a card of its own.
    const head = visible(page).getByTestId('dashboard-trip-todos-head')
    await expect(head).toContainText('Tasks')
    await expect(head).toContainText('1')
    await expect(card).toHaveClass(/jp-card/)
    // The task itself, and the chip that says which row owes it.
    await expect(card.getByTestId(`dashboard-trip-todo-${TODO}`)).toBeVisible()
    await expect(card.getByTestId('task-item-Kamera')).toBeVisible()
    // Reported, not operated: nothing on the card can be ticked.
    await expect(card.locator('ion-checkbox')).toHaveCount(0)

    // Resolved where it lives, the card has nothing left to list — and says
    // so, which is where the merged card differs from the *Prep to do* one it
    // replaced: a trip whose tasks are all done is reported as done (FR-7.4),
    // not dropped. The task line going is the signal that the card reads the
    // todos rather than a copy of them.
    await card.getByTestId('task-item-Kamera').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId(`m5-todo-${TODO}`).click()
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
    await writesLanded(page)
    await page.goto(PATH.dashboard)
    await expect(visible(page).getByTestId(`dashboard-trip-${TRIP.name}`)).toBeVisible()
    const after = visible(page).getByTestId('dashboard-trip-todos')
    await expect(after.getByTestId(`dashboard-trip-todo-${TODO}`)).toHaveCount(0)
    await expect(after.getByTestId(`trip-todos-status-${TRIP.name}`)).toHaveText('✓ All tasks done')
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
    const plannedHead = visible(page).getByTestId('dashboard-planned-head')
    await expect(plannedHead).toContainText('Planned')
    await expect(plannedHead).toContainText('1')
    // G-14/FR-21.28: the app's card, the one the hero above it is.
    await expect(planned).toHaveClass(/jp-card/)
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

  // E2E-M1-07 (FR-7.3/7.6): the chip on a task is the way into the row that
  // owes it. UI-Spec M1 has promised the jump since the screen shipped; what
  // carries it since FR-7.6 is the chip rather than a card of item names.
  test('E2E-M1-07: the chip on a task opens the row it names', async ({ page }) => {
    await activeTripWith(page, ['Kamera'])
    await visible(page).getByTestId('m4-row-Kamera').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId('m5-todo-input').locator('input').fill('Akku laden')
    await page.getByTestId('m5-todo-add').click()
    await page.getByTestId('m5-close').click()

    await page.goto(PATH.dashboard)
    await visible(page).getByTestId('task-item-Kamera').click()

    // The row's own sheet, not merely the trip: the chip names a row.
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

  // --- FR-7.4: the trip's own todos, written in M4 and reported here ---

  /**
   * E2E-M1-10 (FR-7.4): M1 reports every active trip's open trip todos,
   * read-only, and leads into the trip where they are written.
   *
   * Two trips, one with todos and one without: the second's absence from the
   * card is only an assertion because the first is on it. A resolved todo
   * leaves the list while the trip's own check counts it, which says the list
   * filters by state rather than having missed the row.
   */
  test('E2E-M1-10: M1 lists open trip todos read-only and leads into the trip', async ({
    page,
  }) => {
    await createTripViaWizard(page, { ...TRIP, name: 'Elba 2026', startDate: '2026-11-02' })
    await tripAction(page, 'start')
    await activeTripWith(page, ['Zelt'])
    await addTripTodo(page, 'Water the plants')
    await addTripTodo(page, 'Empty the fridge')
    // Ticked on M25 since FR-7.7: M4's section keeps only the preparations
    // still due before the trip, and these are the trip's own chores.
    const tasks = await openTasks(page, 'before')
    await tasks.getByTestId('trip-todo-Empty the fridge').locator('ion-checkbox').click()
    await expect(tasks.getByTestId('trip-todo-Empty the fridge')).toHaveCount(0)
    await writesLanded(page)

    await page.goto(PATH.dashboard)
    const card = visible(page).getByTestId('dashboard-trip-todos')
    const group = card.getByTestId(`trip-todos-${TRIP.name}`)
    await expect(group.getByTestId(`trip-todos-status-${TRIP.name}`)).toHaveText('1 of 2 done')
    await expect(group.getByTestId('dashboard-trip-todo-Water the plants')).toBeVisible()
    await expect(group.getByTestId('dashboard-trip-todo-Empty the fridge')).toHaveCount(0)
    await expect(card.getByTestId('trip-todos-Elba 2026')).toHaveCount(0)
    // Elba is the hero here, so this trip is a following card, which keeps
    // its line; the hero's figure is E2E-M1-11.
    await expect(visible(page).getByTestId(`dashboard-tasks-${TRIP.name}`)).toHaveText(
      'Tasks: 1 open',
    )

    // Reported, not operated: no control on the card.
    await expect(card.locator('ion-checkbox, ion-input, input, button')).toHaveCount(0)

    await group.getByTestId(`trip-todos-open-${TRIP.name}`).click()
    await expectTripOpen(page, TRIP.name)
    await expect(visible(page).getByTestId('m4-trip-todos')).toBeVisible()
    // The way on to where these tasks now live (FR-7.7).
    await expect(visible(page).getByTestId('m4-trip-todos-all')).toBeVisible()
  })

  /**
   * E2E-M1-11 (FR-7.4): packing and tasks are two answers, asserted both ways
   * on one trip.
   *
   * „The share did not change" is green on a card that never rendered one, so
   * every packing assertion here is a before/after pair on the same locator,
   * and each direction moves exactly one of the two figures.
   */
  test('E2E-M1-11: the task check and the packing share move independently', async ({ page }) => {
    await activeTripWith(page, ['Zelt'])
    await packRow(page, 'Zelt')
    await page.goto(PATH.dashboard)

    const hero = visible(page).getByTestId(`dashboard-trip-${TRIP.name}`)
    const share = hero.getByTestId('hero-progress')
    const tasks = hero.getByTestId(`dashboard-tasks-${TRIP.name}`)

    // Fully packed, and no trip todo: no second figure at all.
    await expect(share).toHaveText('1/1 packed')
    await expect(tasks).toHaveCount(0)

    // An open todo leaves the trip fully packed.
    await hero.click()
    await expectTripOpen(page, TRIP.name)
    await addTripTodo(page, 'Water the plants')
    await page.goto(PATH.dashboard)
    await expect(tasks).toHaveText('0/1 tasks')
    await expect(share).toHaveText('1/1 packed')
    // Fully packed carries no detail, one open todo does: the pair still aligns.
    await expectFiguresPaired(hero)
    // And on a phone, where the two columns do not fit, it stacks rather than
    // cutting a sentence short.
    const viewport = page.viewportSize()!
    await page.setViewportSize(PHONE)
    await expectFiguresPaired(hero)
    await page.setViewportSize(viewport)

    // Resolving it changes the task check and nothing else.
    await hero.click()
    await expectTripOpen(page, TRIP.name)
    const section = await openTasks(page, 'before')
    await section.getByTestId('trip-todo-Water the plants').locator('ion-checkbox').click()
    // Its one task done, the phase folds to its line at the end, counting it.
    await expect(section.getByTestId('m25-before-fold')).toHaveText(
      'Before the trip · nothing open · 1 done',
    )
    await writesLanded(page)
    await page.goto(PATH.dashboard)
    await expect(tasks).toHaveText('1/1 tasks')
    await expect(share).toHaveText('1/1 packed')

    // The reverse: unpacking moves the share, the task check stays done.
    await hero.click()
    await expectTripOpen(page, TRIP.name)
    await visible(page).getByTestId('m4-done-bar').click()
    await visible(page)
      .getByTestId('m4-row-Zelt')
      .getByTestId('row-check')
      .locator('ion-checkbox')
      .click()
    await writesLanded(page)
    await page.goto(PATH.dashboard)
    await expect(share).toHaveText('0/1 packed')
    await expect(tasks).toHaveText('1/1 tasks')
  })
})

/**
 * FR-30.7: a trip's shopping list on the dashboard, and workable there — the
 * one card on M1 that is (owner decision 2026-09-19). A running trip always
 * has its card, opened on the destination list; a planned trip has one while
 * something is left to buy, opened on the list before departure. The card
 * also leads onto M6 (FR-30.5).
 */
test.describe('M1 — the shopping list on the dashboard @local @m1', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M1-12: each trip shows its shopping card on the list that is now, and leads onto M6', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await tripAction(page, 'start')
    await addBuyRowOnM4(page, 'Sonnencreme', 'Buy there')

    // Two planned trips: one with something to buy before departure, one without.
    await createTripViaWizard(page, { name: 'Elba 2027', startDate: '2027-07-01' })
    await addBuyRowOnM4(page, 'Adapter', 'Buy before')
    await createTripViaWizard(page, { name: 'Ruhig 2027', startDate: '2027-08-01' })
    await writesLanded(page)

    await page.goto(PATH.dashboard)
    const running = visible(page).getByTestId(`dashboard-shopping-${TRIP.name}`)
    await expect(running.getByTestId('dash-shop-tab-local')).toHaveAttribute('aria-pressed', 'true')
    await expect(running.getByTestId('dash-shop-row')).toHaveText([/Sonnencreme/])
    await expect(running.getByTestId('dash-shop-row')).toContainText(['Packing list'])

    const planned = visible(page).getByTestId('dashboard-shopping-Elba 2027')
    await expect(planned).toContainText('Shopping · Elba 2027')
    await expect(planned.getByTestId('dash-shop-tab-before')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(planned.getByTestId('dash-shop-row')).toHaveText([/Adapter/])
    // Nothing to buy on the quiet one, so it has no card — asserted beside its
    // row in the planned list, which is rendered.
    await expect(visible(page).getByTestId('dashboard-planned-Ruhig 2027')).toBeVisible()
    await expect(visible(page).getByTestId('dashboard-shopping-Ruhig 2027')).toHaveCount(0)

    await running.getByTestId('dash-shop-more').click()
    const m6 = visible(page).getByTestId('m6-page')
    await expect(m6).toBeVisible()
    await expect(page.getByTestId('trip-view-shopping')).toHaveAttribute('aria-current', 'page')
  })

  test('E2E-M1-13: the card checks off, undoes and adds — and M4 and M6 agree', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await tripAction(page, 'start')
    await addBuyRowOnM4(page, 'Sonnencreme', 'Buy there')
    await writesLanded(page)
    await page.goto(PATH.dashboard)
    const card = visible(page).getByTestId(`dashboard-shopping-${TRIP.name}`)

    // Added on the dashboard: an entry of the list it shows.
    await card.getByTestId('dash-shop-add-input').fill('Milch')
    await card.getByTestId('dash-shop-add-submit').click()
    await expect(card.getByTestId('dash-shop-row')).toHaveText([/Milch/, /Sonnencreme/])

    // Checked off, then taken back from the card itself.
    await card
      .getByTestId('dash-shop-row')
      .filter({ hasText: 'Milch' })
      .locator('ion-checkbox')
      .click()
    await expect(card.getByTestId('dash-shop-undo')).toContainText('“Milch” bought')
    await card.getByTestId('dash-shop-undo-button').click()
    await expect(card.getByTestId('dash-shop-row')).toHaveText([/Milch/, /Sonnencreme/])

    // The packing row bought at the destination is packed (FR-3.3), which
    // M1's own share says before anything else is opened.
    await card
      .getByTestId('dash-shop-row')
      .filter({ hasText: 'Sonnencreme' })
      .locator('ion-checkbox')
      .click()
    await expect(card.getByTestId('dash-shop-row')).toHaveText([/Milch/])
    await expect(visible(page).getByTestId(`dashboard-trip-${TRIP.name}`)).toContainText(
      '1/1 packed',
    )
    await writesLanded(page)

    // And M6 reads the same list: Milch open, Sonnencreme under the reveal.
    await card.getByTestId('dash-shop-more').click()
    const m6 = visible(page).getByTestId('m6-page')
    const local = m6.getByTestId('m6-local')
    await expect(local.getByTestId('m6-row')).toHaveText([/Milch/])
    await local.getByTestId('m6-bought-bar').click()
    await expect(local.getByTestId('m6-bought-row')).toHaveText([/Sonnencreme/])
  })
})
