import { test, expect, visiblePage as visible } from './fixtures'
import {
  addTripTodo,
  chooseInRowMenu,
  openTripTodos,
  openRowMenu,
  tripWithRows,
} from './helpers/m4'
import { expectFiguresPaired, writesLanded } from './helpers/page'

/**
 * A trip's tasks (FR-7.4, FR-7.6) — its own chores and the preparations its
 * rows owe, in the one list M4 unfolds above the packing rows. Split out of
 * `packing-list.spec.ts` on 2026-09-20: a task is not a packing row, and the
 * section had grown its own subject.
 */

test.describe('M4 — the trip’s tasks (FR-7.4, FR-7.6) @local @m4', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M4-96 (FR-7.4): *Aufgaben für die Reise* is where a trip todo is
   * written — added, ticked, reopened from the fold and removed, each state
   * read back after a reload, because a list that only repaints proves the
   * component and not the write. The removal keeps a sibling as its positive
   * signal. The section is there on a trip with no todo, closed and silent
   * about being done, because it is where the first one is typed.
   */
  test('E2E-M4-96: trip todos are added, ticked, reopened and removed in the trip', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    const section = visible(page).getByTestId('m4-trip-todos')
    const status = section.getByTestId('m4-trip-todos-status')
    await expect(section).toBeVisible()
    await expect(section.getByTestId('trip-todo-list')).toHaveCount(0)
    await expect(status).toHaveCount(0)

    await addTripTodo(page, 'Water the plants')
    await addTripTodo(page, 'Empty the fridge')
    await expect(status).toHaveText('0 of 2 done')

    const reopenSection = async () => {
      await page.reload()
      await openTripTodos(page)
    }
    await reopenSection()
    await expect(section.getByTestId('trip-todo-Water the plants')).toBeVisible()

    // Tick: the row leaves the open list and the head counts it.
    await section.getByTestId('trip-todo-Water the plants').locator('ion-checkbox').click()
    await expect(status).toHaveText('1 of 2 done')
    await writesLanded(page)
    await reopenSection()
    await expect(status).toHaveText('1 of 2 done')
    await expect(section.getByTestId('trip-todo-Water the plants')).toHaveCount(0)

    // Reopen from the fold: a mis-tap's only undo.
    await section.getByTestId('trip-todos-resolved').click()
    await section.getByTestId('trip-todo-Water the plants').locator('ion-checkbox').click()
    await expect(status).toHaveText('0 of 2 done')
    await expect(section.getByTestId('trip-todos-resolved')).toHaveCount(0)

    // Remove one; its sibling stays. The delete is written when the
    // snackbar's undo lapses (FR-25.31), so its going is waited on before the
    // reload — a reload inside the window keeps the task, on purpose.
    await section.getByTestId('trip-todo-remove-Empty the fridge').click()
    await expect(section.getByTestId('trip-todo-Empty the fridge')).toHaveCount(0)
    const removed = page
      .locator('ion-toast.pack-toast:not(.overlay-hidden)')
      .filter({ hasText: 'Empty the fridge' })
      .last()
    await expect(removed).toBeVisible()
    await expect(removed).toBeHidden()
    await writesLanded(page)
    await reopenSection()
    await expect(section.getByTestId('trip-todo-Empty the fridge')).toHaveCount(0)
    await expect(section.getByTestId('trip-todo-Water the plants')).toBeVisible()
    await expect(status).toHaveText('0 of 1 done')
  })

  /**
   * E2E-M4-134 (FR-7.5, G-8): Local Mode has nobody to hand a todo to, so the
   * todo carries no seat — absent, not an empty picker. The positive signal
   * beside the absence is the same todo's other end control, rendered in the
   * box the seat would share; the seat itself is E2E-M4-133's.
   */
  test('E2E-M4-134: a trip todo offers no seat where there is nobody to assign it to', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    await addTripTodo(page, 'Water the plants')

    const todo = visible(page).getByTestId('trip-todo-Water the plants')
    await expect(todo.getByTestId('trip-todo-remove-Water the plants')).toBeVisible()
    await expect(todo.getByTestId('trip-todo-assign-Water the plants')).toHaveCount(0)
    await expect(todo.getByTestId('trip-todo-assignee-Water the plants')).toHaveCount(0)
  })

  /**
   * E2E-M4-105 (FR-7.4, FR-25.2): ticking a task off offers the snackbar's
   * undo, like a pack. The tick makes the row leave the open list, so the
   * mistap has no evidence left to tap again — the undo brings it back, and
   * the reopened state is read after a reload because a repaint alone proves
   * the component and not the write.
   */
  test('E2E-M4-105: a ticked-off trip todo is taken back from the snackbar', async ({ page }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    const section = visible(page).getByTestId('m4-trip-todos')
    const status = section.getByTestId('m4-trip-todos-status')
    await addTripTodo(page, 'Water the plants')
    await addTripTodo(page, 'Empty the fridge')

    await section.getByTestId('trip-todo-Water the plants').locator('ion-checkbox').click()
    await expect(status).toHaveText('1 of 2 done')
    // The newest: adding each task raised a snackbar of its own (FR-25.31).
    const toast = page
      .locator('ion-toast.pack-toast:not(.overlay-hidden)')
      .filter({ hasText: /done/ })
      .last()
    await expect(toast).toContainText('Water the plants')

    await toast.getByRole('button', { name: /undo/i }).click()
    await expect(status).toHaveText('0 of 2 done')
    await expect(section.getByTestId('trip-todo-Water the plants')).toBeVisible()
    await writesLanded(page)
    await page.reload()
    await openTripTodos(page)
    await expect(status).toHaveText('0 of 2 done')
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

    // No todo yet: the section is only the way to the first one, and the
    // header has no second figure beside the share.
    await expect(visible(page).getByTestId('m4-progress')).toHaveText('0/1 packed')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(figure).toHaveCount(0)

    await addTripTodo(page, 'Water the plants')
    await addTripTodo(page, 'Empty the fridge')

    // Above the list, and open on arrival while anything is owed.
    await page.reload()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(section.getByTestId('trip-todo-Water the plants')).toBeVisible()
    await expect(fraction).toHaveText('0/2 tasks')
    // A pair: the packing share has no detail line and the todos do („2
    // open"), which is exactly the case that put the tracks on two levels.
    await expectFiguresPaired(visible(page).getByTestId('m4-header'))
    const sectionTop = (await section.boundingBox())!.y
    const rowTop = (await visible(page).getByTestId('m4-row-Zelt').boundingBox())!.y
    expect(sectionTop).toBeLessThan(rowTop)

    // Ticking the last one folds the section to its line.
    await section.getByTestId('trip-todo-Water the plants').locator('ion-checkbox').click()
    await expect(fraction).toHaveText('1/2 tasks')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await section.getByTestId('trip-todo-Empty the fridge').locator('ion-checkbox').click()
    await expect(section.getByTestId('m4-trip-todos-status')).toHaveText('✓ All tasks done')
    await expect(fraction).toHaveText('2/2 tasks')
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
    await addTripTodo(page, 'Water the plants')

    await visible(page).getByTestId('m4-row-Kamera').click()
    await page.getByTestId('m5-todo-input').locator('input').fill('Charge the battery')
    await page.getByTestId('m5-todo-add').click()
    await expect(page.getByTestId('m5-todo-Charge the battery')).toBeVisible()
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    // One figure for both kinds (FR-7.6), and the header no longer says the
    // preparation count a second time in its detail line.
    const fraction = visible(page).getByTestId('m4-trip-todos-progress')
    await expect(fraction).toHaveText('0/2 tasks')
    await expect(visible(page).getByTestId('m4-header')).not.toContainText('preparation')

    const section = await openTripTodos(page)
    const prepared = section.getByTestId('trip-todo-Charge the battery')
    const own = section.getByTestId('trip-todo-Water the plants')
    await expect(prepared.getByTestId('task-item-Kamera')).toBeVisible()
    await expect(own.locator('[data-testid^="task-item-"]')).toHaveCount(0)
    await expect(own.getByTestId('trip-todo-remove-Water the plants')).toBeVisible()
    await expect(prepared.getByTestId('trip-todo-remove-Charge the battery')).toHaveCount(0)

    // Ticked here, cleared on the row: one todo, read by two surfaces.
    await expect(visible(page).getByTestId('m4-prep-badge-Kamera')).toContainText('1')
    await prepared.locator('ion-checkbox').click()
    await expect(fraction).toHaveText('1/2 tasks')
    await expect(visible(page).getByTestId('m4-prep-badge-Kamera')).toHaveCount(0)
    await writesLanded(page)
    await page.reload()
    await expect(visible(page).getByTestId('m4-trip-todos-progress')).toHaveText('1/2 tasks')

    // The chip is the way back to the row it names.
    const reopened = await openTripTodos(page)
    await reopened.getByTestId('trip-todos-resolved').click()
    await reopened.getByTestId('task-item-Kamera').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await expect(page.getByTestId('m5-todo-Charge the battery')).toBeVisible()
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
    await addTripTodo(page, 'Water the plants')

    await visible(page).getByTestId('m4-row-Kamera').click()
    await page.getByTestId('m5-todo-input').locator('input').fill('Charge the battery')
    await page.getByTestId('m5-todo-add').click()
    await expect(page.getByTestId('m5-todo-Charge the battery')).toBeVisible()
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    const section = await openTripTodos(page)
    await expect(section.getByTestId('trip-todo-Charge the battery')).toBeVisible()
    await expect(visible(page).getByTestId('m4-trip-todos-progress')).toHaveText('0/2 tasks')

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
    await expect(visible(page).getByTestId('m4-trip-todos-progress')).toHaveText('0/2 tasks')

    // Removed for good, the task goes with the row — while the trip's own
    // task stays, which is what makes this about the row and not the section.
    await removeKamera()
    await expect(section.getByTestId('trip-todo-Charge the battery')).toHaveCount(0)
    await expect(section.getByTestId('trip-todo-Water the plants')).toBeVisible()
    await expect(visible(page).getByTestId('m4-trip-todos-progress')).toHaveText('0/1 tasks')
  })
})
