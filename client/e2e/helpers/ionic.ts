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
 * the target month with the keyboard and confirms the day. Replaces the
 * fill() that drove the native date input the field used to be. Every hop
 * asserts the rendered month header, so the walk is bounded and observable —
 * never a wait.
 */
export async function setDateField(page: Page, testid: string, iso: string): Promise<void> {
  // Destructuring an array is `T | undefined` under `noUncheckedIndexedAccess`,
  // and the compiler is right: `setDateField(page, id, 'tomorrow')` would have
  // walked the calendar towards `NaN` until the hop budget ran out.
  const [year, month, day] = iso.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`setDateField expects an ISO date, got ${iso}`)
  }
  await page.getByTestId(testid).click()
  const picker = page.getByTestId(`${testid}-picker`)
  await expect(picker).toBeVisible()
  /*
   * Visible is not usable, and the difference is the whole of E2E-M4-23's
   * WebKit failure (2026-09-04). `ion-datetime` attaches the scroll listener
   * that recomputes the month header inside `markReady()`, and marks itself
   * with this class in the same breath; the header arrows are clickable the
   * entire time before that, because only `.calendar-body` is held at
   * `opacity: 0`. So a hop taken too early scrolls the grid to the next
   * month and **nothing recomputes the header** — the walk below steps
   * forward and reads September for all thirty-six hops. Waiting for the
   * class is waiting for the mechanism, not for a duration: `markReady` is
   * driven by an IntersectionObserver on a picker that has just been
   * presented in an animating sheet.
   */
  await expect(picker).toHaveClass(/datetime-ready/)

  const headerFor = (y: number, m: number) =>
    new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
  const monthIndex = (name: string) =>
    Array.from({ length: 12 }, (_, i) =>
      new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2000, i, 1)),
    ).indexOf(name) + 1

  const target = headerFor(year, month)
  const header = picker.locator('.calendar-month-year')
  const working = picker.locator('.calendar-month:nth-child(2)')

  /*
   * A hop is PageDown/PageUp on a focused day cell, not a click on the
   * header arrow. The arrow is a *smooth scroll* of the calendar body by two
   * months' width, and the header is recomputed by a scroll listener 50 ms
   * after the last scroll event — and only if the month it finds there is
   * aligned with the body to within 2 px. A smooth scroll that stops short,
   * which a loaded WebKit does (`main` at `b6d2f0d5`, `e2e (7)`), leaves the
   * header on the month it showed and nothing ever recomputes it; a second
   * click would be a guess about where the body stopped. The keyboard path
   * sets the working month directly and re-renders from it: no scroll, no
   * listener, no alignment. Ionic attaches that listener in `markReady()`,
   * which is what the `datetime-ready` wait above is for.
   *
   * The key acts on the focused cell's date, and a hop whose landing day is
   * outside the field's bounds (FR-2.1d) is ignored — so the cell focused is
   * the enabled day nearest the target's day-of-month. Every month between
   * here and the target then lands inside the bound, since the bound is a
   * single date on one side and the target itself is inside it.
   */
  const MAX_HOPS = 36
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const shown = (await header.innerText()).trim()
    if (shown === target) break
    if (hop === MAX_HOPS) throw new Error(`date picker never reached ${target}, still at ${shown}`)
    const [shownMonth = '', shownYear = ''] = shown.split(' ')
    const shownIndex = monthIndex(shownMonth)
    const forward = Number(shownYear) * 12 + shownIndex < year * 12 + month
    const nearest = await working
      .locator(
        `.calendar-day[data-month="${shownIndex}"][data-year="${shownYear}"]:not([disabled])`,
      )
      .evaluateAll(
        (cells, wanted) =>
          cells
            .map((cell) => Number(cell.getAttribute('data-day')))
            .reduce((best, d) => (Math.abs(d - wanted) < Math.abs(best - wanted) ? d : best)),
        day,
      )
    await working
      .locator(`.calendar-day[data-day="${nearest}"][data-month="${shownIndex}"]`)
      .focus()
    await page.keyboard.press(forward ? 'PageDown' : 'PageUp')
    await expect(header).not.toHaveText(shown)
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
