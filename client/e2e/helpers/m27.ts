import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { fillIonic, setDateRange } from './ionic'
import { visiblePage, writesLanded } from './page'
import { confirmCreateSheet, exactSuggestion, openQuickAdd, openTripView } from './trips'

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
  /** The first and last day, ISO; absent leaves the days open. */
  days?: { start: string; end: string }
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
  if (seed.days) {
    await setDateRange(page, 'm27-dates', seed.days)
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

/**
 * One line of the open excursion. The list is built from M4's own row, so a
 * line wears its own screen's handle: `m27-row-<name>`, or
 * `m27-child-<name>-<person>` under a cluster (FR-31.6).
 */
export function excursionLine(page: Page, key: string): Locator {
  return visiblePage(page)
    .getByTestId(`m27-row-${key}`)
    .or(visiblePage(page).getByTestId(`m27-child-${key}`))
}

/**
 * Tick one line's check and wait for the write. The line then leaves the list
 * as a packed row leaves M4's (FR-25.2) — its departure is the rendered
 * evidence that the pack was written.
 */
export async function tickExcursionLine(page: Page, key: string): Promise<void> {
  await excursionLine(page, key).getByTestId('row-check').locator('ion-checkbox').click()
  await expect(excursionLine(page, key)).toHaveCount(0)
  await writesLanded(page)
}

/**
 * Open a line's menu — M4's action sheet (FR-5.5). `contextmenu` rather than a
 * long press, for M4's reason: the hold's timing is unit-tested on a fake
 * clock (`useLongPress`).
 */
export async function openLineMenu(page: Page, key: string): Promise<Locator> {
  await excursionLine(page, key).dispatchEvent('contextmenu')
  const menu = page.getByTestId('excursion-line-menu')
  await expect(menu).toBeVisible()
  return menu
}

/** Choose one entry of the open line menu, and wait for the sheet to go. */
export async function chooseInLineMenu(page: Page, label: RegExp): Promise<void> {
  const menu = page.getByTestId('excursion-line-menu')
  await menu.getByRole('button', { name: label }).click()
  await expect(menu).toHaveCount(0)
}

/** M4's snackbar, and its one undo (FR-25.31). */
export async function undoFromSnackbar(page: Page, text: string | RegExp): Promise<void> {
  const toast = page.locator('ion-toast.pack-toast').filter({ hasText: text })
  await expect(toast).toHaveCount(1)
  await toast.getByRole('button', { name: /undo/i }).click()
}

/** FR-25.2's bar on the excursion: bring the packed lines back into view. */
export async function revealPackedLines(page: Page): Promise<void> {
  await visiblePage(page).getByTestId('m27-done-bar').click()
}

/**
 * Add a thing to the open excursion through its ＋ — M4's quick-add, the
 * inventory included (FR-24.11) — for whom the strip says: nobody named is
 * shared, `'all'` taps *Alle*. Ends with the composer closed.
 */
/**
 * The two ways a name enters an excursion's list (FR-31.14): through the
 * inventory — as M4 adds one — or as a line of this excursion alone.
 */
export type ExcursionAdd = 'inventory' | 'local'

/**
 * Type a name into M27's open composer and add it one of the two ways. The
 * inventory way waits for the settled signal {@link addInComposer} reads —
 * the offer naming the query, or the exact suggestion — and takes the offer,
 * never ✓: on M27, ✓ on an unknown name means *Nur für diesen Ausflug*.
 */
export async function addInExcursionComposer(
  page: Page,
  name: string,
  via: ExcursionAdd = 'inventory',
) {
  const scope = visiblePage(page)
  await scope.getByTestId('quick-add-input').locator('input').fill(name)
  if (via === 'local') {
    await scope.getByTestId('quick-add-local-only').click()
    return
  }
  const offer = scope.getByTestId('quick-add-offer-title').filter({ hasText: name })
  const known = exactSuggestion(scope, name)
  await expect(offer.or(known).first()).toBeVisible()
  if ((await offer.count()) === 0) {
    await scope.getByTestId('quick-add-confirm').click()
    return
  }
  await scope.getByTestId('quick-add-offer').click()
  await confirmCreateSheet(page, name)
}

export async function addToExcursion(
  page: Page,
  name: string,
  forWhom: 'shared' | 'all' = 'shared',
  via: ExcursionAdd = 'inventory',
) {
  await openQuickAdd(page, 'm27-add-fab')
  if (forWhom === 'all') await visiblePage(page).getByTestId('for-whom-all-quick-add').click()
  await addInExcursionComposer(page, name, via)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-add-input')).toBeHidden()
  await writesLanded(page)
}

/** Choose an entry of the open excursion's ⋮ (edit, a track, save as group, delete). */
export async function excursionMenu(
  page: Page,
  id: 'm27-edit' | 'm27-track-add' | 'm27-track-draw' | 'm27-save-as-group' | 'm27-delete',
) {
  await page.getByTestId('header-overflow').click()
  const sheet = page.locator('ion-action-sheet')
  await expect(sheet).toHaveAttribute('data-presented', 'true')
  await sheet.getByTestId(id).click()
  await expect(sheet).toHaveCount(0)
}

/** The open excursion's track lines (FR-31.15). */
export function excursionTrackRows(page: Page): Locator {
  return visiblePage(page).locator(
    '[data-testid^="track-row-"]:not([data-testid^="track-row-facts-"])',
  )
}

/**
 * Add a GPX track to the open excursion through its ⋮ and the file chooser
 * it opens; ends once the excursion shows one more track line — the
 * positive signal that it was read and written.
 */
export async function addExcursionTrack(page: Page, name: string, gpx: string): Promise<void> {
  const before = await excursionTrackRows(page).count()
  const chooser = page.waitForEvent('filechooser')
  await excursionMenu(page, 'm27-track-add')
  await (
    await chooser
  ).setFiles({ name, mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx) })
  await expect(excursionTrackRows(page)).toHaveCount(before + 1)
  await expect(visiblePage(page).getByTestId('m27-track-busy')).toHaveCount(0)
}
