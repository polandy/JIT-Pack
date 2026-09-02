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

/**
 * How many packs this screen has announced. A counter rather than a look
 * for a toast: see the note at its only assertion.
 */
async function announcements(page: Page): Promise<number> {
  const value = await visiblePage(page)
    .locator('ion-content.pack-content')
    .getAttribute('data-pack-announcements')
  return Number(value)
}

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

  // The row leaves — the behaviour FR-25.2 already had — *and* says so,
  // which it did not. `packing.packedToast` was translated in both
  // catalogues months ago and had zero call sites until now.
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

// E2E-M4-35 (FR-25.2): un-packing is not a pack, so it gets no snackbar.
test('E2E-M4-35: un-checking a revealed row offers no undo @local @m4', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize({ width: 390, height: 844 })
  await tripWithRows(page, ['Zelt'], 'Packprobe')

  await check(page, 'Zelt')
  await expect(page.locator('ion-toast.pack-toast')).toBeVisible()

  // Reload rather than wait the snackbar out. Waiting for it to dismiss
  // would make this case depend on the 3 s duration — an observable state,
  // but one that only arrives because a clock ran, which is the shape this
  // project bans. A reload leaves the pack in place and the overlay gone.
  await page.reload()
  await expect(page.locator('ion-toast.pack-toast')).toHaveCount(0)

  const before = await announcements(page)

  // Reveal the packed row and un-pack it from there. The result of *that*
  // is already on screen — the row stays put — so a snackbar would announce
  // something the user can see, and offer to undo an undo.
  await page.getByTestId('m4-done-bar').click()
  const row = visiblePage(page).getByTestId('m4-row-Zelt')
  await expect(row).toBeVisible()
  await check(page, 'Zelt')

  // Asserted against a counter, not against "no toast is on screen right
  // now". The snackbar is created asynchronously, so a bare absence check
  // arrives first and passes on a page that was about to show one — proved
  // by removing the guard in the page and watching this case stay green.
  //
  // The un-pack landing is the positive signal that the comparison is
  // being made against a page where something actually happened.
  await expect(page.getByTestId('m4-done-bar')).toBeHidden()
  expect(await announcements(page)).toBe(before)
})
