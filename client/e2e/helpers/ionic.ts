/**
 * Ionic's own controls, as the suite has to drive them — a field, a select,
 * a date picker. Not a screen: what is here is true wherever the control
 * appears.
 */
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/**
 * Type into an `ion-input`.
 *
 * Three things are deliberate. The hydration class is waited for first,
 * because a component that has not upgraded yet swallows the keys it is
 * given. `fill('')` clears whatever the field carried, and the value is then
 * typed key by key: Ionic's value binding follows `input` events, and a
 * one-shot `fill` sets the DOM value without ever emitting one — the field
 * shows the text and the app never hears it. The value assertion at the end
 * is the settled signal that it did.
 */
export async function fillIonic(field: Locator, value: string): Promise<void> {
  await expect(field).toHaveClass(/hydrated/)
  const input = field.locator('input')
  await input.click()
  await input.fill('')
  await input.pressSequentially(value)
  await expect(input).toHaveValue(value)
}

/**
 * Sets a DateField (ADR-035): opens its picker sheet, walks the calendar to
 * the target month with the header arrows and confirms the day. Replaces the
 * fill() that drove the native date input the field used to be. Every hop
 * asserts the rendered month header, so the walk is bounded and observable —
 * never a wait.
 */
export async function setDateField(page: Page, testid: string, iso: string): Promise<void> {
  const [year, month, day] = iso.split('-').map(Number)
  await page.getByTestId(testid).click()
  const picker = page.getByTestId(`${testid}-picker`)
  await expect(picker).toBeVisible()

  const headerFor = (y: number, m: number) =>
    new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
  const monthIndex = (name: string) =>
    Array.from({ length: 12 }, (_, i) =>
      new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2000, i, 1)),
    ).indexOf(name) + 1

  const target = headerFor(year, month)
  const MAX_HOPS = 36
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const shown = (await picker.locator('.calendar-month-year').innerText()).trim()
    if (shown === target) break
    if (hop === MAX_HOPS) throw new Error(`date picker never reached ${target}, still at ${shown}`)
    const [shownMonth, shownYear] = shown.split(' ')
    const forward = Number(shownYear) * 12 + monthIndex(shownMonth) < year * 12 + month
    const arrows = picker.locator('.calendar-next-prev ion-button')
    await arrows.nth(forward ? 1 : 0).click()
    await expect(picker.locator('.calendar-month-year')).not.toHaveText(shown)
  }

  // The working (centre) grid is the navigated month; the neighbours can
  // carry the same day as an adjacent-day cell, so the scope matters.
  const cell = picker.locator(
    `.calendar-month:nth-child(2) .calendar-day[data-day="${day}"][data-month="${month}"][data-year="${year}"]`,
  )

  // Dispatched, not clicked at a point. A real click is delivered at
  // coordinates, and the calendar may still be scrolling its grids into
  // place: a point that lands one month over selects the day at the same row
  // and column — 22 August and 26 September 2026 are both the fourth Saturday
  // — and Ionic *confirms* immediately on an adjacent-day cell, so the wrong
  // date is taken silently and surfaces screens later. The day button carries
  // a plain `onClick`, so dispatching removes the coordinates from the
  // question entirely rather than racing them.
  //
  // Enabled is asserted first, because dispatching also bypasses the
  // `disabled` a bound puts on an out-of-range day (FR-2.1d) — the helper
  // must not be able to set what the app refuses to offer.
  await expect(cell).toBeEnabled()
  await cell.dispatchEvent('click')

  await picker.getByText('Done', { exact: true }).click()
  await expect(picker).toBeHidden()
}

/**
 * Pick a value from an `ion-select`'s popover. The options live in a
 * detached `ion-popover`, not under the select, so they are addressed from
 * the page and the popover's disappearance is what says the write landed.
 */
export async function chooseInSelect(page: Page, testid: string, label: string) {
  await page.getByTestId(testid).click()
  const popover = page.locator('ion-popover ion-select-popover')
  await expect(popover).toBeVisible()
  await popover.locator('ion-item', { hasText: label }).click()
  await expect(page.locator('ion-popover')).toHaveCount(0)
}
