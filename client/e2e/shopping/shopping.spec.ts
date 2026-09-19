import type { Page } from '@playwright/test'

import {
  addInComposer,
  writesLanded,
  test,
  expect,
  chooseInSelect,
  createTripViaWizard,
  openTripView,
  visiblePage as visible,
} from '../fixtures'
import { PATH } from '../routes'
import { createItem } from '../helpers/m9'
import { addBuyRowOnM4, setMemberInM5 } from '../helpers/m4'

/**
 * M6 — the shopping list (UI-Test-Spec §6, FR-30).
 *
 * The shopping list is a module of its own since FR-30 (ADR-066): it holds
 * entries typed into it, which are on the shopping list only, and it shows the
 * packing list's rows in a buy mode, which stay packing rows. Every case here
 * reaches a packing row the way a person does — added on M4, given its mode in
 * M5 — because M6 no longer writes packing rows at all. The module's cases
 * live in this directory (FR-29.9's layout, first used here).
 *
 * Local Mode throughout, like the M4 suite: everything here is client-side.
 */

const TRIP = { name: 'Samedan Einkauf', endDate: '2026-12-31', travelers: ['Andy'] }

/**
 * M6 alone. ADR-012 leaves M4 mounted and *visible* behind it, so the
 * visible-page locator resolves to two pages here and every shared testid is
 * ambiguous without this.
 */
function m6(page: Page) {
  return visible(page).getByTestId('m6-page')
}

/**
 * Type an entry into M6's own field and commit it with the button — no
 * keyboard, which is the phone case (E2E-M6-16). Lands on the open tab.
 */
async function addEntry(page: Page, name: string) {
  await m6(page).getByTestId('m6-add-input').locator('input').fill(name)
  await m6(page).getByTestId('m6-add-submit').click()
  await expect(m6(page).getByTestId('m6-row').filter({ hasText: name })).toBeVisible()
}

test.describe('M6 shopping — the list’s own entries @local @m6', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M6-26 (FR-30.1): an entry typed into the shopping list is on the
   * shopping list and nowhere else. The packing list's progress is the
   * positive signal for the absence of a row there — an entry that had become
   * a packing row would count, as every free-text add on M6 did before FR-30.
   */
  test('E2E-M6-26: an entry typed on M6 is on the shopping list only (FR-30.1)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await addBuyRowOnM4(page, 'Sonnencreme', 'Buy there')
    await expect(visible(page).getByTestId('m4-progress')).toContainText('0/1')

    await openTripView(page, 'shopping')
    await m6(page).getByTestId('m6-tab-local').click()
    await addEntry(page, 'Milch')

    // Its own section, first; the packing row after it under its own heading.
    await expect(m6(page).getByTestId('m6-group-own')).toContainText('Added here')
    await expect(m6(page).getByTestId('m6-group-own').getByTestId('m6-row')).toHaveText(['Milch'])
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Sonnencreme' })).toBeVisible()
    await expect(m6(page).getByTestId('m6-tab-local')).toContainText('(2)')
    await expect(page.getByTestId('trip-view-shopping')).toHaveText('Shopping (2)')

    // The packing list did not grow: one row, still the one it had.
    await page.getByTestId('header-back').click()
    await expect(visible(page).getByTestId('m4-progress')).toContainText('0/1')
    await expect(visible(page).getByTestId('m4-row-Milch')).toHaveCount(0)
    await expect(visible(page).getByTestId('m4-row-Sonnencreme')).toBeVisible()
  })

  /**
   * E2E-M6-27 (FR-30.1, FR-25.11j): an entry is bought, revealed, put back
   * and removed — and survives a reload in between, because it is a row of
   * its own table on the device rather than a screen's state.
   */
  test('E2E-M6-27: an entry is bought, put back and removed, and survives a reload (FR-30.1)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openTripView(page, 'shopping')
    await addEntry(page, 'Kaffee')
    await addEntry(page, 'Zucker')

    await m6(page)
      .getByTestId('m6-row')
      .filter({ hasText: 'Kaffee' })
      .locator('ion-checkbox')
      .click()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toHaveCount(0)
    await expect(m6(page).getByTestId('m6-bought-bar')).toHaveText('Show 1 bought')
    await writesLanded(page)

    await page.reload()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Zucker' })).toBeVisible()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toHaveCount(0)
    const bar = m6(page).getByTestId('m6-bought-bar')
    await expect(bar).toHaveText('Show 1 bought')
    await bar.click()
    const bought = m6(page).getByTestId('m6-bought-row').filter({ hasText: 'Kaffee' })
    await expect(bought).toBeVisible()
    // It was never anywhere but here, so it names nowhere it went.
    await expect(bought.getByTestId('m6-bought-note')).toHaveCount(0)
    // FR-30.4: when it was bought — and survived the reload with it. No who:
    // Local Mode has no account to name (G-8); E2E-M6-29 names one.
    await expect(bought.getByTestId('m6-bought-stamp')).toContainText('bought · today')

    await bought.locator('ion-checkbox').click()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toBeVisible()
    await expect(m6(page).getByTestId('m6-bought-bar')).toHaveCount(0)

    await m6(page)
      .getByTestId('m6-row')
      .filter({ hasText: 'Kaffee' })
      .getByTestId('m6-row-remove')
      .click()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toHaveCount(0)
    await expect(m6(page).getByTestId('m6-tab-before')).toContainText('(1)')
    await writesLanded(page)
    await page.reload()
    await expect(m6(page).getByTestId('m6-row')).toHaveText(['Zucker'])
  })

  /**
   * E2E-M6-28 (FR-30.2): a packing row reaches the shopping list by its mode,
   * and leaves it the same way — it is a projection, never a copy. Setting the
   * row back to *Pack* on M5 empties the shopping tab; a copy would have left
   * it there to be bought twice.
   */
  test('E2E-M6-28: a packing row is on the shopping list exactly while its mode says so (FR-30.2)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await addBuyRowOnM4(page, 'Adapter', 'Buy there')

    await openTripView(page, 'shopping')
    await m6(page).getByTestId('m6-tab-local').click()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Adapter' })).toBeVisible()
    // A packing row leaves by being bought or by its mode — never by a remove here.
    await expect(m6(page).getByTestId('m6-row-remove')).toHaveCount(0)

    await page.getByTestId('header-back').click()
    await visible(page).getByTestId('m4-row-Adapter').click()
    await page.getByTestId('m5-details').click()
    await chooseInSelect(page, 'm5-mode', 'Pack')
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    await openTripView(page, 'shopping')
    await m6(page).getByTestId('m6-tab-local').click()
    await expect(m6(page).getByTestId('m6-empty')).toBeVisible()
    await expect(m6(page).getByTestId('m6-row')).toHaveCount(0)
    await expect(page.getByTestId('trip-view-shopping')).toHaveText('Shopping')
  })
})

/**
 * FR-25.11j: checking a packing row off a shopping list must stay reversible.
 *
 * The reveal is the only way back for a BUY_BEFORE row — buying it changes
 * its mode, so it is gone from both tabs — which makes every "it disappeared"
 * assertion here worth a positive one beside it: the bar that counts what
 * disappeared, and the row it names once revealed.
 */
test.describe('M6 shopping — what was bought can be found and put back @local @m6', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M6-17 (FR-25.11i/j): the BUY_BEFORE case, where checking off changes
  // the item's mode and would otherwise make the row unreachable from the
  // shopping side. The reveal is hidden by default, states its count, names
  // where the row went, and gives it back.
  test('E2E-M6-17: a purchase before departure is revealable and reversible (FR-25.11j)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await addBuyRowOnM4(page, 'Kaffee', 'Buy before')
    await openTripView(page, 'shopping')

    // Nothing bought yet: the bar is absent, and the open row is the signal
    // that the list itself is rendered.
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toBeVisible()
    await expect(m6(page).getByTestId('m6-bought-bar')).toHaveCount(0)

    await m6(page)
      .getByTestId('m6-row')
      .filter({ hasText: 'Kaffee' })
      .locator('ion-checkbox')
      .click()

    // Gone from the open list — and counted by the bar, which is what makes
    // the disappearance an outcome rather than a loss.
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toHaveCount(0)
    const bar = m6(page).getByTestId('m6-bought-bar')
    await expect(bar).toHaveText('Show 1 bought')
    await expect(m6(page).getByTestId('m6-bought-list')).toHaveCount(0)

    await bar.click()
    const bought = m6(page).getByTestId('m6-bought-row')
    await expect(bought).toContainText('Kaffee')
    // FR-25.11j: the revealed row says where it went.
    await expect(bought.getByTestId('m6-bought-note')).toHaveText('on the packing list')
    // FR-30.4: the purchase keeps its time although the row is a packing row
    // again — the record lives beside `bought_from`, not in the mode.
    await expect(bought.getByTestId('m6-bought-stamp')).toContainText('bought · today')
    await expect(bar).toHaveText('Hide 1 bought')

    // E2E-M6-02 (FR-3.3), and the half the note only *claims*: the row really
    // is on the packing list now. The sentence above is a string until the
    // screen it names has been looked at.
    await page.getByTestId('header-back').click()
    await expect(visible(page).getByTestId('m4-row-Kaffee')).toBeVisible()
    // E2E-FLOW-03's last clause: it arrives as something still *to* pack.
    // Being bought is not being packed, and the mode flip is the only part
    // of the row buying changes — the progress counter is where that shows,
    // since a row that arrived packed would be hidden by FR-25.2 instead.
    await expect(visible(page).getByTestId('m4-progress')).toContainText('0/1')
    await openTripView(page, 'shopping')
    await expect(m6(page).getByTestId('m6-bought-bar')).toBeVisible()
    await m6(page).getByTestId('m6-bought-bar').click()

    // And the way back: it returns to the list it was bought from.
    await bought.locator('ion-checkbox').click()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Kaffee' })).toBeVisible()
    await expect(m6(page).getByTestId('m6-bought-bar')).toHaveCount(0)
  })

  // E2E-M6-22 (FR-3.3/25.11j): the destination tab's half. A BUY_LOCAL row
  // never changes mode — being bought there *is* its packed state — so the
  // record has to name that list too, or the two tabs share one reveal.
  test('E2E-M6-22: a purchase at the destination is revealed on its own tab (FR-25.11j)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await addBuyRowOnM4(page, 'Brot vor Ort', 'Buy before')
    await addBuyRowOnM4(page, 'Milch', 'Buy there')
    await openTripView(page, 'shopping')

    // The button, not the label inside it — the segment button swallows a
    // click aimed at its own `ion-label` (packing-list.spec.ts pays for this).
    await m6(page).getByTestId('m6-tab-local').click()
    await m6(page)
      .getByTestId('m6-row')
      .filter({ hasText: 'Milch' })
      .locator('ion-checkbox')
      .click()

    await m6(page).getByTestId('m6-bought-bar').click()
    await expect(m6(page).getByTestId('m6-bought-row')).toContainText('Milch')
    await expect(m6(page).getByTestId('m6-bought-note')).toHaveText('packed')

    // The other tab has its own reveal, and nothing in it.
    await m6(page).getByTestId('m6-tab-before').click()
    await expect(m6(page).getByTestId('m6-bought-bar')).toHaveCount(0)
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Brot vor Ort' })).toBeVisible()
  })
})

/**
 * FR-25.6 — a per-person item is one thing to buy.
 *
 * Built the way a person would: the item is made per-person in M5's
 * membership editor with three different amounts, and only then looked at
 * from the shop. The assertion that carries the case is that the list holds
 * **one** row where the trip holds three — under the screen this replaced it
 * held three, each with its own amount and its own check-off, and nobody had
 * seen it because nothing could produce a per-person item by hand.
 */
test.describe('M6 shopping — a per-person item is one buy row @local @m6', () => {
  const ITEM = 'Kurze Hosen'
  // No end date: the wizard's date picker is not what these cases are about,
  // and every hop through it is a step that can fail for a reason M6 does not
  // own.
  const PER_PERSON_TRIP = { name: 'Sommerferien Elba', travelers: ['Andy', 'Leonardo', 'Mia'] }

  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * A trip whose "Kurze Hosen" is bought before departure and belongs to
   * three travelers with 2, 3 and 1 — the amounts that make one aggregated
   * row plainly right and three rows plainly wrong.
   */
  async function seedPerPersonPurchase(page: Page) {
    await createTripViaWizard(page, PER_PERSON_TRIP)
    await visible(page).getByTestId('m4-fab').click()
    await addInComposer(page, ITEM)
    await expect(visible(page).getByTestId(`m4-row-${ITEM}`)).toBeVisible()

    // The mode first, while the item is still one row: the membership
    // fan-out copies it onto the rows it creates (ADR-036).
    await visible(page).getByTestId(`m4-row-${ITEM}`).click()
    await page.getByTestId('m5-details').click()
    await chooseInSelect(page, 'm5-mode', 'Buy before')

    for (const [name, quantity] of [
      ['Andy', 2],
      ['Leonardo', 3],
      ['Mia', 1],
    ] as const) {
      await setMemberInM5(page, name, quantity)
    }
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    await openTripView(page, 'shopping')
    await expect(m6(page)).toBeVisible()
  }

  // E2E-M6-05 (FR-25.6): three instances, one row — with the summed amount
  // and the recipients derived from membership.
  test('E2E-M6-05: a per-person item is one aggregated buy row (FR-25.6)', async ({ page }) => {
    await seedPerPersonPurchase(page)

    const rows = m6(page).getByTestId('m6-row')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText(ITEM)
    await expect(rows.first()).toContainText('6×')
    // Derived, never entered (FR-25.10) — and in roster order.
    // `toContainText`: the recipients' avatars sit in the same line and
    // contribute their initials to its text.
    const forWhom = rows.first().getByTestId('m6-row-for')
    await expect(forWhom).toContainText('for Andy, Leonardo, Mia')
    // The spec promises the avatars beside the names, so they are asserted
    // rather than left to the initials the text assertion swallows.
    await expect(forWhom.getByTestId('user-avatar')).toHaveCount(3)
    // The tab counts things to buy, so it agrees with what the list shows.
    await expect(m6(page).getByTestId('m6-tab-before')).toContainText('(1)')

    // E2E-M6-08 (FR-25.10): *for whom* is derived and there is nothing here to
    // re-enter it with. The row's only control is the check-off — asserted as
    // a count rather than as an absence, so the assertion has something
    // positive to fail against.
    await expect(forWhom.locator('button, input, ion-select, ion-checkbox')).toHaveCount(0)
    await expect(rows.first().locator('ion-checkbox')).toHaveCount(1)
  })

  // E2E-M6-06 (FR-25.6/3.3): the half that matters — one act settles every
  // instance. Two instances left behind would still render a row, so the
  // empty state is the positive signal that none was, and the restored 6×
  // is the positive signal that the undo took all of them with it.
  test('E2E-M6-06: checking the aggregated row off settles every instance (FR-3.3)', async ({
    page,
  }) => {
    await seedPerPersonPurchase(page)

    await m6(page).getByTestId('m6-row').locator('ion-checkbox').click()

    await expect(m6(page).getByTestId('m6-row')).toHaveCount(0)
    await expect(m6(page).locator('.empty-state')).toBeVisible()
    await expect(m6(page).getByTestId('m6-tab-before')).toContainText('(0)')

    // And it came back as one purchase, not three.
    const bar = m6(page).getByTestId('m6-bought-bar')
    await expect(bar).toHaveText('Show 1 bought')
    await bar.click()
    const bought = m6(page).getByTestId('m6-bought-row')
    await expect(bought).toHaveCount(1)
    await expect(bought.getByTestId('m6-bought-note')).toHaveText('on the packing list')

    await bought.locator('ion-checkbox').click()
    const back = m6(page).getByTestId('m6-row')
    await expect(back).toHaveCount(1)
    await expect(back.first()).toContainText('6×')
  })
})

/**
 * M6's own spine (UI-Test-Spec E2E-M6-01/03/04/16): the two lists, their
 * headings and their counts, with both kinds of line on them.
 */
test.describe('M6 shopping — the two lists and their counts @local @m6', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M6-01: two tabs, grouped by category, each counting things to buy', async ({
    page,
  }) => {
    // A tagged master item, so the trip row carries a real category (FR-24.2).
    await page.goto(PATH.items)
    await createItem(page, 'Sonnencreme', { tags: ['Drogerie'] })
    await createTripViaWizard(page, TRIP)
    await addBuyRowOnM4(page, 'Sonnencreme', 'Buy before')
    await addBuyRowOnM4(page, 'Batterien', 'Buy before')
    await openTripView(page, 'shopping')
    await expect(m6(page)).toBeVisible()

    // E2E-M6-03/16: an entry of the list's own, committed by tapping the
    // button alone — the phone case, where Enter may be out of reach.
    await addEntry(page, 'Kaugummi')

    // Grouped — the row sits *inside* its group, which is the assertion the
    // promise makes; two rows on one screen prove nothing about where they sit.
    await expect(m6(page).getByTestId('m6-group-own').getByTestId('m6-row')).toContainText(
      'Kaugummi',
    )
    await expect(m6(page).getByTestId('m6-group-Drogerie').getByTestId('m6-row')).toContainText(
      'Sonnencreme',
    )
    await expect(m6(page).getByTestId('m6-group-none').getByTestId('m6-row')).toContainText(
      'Batterien',
    )
    await expect(m6(page).getByTestId('m6-group-none')).toContainText('Uncategorized')

    // The label counts things to buy (FR-25.6), and the other tab is its own
    // list — a shared list would show three here.
    await expect(m6(page).getByTestId('m6-tab-before')).toContainText('(3)')
    await expect(m6(page).getByTestId('m6-tab-local')).toContainText('(0)')

    await m6(page).getByTestId('m6-tab-local').click()
    await expect(m6(page).getByTestId('m6-row')).toHaveCount(0)
    await addEntry(page, 'Eis')
    await expect(m6(page).getByTestId('m6-tab-local')).toContainText('(1)')
    await expect(m6(page).getByTestId('m6-tab-before')).toContainText('(3)')
  })

  test('E2E-M6-04: an empty shopping list drops M4’s count, never the entry', async ({ page }) => {
    await createTripViaWizard(page, TRIP)

    // The destination exists either way — hiding the entry would strand M6 on
    // a trip that has yet to need it. Only the count answers to the count, and
    // it is part of the word rather than a badge (ADR-050, kept by FR-21.21's
    // switcher).
    await expect(page.getByTestId('trip-view-shopping')).toHaveText('Shopping')

    await openTripView(page, 'shopping')
    await expect(m6(page)).toBeVisible()
    await addEntry(page, 'Batterien')
    await expect(page.getByTestId('trip-view-shopping')).toHaveText('Shopping (1)')
  })
})

/**
 * FR-30.6: M4's ＋ bottom right, on M6 too. The field it leads to stays at
 * the top, so the ＋ is the way back to it from a long, scrolled list — and
 * the list scrolls clear of it (E2E-M6-15, FR-25.11h's rule for M6's half).
 */
test.describe('M6 shopping — the ＋ bottom right @local @m6', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M6-15: the ＋ leads to the field, and the last row scrolls clear of it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 700 })
    await createTripViaWizard(page, TRIP)
    await openTripView(page, 'shopping')
    const names = Array.from({ length: 14 }, (_, i) => `Artikel ${String(i + 1).padStart(2, '0')}`)
    for (const name of names) await addEntry(page, name)

    const last = m6(page).getByTestId('m6-row').last()
    await last.scrollIntoViewIfNeeded()
    // `m6-page` is the page's own ion-content.
    await m6(page).evaluate((el) =>
      (el as HTMLElement & { scrollToBottom(d: number): Promise<void> }).scrollToBottom(0),
    )
    const fab = m6(page).getByTestId('m6-fab')
    await expect(fab).toBeVisible()
    const [row, button] = [(await last.boundingBox())!, (await fab.boundingBox())!]
    expect(row.y + row.height <= button.y || row.y >= button.y + button.height).toBe(true)

    // The field is off-screen now; the ＋ brings it back and puts the cursor in it.
    const field = m6(page).getByTestId('m6-add-input').locator('input')
    await expect(field).not.toBeInViewport()
    await fab.click()
    await expect(field).toBeInViewport()
    await expect(field).toBeFocused()
    await field.fill('Zucker')
    await m6(page).getByTestId('m6-add-submit').click()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Zucker' })).toBeVisible()
  })
})
