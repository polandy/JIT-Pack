import { test, expect, visiblePage, useReducedMotion } from './fixtures'
import type { Page } from '@playwright/test'
import { tripWithRows } from './helpers/m4'

/**
 * Pack-out and undo (UI-Test-Spec §3, M4; Addendum FR-25.2).
 *
 * M4 hides a row as soon as it is done — the point of the screen, and the
 * reason a mistap removes its own evidence. FR-25.2 answers with a snackbar
 * carrying one undo; these assert the answer, not the animation.
 *
 * **Reduced motion is on for this file.** Not to make the tests pass: with
 * it the production code takes its own no-motion path (`onRowLeave` finishes
 * immediately), so what is asserted is the outcome — the row left, the
 * snackbar came, the undo put it back — rather than how long a transition
 * took. Asserting a 300 ms collapse would be the timing dependency this
 * project forbids, and it would be testing CSS rather than behaviour.
 */
useReducedMotion(test)

/** Tap a row's checkbox. */
function check(page: Page, name: string) {
  return page.getByTestId(`m4-row-${name}`).getByTestId('row-check').locator('ion-checkbox').click()
}

// E2E-M4-33 (FR-25.2): packing says so, and the saying is undoable.
test('E2E-M4-33: a packed row leaves and the snackbar puts it back @local @m4', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize({ width: 390, height: 844 })
  await tripWithRows(page, ['Zelt', 'Schlafsack'], 'Packprobe')

  await check(page, 'Schlafsack')

  // The row leaves (FR-25.2) *and* says so, through `packing.packedToast` —
  // a key that is translated in both catalogues whether or not anything
  // calls it.
  await expect(page.getByTestId('m4-row-Schlafsack')).toBeHidden()
  const toast = page.locator('ion-toast.pack-toast')
  await expect(toast).toBeVisible()
  await expect(toast).toContainText('Schlafsack')

  // And back. Before this, recovering a mistap meant finding the reveal
  // bar, showing the done rows, finding yours, and un-checking it.
  await toast.getByRole('button').click()
  await expect(visiblePage(page).getByTestId('m4-row-Schlafsack')).toBeVisible()

  // Restored to *open*, not merely visible: a row that came back still
  // marked done would sit under the reveal bar rather than in the list.
  await expect(page.getByTestId('m4-done-bar')).toBeHidden()
})

// E2E-M4-34 (FR-25.2): one snackbar, not a stack.
test('E2E-M4-34: packing several rows leaves one undo, for the last of them @local @m4', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize({ width: 390, height: 844 })
  await tripWithRows(page, ['Zelt', 'Schlafsack', 'Stirnlampe'], 'Packprobe')

  await check(page, 'Zelt')
  await check(page, 'Schlafsack')

  // Packing a list is a run of taps, not one considered act. A queue of
  // snackbars would bury the list it reports on, and "undo" would come to
  // mean "undo the oldest".
  await expect(page.locator('ion-toast.pack-toast')).toHaveCount(1)
  const toast = page.locator('ion-toast.pack-toast')
  await expect(toast).toContainText('Schlafsack')

  await toast.getByRole('button').click()
  await expect(visiblePage(page).getByTestId('m4-row-Schlafsack')).toBeVisible()
  // The earlier pack stays packed — undo is one step, not a rewind.
  await expect(page.getByTestId('m4-row-Zelt')).toBeHidden()
})

// E2E-M4-35 is reversed by FR-25.31: un-packing is announced, and its undo is
// E2E-M4-120 in undo-every-act.spec.ts.
