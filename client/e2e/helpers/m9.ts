/**
 * The inventory (M9) and its editor (M10) as other specs need to *reach*
 * them: an item that exists, and the way back to the list.
 */
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { visiblePage, writesLanded } from './page'
import { fillIonic } from './ionic'

/** What a created item may carry besides its name. */
export interface NewItem {
  /** Tags to attach, each offered-or-created in M10's filter field. */
  tags?: string[]
  /** FR-28: the item mark, picked by its emoji from the suggestions. */
  mark?: string
  /** Weight in grams, behind M10's "more" disclosure. */
  weight?: string
  /** Price, behind the same disclosure as the weight (FR-24.5). */
  price?: string
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

  if (opts.weight || opts.price) {
    await visiblePage(page).getByTestId('m10-more').click()
    if (opts.weight) await fillIonic(visiblePage(page).getByTestId('m10-weight'), opts.weight)
    if (opts.price) await fillIonic(visiblePage(page).getByTestId('m10-price'), opts.price)
  }

  await visiblePage(page).getByTestId('m10-create').click()
  // Creating ends where editing continues — the saved item, by name, on the
  // edit head that only the replaced page carries. Not the FR-25.15
  // indicator inside it: that is silent until it has written something, so
  // it says nothing about which page is on screen.
  await expect(page.getByTestId('header-title')).toHaveText(name)
  await expect(visiblePage(page).getByTestId('m10-edit-head')).toBeVisible()
  await writesLanded(page)
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

/**
 * Commit the creation form and wait for the *edit* page to be painted.
 *
 * A helper rather than two lines inline, because leaving this wait out is
 * invisible until it bites: committing does a `router.replace`, and going
 * back immediately overlaps two outlet transitions — after which
 * `ion-router-outlet` intercepts pointer events and the next tap simply
 * never lands. That surfaces as an unclickable FAB 30 s later, nothing
 * resembling a navigation error. The edit head exists only once the item
 * does, so it is a positive signal that the replaced page — and not the
 * form it replaced — is the one now on screen. The FR-25.15 indicator
 * inside that head cannot say so: it is silent until it has written
 * something, and the write that created the item can well have landed
 * before its page was painted.
 */
export async function commitNewItem(page: Page, name: string) {
  await visiblePage(page).getByTestId('m10-create').click()
  // Creating ends where editing continues — the saved item, by name.
  await expect(page.getByTestId('header-title')).toHaveText(name)
  await expect(visiblePage(page).getByTestId('m10-edit-head')).toBeVisible()
}

/**
 * The group headings, normalised. Lower-cased on purpose: the heading wears
 * the `.jp-eyebrow` role, which uppercases in CSS, so the rendered casing is
 * a styling decision and not the data these cases are about.
 */
export async function groupHeadings(scope: Locator): Promise<string[]> {
  const heads = await scope.getByTestId('m9-group-head').allInnerTexts()
  return heads.map((h) => h.split('\n')[0]!.trim().toLowerCase())
}
