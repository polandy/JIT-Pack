import { test, expect, visiblePage as visible } from './fixtures'
import {
  addPrepTodo,
  addTripTodo,
  chooseInRowMenu,
  openTasks,
  openTripTodos,
  removeTaskFromSheet,
  openRowMenu,
  startTrip,
  tripWithRows,
} from './helpers/m4'
import { createTripViaWizard } from './helpers/trips'
import { expectFiguresPaired, writesLanded } from './helpers/page'
import { fillIonic, setDateField } from './helpers/ionic'
import { PATH } from './routes'

/**
 * A trip's tasks (FR-7.4, FR-7.6, FR-7.7) — its own chores and the
 * preparations its rows owe. Split out of `packing-list.spec.ts` on
 * 2026-09-20: a task is not a packing row, and the section had grown its own
 * subject.
 *
 * Since FR-7.7 the one list is read through two windows, and this file covers
 * both: **M4** keeps the preparations still due before the trip (the ones you
 * do as part of packing), and **M25** holds every task of the trip in its two
 * phases. The cases below are grouped by the screen that makes the promise,
 * which is why three ids moved here from M4 — see the ledger.
 */

test.describe('M4 — the trip’s tasks (FR-7.4, FR-7.6) @local @m4', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M4-97 (FR-7.4): the todos are where the trip is read, not at its foot.
   *
   * The section sits above the list and opens by itself while anything is
   * owed — asserted after a reload, where no helper has touched the toggle —
   * and folds to its one line once nothing is. The header carries the second
   * figure beside the packing share, and tapping it is the way back in. The
   * fold's absence is asserted against its own status line, which is the
   * positive signal that the section rendered.
   */
  test('E2E-M4-97: trip todos head the list, open while owed, with a figure in the header', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    const section = visible(page).getByTestId('m4-trip-todos')
    const toggle = section.getByTestId('m4-trip-todos-toggle')
    const figure = visible(page).getByTestId('m4-trip-todos-figure')
    const fraction = figure.getByTestId('m4-trip-todos-progress')

    // No task yet: the section is only the way to them, and the header has no
    // second figure beside the share.
    await expect(visible(page).getByTestId('m4-progress')).toHaveText('0/1 packed')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(figure).toHaveCount(0)

    // FR-7.7: the window is made of preparations — what M4 keeps is what you
    // do as part of packing, and a trip's own chore is no longer in it.
    await addPrepTodo(page, 'Zelt', 'Water the plants')
    await addPrepTodo(page, 'Zelt', 'Empty the fridge')

    // Above the list, and open on arrival while anything is owed.
    await page.reload()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(section.getByTestId('trip-todo-Water the plants')).toBeVisible()
    await expect(fraction).toHaveText('While packing 0/2')
    // A pair: the packing share has no detail line and the todos do („2
    // open"), which is exactly the case that put the tracks on two levels.
    await expectFiguresPaired(visible(page).getByTestId('m4-header'))
    const sectionTop = (await section.boundingBox())!.y
    const rowTop = (await visible(page).getByTestId('m4-row-Zelt').boundingBox())!.y
    expect(sectionTop).toBeLessThan(rowTop)

    // Ticking the last one folds the section to its line.
    await section.getByTestId('trip-todo-Water the plants').locator('ion-checkbox').click()
    await expect(fraction).toHaveText('While packing 1/2')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await section.getByTestId('trip-todo-Empty the fridge').locator('ion-checkbox').click()
    await expect(section.getByTestId('m4-trip-todos-status')).toHaveText('✓ All tasks done')
    await expect(fraction).toHaveText('While packing 2/2')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(section.getByTestId('trip-todo-list')).toHaveCount(0)
    await writesLanded(page)

    // Still folded on the next visit; the header figure opens it.
    await page.reload()
    await expect(section.getByTestId('m4-trip-todos-status')).toHaveText('✓ All tasks done')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await figure.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(section.getByTestId('trip-todos-resolved')).toBeVisible()
  })

  /**
   * E2E-M4-136 (FR-7.6): a row's preparation is a task of the trip. It is
   * listed in the one section beside the trip's own, counted in the one
   * figure, and told apart by the chip that names its row — which is also the
   * way into that row.
   *
   * Every assertion is a pair, because "both kinds are here" is green on a
   * list that renders one of them twice: the preparation carries a chip and
   * the trip's own does not, and the ✕ is on the trip's own and not on the
   * preparation, which is removed where it lives.
   *
   * The row badge is the cross-signal that the section writes the row's own
   * todo rather than a copy: ticking the task in the section clears the badge
   * on the row, which reads its own store.
   */
  test('E2E-M4-136: a row’s preparation is a task of the trip, named by its row', async ({
    page,
  }) => {
    await tripWithRows(page, ['Kamera'], 'Samedan')
    await addPrepTodo(page, 'Kamera', 'Water the plants')
    await addPrepTodo(page, 'Kamera', 'Charge the battery')

    // One figure for both kinds (FR-7.6), and the header no longer says the
    // preparation count a second time in its detail line.
    const fraction = visible(page).getByTestId('m4-trip-todos-progress')
    await expect(fraction).toHaveText('While packing 0/2')
    await expect(visible(page).getByTestId('m4-header')).not.toContainText('preparation')

    const section = await openTripTodos(page)
    const prepared = section.getByTestId('trip-todo-Charge the battery')
    await expect(prepared.getByTestId('task-item-Kamera')).toBeVisible()
    // FR-7.6's ✕ rule, unchanged by FR-7.7: a preparation is removed on its
    // row, so the window offers none — and the seat it *did* gain is there.
    await expect(prepared.getByTestId('trip-todo-remove-Charge the battery')).toHaveCount(0)

    // Ticked here, cleared on the row: one todo, read by two surfaces.
    await expect(visible(page).getByTestId('m4-prep-badge-Kamera')).toContainText('2')
    await prepared.locator('ion-checkbox').click()
    await expect(fraction).toHaveText('While packing 1/2')
    await expect(visible(page).getByTestId('m4-prep-badge-Kamera')).toContainText('1')
    await writesLanded(page)
    await page.reload()
    await expect(visible(page).getByTestId('m4-trip-todos-progress')).toHaveText(
      'While packing 1/2',
    )

    // The chip is the way back to the row it names.
    const reopened = await openTripTodos(page)
    await reopened.getByTestId('trip-todos-resolved').click()
    // Scoped to the task, because both preparations name the same row now.
    await reopened
      .getByTestId('trip-todo-Charge the battery')
      .getByTestId('task-item-Kamera')
      .click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await expect(page.getByTestId('m5-todo-Charge the battery')).toBeVisible()
  })

  /**
   * E2E-M4-138 (FR-7.6, UI-Spec M4): where the tick stands. The section sits
   * directly above the packing rows, whose control is at the row's own edge
   * so that the thing you tap is under the thumb — and the tasks were ticked
   * on the opposite side, which reads as a different kind of row and is
   * reached across the screen (owner, 2026-09-20).
   *
   * Geometry rather than markup, because only the rendered box says which
   * edge a control ended up on (invariant 9b's point), and both kinds of task
   * are measured: the trip's own ends with a seat and a ✕, a preparation with
   * the chip of its row, and a tick placed before either of those would still
   * carry the right `slot`.
   *
   * The packing row is measured in the same frame and asserted the same way.
   * That clause is what makes this about the idiom instead of a number: it
   * would go green on its own the day the packing control moves, and then
   * the task clauses would be the ones to fail.
   */
  test('E2E-M4-138: a task is ticked at the row’s edge, where a packing row’s control is', async ({
    page,
  }) => {
    await tripWithRows(page, ['Kamera'], 'Samedan')
    await addPrepTodo(page, 'Kamera', 'Water the plants')
    await addPrepTodo(page, 'Kamera', 'Charge the battery')

    const section = await openTripTodos(page)
    await expect(section.getByTestId('trip-todo-Water the plants')).toBeVisible()
    await expect(section.getByTestId('trip-todo-Charge the battery')).toBeVisible()
    await expect(visible(page).getByTestId('m4-row-Kamera')).toBeVisible()

    // One frame for every box: read one at a time they land in different
    // frames of the section's unfold, and a row that is still moving reports
    // edges that were never on screen together (the lesson of E2E-M5-14).
    const measured = await visible(page).evaluate((screen) => {
      const edges = (row: Element, control: string, words: string) => {
        const r = row.getBoundingClientRect()
        const c = row.querySelector(control)!.getBoundingClientRect()
        const w = row.querySelector(words)!.getBoundingClientRect()
        return { fromRowEnd: r.right - c.right, pastTheWords: c.left - w.right }
      }
      const row = (testid: string) => screen.querySelector(`[data-testid="${testid}"]`)!
      return {
        own: edges(row('trip-todo-Water the plants'), 'ion-checkbox', 'ion-label'),
        prepared: edges(row('trip-todo-Charge the battery'), 'ion-checkbox', 'ion-label'),
        packing: edges(row('m4-row-Kamera'), '.row-control', 'ion-label'),
      }
    })

    // The words first, then the control: a tick to the left of its task reads
    // as a bullet rather than as the thing you press.
    expect(measured.own.pastTheWords).toBeGreaterThan(0)
    expect(measured.prepared.pastTheWords).toBeGreaterThan(0)
    expect(measured.packing.pastTheWords).toBeGreaterThan(0)

    // And the control is the last thing on the line, close enough to the
    // row's own end that the thumb finds it there — as it does one row down,
    // on the packing rows the section stands above.
    const AT_THE_EDGE = 24
    expect(measured.own.fromRowEnd).toBeLessThan(AT_THE_EDGE)
    expect(measured.prepared.fromRowEnd).toBeLessThan(AT_THE_EDGE)
    expect(measured.packing.fromRowEnd).toBeLessThan(AT_THE_EDGE)
  })

  /**
   * E2E-M4-137 (FR-7.6, FR-5.8): the task goes with the row. Removing the
   * packing element takes its preparation out of the trip's tasks — off the
   * list and out of the count — while the trip's own task stays, which is
   * what makes the disappearance about the row rather than about the section.
   *
   * The removal is confirmed rather than immediate precisely because the task
   * cascades: FR-5.8 asks whenever something the undo cannot restore would go
   * (`removalNeedsConfirm`), and the preparation is one of those things. The
   * undo is asserted too, because a list that lost the task for good would
   * pass the first half.
   */
  test('E2E-M4-137: removing the row takes its preparation out of the trip’s tasks', async ({
    page,
  }) => {
    await tripWithRows(page, ['Kamera', 'Zelt'], 'Samedan')
    // The sibling that has to survive is a second row's preparation, since
    // FR-7.7 — a trip's own task is not in this window at all.
    await addPrepTodo(page, 'Zelt', 'Water the plants')
    await addPrepTodo(page, 'Kamera', 'Charge the battery')

    const section = await openTripTodos(page)
    await expect(section.getByTestId('trip-todo-Charge the battery')).toBeVisible()
    await expect(visible(page).getByTestId('m4-trip-todos-progress')).toHaveText(
      'While packing 0/2',
    )

    const removeKamera = async () => {
      await openRowMenu(page, 'Kamera')
      await chooseInRowMenu(page, /remove from the list/i)
      // Asked, because the preparation is something the undo cannot write back.
      const confirm = page.getByTestId('m4-remove-confirm')
      await expect(confirm).toBeVisible()
      await confirm.getByRole('button', { name: /^remove$/i }).click()
      await expect(visible(page).getByTestId('m4-row-Kamera')).toHaveCount(0)
    }

    // Taken back first, and the undo is tapped straight away: the snackbar has
    // a lifetime, and a case that asserts four things before reaching for it
    // is racing that lifetime rather than testing anything.
    await removeKamera()
    await page
      .locator('ion-toast.pack-toast:not(.overlay-hidden)')
      .filter({ hasText: 'Kamera' })
      .last()
      .getByRole('button', { name: /undo/i })
      .click()
    await expect(visible(page).getByTestId('m4-row-Kamera')).toBeVisible()
    await expect(section.getByTestId('trip-todo-Charge the battery')).toBeVisible()
    await expect(visible(page).getByTestId('m4-trip-todos-progress')).toHaveText(
      'While packing 0/2',
    )

    // Removed for good, the task goes with the row — while the other row's
    // task stays, which is what makes this about the row and not the section.
    await removeKamera()
    await expect(section.getByTestId('trip-todo-Charge the battery')).toHaveCount(0)
    await expect(section.getByTestId('trip-todo-Water the plants')).toBeVisible()
    await expect(visible(page).getByTestId('m4-trip-todos-progress')).toHaveText(
      'While packing 0/1',
    )
  })
})

/**
 * M25 — every task of the trip, in the two phases a trip has (FR-7.7).
 *
 * Three of the ids below moved here from M4 rather than being renumbered:
 * their promise is still exactly what it was, and the screen that makes it is
 * the one that changed. The ledger says where each one went.
 */
test.describe('M25 — a trip’s tasks in two phases (FR-7.7) @local @m25', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M25-01 (FR-7.7, was E2E-M4-96): the trip's own tasks are added,
   * ticked, reopened and removed here — each state read back after a reload,
   * because a list that only repaints proves the component and not the write.
   * The removal keeps a sibling as its positive signal.
   *
   * The second half is what the screen exists for: a task written into
   * *Während der Reise* lands in that section and **not** in the other one,
   * and it is not on the packing list at all.
   */
  test('E2E-M25-01: a trip’s tasks are written, ticked and removed in their phase', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')

    await addTripTodo(page, 'Water the plants')
    await addTripTodo(page, 'Ask about the train', 'during')

    const before = await openTasks(page, 'before')
    const during = visible(page).getByTestId('m25-during')
    await expect(before.getByTestId('trip-todo-Water the plants')).toBeVisible()
    await expect(during.getByTestId('trip-todo-Ask about the train')).toBeVisible()
    // Each section holds its own: a task in both would be a task filed twice.
    await expect(before.getByTestId('trip-todo-Ask about the train')).toHaveCount(0)
    await expect(during.getByTestId('trip-todo-Water the plants')).toHaveCount(0)

    // Ticked, and read back after a reload rather than off the repaint.
    await before.getByTestId('trip-todo-Water the plants').locator('ion-checkbox').click()
    await writesLanded(page)
    await page.reload()
    const reopened = await openTasks(page, 'before')
    await expect(reopened.getByTestId('trip-todo-Water the plants')).toHaveCount(0)
    // Nothing open is left before the trip: the phase is one line at the end
    // (owner, 2026-09-26), counting what was done, and opens onto it.
    const line = reopened.getByTestId('m25-before-fold')
    await expect(line).toHaveText('Before the trip · nothing open · 1 done')
    await line.click()
    await expect(reopened.getByTestId('trip-todo-Water the plants')).toBeVisible()

    // Unticked again: a mis-tap's only undo once the snackbar is gone — and
    // the phase stands in its place again.
    await reopened.getByTestId('trip-todo-Water the plants').locator('ion-checkbox').click()
    await expect(reopened.getByTestId('trip-todos-resolved')).toHaveCount(0)
    await expect(reopened.getByTestId('m25-before-fold')).toHaveCount(0)

    // Removed; the other section's task stays. The delete is written when the
    // snackbar lapses (FR-25.31), so its going is waited on before the reload.
    await removeTaskFromSheet(page, 'Water the plants')
    const removed = page
      .locator('ion-toast.pack-toast:not(.overlay-hidden)')
      .filter({ hasText: 'Water the plants' })
      .last()
    await expect(removed).toBeVisible()
    await expect(removed).toBeHidden()
    await writesLanded(page)
    await page.reload()
    const after = await openTasks(page, 'before')
    await expect(after.getByTestId('trip-todo-Water the plants')).toHaveCount(0)
    await expect(
      visible(page).getByTestId('m25-during').getByTestId('trip-todo-Ask about the train'),
    ).toBeVisible()
  })

  /**
   * E2E-M25-02 (FR-7.7/FR-25.2, was E2E-M4-105): ticking a task off offers
   * the snackbar's undo, like a pack. The tick makes the task leave the open
   * list, so the mistap has no evidence left to tap again — the undo brings
   * it back, and the reopened state is read after a reload because a repaint
   * alone proves the component and not the write.
   */
  test('E2E-M25-02: a ticked-off task is taken back from the snackbar', async ({ page }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    await addTripTodo(page, 'Water the plants')

    const before = await openTasks(page, 'before')
    await before.getByTestId('trip-todo-Water the plants').locator('ion-checkbox').click()
    await expect(before.getByTestId('trip-todo-Water the plants')).toHaveCount(0)

    // The newest: adding the task raised a snackbar of its own (FR-25.31).
    const toast = page
      .locator('ion-toast.pack-toast:not(.overlay-hidden)')
      .filter({ hasText: /done/ })
      .last()
    await expect(toast).toContainText('Water the plants')
    await toast.getByRole('button', { name: /undo/i }).click()
    await expect(before.getByTestId('trip-todo-Water the plants')).toBeVisible()

    await writesLanded(page)
    await page.reload()
    const reopened = await openTasks(page, 'before')
    await expect(reopened.getByTestId('trip-todo-Water the plants')).toBeVisible()
    await expect(reopened.getByTestId('trip-todos-resolved')).toHaveCount(0)
  })

  /**
   * E2E-M25-03 (FR-7.5/G-8, was E2E-M4-134): Local Mode has nobody to hand a
   * task to, so the task carries no seat and the screen offers no *Meine*
   * chip — absent, not an empty picker over an empty list. The positive
   * signal beside the two absences is the same task's grip, rendered on the
   * row the seat would sit on; the seat itself is E2E-M4-133's. And since
   * FR-7.14 the row carries no ✕ at all: a task is removed from its sheet.
   */
  test('E2E-M25-03: no seat and no “mine” where there is nobody to assign to', async ({ page }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    await addTripTodo(page, 'Water the plants')

    const before = await openTasks(page, 'before')
    const task = before.getByTestId('trip-todo-Water the plants')
    await expect(task.getByTestId('trip-todo-grip-Water the plants')).toBeVisible()
    await expect(task.getByTestId('trip-todo-remove-Water the plants')).toHaveCount(0)
    await expect(task.getByTestId('trip-todo-assign-Water the plants')).toHaveCount(0)
    await expect(task.getByTestId('trip-todo-assignee-Water the plants')).toHaveCount(0)
    await expect(visible(page).getByTestId('m25-mine')).toHaveCount(0)
  })

  /**
   * E2E-M25-07 (FR-7.8): a task is given a tag from its own sheet, and the
   * heading it lands under appears with it.
   *
   * The tag is *created* here rather than picked, because that is the first
   * run every instance has: the list starts empty, and a word that is not in
   * it yet is the next tag rather than an error. The undo is asserted too —
   * a tag given by mistake is one tap to take back, and FR-25.31 covers every
   * act on the list.
   */
  test('E2E-M25-07: a task is tagged from its sheet, and the tag is taken back', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    await addTripTodo(page, 'Salbe holen')

    const before = await openTasks(page, 'before')
    await expect(before.getByTestId('m25-group-trip')).toContainText('No tag')

    await before.getByTestId('trip-todo-open-Salbe holen').click()
    await page.getByTestId('tag-pick-search').locator('input').fill('Apotheke')
    await page.getByTestId('tag-pick-create').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    // The heading is the assertion: a tag that wrote nothing visible would
    // pass a check on the sheet alone.
    const tagged = visible(page)
      .locator('[data-testid^="m25-group-"]')
      .filter({ hasText: 'Apotheke' })
    await expect(tagged).toContainText('Salbe holen')
    await writesLanded(page)
    await page.reload()
    await openTasks(page, 'before')
    await expect(
      visible(page).locator('[data-testid^="m25-group-"]').filter({ hasText: 'Apotheke' }),
    ).toContainText('Salbe holen')

    // Taken back: the task is under „No tag" again, and the empty tag group
    // is gone with it — an empty heading is not drawn.
    await visible(page).getByTestId('trip-todo-open-Salbe holen').click()
    await expect(page.getByTestId('tag-pick-summary')).toHaveText('Filed under: Apotheke')
    await page.getByTestId('tag-pick-assigned-Apotheke').click()
    await expect(visible(page).getByTestId('m25-group-trip')).toContainText('Salbe holen')
  })

  /**
   * E2E-M25-08 (FR-7.8): the drag. A task is lifted by its grip, carried into
   * another group and let go, and the write lands.
   *
   * Three clauses, and each is a way the gesture goes wrong on its own:
   *
   *  - **`data-drag` is the signal**, and the case waits for `idle` — which
   *    arrives only once the write has resolved. Waiting on the animation
   *    instead is what E2E-M4-135 paid for.
   *  - **The group under the pointer says so** while the task is in the air,
   *    or the drop is made blind.
   *  - **Nothing moves that the hand did not move** (ADR-060): the list's
   *    scroll position is read before the lift and after it, because a list
   *    that grew a drop target under the finger would have shifted every row
   *    below it.
   */
  test('E2E-M25-08: a task is dragged from one tag into another @m25', async ({ page }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    await addTripTodo(page, 'Salbe holen')
    await addTripTodo(page, 'Pflanzen giessen')

    // Two tags to drag between, made the way the app makes them.
    const section = await openTasks(page, 'before')
    await section.getByTestId('trip-todo-open-Salbe holen').click()
    await page.getByTestId('tag-pick-search').locator('input').fill('Apotheke')
    await page.getByTestId('tag-pick-create').click()
    await visible(page).getByTestId('trip-todo-open-Pflanzen giessen').click()
    await page.getByTestId('tag-pick-search').locator('input').fill('Haus')
    await page.getByTestId('tag-pick-create').click()
    // The sheet's own teardown, as `tripAction` waits for it: one still on
    // screen takes the pointer that was meant for the row underneath — which
    // is exactly what the first run of this case did.
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    await writesLanded(page)

    const host = visible(page).getByTestId('m25-page')
    await expect(host).toHaveAttribute('data-drag', 'idle')

    const grip = visible(page).getByTestId('trip-todo-grip-Salbe holen')
    const target = visible(page).locator('[data-testid^="m25-group-"]').filter({ hasText: 'Haus' })
    const before = await host.evaluate((el) => el.scrollTop)
    const g = (await grip.boundingBox())!
    const t = (await target.boundingBox())!

    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    await page.mouse.move(g.x + 12, g.y + 12, { steps: 3 })
    await expect(host).toHaveAttribute('data-drag', 'dragging')
    // The clone travelling under the pointer carries `useDragToGroup`'s own
    // shared frame (`composables/dragToGroup.css`) — this screen never drew
    // one of its own before it, so a lost import would silently drop it back
    // to no frame at all rather than change a colour.
    await expect(page.locator('[data-drag-ghost]')).toHaveCSS('border-style', 'solid')
    await page.mouse.move(t.x + t.width / 2, t.y + 10, { steps: 8 })
    // It says where it will land before it lands.
    await expect(target).toHaveAttribute('data-drop-over', '')
    await page.mouse.up()

    // `idle` means the write is real, not that the animation finished.
    await expect(host).toHaveAttribute('data-drag', 'idle')
    await expect(target).toContainText('Salbe holen')
    expect(await host.evaluate((el) => el.scrollTop)).toBe(before)

    await writesLanded(page)
    await page.reload()
    await openTasks(page, 'before')
    await expect(
      visible(page).locator('[data-testid^="m25-group-"]').filter({ hasText: 'Haus' }),
    ).toContainText('Salbe holen')
  })

  /**
   * E2E-M25-09 (FR-7.8): a heading that would not be true of the task in hand
   * neither lights up nor takes it.
   *
   * *Aus Packliste* holds what a packing row owes; a chore of the trip
   * dropped there would be filed under a sentence that is false of it, and
   * the next reader would look for it in the wrong place. The positive half
   * is asserted beside the refusal: the task is still where it was.
   */
  test('E2E-M25-09: a group refuses a task it could not honestly head @m25', async ({ page }) => {
    await tripWithRows(page, ['Kamera'], 'Samedan')
    await addPrepTodo(page, 'Kamera', 'Akku laden')
    await addTripTodo(page, 'Pflanzen giessen')

    await openTasks(page, 'before')
    const host = visible(page).getByTestId('m25-page')
    const fromPacking = visible(page).getByTestId('m25-group-prep')
    await expect(fromPacking).toContainText('Akku laden')

    const grip = visible(page).getByTestId('trip-todo-grip-Pflanzen giessen')
    const g = (await grip.boundingBox())!
    const t = (await fromPacking.boundingBox())!
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    await page.mouse.move(t.x + t.width / 2, t.y + 10, { steps: 8 })
    await expect(fromPacking).not.toHaveAttribute('data-drop-over', '')
    await page.mouse.up()

    // The gesture still ends — a refused drop is not a hung one — and the
    // task stayed where it was.
    await expect(host).toHaveAttribute('data-drag', 'idle')
    await expect(visible(page).getByTestId('m25-group-trip')).toContainText('Pflanzen giessen')
    await expect(fromPacking).not.toContainText('Pflanzen giessen')
  })

  /**
   * E2E-M25-12 (FR-7.8, 2026-09-24): several tasks in one act — M6's own
   * selection, on M25, so a hold means the same on both lists.
   *
   *  - **A hold selects, it no longer lifts.** The right-click is the hold's
   *    deterministic twin (`useRowSelection`); `data-drag` stays `idle`,
   *    the positive signal that nothing was picked up.
   *  - **A tap then chooses**, rather than opening the task's sheet.
   *  - **The batch reaches across groups**, and one tag files it under one
   *    heading. The second round takes „Alle" instead.
   *  - **A phase is a batch act too**, and it survives a reload.
   */
  test('E2E-M25-12: several tasks are selected by a hold, then tagged and moved in one act @m25', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    await addTripTodo(page, 'Salbe holen')
    await addTripTodo(page, 'Pflanzen giessen')

    const before = await openTasks(page, 'before')
    const host = visible(page).getByTestId('m25-page')
    // A real right-click, not a dispatched `contextmenu`: its own pointerdown
    // arrives first, and once armed a hold that nothing disarmed re-selected
    // the row half a second later and swallowed the next tap.
    await before.getByTestId('trip-todo-open-Salbe holen').click({ button: 'right' })

    await expect(page.getByTestId('m25-selbar')).toBeVisible()
    await expect(before.getByTestId('trip-todo-check-Salbe holen')).toHaveClass(/on/)
    await expect(host).toHaveAttribute('data-drag', 'idle')
    // The grip steps aside while choosing; the composer stays where it is, at
    // rest, so the list under it does not move (G-20).
    await expect(before.getByTestId('trip-todo-grip-Salbe holen')).toHaveCount(0)
    const composer = visible(page).getByTestId('m25-composer')
    await expect(composer.getByTestId('trip-todo-input')).toBeVisible()
    await expect(composer.locator('xpath=..')).toHaveAttribute('inert', '')

    // A tap on another task's words now chooses it instead of opening its sheet.
    await before.getByTestId('trip-todo-open-Pflanzen giessen').click()
    await expect(before.getByTestId('trip-todo-check-Pflanzen giessen')).toHaveClass(/on/)
    await expect(page.getByTestId('m25-select-count')).toContainText('2')
    await expect(page.getByTestId('task-sheet')).toHaveCount(0)

    await visible(page).getByTestId('m25-bulk-tag').click()
    await expect(page.getByTestId('m25-bulk-title')).toContainText('2')
    await page.getByTestId('tag-pick-search').locator('input').fill('Haus')
    await page.getByTestId('tag-pick-create').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    // The mode ends with the batch; both tasks now stand under one heading.
    await expect(page.getByTestId('m25-selbar')).toHaveCount(0)
    const haus = before.locator('[data-testid^="m25-group-"]').filter({ hasText: 'Haus' })
    await expect(haus).toContainText('Salbe holen')
    await expect(haus).toContainText('Pflanzen giessen')

    // Again, and this time into the other phase.
    await before
      .getByTestId('trip-todo-Salbe holen')
      .locator('ion-label')
      .dispatchEvent('contextmenu')
    await page.getByTestId('m25-select-all').click()
    await visible(page).getByTestId('m25-bulk-during').click()

    const during = visible(page).getByTestId('m25-during')
    await expect(during).toContainText('Salbe holen')
    await expect(during).toContainText('Pflanzen giessen')
    await expect(before.getByTestId('trip-todo-Salbe holen')).toHaveCount(0)

    await writesLanded(page)
    await page.reload()
    const afterReload = await openTasks(page, 'during')
    await expect(afterReload).toContainText('Salbe holen')
    await expect(afterReload).toContainText('Pflanzen giessen')
  })

  /**
   * E2E-M25-04 (FR-7.7): the salve. A preparation that will not happen before
   * departure is moved to *Während der Reise* from the task's own sheet — and
   * the move is what takes it **off the packing list**, which is the whole
   * reason the phase is stored rather than derived.
   *
   * Both halves are asserted on both screens, because either one alone is
   * green on a build that moved the task in one list and copied it in the
   * other. The undo is asserted too: it writes back the phase the task had,
   * so the task returns to M4's window rather than to „no phase at all".
   */
  test('E2E-M25-04: a task moved to the trip leaves the packing list, and comes back', async ({
    page,
  }) => {
    const trip = await tripWithRows(page, ['Kulturbeutel'], 'Samedan')
    await addPrepTodo(page, 'Kulturbeutel', 'Fetch the salve')

    // It starts where a preparation starts: on the packing list.
    const window = await openTripTodos(page)
    await expect(window.getByTestId('trip-todo-Fetch the salve')).toBeVisible()

    const before = await openTasks(page, 'before')
    await before.getByTestId('trip-todo-open-Fetch the salve').click()
    const sheet = page.getByTestId('task-sheet')
    await expect(sheet).toBeVisible()
    // The sheet says which row it prepares and who wrote it, which is what
    // the line has no room for (FR-7.7, Q3 B).
    await expect(sheet.getByTestId('task-sheet-item')).toContainText('Kulturbeutel')
    await expect(sheet.getByTestId('task-sheet-created')).toBeVisible()
    await sheet.getByTestId('task-sheet-move').click()

    const during = visible(page).getByTestId('m25-during')
    await expect(during.getByTestId('trip-todo-Fetch the salve')).toBeVisible()
    await expect(
      visible(page).getByTestId('m25-before').getByTestId('trip-todo-Fetch the salve'),
    ).toHaveCount(0)
    await writesLanded(page)

    // Off the packing list — the consequence that makes the phase mean
    // something. The section's own head is the positive signal that M4
    // rendered its window at all.
    await page.goto(trip)
    await expect(visible(page).getByTestId('m4-trip-todos')).toBeVisible()
    await expect(visible(page).getByTestId('trip-todo-Fetch the salve')).toHaveCount(0)

    // Taken back: the task is a preparation for before the trip again, and
    // the packing list has it back.
    await openTasks(page, 'during')
    await visible(page).getByTestId('trip-todo-open-Fetch the salve').click()
    await page.getByTestId('task-sheet-move').click()
    await writesLanded(page)
    await page.goto(trip)
    const back = await openTripTodos(page)
    await expect(back.getByTestId('trip-todo-Fetch the salve')).toBeVisible()
  })

  /**
   * E2E-M25-13 (FR-7.11): a task names the day it is due.
   *
   * The date is set where every other fact of a task is — its sheet — and the
   * sheet stays up: the date is one fact of several. Three promises follow
   * from it and are asserted on the list, not the sheet: the line wears the
   * day in words (*Tomorrow*), the dated task leads its group ahead of an
   * undated one it would otherwise follow (FR-7.6 sorts by words, and *Buy*
   * comes before *Renew*), and both survive a reload — a line that only
   * repainted proves the component, not the write.
   *
   * Then Local Mode's stand-in for the push: the app says once, when it is
   * opened, how many tasks are due. Opened means a fresh load of the
   * dashboard, and the trip has to be running — M1 counts the active trips.
   */
  test('E2E-M25-13: a due day is set on the sheet, leads the list, and is said when the app opens', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Fällig')
    // Running from the start: M1 counts the active trips. Started here, where
    // the trip's name is already on screen for the helper to read — right
    // after a fresh load WebKit showed the screen's generic title instead.
    await startTrip(page)
    await addTripTodo(page, 'Buy a map')
    await addTripTodo(page, 'Renew the passport')

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const iso = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, '0'),
      String(tomorrow.getDate()).padStart(2, '0'),
    ].join('-')

    const before = await openTasks(page, 'before')
    await before.getByTestId('trip-todo-open-Renew the passport').click()
    const sheet = page.getByTestId('task-sheet')
    await expect(sheet).toBeVisible()
    // The calendar, which is still there behind *Datum…* (FR-7.14).
    await setDateField(page, 'task-sheet-due', iso)
    // The sheet stays up, with the day as its chip.
    await expect(sheet.getByTestId('task-sheet-due-current')).toBeVisible()
    await sheet.getByTestId('task-sheet-close').click()
    await expect(sheet).toHaveCount(0)

    // FR-7.14: due tomorrow is pressing, so it is read in the *Fällig* block
    // on top — and not a second time in its section.
    const due = visible(page).getByTestId('m25-due')
    const pill = due.getByTestId('trip-todo-due-Renew the passport')
    await expect(pill).toHaveText('Tomorrow')
    await expect(pill).toHaveAttribute('data-due', 'soon')
    await expect(before.getByTestId('trip-todo-Renew the passport')).toHaveCount(0)
    await expect(before.getByTestId('trip-todo-Buy a map')).toBeVisible()
    await expect(visible(page).getByTestId('trip-todo-due-Buy a map')).toHaveCount(0)
    await writesLanded(page)

    await page.reload()
    await expect(
      visible(page).getByTestId('m25-due').getByTestId('trip-todo-due-Renew the passport'),
    ).toHaveText('Tomorrow')

    // Local Mode's reminder: once, when the app opens on a running trip.
    await page.goto(PATH.dashboard)
    await expect(page.locator('ion-toast').filter({ hasText: '1 task due' })).toBeVisible()
  })

  /**
   * E2E-M25-14 (FR-7.14): a task is filed as it is typed, and what is due
   * leads. The one composer sits on top; its chips name the phase, the tag
   * and the day, and *＋ Tag* opens M6's entry sheet with what was typed. The
   * task lands with all three in one write — read back after a reload. Due today, it stands in the *Fällig* block, named by its
   * tag since it is outside its group; the tag's group itself is not drawn,
   * because nothing else is in it. The FAB takes the reader back to the field.
   */
  test('E2E-M25-14: a task is filed as it is typed, and what is due today leads the screen', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    await addTripTodo(page, 'Water the plants')
    const before = await openTasks(page, 'before')
    await expect(visible(page).getByTestId('m25-due')).toHaveCount(0)

    const composer = visible(page).getByTestId('m25-composer')
    await fillIonic(composer.getByTestId('trip-todo-input'), 'Fetch the salve')
    await composer.getByTestId('due-chip-today').click()
    await expect(composer.getByTestId('m25-composer-due-current')).toBeVisible()

    // ＋ Tag is M6's entry sheet (owner, 2026-09-26): it carries the words
    // and the day typed so far, and makes the tag by search-or-create.
    await composer.getByTestId('m25-composer-tag-new').click()
    const sheet = page.getByTestId('m25-entry-sheet')
    await expect(sheet.getByTestId('m25-entry-title')).toHaveText('New task')
    await expect(sheet.getByTestId('m25-entry-name').locator('input')).toHaveValue(
      'Fetch the salve',
    )
    await expect(sheet.getByTestId('m25-entry-due-current')).toBeVisible()
    await sheet.getByTestId('tag-pick-search').locator('input').fill('Apotheke')
    await sheet.getByTestId('tag-pick-create').click()
    await expect(sheet.getByTestId('tag-pick-summary')).toHaveText('Filed under: Apotheke')
    await sheet.getByTestId('m25-entry-confirm').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    const tag = composer.getByTestId('m25-composer-tag-Apotheke')

    const due = visible(page).getByTestId('m25-due')
    await expect(due.getByTestId('trip-todo-due-Fetch the salve')).toHaveText('Today')
    await expect(due.getByTestId('trip-todo-tag-Fetch the salve')).toHaveText('Apotheke')
    await expect(before.getByTestId('trip-todo-Fetch the salve')).toHaveCount(0)
    await expect(
      visible(page).locator('[data-testid^="m25-group-"]').filter({ hasText: 'Apotheke' }),
    ).toHaveCount(0)
    // The tag stays chosen for the next task of the errand; the day does not.
    await expect(tag).toHaveAttribute('aria-pressed', 'true')
    await expect(composer.getByTestId('m25-composer-due-current')).toHaveCount(0)
    await writesLanded(page)

    await page.reload()
    await openTasks(page, 'before')
    await expect(
      visible(page).getByTestId('m25-due').getByTestId('trip-todo-tag-Fetch the salve'),
    ).toHaveText('Apotheke')

    // The FAB, from further down: the field is focused and on screen.
    await visible(page).getByTestId('m25-fab').click()
    await expect(
      visible(page).getByTestId('m25-composer').getByTestId('trip-todo-input').locator('input'),
    ).toBeFocused()
  })

  /**
   * E2E-M25-15 (FR-7.14): the sheet in the order acts are wanted. A task's
   * words are corrected in place — read back after a reload, and the undo
   * puts the old words back — and *Erledigt* is the sheet's first act: it
   * finishes the task and the sheet goes with it.
   */
  test('E2E-M25-15: a task’s words are corrected on its sheet, and it is finished from there', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    await addTripTodo(page, 'Pas holen')
    const before = await openTasks(page, 'before')

    await before.getByTestId('trip-todo-open-Pas holen').click()
    const sheet = page.getByTestId('task-sheet')
    const words = sheet.getByTestId('task-sheet-title-input').locator('textarea')
    await words.fill('Pass holen')
    await words.press('Enter')
    await expect(before.getByTestId('trip-todo-open-Pass holen')).toBeVisible()
    await page
      .locator('ion-toast.pack-toast:not(.overlay-hidden)')
      .filter({ hasText: 'changed' })
      .last()
      .getByRole('button', { name: /undo/i })
      .click()
    await expect(before.getByTestId('trip-todo-open-Pas holen')).toBeVisible()

    await words.fill('Pass holen')
    await words.press('Enter')
    await expect(before.getByTestId('trip-todo-open-Pass holen')).toBeVisible()
    await writesLanded(page)
    await page.reload()
    const reloaded = await openTasks(page, 'before')
    await reloaded.getByTestId('trip-todo-open-Pass holen').click()
    await page.getByTestId('task-sheet-done').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    await expect(reloaded.getByTestId('trip-todo-Pass holen')).toHaveCount(0)
    await reloaded.getByTestId('m25-before-fold').click()
    await expect(reloaded.getByTestId('trip-todo-Pass holen')).toBeVisible()
  })

  /**
   * E2E-M25-16 (FR-7.14): the selection's own acts. Two tasks are dated in
   * one go from the bar's *Fällig* — both then lead the screen — and ticked
   * off in one more; a third is deleted from the bar and taken back whole by
   * the one undo. Each state is read on the list, not off the bar.
   */
  test('E2E-M25-16: a selection is dated, ticked off and deleted in one act each', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    await addTripTodo(page, 'Buy a map')
    await addTripTodo(page, 'Water the plants')
    await addTripTodo(page, 'Cancel the paper')
    const before = await openTasks(page, 'before')

    await before.getByTestId('trip-todo-open-Buy a map').click({ button: 'right' })
    await before.getByTestId('trip-todo-open-Water the plants').click()
    await expect(page.getByTestId('m25-select-count')).toContainText('2')
    await visible(page).getByTestId('m25-bulk-due').click()
    await page.getByTestId('m25-bulk-when-chips').getByTestId('due-chip-tomorrow').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    const due = visible(page).getByTestId('m25-due')
    await expect(due.getByTestId('trip-todo-due-Buy a map')).toHaveText('Tomorrow')
    await expect(due.getByTestId('trip-todo-due-Water the plants')).toHaveText('Tomorrow')

    await due.getByTestId('trip-todo-open-Buy a map').click({ button: 'right' })
    await due.getByTestId('trip-todo-open-Water the plants').click()
    await visible(page).getByTestId('m25-bulk-done').click()
    await expect(visible(page).getByTestId('m25-due')).toHaveCount(0)
    await before.getByTestId('trip-todos-resolved').click()
    await expect(before.getByTestId('trip-todo-Buy a map')).toBeVisible()
    await expect(before.getByTestId('trip-todo-Water the plants')).toBeVisible()

    await before.getByTestId('trip-todo-open-Cancel the paper').click({ button: 'right' })
    await visible(page).getByTestId('m25-bulk-remove').click()
    await expect(before.getByTestId('trip-todo-Cancel the paper')).toHaveCount(0)
    await page
      .locator('ion-toast.pack-toast:not(.overlay-hidden)')
      .filter({ hasText: 'deleted' })
      .last()
      .getByRole('button', { name: /undo/i })
      .click()
    await expect(before.getByTestId('trip-todo-Cancel the paper')).toBeVisible()
    await writesLanded(page)
    await page.reload()
    const reloaded = await openTasks(page, 'before')
    await expect(reloaded.getByTestId('trip-todo-Cancel the paper')).toBeVisible()
  })

  /**
   * E2E-M25-17 (FR-7.14): once the trip's first day has come, a new task is
   * for the road — the composer names no phase, and what is typed lands under
   * *Während der Reise*. The start is two days back, computed by the case:
   * „today" is an input here, not a race, and two days clear any time zone.
   */
  test('E2E-M25-17: a trip under way files a new task for the road', async ({ page }) => {
    const started = new Date(Date.now() - 2 * 86_400_000)
    const startDate = [
      started.getFullYear(),
      String(started.getMonth() + 1).padStart(2, '0'),
      String(started.getDate()).padStart(2, '0'),
    ].join('-')
    await createTripViaWizard(page, { name: 'Unterwegs', startDate, travelers: ['Andy'] })
    const during = await openTasks(page, 'during')

    const composer = visible(page).getByTestId('m25-composer')
    // The positive signal first: the composer is on screen, so the phase
    // row's absence is read off a rendered page.
    await expect(composer.getByTestId('trip-todo-input')).toBeVisible()
    await expect(composer.getByTestId('m25-composer-phase')).toHaveCount(0)
    await fillIonic(composer.getByTestId('trip-todo-input'), 'Maut zahlen')
    await composer.getByTestId('trip-todo-add').click()
    await expect(during.getByTestId('trip-todo-Maut zahlen')).toBeVisible()
    await writesLanded(page)

    await page.reload()
    await expect(
      (await openTasks(page, 'during')).getByTestId('trip-todo-Maut zahlen'),
    ).toBeVisible()
    await expect(
      visible(page).getByTestId('m25-before').getByTestId('trip-todo-Maut zahlen'),
    ).toHaveCount(0)
  })
})
