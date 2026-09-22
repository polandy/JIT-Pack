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
import {
  addInComposer,
  createTripViaWizard,
  expectTripActionOffered,
  openQuickAdd,
  tripAction,
} from './trips'
import { openTripView } from './trips'
import { visiblePage, writesLanded } from './page'
import { chooseInSelect, fillIonic } from './ionic'

/** The trip M4's own cases are written against (name, end date, two travelers). */
export const M4_TRIP = {
  name: 'Samedan Sommer',
  endDate: '2026-12-31',
  travelers: ['Andy', 'Sia'],
}

/**
 * Enough rows that the list is taller than a phone screen — E2E-M4-45 needs a
 * scroll position worth losing.
 */
export const SCROLL_ROWS = Array.from({ length: 16 }, (_, i) => `Sache ${i + 1}`)

/**
 * Add rows to a trip that is already open, through the quick-add — the only
 * add path M4 has. One open for the whole batch, unlike `tripWithRows`, which
 * reopens per name because it also has to leave the composer closed.
 *
 * It lives here rather than in a spec because four spec files need it since
 * the M4 unit was split, and a helper copied four times is the drift the
 * suite's helper gate exists to stop.
 */
export async function quickAddRows(page: Page, names: string[]) {
  await openQuickAdd(page)
  for (const name of names) {
    await addInComposer(page, name)
    await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
  }
}

/**
 * Create a trip through M3 and quick-add the named rows onto it. Returns the
 * trip's path, so a caller that navigates away can come back to it. A name the
 * inventory lacks is created through the composer's sheet (FR-24.11).
 *
 * The quick-add is closed with Escape and its disappearance awaited: the
 * sheet overlays the list, and a following click on a row would otherwise
 * land on the overlay that is still fading.
 */
export async function tripWithRows(page: Page, names: string[], tripName: string): Promise<string> {
  const path = await createTripViaWizard(page, { name: tripName, travelers: ['Andy'] })
  for (const name of names) {
    await openQuickAdd(page)
    await addInComposer(page, name)
    await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
  }
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-add-input')).toBeHidden()
  await writesLanded(page)
  return path
}

/**
 * Put a row on the packing list and give it a buy mode in M5 (FR-3.1) — the
 * one way a packing row reaches the shopping list since FR-30.2: M6 no longer
 * writes packing rows, it only shows the ones in a buy mode.
 *
 * `mode` is the select's label (`'Buy before'`, `'Buy there'`). Ends on M4
 * with the sheet closed and the write landed.
 */
export async function addBuyRowOnM4(page: Page, name: string, mode: string): Promise<void> {
  await visiblePage(page).getByTestId('m4-fab').click()
  await addInComposer(page, name)
  await expect(visiblePage(page).getByTestId(`m4-row-${name}`)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-add-input')).toBeHidden()
  await visiblePage(page).getByTestId(`m4-row-${name}`).click()
  await page.getByTestId('m5-details').click()
  await chooseInSelect(page, 'm5-mode', mode)
  await page.getByTestId('m5-close').click()
  await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
  await writesLanded(page)
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

/** M4's own scroller, which is where an offset is real. */
export function packList(page: Page): Locator {
  return visiblePage(page).locator('ion-content.pack-content')
}

/** Where M4's list stands right now: its offset and how much of it is left. */
export async function packListOffset(page: Page): Promise<{ top: number; slack: number }> {
  return packList(page).evaluate(async (host: HTMLIonContentElement) => {
    const el = await host.getScrollElement()
    return { top: el.scrollTop, slack: el.scrollHeight - el.clientHeight }
  })
}

/**
 * Scroll M4's list the way a reader does: a wheel over the list itself.
 *
 * Since FR-21.17's gesture rule the head yields to an input and stands still
 * for a scroll nobody made, so a case that moves the offset through the
 * scroller's API is asserting against a head that was never asked to move —
 * it would stay green against the rule's removal. `deltaY` is a wheel's, not
 * an offset: pass more than the slack to reach the end.
 *
 * It returns the offset the list came to rest at, which is not the one the
 * wheel asked for: yielding the head takes its height out of the scrolled
 * content, and the browser re-anchors the offset a frame or two later. A
 * caller that needs "where it was" has to be given that settled value, or it
 * will compare the list against a position it only passed through.
 */
export async function scrollPackList(page: Page, deltaY: number): Promise<number> {
  const box = await packList(page).boundingBox()
  if (box === null) throw new Error('M4 list has no box to scroll')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const from = (await packListOffset(page)).top
  await page.mouse.wheel(0, deltaY)
  // Settled, not merely moved: two readings alike, and both clear of where
  // the list started. The wait is on the list holding still, never on a clock.
  let last = from
  await expect
    .poll(async () => {
      const { top } = await packListOffset(page)
      const settled = top !== from && top === last
      last = top
      return settled
    })
    .toBe(true)
  // …and the *gesture* has ended too, which is a second thing. The list stops
  // moving first; M4's window closes on Ionic's scroll-end debounce after it
  // (FR-21.17), and until it does, a scroll nobody made still counts as the
  // reader's. Without this wait the next programmatic move in a case is a race
  // against that debounce — which is what made E2E-M4-135 red on a loaded
  // shard, measuring the head answering the *flick* and reading it as the
  // defect the case was written to catch. The attribute is that window.
  await expect(visiblePage(page).locator('ion-content.pack-content')).not.toHaveAttribute(
    'data-scroll-gesture',
  )
  return last
}

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
}

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
 * FR-7.7: M25, the trip's tasks, reached the way a reader reaches it — the
 * third pill of the view switcher. Returns the section of the phase asked
 * for, so a caller writes into the list it means.
 */
export async function openTasks(page: Page, phase: 'before' | 'during'): Promise<Locator> {
  // The pill is frame chrome rather than page content, and it is reached the
  // way every other view is — `openTripView` owns the scroll and the settle.
  await openTripView(page, 'tasks')
  await expect(visiblePage(page).getByTestId('m25-page')).toBeVisible()
  const section = visiblePage(page).getByTestId(`m25-${phase}`)
  await expect(section).toBeVisible()
  return section
}

/**
 * FR-7.9: M25's notes segment, reached the way a reader reaches it — the
 * same pill as the tasks, then the *Notizen* button beside *Aufgaben*.
 * Returns the list's own container.
 */
export async function openNotes(page: Page): Promise<Locator> {
  await openTripView(page, 'tasks')
  await expect(visiblePage(page).getByTestId('m25-page')).toBeVisible()
  await visiblePage(page).getByTestId('m25-segment-notes').click()
  const section = visiblePage(page).getByTestId('m25-notes')
  await expect(section).toBeVisible()
  return section
}

/**
 * FR-7.9: write a trip note from M25's notes segment. Ends with the write
 * landed, so a caller may reload or switch identity straight after.
 */
export async function addTripNote(page: Page, body: string): Promise<void> {
  const section = await openNotes(page)
  await section.getByTestId('trip-note-input').locator('textarea').fill(body)
  await section.getByTestId('trip-note-add').click()
  // The row's own testid carries the note's server id, not its words, so
  // the write is read back by its text instead — scoped to the row's own
  // button, since the composer's field can still carry the same text.
  await expect(section.getByRole('button', { name: body })).toBeVisible()
  await writesLanded(page)
}

/**
 * FR-7.4 with FR-7.7: add a task of the trip itself. It is written on **M25**
 * since M4 lost its composer (everything M4's window shows hangs off a row),
 * so the helper goes there, writes, and comes back to where it was — the
 * callers that follow it are asserting about the packing list.
 *
 * Ends with the write landed, so a caller may reload straight after.
 */
export async function addTripTodo(
  page: Page,
  body: string,
  phase: 'before' | 'during' = 'before',
): Promise<void> {
  const cameFrom = page.url()
  const section = await openTasks(page, phase)
  const field = section.getByTestId('trip-todo-input')
  await fillIonic(field, body)
  await field.locator('input').press('Enter')
  await expect(section.getByTestId(`trip-todo-${body}`)).toBeVisible()
  await writesLanded(page)
  if (page.url() !== cameFrom) {
    await page.goto(cameFrom)
    await expect(visiblePage(page).getByTestId('m4-header')).toBeVisible()
  }
}

/**
 * FR-7.3: a preparation, declared where it lives — on the row's own sheet.
 * M4's task window is made of these, so most of the section's cases need one.
 */
export async function addPrepTodo(page: Page, rowName: string, body: string): Promise<void> {
  await visiblePage(page).getByTestId(`m4-row-${rowName}`).click()
  await page.getByTestId('m5-todo-input').locator('input').fill(body)
  await page.getByTestId('m5-todo-add').click()
  await expect(page.getByTestId(`m5-todo-${body}`)).toBeVisible()
  await page.getByTestId('m5-close').click()
  await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
  await writesLanded(page)
}
