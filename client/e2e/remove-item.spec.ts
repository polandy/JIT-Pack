import {
  test,
  expect,
  createTripViaWizard,
  createMasterItem,
  openQuickAdd,
  visiblePage,
  useReducedMotion,
  writesLanded,
} from './fixtures'
import { chooseInRowMenu, openRowMenu, tripWithRows } from './helpers/m4'

/**
 * Taking a row off the packing list (UI-Test-Spec §3, M4; Addendum FR-5.8).
 *
 * The distinction these cases keep is the one FR-5.5 is built on, from the
 * other side: *removed* is not *left behind*. A skipped row is revealed with
 * the done rows and names itself as a decision; a removed one is nowhere —
 * not in the working list, not behind the *Erledigte* bar, not after a reload.
 *
 * **Reduced motion is on**, as in skip-item.spec.ts: the production code takes
 * its own no-motion path, so what is asserted is the outcome.
 */
useReducedMotion(test)

// E2E-M4-91 (FR-5.8): an untouched row goes at once, behind the snackbar's
// undo — no dialog, because nothing on it would be lost.
test('E2E-M4-91: an untouched row is removed at once and the undo brings it back @local @m4', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize({ width: 390, height: 844 })
  await tripWithRows(page, ['Zelt', 'Schlafsack'], 'Entfernprobe')

  await openRowMenu(page, 'Zelt')
  // Last in the menu: the destructive entry sits below every row action.
  // (The very last button is *Cancel*, in its own group.)
  const labels = await page.locator('ion-action-sheet').getByRole('button').allInnerTexts()
  expect(labels.at(-2)).toMatch(/remove from the list/i)
  await chooseInRowMenu(page, /remove from the list/i)

  // The snackbar is the positive signal that the immediate path ran: the
  // confirmed path shows no undo, and an unanswered dialog shows no toast.
  const toast = page.locator('ion-toast.pack-toast')
  await expect(toast).toContainText('Zelt')
  await expect(page.locator('ion-alert')).toHaveCount(0)
  await expect(visiblePage(page).getByTestId('m4-row-Zelt')).toHaveCount(0)
  await expect(visiblePage(page).getByTestId('m4-row-Schlafsack')).toBeVisible()
  // Not a done row: with nothing done there is no reveal bar at all, where a
  // skip would have raised one.
  await expect(page.getByTestId('m4-done-bar')).toBeHidden()

  await toast.getByRole('button', { name: /undo/i }).click()
  await expect(visiblePage(page).getByTestId('m4-row-Zelt')).toBeVisible()

  // Removed for good this time, and still gone after a reload — the delete
  // reached IndexedDB, not only the screen.
  await openRowMenu(page, 'Zelt')
  await chooseInRowMenu(page, /remove from the list/i)
  await expect(visiblePage(page).getByTestId('m4-row-Zelt')).toHaveCount(0)
  await writesLanded(page)
  await page.reload()
  await expect(visiblePage(page).getByTestId('m4-row-Schlafsack')).toBeVisible()
  await expect(visiblePage(page).getByTestId('m4-row-Zelt')).toHaveCount(0)
})

// E2E-M4-92 (FR-5.8 with FR-20.2): a row that takes something along asks
// first, names what it takes, and can be declined.
test('E2E-M4-92: removing a main item asks first and skips its companion @local @m4', async ({
  page,
  seedMode,
}) => {
  // Builds its world through M10 and M4 (spec §2.4), as E2E-M4-40 does.
  test.slow()
  await seedMode({ mode: 'local' })
  await page.setViewportSize({ width: 390, height: 844 })

  await createMasterItem(page, 'Drohne')
  await createMasterItem(page, 'Akku')
  await visiblePage(page).getByTestId('m10-add-dependency').click()
  await visiblePage(page).getByTestId('m10-dependency-main-Drohne').click()
  await expect(visiblePage(page).getByTestId('m10-add-dependency')).toBeVisible()

  await createTripViaWizard(page, { name: 'Entfernkaskade', travelers: ['Andy'] })
  await openQuickAdd(page)
  await page.getByTestId('quick-add-input').locator('input').fill('Drohne')
  await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Drohne' }).first().click()
  await expect(page.getByTestId('m4-row-Akku')).toBeVisible()
  await page.keyboard.press('Escape')

  await openRowMenu(page, 'Drohne')
  await chooseInRowMenu(page, /remove from the list/i)

  // The dialog names the companion before anything is written…
  const alert = page.getByTestId('m4-remove-confirm')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('Akku')
  // …and declining is the positive signal that it is a question: both rows
  // are still on the list once it is gone.
  await alert.getByRole('button', { name: /cancel/i }).click()
  await expect(alert).toBeHidden()
  await expect(visiblePage(page).getByTestId('m4-row-Drohne')).toBeVisible()
  await expect(visiblePage(page).getByTestId('m4-row-Akku')).toBeVisible()

  await openRowMenu(page, 'Drohne')
  await chooseInRowMenu(page, /remove from the list/i)
  await page
    .getByTestId('m4-remove-confirm')
    .getByRole('button', { name: /^remove$/i })
    .click()

  await expect(visiblePage(page).getByTestId('m4-row-Drohne')).toHaveCount(0)
  await expect(visiblePage(page).getByTestId('m4-row-Akku')).toHaveCount(0)

  // Revealed, the two differ: the companion is a done row, skipped; the main
  // item is not there at all.
  await page.getByTestId('m4-done-bar').click()
  await expect(visiblePage(page).getByTestId('m4-row-Akku')).toContainText(/deliberately skipped/i)
  await expect(visiblePage(page).getByTestId('m4-row-Drohne')).toHaveCount(0)
})

// E2E-M4-95 (FR-5.8, G-9): removing the row whose detail is open closes the
// detail. On a desktop width the panel stands beside the list, so the row can
// be held while its panel is showing — and without the close, the panel stays
// behind reporting the item it was just asked to remove as not found.
test('E2E-M4-95: removing the open row closes its detail panel @local @m4', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await tripWithRows(page, ['Zelt', 'Schlafsack'], 'Entfernpanel')

  await visiblePage(page).getByTestId('m4-row-Zelt').getByRole('heading').click()
  // Not page-scoped: the panel is teleported into the frame's second pane.
  const panel = page.getByTestId('m5-panel')
  await expect(panel).toBeVisible()

  await openRowMenu(page, 'Zelt')
  await chooseInRowMenu(page, /remove from the list/i)

  await expect(visiblePage(page).getByTestId('m4-row-Zelt')).toHaveCount(0)
  await expect(panel).toHaveCount(0)
  await expect(page.getByTestId('m5-missing')).toHaveCount(0)
})
