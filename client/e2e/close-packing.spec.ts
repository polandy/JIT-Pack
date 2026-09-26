import {
  test,
  expect,
  addInComposer,
  createTripViaWizard,
  openQuickAdd,
  openTripView,
  tripAction,
  expectTripActionAbsent,
  expectTripActionOffered,
  visiblePage,
  useReducedMotion,
  writesLanded,
} from './fixtures'
import { PATH } from './routes'
import {
  addBuyRowOnM4,
  addPrepTodo,
  openTasks,
  openTripTodos,
  packRow,
  startTrip,
  tripWithRows,
} from './helpers/m4'

/**
 * FR-5.10 — finishing the packing, and FR-30.8's consequence for M6.
 *
 * The step this unit is about is the one most trips take before the
 * lifecycle's: the bag is shut, and whatever is still on the list was left
 * behind on purpose (FR-5.5) rather than forgotten. Three promises are
 * separable and separately breakable, so they are separate cases: what the
 * write does to the rows, what a *half-packed* row becomes, and what a
 * finished list still lets you do.
 *
 * **Reduced motion**, as in `closing-pass.spec.ts`: the production code takes
 * its own no-motion path, so the outcome is asserted rather than a transition.
 */
useReducedMotion(test)

/**
 * Which of M6's two lists a new entry is filed on (FR-30.8), read off the
 * composer: the pressed list chip while *before departure* still takes one,
 * and no chips at all once it does not — then every entry is for the
 * destination.
 */
async function expectComposingFor(
  page: import('@playwright/test').Page,
  list: 'before' | 'local',
): Promise<void> {
  const m6 = visiblePage(page).getByTestId('m6-page')
  await expect(m6.getByTestId('m6-composer')).toBeVisible()
  if (list === 'before') {
    await expect(m6.getByTestId('m6-list-before')).toHaveAttribute('aria-pressed', 'true')
  } else {
    await expect(m6.getByTestId('m6-composer-list')).toHaveCount(0)
  }
}

/**
 * The question, however it was raised — the ⋮ or the last row packed. Not
 * scoped to the visible page: an `ion-modal` is teleported to the app root,
 * so the sheet lives outside the router outlet it was opened from.
 */
function closeSheet(page: import('@playwright/test').Page) {
  return page.getByTestId('m4-close-sheet')
}

/** Answer it (FR-5.10, variant A of the round). */
async function confirmClose(page: import('@playwright/test').Page) {
  await expect(closeSheet(page)).toBeVisible()
  await page.getByTestId('m4-close-sheet-confirm').click()
  await expect(page.getByTestId('m4-close-sheet')).toHaveCount(0)
  await writesLanded(page)
}

test.describe('FR-5.10 — the packing is finished @local @m4', () => {
  test.slow()

  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M4-139: the whole shape in one pass — the question names what it is
   * about to do, the open row becomes a decision, the list says it is
   * finished, the step stops being offered, and one undo takes it all back.
   */
  test('E2E-M4-139: closing the packing decides what is left, and one undo takes it back', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt', 'Regenjacke'], 'Abschluss')
    await startTrip(page)
    await packRow(page, 'Zelt')

    await tripAction(page, 'closePacking')
    // The question states the count before anything is written; „1" is the
    // one row still open, not the two on the list.
    await expect(closeSheet(page)).toContainText('1 open item')
    await confirmClose(page)

    // The row that was open is a decision now: off the working list, and
    // behind the reveal that names how many were left behind (FR-25.2).
    await expect(visiblePage(page).getByTestId('m4-row-Regenjacke')).toHaveCount(0)
    const card = visiblePage(page).getByTestId('m4-packing-closed')
    await expect(card).toBeVisible()
    await expect(visiblePage(page).getByTestId('m4-packing-closed-stamp')).toContainText('1')

    // A second close would re-decide rows nobody touched, so it is gone.
    await expectTripActionAbsent(page, 'closePacking')

    // One undo for the batch (FR-25.31): the row is back, open, and so is
    // the packing — the card that said otherwise is gone with it.
    await page.locator('ion-toast.pack-toast').getByRole('button', { name: /undo/i }).click()
    await expect(visiblePage(page).getByTestId('m4-row-Regenjacke')).toBeVisible()
    await expect(card).toHaveCount(0)
    await expectTripActionOffered(page, 'closePacking')
  })

  /**
   * E2E-M4-145 (FR-25.2 with FR-5.10): the bar names what it counts. Two rows
   * stand behind it and only one of them was packed — the other was left
   * behind on purpose by the close — so a word that is true of both is the
   * only honest one. It read „2 packed" until 2026-09-21, which FR-25.2's own
   * sentence contradicted from the start (a skipped row *is* a done row); the
   * close is what made the wrong half the ordinary case rather than the rare
   * one, because it decides every remaining row in a single act.
   *
   * Both directions are asserted. The label is built twice in the template,
   * once per direction, and the pair has drifted apart here before — the log
   * records a bar that read „Show 3 packed" and then „Hide 5 packed" for the
   * same rows.
   */
  test('E2E-M4-145: the reveal bar counts a skipped row under a word that is true of it', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt', 'Regenjacke'], 'Wortlaut')
    await startTrip(page)
    await packRow(page, 'Zelt')
    await tripAction(page, 'closePacking')
    await confirmClose(page)

    const bar = visiblePage(page).getByTestId('m4-done-bar')
    await expect(bar).toHaveText('Show 2 done')
    // The same word one element up, while the rows are still away: the state a
    // finished list shows is named for what it covers too, and one of the two
    // rows it covers here was never packed.
    await expect(visiblePage(page).getByTestId('packing-empty')).toContainText('All done')

    await bar.click()
    await expect(bar).toHaveText('Hide 2 done')
    // The second of the two, revealed: not packed, and counted all the same.
    await expect(visiblePage(page).getByTestId('m4-row-Regenjacke')).toContainText(
      /deliberately skipped/i,
    )
  })

  /**
   * E2E-M4-144 (FR-7.7): closing the packing is the moment „before the trip"
   * ends, so every task still open and still due before it crosses to
   * *during* — and the question says so before anything is written.
   *
   * Three things have to hold together, and each is a way this goes wrong on
   * its own: the **count in the question comes from the same plan the write
   * reads**, so it cannot say two while one moves; the task **leaves M4's
   * window and stands in M25's second section**, because the move is a write
   * and not a repaint; and **one undo takes back the rows and the tasks**,
   * since the record holds a single action at a time and a second undo would
   * have quietly cost the rows their way back.
   *
   * A resolved task is seeded beside the open one as the negative half: its
   * phase says when it *was* done, and a close that moved it would be
   * inventing a second history.
   */
  test('E2E-M4-144: finishing the packing moves the open tasks to the trip itself', async ({
    page,
  }) => {
    const trip = await tripWithRows(page, ['Zelt', 'Kulturbeutel'], 'Abschluss')
    await addPrepTodo(page, 'Kulturbeutel', 'Fetch the salve')
    await addPrepTodo(page, 'Kulturbeutel', 'Pack the toothbrush')
    // The one that must not move: done is done, in the phase it was done in.
    const window = await openTripTodos(page)
    await window.getByTestId('trip-todo-Pack the toothbrush').locator('ion-checkbox').click()
    await writesLanded(page)

    // Only the other row is packed: FR-7.3 keeps a packed row with an open
    // preparation on the list, so packing this one would be asserting against
    // a rule rather than with it. Closing decides it instead, which is the
    // batch the tasks have to ride in.
    await startTrip(page)
    await packRow(page, 'Zelt')

    // Taken back first, and from the frame the undo was armed in: a snackbar
    // belongs to the screen that raised it, so a case that navigates away
    // before reaching for it is testing nothing.
    await tripAction(page, 'closePacking')
    // One task moves, not two: the resolved one is not counted, and the
    // sentence is read off the plan the write will use.
    await expect(closeSheet(page)).toContainText('1 open task')
    await confirmClose(page)
    await expect(visiblePage(page).getByTestId('trip-todo-Fetch the salve')).toHaveCount(0)

    // One undo for the whole act: the row the close decided *and* the task it
    // moved come back together, because a second undo would have replaced the
    // first and one of the two would have lost its way back.
    await page.locator('ion-toast.pack-toast').getByRole('button', { name: /undo/i }).click()
    await expect(visiblePage(page).getByTestId('m4-packing-closed')).toHaveCount(0)
    const back = await openTripTodos(page)
    await expect(back.getByTestId('trip-todo-Fetch the salve')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m4-row-Kulturbeutel')).toBeVisible()
    await writesLanded(page)

    // Closed for good this time: off the packing list, and standing in the
    // trip's own section on M25.
    await tripAction(page, 'closePacking')
    await confirmClose(page)
    await writesLanded(page)
    await expect(visiblePage(page).getByTestId('trip-todo-Fetch the salve')).toHaveCount(0)
    const during = await openTasks(page, 'during')
    await expect(during.getByTestId('trip-todo-Fetch the salve')).toBeVisible()
    await page.goto(trip)
  })

  /**
   * E2E-M4-149 (FR-7.12): finishing the packing ends *before the trip* for the
   * shopping list too, and keeps it closed.
   *
   * Both kinds of purchase cross in the act — a packing row bought *before
   * departure* and the list's own entry — because the list is a module and the
   * second half travels a different contract; a close that moved only its own
   * rows would pass a case with one of them. The sheet counts both, the one
   * undo brings both back, and after the second close the two *before* places
   * are records: M6's and M25's *before* each fold to one line at the end
   * that says why it takes nothing, and neither composer offers it.
   * *Wieder öffnen* lifts both.
   */
  test('E2E-M4-149: finishing the packing moves the purchases and closes before', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Vorher zu')
    await addBuyRowOnM4(page, 'Sun hat', 'Buy before')
    const m6 = visiblePage(page).getByTestId('m6-page')
    await openTripView(page, 'shopping')
    await expectComposingFor(page, 'before')
    await m6.getByTestId('m6-add-input').locator('input').fill('Coffee')
    await m6.getByTestId('m6-add-submit').click()
    await expect(m6.getByTestId('m6-row').filter({ hasText: 'Coffee' })).toBeVisible()
    await writesLanded(page)

    await openTripView(page, 'packing')
    await tripAction(page, 'closePacking')
    await expect(page.getByTestId('m4-close-sheet-shopping')).toContainText('2 open purchases')
    await confirmClose(page)
    // Taken back from the frame that armed it: both purchases are before
    // departure again.
    await page.locator('ion-toast.pack-toast').getByRole('button', { name: /undo/i }).click()
    await expect(visiblePage(page).getByTestId('m4-packing-closed')).toHaveCount(0)
    await writesLanded(page)
    await openTripView(page, 'shopping')
    await expectComposingFor(page, 'before')
    await expect(m6.getByTestId('m6-before').getByTestId('m6-row')).toHaveText([
      /Sun hat/,
      /Coffee/,
    ])

    // Closed for good: both wait at the destination, and before departure is
    // the record of what was bought there.
    await openTripView(page, 'packing')
    await tripAction(page, 'closePacking')
    await confirmClose(page)
    await writesLanded(page)
    await openTripView(page, 'shopping')
    await expectComposingFor(page, 'local')
    await expect(m6.getByTestId('m6-local').getByTestId('m6-row')).toHaveText([/Sun hat/, /Coffee/])
    // Before the trip is one folded line at the end, and says why once open.
    const fold = m6.getByTestId('m6-before-fold')
    await expect(fold).toHaveText('Before the trip · closed')
    await expect(m6.getByTestId('m6-before-locked')).toHaveCount(0)
    await fold.click()
    await expect(m6.getByTestId('m6-before-locked')).toBeVisible()
    await expect(m6.getByTestId('m6-before').getByTestId('m6-row')).toHaveCount(0)

    // FR-7.14: the closed *before* is one folded line at the end, and the
    // composer writes for the road only.
    const before = await openTasks(page, 'before')
    await expect(visiblePage(page).getByTestId('m25-composer')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m25-phase-before')).toHaveCount(0)
    await before.getByTestId('m25-before-fold').click()
    await expect(before.getByTestId('m25-before-locked')).toBeVisible()

    // Reopened: both places take entries again, and nothing moved back.
    await openTripView(page, 'packing')
    await visiblePage(page).getByTestId('m4-reopen-packing').click()
    await writesLanded(page)
    const reopened = await openTasks(page, 'before')
    await expect(visiblePage(page).getByTestId('m25-phase-before')).toBeVisible()
    // Open again but empty: the plain line at the end, with no lock behind it.
    await expect(reopened.getByTestId('m25-before-fold')).toHaveText(
      /^Before the trip · nothing open/,
    )
    await openTripView(page, 'shopping')
    await expectComposingFor(page, 'before')
    await expect(m6.getByTestId('m6-before-fold')).toHaveText('Before the trip · nothing open')
    await expect(m6.getByTestId('m6-before').getByTestId('m6-row')).toHaveCount(0)
    await expect(m6.getByTestId('m6-local').getByTestId('m6-row')).toHaveText([/Sun hat/, /Coffee/])
  })

  /**
   * E2E-M4-140 (variant P1, owner 2026-09-20): four of six socks are in the
   * bag. The skip M4 already had would write quantity 0 and deny them; the
   * close shrinks the amount to what travelled instead, so the row reads as
   * packed and the trip's figure completes without lying about the bag.
   *
   * A quantity above one can only come from an import (spec §2.4), which is
   * also the only way to reach a *partially* packed row without six taps.
   */
  test('E2E-M4-140: a half-packed row keeps what is in the bag', async ({ page }) => {
    await page.goto(PATH.importFile)
    await page
      .getByTestId('portable-paste')
      .locator('textarea')
      .fill(
        [
          'kind: trip',
          'schema_version: 1',
          'name: Sockentest',
          'end_date: "2026-12-31"',
          'travelers: []',
          'containers: []',
          'items:',
          '  - name: Wandersocken',
          '    quantity: 6',
          '    packed_count: 0',
          '    category: Kleidung',
          '    mode: pack',
          '    late_packer: false',
        ].join('\n'),
      )
    await page.getByTestId('portable-preview').click()
    await page.getByTestId('portable-commit').click()

    const row = visiblePage(page).getByTestId('m4-row-Wandersocken')
    await expect(row).toBeVisible()
    for (let n = 0; n < 4; n += 1) await row.getByTestId('row-plus').click()
    await expect(row).toContainText('4/6')
    await writesLanded(page)

    await tripAction(page, 'closePacking')
    await confirmClose(page)

    // Packed, and packed *four* — not skipped, and not six either.
    await expect(visiblePage(page).getByTestId('m4-progress')).toContainText('4/4')
    // Nothing was left behind, so the card states the moment alone.
    await expect(visiblePage(page).getByTestId('m4-packing-closed')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m4-done-bar')).toContainText('1')
  })

  /**
   * E2E-M4-141: the list stays workable afterwards, which is the owner's own
   * requirement (2026-09-20) — something that travelled and was never listed
   * is added later, and it lands *packed* rather than as the one open job on
   * an otherwise finished trip.
   */
  test('E2E-M4-141: a finished list takes an addition as something already packed', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Nachtrag')
    await startTrip(page)
    // The last row going in offers the step by itself (E2E-M4-143); this
    // case takes the offer rather than reaching for the ⋮.
    await packRow(page, 'Zelt')
    await visiblePage(page).getByTestId('m4-close-prompt').click()
    await confirmClose(page)

    await openQuickAdd(page)
    // The composer says what an addition will become before it is typed.
    await expect(page.getByText('recorded as packed')).toBeVisible()
    await addInComposer(page, 'Zahnbürste')
    await page.keyboard.press('Escape')
    await writesLanded(page)

    // It did not reopen the packing: the card stands, the row is done, and
    // the trip's figure counts it as packed rather than as work left.
    await expect(visiblePage(page).getByTestId('m4-packing-closed')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m4-row-Zahnbürste')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m4-progress')).toContainText('2/2')
  })

  /**
   * E2E-M4-146 (FR-5.11, owner 2026-09-21): *„was ich vergessen habe zu
   * packen"*. Once the packing is closed an add answers what happened: it was
   * in the bag and not on the list (the default, E2E-M4-141), or it stayed
   * home. The second must not land *packed* (it is not in the bag) and must
   * not become an open job — it is a record for the next trip, so the figure
   * stays where it was and the row says what it is.
   */
  test('E2E-M4-146: a finished list takes an addition as forgotten, not as packed or open', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Vergessen')
    await startTrip(page)
    // Before the close there is no question to answer: the composer is as it was.
    await openQuickAdd(page)
    await expect(page.getByTestId('quick-add-choice')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await packRow(page, 'Zelt')
    await visiblePage(page).getByTestId('m4-close-prompt').click()
    await confirmClose(page)

    await openQuickAdd(page)
    await expect(page.getByTestId('quick-add-choice-packed')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await page.getByTestId('quick-add-choice-forgotten').click()
    await expect(page.getByTestId('quick-add-hint')).toContainText('forgotten')
    await addInComposer(page, 'Zahnbürste')
    await page.keyboard.press('Escape')
    await writesLanded(page)

    // The figure is the one it was before the add, and the row is not open.
    await expect(visiblePage(page).getByTestId('m4-progress')).toContainText('1/1')
    await expect(visiblePage(page).getByTestId('m4-row-Zahnbürste')).toHaveCount(0)

    // Behind the bar with the other decided rows, in its own words.
    await visiblePage(page).getByTestId('m4-done-bar').click()
    await expect(visiblePage(page).getByTestId('m4-row-Zahnbürste')).toContainText(
      'Forgotten to pack',
    )
  })

  /**
   * E2E-M4-143 (FR-5.10, owner 2026-09-20): the step is offered where the
   * moment is. Packing the last open row raises the same question the ⋮
   * asks — and it is still a *question*: nothing is written until it is
   * answered, and a reader who says *Later* is not asked again.
   */
  test('E2E-M4-143: packing the last row offers to finish, without taking the screen', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt', 'Regenjacke'], 'Letzte Zeile')
    await startTrip(page)
    await packRow(page, 'Zelt')
    // One row still open: no offer yet, or it would be reporting a moment
    // that has not happened.
    await expect(visiblePage(page).getByTestId('m4-close-prompt')).toHaveCount(0)

    await packRow(page, 'Regenjacke')

    const prompt = visiblePage(page).getByTestId('m4-close-prompt')
    await expect(prompt).toBeVisible()
    // In the empty state the list already shows, not over it: no sheet
    // opened itself, and the list underneath still answers a click — the
    // clause that failed on the modal build this replaced (ADR-060).
    await expect(closeSheet(page)).toHaveCount(0)
    await visiblePage(page).getByTestId('m4-done-bar').click()
    await expect(visiblePage(page).getByTestId('m4-row-Zelt')).toBeVisible()

    // Taken, then waved off with *Later*: it stays away, nothing is written,
    // and the ⋮ still carries the step.
    await visiblePage(page).getByTestId('m4-done-bar').click()
    await prompt.click()
    await expect(closeSheet(page)).toBeVisible()
    await page.getByTestId('m4-close-sheet-cancel').click()
    await expect(page.getByTestId('m4-close-sheet')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m4-close-prompt')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m4-packing-closed')).toHaveCount(0)
    await expectTripActionOffered(page, 'closePacking')
  })

  /**
   * E2E-M4-142: reopening is **not** the undo, and the difference is the
   * whole case — the snackbar's *Rückgängig* puts the rows back, while
   * *Wieder öffnen* lifts the stamp and leaves every decision standing. With
   * variant P1 the amount a half-packed row wanted is not recorded anywhere
   * after the close, so a reopen that restored rows would have to invent it.
   */
  test('E2E-M4-142: the card reopens the packing, and the rows it decided stay decided', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt', 'Regenjacke'], 'Wieder auf')
    await startTrip(page)
    await packRow(page, 'Zelt')
    await tripAction(page, 'closePacking')
    await confirmClose(page)
    // Every snackbar is taken off the page first — the outgoing pack toast and
    // the close's own — so nothing below here can be an undo's doing.
    await page
      .locator('ion-toast.pack-toast')
      .evaluateAll((toasts) => toasts.forEach((toast) => toast.remove()))

    await visiblePage(page).getByTestId('m4-reopen-packing').click()
    await writesLanded(page)

    await expect(visiblePage(page).getByTestId('m4-packing-closed')).toHaveCount(0)
    await expectTripActionOffered(page, 'closePacking')
    // The decision stands: the row is still off the working list, and still
    // behind the reveal that counts it.
    await expect(visiblePage(page).getByTestId('m4-row-Regenjacke')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m4-done-bar')).toContainText('2')
  })

  /**
   * E2E-M1-25 (FR-5.10 with FR-7.10 on M1): the phase has moved on, so the
   * dashboard's loudest element about packing stands down — and, since
   * 2026-09-21, no line takes its place. Asserted as a **pair**: the figure
   * gone *and* the phase said in the date line, because a card
   * that simply stopped saying anything would pass the first half.
   */
  test('E2E-M1-25: the dashboard lets a finished packing recede', async ({ page }) => {
    await tripWithRows(page, ['Zelt'], 'Dashboard-Phase')
    await startTrip(page)
    await packRow(page, 'Zelt')

    await page.goto(PATH.dashboard)
    const open = visiblePage(page).getByTestId('dashboard-trip-Dashboard-Phase')
    await expect(open.getByTestId('hero-phase')).toContainText(/Packen|Packing/)

    await open.getByTestId('hero-name').click()
    await tripAction(page, 'closePacking')
    await confirmClose(page)

    await page.goto(PATH.dashboard)
    const hero = visiblePage(page).getByTestId('dashboard-trip-Dashboard-Phase')
    await expect(hero).toBeVisible()
    await expect(hero.getByTestId('hero-progress')).toHaveCount(0)
    await expect(hero.getByTestId('hero-phase')).toContainText(/Vor Ort|On site/)
  })

  /**
   * E2E-M1-26 (FR-7.10): the hero's task block is worked in place. A task is
   * added in the block, ticked on its right-hand check, and comes back with
   * the snackbar's undo; the block folds and *stays folded* after a reload;
   * and adding to a folded block moves its count without unfolding it — the
   * absence needs the count as its positive signal.
   */
  test('E2E-M1-26: the hero’s task block adds, ticks and folds', async ({ page }) => {
    await tripWithRows(page, ['Zelt'], 'Dashboard-Aufgaben')
    await startTrip(page)
    await packRow(page, 'Zelt')
    await visiblePage(page).getByTestId('m4-close-prompt').click()
    await confirmClose(page)

    await page.goto(PATH.dashboard)
    const block = visiblePage(page).getByTestId('dashboard-tasks-Dashboard-Aufgaben')
    const count = block.getByTestId('dashboard-tasks-Dashboard-Aufgaben-count')
    await expect(block).toBeVisible()

    await block.getByTestId('dashboard-tasks-Dashboard-Aufgaben-add-input').fill('Post nachsenden')
    await block.getByTestId('dashboard-tasks-Dashboard-Aufgaben-add-submit').click()
    const row = block.getByTestId('dashboard-tasks-Dashboard-Aufgaben-row')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Post nachsenden')
    await expect(count).toHaveText('1')

    // The check sits to the right of the words: the positive signal for
    // „at the end", which a box at the start would fail.
    const words = await row.locator('.words').boundingBox()
    const check = await row.getByRole('checkbox').boundingBox()
    expect(check!.x).toBeGreaterThan(words!.x + words!.width - 1)

    await row.getByRole('checkbox').click()
    await expect(row).toHaveCount(0)

    // Folded: the head stays, the rows leave, and an added task moves the
    // count but not the fold.
    const fold = block.getByTestId('dashboard-tasks-Dashboard-Aufgaben-fold')
    await fold.click()
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await expect(block.getByTestId('dashboard-tasks-Dashboard-Aufgaben-add-input')).toBeVisible()
    await block.getByTestId('dashboard-tasks-Dashboard-Aufgaben-add-input').fill('Schlüssel geben')
    await block.getByTestId('dashboard-tasks-Dashboard-Aufgaben-add-submit').click()
    await expect(count).toHaveText('1')
    await expect(fold).toHaveAttribute('aria-expanded', 'false')

    await page.reload()
    await expect(
      visiblePage(page).getByTestId('dashboard-tasks-Dashboard-Aufgaben-fold').first(),
    ).toHaveAttribute('aria-expanded', 'false')

    // The way on is the block's own line — the head folds — and it leads to M25.
    // It is out of reach while the block is folded, so the fold is undone first.
    const foldAgain = visiblePage(page).getByTestId('dashboard-tasks-Dashboard-Aufgaben-fold')
    await foldAgain.click()
    await expect(foldAgain).toHaveAttribute('aria-expanded', 'true')
    await visiblePage(page).getByTestId('dashboard-tasks-Dashboard-Aufgaben-more').click()
    await expect(visiblePage(page).getByTestId('m25-page')).toBeVisible()
  })

  /**
   * E2E-M1-27 (FR-7.10): the hero's shopping block takes an entry in place,
   * checks it off on the right, and the head of the card — not the card —
   * leads into the trip: no control sits inside a link.
   */
  test('E2E-M1-27: the hero’s shopping block adds and buys, and the hero is not one link', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Dashboard-Einkauf')
    await startTrip(page)
    await packRow(page, 'Zelt')
    await visiblePage(page).getByTestId('m4-close-prompt').click()
    await confirmClose(page)

    await page.goto(PATH.dashboard)
    const block = visiblePage(page).getByTestId('dashboard-shopping-Dashboard-Einkauf')
    await block.getByTestId('dashboard-shopping-Dashboard-Einkauf-add-input').fill('Milch')
    await block.getByTestId('dashboard-shopping-Dashboard-Einkauf-add-submit').click()
    const row = block.getByTestId('dash-shop-row')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Milch')

    await row.getByRole('checkbox').click()
    await expect(row).toHaveCount(0)

    // No control inside a link: the tap on a check would be a navigation.
    const hero = visiblePage(page).getByTestId('dashboard-trip-Dashboard-Einkauf')
    await expect(hero.locator('a button, a input')).toHaveCount(0)
    await expect(hero.getByTestId('dashboard-open-packing')).toBeVisible()

    // The blocks' own lines lead on, and the way back to the packing list.
    await block.getByTestId('dashboard-shopping-Dashboard-Einkauf-more').click()
    await expect(visiblePage(page).getByTestId('m6-page')).toBeVisible()
    await page.goto(PATH.dashboard)
    await visiblePage(page).getByTestId('dashboard-open-packing').click()
    await expect(visiblePage(page).getByTestId('m4-packing-closed')).toBeVisible()
  })

  /**
   * E2E-M6-30 (FR-30.8): the shopping list stops filing new entries under
   * *Before the trip* once that moment is past. The trip here is still
   * *planning* — nobody tapped *Start trip* — which is exactly the case the
   * trip's phase alone gets wrong: the bag is shut the evening before. The
   * entry typed afterwards standing in *At destination* is the positive
   * signal behind the list chips' absence.
   */
  test('E2E-M6-30: M6 files new entries at the destination once the packing is finished', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Einkauf danach', travelers: ['Andy'] })
    const m6 = visiblePage(page).getByTestId('m6-page')

    await openTripView(page, 'shopping')
    await expectComposingFor(page, 'before')

    await openTripView(page, 'packing')
    await tripAction(page, 'closePacking')
    await confirmClose(page)

    await openTripView(page, 'shopping')
    await expectComposingFor(page, 'local')
    await m6.getByTestId('m6-add-input').locator('input').fill('Milk')
    await m6.getByTestId('m6-add-submit').click()
    await expect(m6.getByTestId('m6-local').getByTestId('m6-row')).toHaveText([/Milk/])
    await expect(m6.getByTestId('m6-before').getByTestId('m6-row')).toHaveCount(0)
  })
})
