/**
 * The inventory (M9) and its editor (M10) as other specs need to *reach*
 * them: an item that exists, and the way back to the list.
 */
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { pageSettled, visiblePage, writesLanded } from './page'
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

  await commitNewItem(page, name)
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
 * Commit the creation form and wait until the *edit* page is the only one
 * painted.
 *
 * A helper rather than lines inline, because leaving this wait out is
 * invisible until it bites: committing does a `router.replace`, and for the
 * length of that transition the outlet holds both pages — the form, still
 * painted, and the editor, `ion-page-invisible`. Going back in that window
 * overlaps two outlet transitions, after which `ion-router-outlet` intercepts
 * pointer events and the next tap simply never lands (an unclickable FAB
 * 30 s later). Reading a field in it fails outright: both pages carry
 * `m10-name` and `m10-assignee`, and `visiblePage` excludes only hidden
 * pages, so a scoped locator resolves twice.
 *
 * Neither the header title nor the edit head says the transition is over.
 * The title lives in the frame, outside the outlet, and follows the route;
 * the edit head is on the incoming page from its first frame, and
 * `ion-page-invisible` is `opacity: 0`, which Playwright counts as visible.
 * The title proves the item was created; `pageSettled` proves its page is
 * the one on screen, and only then does the edit head say which page that is.
 */
export async function commitNewItem(page: Page, name: string) {
  await visiblePage(page).getByTestId('m10-create').click()
  // Creating ends where editing continues — the saved item, by name.
  await expect(page.getByTestId('header-title')).toHaveText(name)
  await pageSettled(page)
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

/**
 * Start M9's selection the way the family does — a hold on a row, here its
 * right-click twin (FR-24.9, ADR-075) — with that row picked. The bar has no
 * selection glyph (UX-05). Matched on the row's whole name, so „Stirnlampe"
 * does not also catch „Stirnlampe Petzl".
 */
export async function holdRow(scope: Locator, name: string): Promise<void> {
  // The heading may also wear the fresh row's „Neu" (FR-24.5).
  const exact = new RegExp(
    `^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s+(New|Neu))?\\s*$`,
  )
  const row = scope
    .getByTestId('m9-row')
    .filter({ has: scope.page().locator('h2', { hasText: exact }) })
  await row.click({ button: 'right' })
  await expect(scope.getByTestId(`m9-row-check-${name}`)).toHaveClass(/\bon\b/)
}

/** Open M9's „Ansicht & Filter" sheet (FR-24.4, FR-24.8) and wait for it. */
export async function openViewSheet(page: Page): Promise<Locator> {
  await visiblePage(page).getByTestId('m9-filter-open').click()
  const sheet = page.getByTestId('m9-filter-sheet')
  await expect(sheet).toHaveAttribute('data-presented', 'true')
  return sheet
}

/**
 * Close the tag manager (FR-24.13) and wait until it has *gone*, not only
 * been asked to go.
 *
 * Until its dismissal ends, Ionic's overlay focus trap still treats the
 * sheet as the top overlay and pulls every focus outside it back in. A
 * `fill()` into M9's search started in that window loses its focus to the
 * sheet and types into nothing — the field stays empty, the list never
 * enters search, and the failure surfaces at the next assertion on the
 * search's rows. `data-presented` clears on `didDismiss`, after the trap
 * has let go.
 */
export async function closeTagManager(page: Page): Promise<void> {
  await page.getByTestId('m9-tags-close').click()
  await expect(page.getByTestId('m9-tags-sheet')).not.toHaveAttribute('data-presented', 'true')
}
