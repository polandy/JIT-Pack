import { test, expect, createTripViaWizard, openQuickAdd } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * "Deliberately not packed" (UI-Test-Spec §3, M4/M5; Addendum FR-5.5, FR-20.2).
 *
 * The distinction FR-5.5 exists to keep is *left behind on purpose* versus
 * *forgotten*, and until this unit there was no way to say the first: the
 * state was reachable only through a bare Ionic swipe that nothing
 * announced and whose option panel broke out of the row's card.
 *
 * The two paths are asserted separately because they are separate promises:
 * M4's press-and-hold is the fast one, the M5 sheet's control is the
 * findable one, and a screen keeping its half says nothing about the other.
 *
 * **Reduced motion is on**, for the same reason as pack-out.spec.ts: the
 * production code takes its own no-motion path, so what is asserted is the
 * outcome rather than the length of a transition.
 */
test.use({ reducedMotion: 'reduce' })

/** The visible page, never the document — a route that does not repaint
 *  leaves the previous screen's markup in the outlet. */
const shown = (page: Page) => page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')

async function tripWithRows(page: Page, names: string[]) {
  await createTripViaWizard(page, { name: 'Weglassprobe', travelers: ['Andy'] })
  for (const name of names) {
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill(name)
    await page.getByTestId('quick-add-confirm').click()
    await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
  }
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-add-input')).toBeHidden()
}

/**
 * Open a row's menu.
 *
 * `contextmenu` rather than a held pointer: the 500 ms themselves are unit
 * tested with fake timers in `useLongPress`, and driving a real hold here
 * would be a duration this suite is not allowed to depend on. Both events
 * reach the same handler, so what the case covers is the menu and what it
 * does — not which input produced it.
 */
async function openRowMenu(page: Page, name: string) {
  await page.getByTestId(`m4-row-${name}`).dispatchEvent('contextmenu')
  await expect(page.locator('ion-action-sheet')).toBeVisible()
}

/** Dismissal is part of the interaction: the next tap lands on the overlay
 *  until the sheet is gone. */
async function chooseInRowMenu(page: Page, label: RegExp) {
  await page.locator('ion-action-sheet').getByRole('button', { name: label }).click()
  await expect(page.locator('ion-action-sheet')).toHaveCount(0)
}

// E2E-M4-37 (FR-5.5): the row can be told to stay at home, and it says so.
test('M4: a row can be marked deliberately not packed @local @m4', async ({ page, seedMode }) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize({ width: 390, height: 844 })
  await tripWithRows(page, ['Zelt', 'Schlafsack'])

  await openRowMenu(page, 'Zelt')
  await chooseInRowMenu(page, /do not pack this/i)

  // It counts as done (FR-25.2), so it leaves the working list…
  await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)
  await expect(page.getByTestId('m4-row-Schlafsack')).toBeVisible()
  // …and the snackbar says what happened rather than letting a row vanish.
  await expect(page.locator('ion-toast.pack-toast')).toContainText('Zelt')

  // Revealed with the other done rows, and named as a decision — the whole
  // point of the state is that it is distinguishable from "forgotten".
  await page.getByTestId('m4-done-bar').click()
  await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
  await expect(page.getByTestId('m4-row-Zelt')).toContainText(/deliberately skipped/i)
})

// E2E-M4-38 (FR-5.5): the snackbar's undo returns the row to the *open*
// list, not merely to the revealed one — a row recovered into the done
// section would still read as decided.
test('M4: the undo puts a skipped row back on the open list @local @m4', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize({ width: 390, height: 844 })
  await tripWithRows(page, ['Zelt'])

  await openRowMenu(page, 'Zelt')
  await chooseInRowMenu(page, /do not pack this/i)
  await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)

  await page.locator('ion-toast.pack-toast').getByRole('button', { name: /undo/i }).click()

  await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
  // Nothing is left in the done section, so the row is open rather than
  // hidden — the reveal bar only exists while something is done.
  await expect(page.getByTestId('m4-done-bar')).toBeHidden()
})

// E2E-M4-39 (FR-5.5): un-skipping reads as the opposite of the decision,
// not as "undo", and is reachable long after the snackbar is gone.
test('M4: a skipped row offers to be packed after all @local @m4', async ({ page, seedMode }) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize({ width: 390, height: 844 })
  await tripWithRows(page, ['Zelt'])

  await openRowMenu(page, 'Zelt')
  await chooseInRowMenu(page, /do not pack this/i)
  await page.getByTestId('m4-done-bar').click()
  await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

  await openRowMenu(page, 'Zelt')
  // The menu on a skipped row offers the reverse and *only* the reverse:
  // "pack now" on a row nobody is packing would be a third state.
  await expect(
    page.locator('ion-action-sheet').getByRole('button', { name: /do not pack this/i }),
  ).toHaveCount(0)
  await chooseInRowMenu(page, /pack it after all/i)

  await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
  await expect(page.getByTestId('m4-row-Zelt')).not.toContainText(/deliberately skipped/i)
})

// E2E-M4-41 (FR-5.5, UI-Spec M4): the row keeps its tap. The hold and the
// tap live on the same element, and M7 paid for this once already — the
// release of a hold usually lands on the overlay rather than the row, so a
// "swallow the next click" flag goes stale and eats a later, legitimate tap.
test('M4: the row menu neither opens the sheet nor eats the next tap @local @m4', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize({ width: 390, height: 844 })
  await tripWithRows(page, ['Zelt'])

  await openRowMenu(page, 'Zelt')
  // Holding must not also open the detail — one gesture, one outcome.
  await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
  await chooseInRowMenu(page, /cancel/i)

  await page.getByTestId('m4-row-Zelt').click()
  await expect(page.getByTestId('m5-sheet')).toBeVisible()
})

/** Create a master item through M9/M10's own path. */
async function createMasterItem(page: Page, name: string) {
  await page.goto('/tabs/items')
  await shown(page).getByTestId('m9-fab').click()
  await shown(page).getByTestId('m10-name').locator('input').fill(name)
  await shown(page).getByTestId('m10-create').click()
  await expect(page.getByTestId('header-title')).toHaveText(name)
}

// E2E-M4-40 (FR-5.5 with FR-20.2): the cascade is the reason the snackbar
// carries names at all — a list that shortened itself by two rows on one
// tap owes the user an account of the second.
test('M4: skipping a main item names the companion it took along @local @m4', async ({
  page,
  seedMode,
}) => {
  // Builds its world through M10 and M4 (spec §2.4) rather than by
  // injection, which is several screens' worth of navigation.
  test.slow()
  await seedMode({ mode: 'local' })
  await page.setViewportSize({ width: 390, height: 844 })

  await createMasterItem(page, 'Drohne')
  await createMasterItem(page, 'Akku')
  // The editor is already open on the Akku: it depends on the Drohne.
  await shown(page).getByTestId('m10-add-dependency').click()
  await shown(page).getByTestId('m10-dependency-main-Drohne').click()
  await expect(shown(page).getByTestId('m10-add-dependency')).toBeVisible()

  await createTripViaWizard(page, { name: 'Cascade', travelers: ['Andy'] })
  await openQuickAdd(page)
  await page.getByTestId('quick-add-input').locator('input').fill('Drohne')
  // The *suggestion*, not the free text: a row that carries no master item
  // has no dependencies, and the cascade would have nothing to take along.
  await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Drohne' }).first().click()
  // FR-20.4: the required companion joins on its own.
  await expect(page.getByTestId('m4-row-Akku')).toBeVisible()
  await page.keyboard.press('Escape')

  await openRowMenu(page, 'Drohne')
  await chooseInRowMenu(page, /do not pack this/i)

  // Both rows left, and the snackbar names the one the user did not touch.
  await expect(page.getByTestId('m4-row-Drohne')).toHaveCount(0)
  await expect(page.getByTestId('m4-row-Akku')).toHaveCount(0)
  await expect(page.locator('ion-toast.pack-toast')).toContainText('Akku')

  // The revealed companion says whose decision took it (FR-20.2)…
  await page.getByTestId('m4-done-bar').click()
  await expect(page.getByTestId('m4-row-Akku')).toContainText(/Drohne/)

  // …and the one undo puts the whole cascade back, not only the row tapped.
  await page.locator('ion-toast.pack-toast').getByRole('button', { name: /undo/i }).click()
  await expect(page.getByTestId('m4-row-Drohne')).toBeVisible()
  await expect(page.getByTestId('m4-row-Akku')).toBeVisible()
  await expect(page.getByTestId('m4-row-Akku')).not.toContainText(/skipped/i)
})

// E2E-M5-16 (FR-5.5): the findable half. The stepper says how many; only
// this says "none, on purpose", and it is spelled out rather than held.
test('M5: the sheet says a thing is not coming, and takes it back @local @m5', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize({ width: 390, height: 844 })
  await tripWithRows(page, ['Zelt'])

  await page.getByTestId('m4-row-Zelt').click()
  await expect(page.getByTestId('m5-sheet')).toBeVisible()

  const control = page.getByTestId('m5-skip')
  await expect(control).toContainText(/do not pack this/i)
  await control.click()

  // The sheet reports the new state, and the control now offers its reverse.
  await expect(page.getByTestId('m5-sheet')).toContainText(/skipped/i)
  await expect(control).toContainText(/pack it after all/i)

  await control.click()
  await expect(control).toContainText(/do not pack this/i)
  await expect(page.getByTestId('m5-sheet')).not.toContainText(/skipped/i)
})
