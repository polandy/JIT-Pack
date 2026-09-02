/**
 * The inventory (M9) and its editor (M10) as other specs need to *reach*
 * them: an item that exists, and the way back to the list.
 */
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { visiblePage } from './page'
import { fillIonic } from './ionic'

/** What a created item may carry besides its name. */
export interface NewItem {
  /** Tags to attach, each offered-or-created in M10's filter field. */
  tags?: string[]
  /** FR-28: the item mark, picked by its emoji from the suggestions. */
  mark?: string
  /** Weight in grams, behind M10's "more" disclosure. */
  weight?: string
}

/**
 * Create one master item and stay in its editor.
 *
 * Creating ends where editing continues, so the header carrying the item's
 * name is what says the row was written — not the disappearance of the form,
 * which never happens.
 */
export async function createItem(page: Page, name: string, opts: NewItem = {}): Promise<void> {
  await visiblePage(page).getByTestId('m9-fab').click()
  await expect(visiblePage(page).getByTestId('m10-new-hint')).toBeVisible()
  await fillIonic(visiblePage(page).getByTestId('m10-name'), name)

  for (const tag of opts.tags ?? []) {
    await fillIonic(visiblePage(page).getByTestId('m10-tag-search'), tag)

    // Filter-or-create: an existing tag is offered, an unmatched name is
    // created. Which of the two is on screen has to be *settled* before we
    // branch — a one-shot isVisible() runs before Vue has re-rendered the
    // chips and then picks the wrong arm, which surfaces 30 s later as a
    // missing chip rather than as a race.
    const offer = visiblePage(page).getByTestId(`m10-tag-offer-${tag}`)
    const create = visiblePage(page).getByTestId('m10-tag-create')
    await expect(offer.or(create).first()).toBeVisible()

    if ((await offer.count()) > 0) await offer.click()
    else await create.click()

    await expect(visiblePage(page).getByTestId(`m10-tag-assigned-${tag}`)).toBeVisible()
  }

  if (opts.mark) {
    await visiblePage(page).getByTestId('m10-mark').click()
    await expect(page.getByTestId('mark-picker')).toBeVisible()
    await page.getByTestId('mark-suggestion').filter({ hasText: opts.mark }).click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m10-mark')).toContainText(opts.mark)
  }

  if (opts.weight) {
    await visiblePage(page).getByTestId('m10-more').click()
    await fillIonic(visiblePage(page).getByTestId('m10-weight'), opts.weight)
  }

  await visiblePage(page).getByTestId('m10-create').click()
  // Creating ends where editing continues — the saved item, by name, with
  // the editor's own save indicator beside it.
  await expect(page.getByTestId('header-title')).toHaveText(name)
  await expect(visiblePage(page).getByTestId('save-indicator')).toBeVisible()
}

/**
 * Leave M10 for the list behind it.
 *
 * Settled, not merely arriving: while the outgoing editor fades it still
 * counts as visible, so the list's FAB alone would let a one-shot read see
 * both pages at once. The editor's name field being gone is the second half.
 */
export async function backToInventory(page: Page): Promise<void> {
  await page.getByTestId('header-back').click()
  await expect(visiblePage(page).getByTestId('m9-fab')).toBeVisible()
  await expect(visiblePage(page).getByTestId('m10-name')).toHaveCount(0)
}
