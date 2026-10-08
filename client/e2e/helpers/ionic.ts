/**
 * Ionic's own controls, as the suite has to drive them — a field, a select,
 * a date picker. Not a screen: what is here is true wherever the control
 * appears.
 */
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { PRESENTED_POPOVER } from './page'

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
 * the target month with the keyboard and confirms the day — the field is not a
 * native date input, so fill() cannot drive it. Every hop asserts the rendered
 * month header, so the walk is bounded and observable — never a wait.
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
   * Visible is not usable, twice over. The sheet is visible from the first
   * frame of its enter animation, and Ionic's `didPresent` comes only at the
   * animation's end — measured at 2.9 s on a loaded WebKit, so it gets its
   * own wait and its own budget. Then `ion-datetime` has to be *ready*:
   * `markReady()` is what attaches the keyboard and scroll listeners the walk
   * below relies on and unhides `.calendar-body`; before it, a key is
   * accepted and dropped. `DateField` mounts the calendar afresh on
   * `didPresent` so that readiness follows the presentation rather than an
   * IntersectionObserver that reports whenever it likes; the two waits are
   * therefore for two mechanisms, in the order they happen.
   */
  await expect(page.locator('ion-modal', { has: picker })).toHaveAttribute('data-presented', 'true')
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
   * The key acts on the focused cell's date, so the cell focused is the
   * enabled day nearest the target's day-of-month — the 31st where the shown
   * month has one, its last day where it does not.
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
  // Enabled is asserted first, because dispatching also bypasses a
  // `disabled` day — the helper must not be able to set what the app
  // refuses to offer.
  await expect(cell).toBeEnabled()
  await cell.dispatchEvent('click')

  await picker.getByText('Done', { exact: true }).click()
  await expect(picker).toBeHidden()
}

/** How many *Frühere/Spätere Monate* taps a range helper may spend reaching a day. */
const MAX_MONTH_LOADS = 10

/**
 * Loads months until the day's is listed: an unbounded calendar lists a
 * window around where it opened and grows by a tap at either end. Each tap
 * is confirmed by the month count growing, never by a wait.
 */
async function revealMonth(picker: Locator, testid: string, day: string): Promise<void> {
  const months = picker.locator('[data-month]')
  const wanted = day.slice(0, 7)
  for (let load = 0; (await picker.locator(`[data-month="${wanted}"]`).count()) === 0; load++) {
    if (load === MAX_MONTH_LOADS) throw new Error(`range picker never listed ${wanted}`)
    const first = (await months.first().getAttribute('data-month')) ?? ''
    const listed = await months.count()
    await picker.getByTestId(wanted < first ? `${testid}-earlier` : `${testid}-later`).click()
    await expect(months).not.toHaveCount(listed)
  }
}

/**
 * Sets a DateRangeField (G-17, ADR-080): opens its sheet, chooses each given
 * side in the sheet's head and taps its day, then confirms. A side left out
 * keeps what the field held. The calendar is a plain list of day buttons, so
 * a tap is a click — Playwright scrolls the month into view itself.
 */
export async function setDateRange(
  page: Page,
  testid: string,
  range: { start?: string; end?: string },
): Promise<void> {
  await page.getByTestId(testid).click()
  const picker = page.getByTestId(`${testid}-picker`)
  await expect(picker).toBeVisible()
  for (const side of ['start', 'end'] as const) {
    const day = range[side]
    if (!day) continue
    await picker.getByTestId(`${testid}-${side}`).click()
    const cell = picker.locator(`[data-day="${day}"]`)
    await revealMonth(picker, testid, day)
    // Enabled first: a bound (FR-2.1d, FR-31.1) is what the app refuses to
    // offer, and the helper must not be able to set it anyway.
    await expect(cell).toBeEnabled()
    await cell.click()
    await expect(cell).toHaveAttribute('aria-pressed', 'true')
  }
  await picker.getByTestId(`${testid}-apply`).click()
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
  await expect(page.locator(PRESENTED_POPOVER)).toHaveCount(0)
}

/**
 * An `ion-input` whose value stands in a painted box rather than as a caption
 * under its label (UX-21): the wrapper around the native input carries a
 * background, and one that differs from the surface the field sits on — the
 * same colour would draw no box at all.
 */
export async function expectValueInABox(field: Locator, surface: Locator): Promise<void> {
  await expect(field).toHaveClass(/hydrated/)
  const background = (el: Element) => getComputedStyle(el).backgroundColor
  const box = await field.locator('.native-wrapper').evaluate(background)
  expect(box).not.toBe('rgba(0, 0, 0, 0)')
  expect(box).not.toBe(await surface.evaluate(background))
}

/** A row menu's entries by G-14 band, each band's labels in the order shown. */
export interface SheetBands {
  acts: string[]
  flags?: string[]
  destructive?: string[]
}

/**
 * Hold an open `ion-action-sheet` to G-14's ordering rule as rendered: the
 * entries in band order, a hairline above the first entry of each band after
 * the first and above no other, and the destructive entry painted apart from
 * the acts — glyph and label alike. The hairline and the paint are read from
 * the computed style, because the role alone was on the button for months
 * while Material drew it like every other entry.
 */
export async function expectSheetBands(sheet: Locator, bands: SheetBands): Promise<void> {
  const groups = [bands.acts, bands.flags ?? [], bands.destructive ?? []].filter((g) => g.length)
  const buttons = sheet.locator('.action-sheet-group').first().locator('.action-sheet-button')
  await expect(buttons.locator('.action-sheet-button-inner')).toHaveText(groups.flat())

  // A band's first entry carries the line, except the first band's.
  const lined = groups.flatMap((group, g) => group.map((_, i) => g > 0 && i === 0))
  const lines = await buttons.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).backgroundImage.includes('gradient')),
  )
  expect(lines).toEqual(lined)

  if (!bands.destructive?.length) return
  const paint = await buttons.evaluateAll((els) =>
    els.map((el) => ({
      destructive: el.classList.contains('action-sheet-destructive'),
      label: getComputedStyle(el).color,
      glyph: getComputedStyle(el.querySelector('.action-sheet-icon') ?? el).color,
    })),
  )
  const act = paint[0]!
  for (const entry of paint.slice(-bands.destructive.length)) {
    expect(entry.destructive).toBe(true)
    expect(entry.label).not.toBe(act.label)
    expect(entry.glyph).toBe(entry.label)
  }
  expect(paint.filter((p) => p.destructive)).toHaveLength(bands.destructive.length)
}
