import { test, expect, createTripViaWizard, visiblePage } from '../fixtures'
import { bootPage, uniq } from '../serverMode'
import { addSeriesTask, openSeries } from '../helpers/m16'

/**
 * E2E-M16-06 (FR-13.4, G-8) — a Single-User instance offers no default
 * assignee for a series task.
 *
 * `single` because only this mode has the shape: the directory is not empty —
 * the instance's one user is in it — so a gate on "anyone in the directory"
 * reads true here, where there is no one to hand a task to.
 */
test.describe('M16 series tasks, Single-User @single @m16', () => {
  test('E2E-M16-06: the task sheet offers no assignee and the row carries no seat', async ({
    browser,
  }) => {
    const series = `Engadin ${uniq()}`
    const page = await bootPage(await browser.newContext())
    await createTripViaWizard(page, { name: `${series} 2026`, series })
    await openSeries(page, series)

    // The sheet's day line is the positive signal that the sheet rendered its
    // body — the picker would sit right under it.
    await visiblePage(page).getByTestId('m16-task-add').click()
    const sheet = page.getByTestId('m16-task-sheet')
    await expect(sheet.getByTestId('m16-task-sheet-next-day')).toBeVisible()
    await expect(sheet.getByTestId('m16-task-sheet-who')).toHaveCount(0)
    await sheet.getByTestId('m16-task-sheet-close').click()
    await expect(sheet).toBeHidden()

    await addSeriesTask(page, 'Book the Bernina table', 7)
    const row = visiblePage(page)
      .getByTestId('m16-task-row')
      .filter({ hasText: 'Book the Bernina table' })
    await expect(row.getByTestId('m16-task-lead')).toHaveText('1 week before departure')
    await expect(row.getByTestId('m16-task-seat')).toHaveCount(0)
  })
})
