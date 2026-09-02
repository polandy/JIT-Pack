/**
 * Luggage (M11): the sheet, the containers in it, and what is assigned to
 * one. The sheet's fields are reached through these steps, never one at a
 * time — and they are filled with the suite's own `fillIonic`, which is what
 * the private copy that used to live here was.
 */
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { fillIonic } from './ionic'
import { visiblePage } from './page'

/** M4 → M11 via the luggage button, waiting for *settled*, not arrived. */
export async function openLuggage(page: Page) {
  await visiblePage(page).getByTestId('m4-nav-luggage').click()
  await expect(visiblePage(page).getByTestId('m11-fab')).toBeVisible()
  // While the outgoing M4 still fades, both pages read as visible.
  await expect(visiblePage(page).getByTestId('m4-nav-luggage')).toHaveCount(0)
}

/**
 * Close M11's sheet and wait for the overlay to be fully gone — a click
 * arriving during the dismiss animation is swallowed by the backdrop.
 */
export async function closeContainerSheet(page: Page) {
  await page.getByTestId('m11-sheet-close').click()
  await expect(page.getByTestId('m11-sheet')).toHaveCount(0)
  await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
}

/**
 * FAB → sheet → name (＋ an optional limit in kg) — the FR-24.5 creation
 * path, and the only way any test can produce a container at all. Shared
 * rather than copied because the M12 unit needs a real bag with a real load
 * to render the Gepäck dimension (FR-10.4), and two copies of one
 * navigation sequence are how the M9 unit lost a wait (see e2e-tests.md).
 */
export async function createContainer(page: Page, name: string, limitKg?: string) {
  await visiblePage(page).getByTestId('m11-fab').click()
  await expect(page.getByTestId('m11-sheet')).toBeVisible()
  await fillIonic(page.getByTestId('m11-name-input'), name)
  await page.getByTestId('m11-name-input').locator('input').press('Enter')
  await expect(page.getByTestId('m11-sheet-name')).toHaveText(name)
  if (limitKg) {
    await fillIonic(page.getByTestId('m11-max-input'), limitKg)
    // The commit seam is blur (G-5) — Tab moves focus and produces one.
    await page.getByTestId('m11-max-input').locator('input').press('Tab')
  }
  await closeContainerSheet(page)
}

/** M11's own assignment path: the unassigned row's picker (FR-10.2). */
export async function assignToContainer(page: Page, item: string, container: string) {
  await visiblePage(page).getByTestId('m11-unassigned-row').filter({ hasText: item }).click()
  await expect(page.getByTestId('m11-picker')).toBeVisible()
  await page.getByTestId('m11-picker-option').filter({ hasText: container }).click()
  await expect(page.getByTestId('m11-picker')).toHaveCount(0)
  await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
}
