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
import { visiblePage } from './page'

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
  return path
}

/** Move the open trip from planning into packing, and wait until it is there. */
export async function startTrip(page: Page): Promise<void> {
  await tripAction(page, 'start')
  await expectTripActionOffered(page, 'archive')
}

/**
 * Pack one row by its name. The row leaving the open list is the rendered
 * evidence that the pack was written rather than merely clicked (FR-25.2).
 */
export async function packRow(page: Page, name: string): Promise<void> {
  await page.getByTestId(`m4-row-${name}`).getByTestId('row-check').locator('ion-checkbox').click()
  await expect(page.getByTestId(`m4-row-${name}`)).toHaveCount(0)
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
 * membership sheet.
 *
 * The row is passed as a locator rather than a name because callers reach it
 * differently — scoped to the visible page, or from a filtered list. The
 * roster itself is a view: only the checkbox converts the row (FR-25.21), and
 * the amount it then shows is the settled signal that the write landed.
 */
export async function assignTraveler(
  page: Page,
  row: Locator,
  travelerName: string,
): Promise<void> {
  await row.click()
  await expect(page.getByTestId('m5-sheet')).toBeVisible()
  await page.getByTestId('m5-details').click()
  await page.getByTestId('m5-membership').click()
  await expect(page.getByTestId('membership-sheet')).toBeVisible()
  await page.getByTestId('membership-per-person').click()
  await page.getByTestId(`membership-check-${travelerName}`).click()
  await expect(page.getByTestId(`membership-qty-${travelerName}`)).toHaveText('1')
  await page.getByTestId('membership-close').click()
  await expect(page.getByTestId('membership-sheet')).toHaveCount(0)
  await page.getByTestId('m5-close').click()
  await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
}

/** The row on the visible page, for a caller that has no locator of its own. */
export function row(page: Page, name: string): Locator {
  return visiblePage(page).getByTestId(`m4-row-${name}`)
}
