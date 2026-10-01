import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { fillIonic } from './ionic'
import { visiblePage } from './page'
import { openTripView } from './trips'

/**
 * M29 — the trip's day plan (FR-29.14, FR-29.15), the planner module's
 * second screen.
 */

/** The day plan, on the page the outlet shows. */
export function dayPlan(page: Page): Locator {
  return visiblePage(page).getByTestId('m29-page')
}

/** Reach the plan through the switcher; ends with its strip on screen. */
export async function openDayPlan(page: Page): Promise<Locator> {
  await openTripView(page, 'dayplan')
  const plan = dayPlan(page)
  await expect(plan.getByTestId('m29-strip')).toBeVisible()
  return plan
}

/** Choose a day on the strip; ends with it chosen. */
export async function chooseDay(page: Page, day: string): Promise<void> {
  const tile = dayPlan(page).getByTestId(`m29-day-${day}`)
  await tile.click()
  await expect(tile).toHaveAttribute('aria-selected', 'true')
}

/** The chosen day's timeline. */
export function timeline(page: Page): Locator {
  return dayPlan(page).getByTestId('m29-timeline')
}

/** The chosen day's lines, in the order they stand. */
export function timelineLines(page: Page): Locator {
  return timeline(page).locator('[data-testid^="m29-line-"]')
}

/** A calendar day `n` days from today, `YYYY-MM-DD` in local time. */
export function dayFromToday(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Write an entry of the plan's own on the chosen day; ends with its line. */
export async function addDayEntry(
  page: Page,
  entry: { title: string; note?: string; time?: string },
): Promise<void> {
  await dayPlan(page).getByTestId('m29-fab').click()
  const sheet = page.getByTestId('day-entry')
  await fillIonic(sheet.getByTestId('day-entry-name'), entry.title)
  if (entry.note) await sheet.getByTestId('day-entry-note').locator('textarea').fill(entry.note)
  if (entry.time) await sheet.getByTestId('day-entry-time').locator('input').fill(entry.time)
  await sheet.getByTestId('day-entry-save').click()
  await expect(page.getByTestId('day-entry-save')).toHaveCount(0)
  await expect(timelineLines(page).filter({ hasText: entry.title })).toBeVisible()
}

/** Open the ＋ sheet on its *Connection* segment; ends with the link field on screen. */
export async function openConnectionSheet(page: Page): Promise<Locator> {
  await dayPlan(page).getByTestId('m29-fab').click()
  const sheet = page.getByTestId('day-entry')
  await sheet.getByTestId('day-entry-kind-connection').click()
  await expect(sheet.getByTestId('day-entry-link')).toBeVisible()
  return sheet
}

/**
 * Paste `text` into the connection's link field, as a paste from the
 * keyboard or the context menu delivers it: one `paste` event carrying the
 * text. WebKit grants no clipboard permission to a test, so the event is
 * built here rather than read from a clipboard.
 */
export async function pasteLink(sheet: Locator, text: string): Promise<void> {
  await sheet
    .getByTestId('day-entry-link')
    .locator('input')
    .evaluate((input, value) => {
      const data = new DataTransfer()
      data.setData('text/plain', value)
      input.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      )
    }, text)
}
