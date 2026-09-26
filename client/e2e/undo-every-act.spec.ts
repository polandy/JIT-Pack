import type { Page } from '@playwright/test'
import { test, expect, tripAction, visiblePage, useReducedMotion, writesLanded } from './fixtures'
import {
  chooseInRowMenu,
  openRowMenu,
  openTasks,
  removeTaskFromSheet,
  addTripTodo,
  packRow,
  row,
  startTrip,
  tripWithRows,
} from './helpers/m4'

/**
 * Every act on the packing list can be taken back (UI-Test-Spec §3, M4;
 * Addendum FR-25.31).
 *
 * FR-25.2's snackbar covers the pack, the skip and the untouched removal;
 * FR-25.31 extends it to everything else a tap writes, which would otherwise
 * be final unless the user found the control that reverses it. These cases
 * take those acts, one of each kind, and assert the way back — each through
 * what the row renders afterwards, never through the snackbar alone, which
 * would be green on a page whose undo wrote nothing.
 *
 * **Reduced motion is on**, as in pack-out.spec.ts: the production code takes
 * its own no-motion path, so what is asserted is the outcome.
 */
useReducedMotion(test)

/**
 * The newest snackbar that names `text`. Filtered by its sentence and taken
 * last rather than as the only toast: a replaced snackbar stays in the DOM,
 * unmarked, for as long as its leave animation runs.
 */
function snackbar(page: Page, text: RegExp) {
  return page.locator('ion-toast.pack-toast:not(.overlay-hidden)').filter({ hasText: text }).last()
}

/** Take the standing snackbar's undo, once it names `text`. */
async function undo(page: Page, text: RegExp): Promise<void> {
  const toast = snackbar(page, text)
  await expect(toast).toBeVisible()
  await toast.getByRole('button', { name: /undo/i }).click()
}

/** The amount the row's stepper shows, `packed/quantity`. */
function amount(page: Page, name: string) {
  return row(page, name).getByTestId('row-quantity')
}

/** Change the row's amount by one step through its menu's popover. */
async function stepAmountUp(page: Page, name: string): Promise<void> {
  await openRowMenu(page, name)
  await chooseInRowMenu(page, /change the amount/i)
  const editor = page.getByTestId('quantity-editor')
  await editor.getByTestId('quantity-more').click()
  await expect(editor.getByTestId('quantity-value')).toHaveText('2')
  await page.keyboard.press('Escape')
  await expect(editor).toHaveCount(0)
}

test.describe('FR-25.31 — the list takes back what it wrote', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.setViewportSize({ width: 390, height: 844 })
  })

  // E2E-M4-120: the reversal of E2E-M4-35. Un-packing a revealed row is
  // announced even though its result is on screen: every act is undoable,
  // and a mistap among done rows costs the same to find again.
  test('E2E-M4-120: un-checking a revealed row is announced and its undo packs it again @local @m4', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Rückgängigprobe')
    await packRow(page, 'Zelt')
    await page.getByTestId('m4-done-bar').click()
    await row(page, 'Zelt').getByTestId('row-check').locator('ion-checkbox').click()
    // Un-packed: nothing is done any more, so the reveal bar has nothing to
    // count — the positive signal that the un-pack landed.
    await expect(page.getByTestId('m4-done-bar')).toBeHidden()

    await undo(page, /unpacked/i)
    await expect(page.getByTestId('m4-done-bar')).toBeVisible()
    await expect(
      row(page, 'Zelt').getByTestId('row-check').locator('ion-checkbox'),
    ).toHaveJSProperty('checked', true)
  })

  // E2E-M4-121: the amount, a step of the stepper, and the confirmed
  // removal — a delete, and still not final — each come back.
  test('E2E-M4-121: the amount, a step and a confirmed removal are each undone @local @m4', async ({
    page,
  }) => {
    test.slow()
    await tripWithRows(page, ['Zelt', 'Schlafsack'], 'Rückgängigprobe')

    // The amount: 1 → 2 turns the check into a stepper; the undo turns it back.
    await stepAmountUp(page, 'Zelt')
    await expect(amount(page, 'Zelt')).toHaveText('0/2')
    await undo(page, /quantity 2/i)
    await expect(row(page, 'Zelt').getByTestId('row-check')).toBeVisible()

    // A step: counted, then taken back to where it was.
    await stepAmountUp(page, 'Zelt')
    await row(page, 'Zelt').getByTestId('row-plus').click()
    await expect(amount(page, 'Zelt')).toHaveText('1/2')
    await undo(page, /1 of 2 packed/i)
    await expect(amount(page, 'Zelt')).toHaveText('0/2')

    // The confirmed removal: a packed unit makes the dialog ask first.
    await row(page, 'Zelt').getByTestId('row-plus').click()
    await expect(amount(page, 'Zelt')).toHaveText('1/2')
    await openRowMenu(page, 'Zelt')
    await chooseInRowMenu(page, /remove from the list/i)
    await page
      .getByTestId('m4-remove-confirm')
      .getByRole('button', { name: /^remove$/i })
      .click()
    await expect(row(page, 'Zelt')).toHaveCount(0)
    // Hidden, not yet deleted — and the trip line says what the list says, not
    // what the store still holds.
    const progress = visiblePage(page).getByTestId('m4-progress')
    await expect(progress).toHaveText('0/1 packed')

    await undo(page, /removed/i)
    await expect(amount(page, 'Zelt')).toHaveText('1/2')
    await expect(progress).toHaveText('1/3 packed')

    // Never deleted, so nothing had to be re-created: the row survives a
    // reload with the unit it carried.
    await writesLanded(page)
    await page.reload()
    await expect(amount(page, 'Zelt')).toHaveText('1/2')
  })

  // E2E-M4-122: a flag from the row menu. Late packer stands for the menu's
  // one-field writes — the menu offering the entry again is what the row
  // says about the flag, and it would still read "off" had the undo not run.
  test('E2E-M4-122: late packer set from the row menu is undone @local @m4', async ({ page }) => {
    await tripWithRows(page, ['Ladekabel'], 'Rückgängigprobe')

    await openRowMenu(page, 'Ladekabel')
    await chooseInRowMenu(page, /^late packer on$/i)
    await undo(page, /packed late/i)

    await openRowMenu(page, 'Ladekabel')
    await expect(
      page.locator('ion-action-sheet').getByRole('button', { name: /^late packer on$/i }),
    ).toBeVisible()
    await expect(
      page.locator('ion-action-sheet').getByRole('button', { name: /^late packer off$/i }),
    ).toHaveCount(0)
  })

  // E2E-M4-123: the closing pass's tap gets its snackbar too — one toast per
  // tap is accepted as the price of every act being undoable.
  test('E2E-M4-123: a mark in the closing pass is undone @local @m4', async ({ page }) => {
    await tripWithRows(page, ['Stativ'], 'Rückgängigprobe')
    await startTrip(page)
    await packRow(page, 'Stativ')
    await tripAction(page, 'archive')
    await expect(visiblePage(page).getByTestId('m4-pass-banner')).toBeVisible()

    const mark = page.getByTestId('m4-pass-toggle-Stativ')
    await mark.click()
    await expect(mark).toHaveAttribute('aria-pressed', 'true')
    await undo(page, /marked as unused/i)
    await expect(mark).toHaveAttribute('aria-pressed', 'false')
  })

  // ~~E2E-M4-124~~ moved 2026-09-21 to E2E-M25-06 (FR-7.7). The promise is
  // unchanged — a deleted task comes back, and one left deleted goes when the
  // snackbar does — but a trip's own task is not on M4 any more: its section
  // keeps only the preparations still due before the trip. The case runs on
  // the screen that now holds the thing it is about.
  test('E2E-M25-06: a deleted task is undone, and goes for good once the snackbar does @local @m25', async ({
    page,
  }) => {
    test.slow()
    await tripWithRows(page, ['Zelt'], 'Rückgängigprobe')
    await addTripTodo(page, 'Pass erneuern')
    const section = await openTasks(page, 'before')
    const task = section.getByTestId('trip-todo-Pass erneuern')

    await removeTaskFromSheet(page, 'Pass erneuern')
    await expect(task).toHaveCount(0)
    await undo(page, /deleted/i)
    await expect(task).toBeVisible()

    // Left alone, the lapse is the delete. Its toast going is the signal
    // waited on — the lapse itself changes nothing on screen here.
    await removeTaskFromSheet(page, 'Pass erneuern')
    const toast = snackbar(page, /deleted/i)
    await expect(toast).toBeVisible()
    await expect(toast).toBeHidden()
    await writesLanded(page)
    await page.reload()
    const reloaded = await openTasks(page, 'before')
    // The input rendering is the positive signal that the list is there —
    // without it, „the task is gone" is also what an empty screen says.
    await expect(
      visiblePage(page).getByTestId('m25-composer').getByTestId('trip-todo-input'),
    ).toBeVisible()
    await expect(reloaded.getByTestId('trip-todo-Pass erneuern')).toHaveCount(0)
  })

  // E2E-M4-125: two menu acts whose undo is the opposite act — bringing a
  // skipped row back, and claiming a row. Each is read off the row itself.
  test('E2E-M4-125: pack-it-after-all and a claim are each undone @local @m4', async ({ page }) => {
    await tripWithRows(page, ['Zelt', 'Schlafsack'], 'Rückgängigprobe')

    await openRowMenu(page, 'Zelt')
    await chooseInRowMenu(page, /do not pack this/i)
    await expect(row(page, 'Zelt')).toHaveCount(0)
    await page.getByTestId('m4-done-bar').click()
    await openRowMenu(page, 'Zelt')
    await chooseInRowMenu(page, /pack it after all/i)
    await expect(page.getByTestId('m4-done-bar')).toBeHidden()
    await undo(page, /coming after all/i)
    // Skipped again: the reveal bar has a done row to count.
    await expect(page.getByTestId('m4-done-bar')).toBeVisible()

    await openRowMenu(page, 'Schlafsack')
    await chooseInRowMenu(page, /^pack$/i)
    await expect(row(page, 'Schlafsack').getByTestId('m4-own-claim')).toBeVisible()
    await undo(page, /you are packing/i)
    await expect(row(page, 'Schlafsack').getByTestId('m4-own-claim')).toHaveCount(0)
  })
})
