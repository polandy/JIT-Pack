import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { fillIonic } from './ionic'
import { visiblePage, writesLanded } from './page'
import { openTripView } from './trips'

/**
 * M27 — a trip's excursions (FR-31). The steps more than one case takes: reach
 * the view, create an excursion through the FAB's sheet, and address a line.
 */

/** The open trip's excursions, reached by their pill. Returns the visible page. */
export async function openExcursions(page: Page): Promise<Locator> {
  await openTripView(page, 'excursions')
  const m27 = visiblePage(page)
  await expect(m27.getByTestId('m27-fab')).toBeVisible()
  return m27
}

export interface ExcursionSeed {
  name: string
  /** The Gruppe to start from; absent starts empty. */
  group?: string
  /** Who goes by name; absent is everybody. */
  who?: string[]
}

/**
 * Create an excursion from M27 and land on its own list (FR-31.1–31.3). Ends
 * with the write on the device and the list's page rendered.
 */
export async function createExcursion(page: Page, seed: ExcursionSeed): Promise<Locator> {
  await visiblePage(page).getByTestId('m27-fab').click()
  const sheet = page.getByTestId('m27-sheet')
  await expect(sheet.getByTestId('m27-sheet-title')).toBeVisible()
  await fillIonic(sheet.getByTestId('m27-name'), seed.name)
  // The first name tapped while everybody goes names just them; each next
  // one joins (FR-31.3).
  for (const person of seed.who ?? []) {
    await sheet.getByTestId(`m27-who-${person}`).click()
    await expect(sheet.getByTestId(`m27-who-${person}`)).toHaveAttribute('aria-pressed', 'true')
  }
  if (seed.group) {
    await sheet.getByTestId(`m27-group-${seed.group}`).click()
    await expect(sheet.getByTestId('m27-suitcase-note')).toBeVisible()
  }
  await sheet.getByTestId('m27-save').click()
  // The list's own page, not the sheet's absence: the list mounts an edit
  // sheet of its own under the same testid, closed.
  const list = visiblePage(page)
  await expect(list.getByTestId('m27-excursion-page')).toBeVisible()
  await expect(page.getByTestId('header-title')).toHaveText(seed.name)
  await writesLanded(page)
  return list
}

/** One line of the open excursion, by its name (or `name-person` under a cluster). */
export function excursionLine(page: Page, key: string): Locator {
  return visiblePage(page).getByTestId(`excursion-line-${key}`)
}

/** Tick one line's check and wait for the write. */
export async function tickExcursionLine(page: Page, key: string): Promise<void> {
  await excursionLine(page, key).locator('ion-checkbox').click()
  await expect(excursionLine(page, key).locator('ion-checkbox')).toHaveJSProperty('checked', true)
  await writesLanded(page)
}

/** Choose an entry of the open excursion's ⋮ (edit, save as group, delete). */
export async function excursionMenu(
  page: Page,
  id: 'm27-edit' | 'm27-save-as-group' | 'm27-delete',
) {
  await page.getByTestId('header-overflow').click()
  const sheet = page.locator('ion-action-sheet')
  await expect(sheet).toBeVisible()
  await sheet.getByTestId(id).click()
  await expect(sheet).toHaveCount(0)
}
