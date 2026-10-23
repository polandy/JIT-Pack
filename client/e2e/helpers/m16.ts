/**
 * The series screen (M16) as other specs need to *reach* it: its one door on
 * M2, and a series task written through its sheet (FR-13.4).
 */
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { PATH } from '../routes'
import { visiblePage } from './page'
import { fillIonic, chooseInSelect } from './ionic'

/**
 * Open M16 through M2's series header — the screen's only door, and one
 * locator on purpose: the grouping is what M2 keeps (E2E-M2-15's flat-list
 * alternative is struck).
 */
export async function openSeries(page: Page, name: string): Promise<void> {
  await page.goto(PATH.trips)
  await visiblePage(page).getByTestId(`series-header-${name}`).click()
  await expect(page.getByTestId('header-title')).toHaveText(name)
}

/**
 * Add one series task on the open M16, with a lead in days or none, and —
 * server mode only — a display name from the instance directory to seat
 * (G-8: Local Mode offers no picker at all, so `assignee` is never passed
 * there). The row appearing with the text is what says the write landed on
 * the profile.
 */
export async function addSeriesTask(
  page: Page,
  text: string,
  lead?: number,
  assignee?: string,
): Promise<void> {
  await visiblePage(page).getByTestId('m16-task-add').click()
  const sheet = page.getByTestId('m16-task-sheet')
  await expect(sheet).toBeVisible()
  if (lead !== undefined) await sheet.getByTestId(`m16-task-sheet-lead-${lead}`).click()
  await fillIonic(sheet.getByTestId('m16-task-sheet-text'), text)
  await sheet.getByTestId('m16-task-sheet-text').locator('input').press('Enter')
  if (assignee !== undefined) await chooseInSelect(page, 'm16-task-sheet-who', assignee)
  await sheet.getByTestId('m16-task-sheet-close').click()
  await expect(sheet).toBeHidden()
  await expect(visiblePage(page).getByTestId('m16-task-row').filter({ hasText: text })).toHaveCount(
    1,
  )
}
