/**
 * The packing list (M4) as other specs need to *reach* it: a trip with rows
 * on it, the trip started, a row packed, a row's menu opened and chosen from.
 *
 * Every one of these was copied two or three times before it lived here, and
 * the copies had already drifted in their comments rather than their steps —
 * which is the drift that is cheap to fix and expensive to notice.
 */
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { createTripViaWizard, expectTripActionOffered, openQuickAdd, tripAction } from './trips'
import { visiblePage, writesLanded } from './page'
import { fillIonic } from './ionic'

/**
 * Create a trip through M3 and quick-add the named rows onto it. Returns the
 * trip's path, so a caller that navigates away can come back to it.
 *
 * The quick-add is closed with Escape and its disappearance awaited: the
 * sheet overlays the list, and a following click on a row would otherwise
 * land on the overlay that is still fading.
 */
export async function tripWithRows(page: Page, names: string[], tripName: string): Promise<string> {
  const path = await createTripViaWizard(page, { name: tripName, travelers: ['Andy'] })
  for (const name of names) {
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill(name)
    await page.getByTestId('quick-add-confirm').click()
    await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
  }
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-add-input')).toBeHidden()
  await writesLanded(page)
  return path
}

/** Move the open trip from planning into packing, and wait until it is there. */
export async function startTrip(page: Page): Promise<void> {
  await tripAction(page, 'start')
  await expectTripActionOffered(page, 'archive')
  await writesLanded(page)
}

/**
 * Pack one row by its name. The row leaving the open list is the rendered
 * evidence that the pack was written rather than merely clicked (FR-25.2).
 */
export async function packRow(page: Page, name: string): Promise<void> {
  await page.getByTestId(`m4-row-${name}`).getByTestId('row-check').locator('ion-checkbox').click()
  await expect(page.getByTestId(`m4-row-${name}`)).toHaveCount(0)
  await writesLanded(page)
}

/**
 * Open a row's action sheet. `contextmenu` rather than a long press: the
 * gesture's timing is unit-tested against a fake clock, and driving it here
 * through Ionic's own overlay on a warm app is what made three cases flaky.
 */
export async function openRowMenu(page: Page, name: string): Promise<void> {
  await page.getByTestId(`m4-row-${name}`).dispatchEvent('contextmenu')
  await expect(page.locator('ion-action-sheet')).toBeVisible()
}

/** Choose one action from an open row menu, and wait for the sheet to go. */
export async function chooseInRowMenu(page: Page, label: RegExp): Promise<void> {
  await page.locator('ion-action-sheet').getByRole('button', { name: label }).click()
  await expect(page.locator('ion-action-sheet')).toHaveCount(0)
}

/**
 * Turn one row into a per-person row for the named traveler, through M5's
 * for-whom strip (FR-25.28).
 *
 * The row is passed as a locator rather than a name because callers reach it
 * differently — scoped to the visible page, or from a filtered list. It goes
 * through M5 rather than the row's own seat for the same reason: M5's strip
 * has one name whatever the item is called. The lit toggle is the settled
 * signal that the write landed.
 */
export async function assignTraveler(
  page: Page,
  row: Locator,
  travelerName: string,
): Promise<void> {
  await row.click()
  await expect(page.getByTestId('m5-sheet')).toBeVisible()
  await lightTraveler(page, FOR_WHOM_M5, travelerName)
  await page.getByTestId('m5-close').click()
  await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
  await writesLanded(page)
}

/** The row on the visible page, for a caller that has no locator of its own. */
export function row(page: Page, name: string): Locator {
  return visiblePage(page).getByTestId(`m4-row-${name}`)
}

/**
 * Open a per-person cluster so its child rows render (FR-25.23).
 *
 * Since the cluster folds, and shut is its default, a test that wants a
 * traveler's own row has to say so. Idempotent on purpose: a caller should be
 * able to ask for the children without first knowing which state the head is
 * in, and the `aria-expanded` it toggles is the settled signal to wait on
 * rather than the child rows themselves.
 */
export async function openCluster(page: Page, name: string): Promise<void> {
  const head = visiblePage(page).getByTestId(`m4-cluster-${name}`)
  await expect(head).toBeVisible()
  if ((await head.getAttribute('aria-expanded')) === 'false') await head.click()
  await expect(head).toHaveAttribute('aria-expanded', 'true')
}

<<<<<<< HEAD
/** The `testKey` M5's for-whom strip carries; M4's carries the item's name. */
export const FOR_WHOM_M5 = 'm5'

/**
 * FR-25.28: unfold the for-whom strip under an item's row or cluster head.
 * Strict on purpose — a seat that is already open would fold on this tap, so a
 * caller that does not know says so by failing here rather than by toggling.
 */
export async function openForWhom(page: Page, itemName: string): Promise<Locator> {
  const list = visiblePage(page)
  const strip = list.getByTestId(`for-whom-strip-${itemName}`)
  await expect(strip).toHaveCount(0)
  await list.getByTestId(`for-whom-seat-${itemName}`).click()
  await expect(strip).toBeVisible()
  return strip
}

/** Light one traveler on an open strip; `key` is the item's name on M4, {@link FOR_WHOM_M5} in M5. */
export async function lightTraveler(page: Page, key: string, travelerName: string): Promise<void> {
  const toggle = page.getByTestId(`for-whom-${key}-${travelerName}`)
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
}

/**
 * Light a traveler in M5's strip and step their amount to `quantity`, settling
 * on each write. M5 is where a strip carries steppers; on M4 the amount is the
 * child row's own (FR-25.24).
 */
export async function setMemberInM5(page: Page, name: string, quantity: number): Promise<void> {
  await lightTraveler(page, FOR_WHOM_M5, name)
  const amount = page.getByTestId(`for-whom-qty-${FOR_WHOM_M5}-${name}`)
  await expect(amount).toHaveText('1')
  for (let n = 1; n < quantity; n += 1) {
    await page.getByTestId(`for-whom-plus-${FOR_WHOM_M5}-${name}`).click()
    await expect(amount).toHaveText(String(n + 1))
  }
=======
/**
 * FR-7.4: unfold M4's *Aufgaben für die Reise* section if it is closed, and
 * return it. It mounts closed, so every visit to a trip starts here.
 */
export async function openTripTodos(page: Page): Promise<Locator> {
  const section = visiblePage(page).getByTestId('m4-trip-todos')
  const toggle = section.getByTestId('m4-trip-todos-toggle')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await expect(section.getByTestId('trip-todo-list')).toBeVisible()
  return section
}

/**
 * FR-7.4: add a trip todo through M4's *Aufgaben für die Reise* section,
 * unfolding it first when it is closed. Ends with the todo listed and the
 * write landed, so a caller may navigate or reload straight after.
 */
export async function addTripTodo(page: Page, body: string): Promise<void> {
  const section = await openTripTodos(page)
  const field = section.getByTestId('trip-todo-input')
  await fillIonic(field, body)
  await field.locator('input').press('Enter')
  await expect(section.getByTestId(`trip-todo-${body}`)).toBeVisible()
  await writesLanded(page)
>>>>>>> origin/main
}
