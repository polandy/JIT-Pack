import type { Page } from '@playwright/test'

import {
  test,
  expect,
  chooseInSelect,
  createTripViaWizard,
  visiblePage as visible,
} from './fixtures'

/**
 * M6 — shopping views (UI-Test-Spec §6).
 *
 * The first M6 case landed with FR-25.13d, which closed the composer gap M6
 * had carried since FR-25.13c: the shared component excluded nothing here
 * because the screen passed nothing. What this file pins is therefore M6's
 * *wiring*, not the composer's own rules — those are covered on M8 and in
 * the component's unit tests, and a dropped prop keeps all of them green.
 *
 * Local Mode throughout, like the M4 suite: everything here is client-side.
 */

const TRIP = { name: 'Samedan Einkauf', endDate: '2026-12-31', travelers: ['Andy'] }

test.describe('M6 shopping — the shared composer knows the trip @local @m6', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M6-21 (FR-25.13c/25.13d): what the trip already carries is offered
  // on no shopping tab either — not in the autocomplete, and in the
  // browse-sheet only as the "already in" state.
  test('E2E-M6-21: what the trip carries is not offered again on M6 (FR-25.13d)', async ({
    page,
  }) => {
    await page.goto('/tabs/items')
    await page.getByTestId('m9-fab').click()
    await page.getByTestId('m10-name').locator('input').fill('Sonnencreme')
    await page.getByTestId('m10-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Sonnencreme')

    // The trip carries the item through M4, with its master-item provenance.
    await createTripViaWizard(page, TRIP)
    await visible(page).getByTestId('m4-fab').click()
    const m4Input = visible(page).getByTestId('quick-add-input').locator('input')
    await m4Input.fill('Sonnen')
    await visible(page)
      .getByTestId('quick-add-suggestion')
      .filter({ hasText: 'Sonnencreme' })
      .click()
    await expect(page.getByTestId('m4-row-Sonnencreme')).toBeVisible()

    await visible(page).getByTestId('m4-nav-shopping').click()
    await expect(visible(page).getByTestId('quick-add-open')).toBeVisible()
    await visible(page).getByTestId('quick-add-open').click()

    // The autocomplete declines: the positive signal for the absent
    // suggestion is the free-text hint, rendered exactly when nothing is
    // offered (the E2E-M4-46 idiom).
    const input = visible(page).getByTestId('quick-add-input').locator('input')
    await input.fill('Sonnen')
    await expect(visible(page).locator('.no-match')).toContainText('Add “Sonnen” as a new item')
    await expect(visible(page).getByTestId('quick-add-suggestion')).toHaveCount(0)

    // And the browse-sheet states it rather than offering it.
    await input.fill('')
    await visible(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    await expect(
      sheet.getByTestId('browse-row-carried').filter({ hasText: 'Sonnencreme' }),
    ).toContainText('already in')
  })
})

/**
 * FR-25.11j: checking a row off a shopping list must stay reversible.
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

  /**
   * M6 alone. ADR-012 leaves M4 mounted and *visible* behind it, so the
   * visible-page locator resolves to two pages here and every shared testid
   * — the composer's above all — is ambiguous without this.
   */
  function m6(page: Page) {
    return visible(page).getByTestId('m6-page')
  }

  async function addOnShoppingTab(page: Page, name: string) {
    await m6(page).getByTestId('quick-add-open').click()
    await m6(page).getByTestId('quick-add-input').locator('input').fill(name)
    await m6(page).getByTestId('quick-add-confirm').click()
    await m6(page).getByTestId('quick-add-close').click()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: name })).toBeVisible()
  }

  // E2E-M6-17 (FR-25.11i/j): the BUY_BEFORE case, where checking off changes
  // the item's mode and would otherwise make the row unreachable from the
  // shopping side. The reveal is hidden by default, states its count, names
  // where the row went, and gives it back.
  test('E2E-M6-17: a purchase before departure is revealable and reversible (FR-25.11j)', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await visible(page).getByTestId('m4-nav-shopping').click()
    await addOnShoppingTab(page, 'Kaffee')

    // Nothing bought yet: the bar is absent, and the open row is the signal
    // that the list itself is rendered.
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
    await expect(bar).toHaveText('Hide 1 bought')

    // E2E-M6-02 (FR-3.3), and the half the note only *claims*: the row really
    // is on the packing list now. The sentence above is a string until the
    // screen it names has been looked at.
    await page.getByTestId('header-back').click()
    await expect(visible(page).getByTestId('m4-row-Kaffee')).toBeVisible()
    await visible(page).getByTestId('m4-nav-shopping').click()
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
    await visible(page).getByTestId('m4-nav-shopping').click()
    await addOnShoppingTab(page, 'Brot vor Ort')

    // The button, not the label inside it — the segment button swallows a
    // click aimed at its own `ion-label` (packing-list.spec.ts pays for this).
    await m6(page).getByTestId('m6-tab-local').click()
    await addOnShoppingTab(page, 'Milch')
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
    await visible(page).getByTestId('quick-add-input').locator('input').fill(ITEM)
    await visible(page).getByTestId('quick-add-confirm').click()
    await expect(visible(page).getByTestId(`m4-row-${ITEM}`)).toBeVisible()

    // The mode first, while the item is still one row: the membership
    // fan-out copies it onto the rows it creates (ADR-036).
    await visible(page).getByTestId(`m4-row-${ITEM}`).click()
    await page.getByTestId('m5-details').click()
    await chooseInSelect(page, 'm5-mode', 'Buy before')

    await page.getByTestId('m5-membership').click()
    await expect(page.getByTestId('membership-sheet')).toBeVisible()
    await page.getByTestId('membership-per-person').click()
    for (const [name, quantity] of [
      ['Andy', 2],
      ['Leonardo', 3],
      ['Mia', 1],
    ] as const) {
      await page.getByTestId(`membership-check-${name}`).click()
      await expect(page.getByTestId(`membership-qty-${name}`)).toHaveText('1')
      for (let n = 1; n < quantity; n += 1) {
        await page.getByTestId(`membership-plus-${name}`).click()
        await expect(page.getByTestId(`membership-qty-${name}`)).toHaveText(String(n + 1))
      }
    }
    await page.getByTestId('membership-close').click()
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    await visible(page).getByTestId('m4-nav-shopping').click()
    await expect(visible(page).getByTestId('m6-page')).toBeVisible()
  }

  function m6(page: Page) {
    return visible(page).getByTestId('m6-page')
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
 * M6's own spine (UI-Test-Spec E2E-M6-01/04), written 2026-08-30 with the pass
 * that read all twenty-two M6 promises against the screen.
 *
 * The composer is the fixture here rather than the subject: a free-text add on
 * M6 lands in the **open tab's** mode, which is the only way the app can put a
 * row on a shopping list by hand, and it is what E2E-M6-03 covers in its own
 * right.
 */
test.describe('M6 shopping — the two lists and their counts @local @m6', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /** M6's own page — see `addOnOpenTab` for why `visiblePage` will not do. */
  const m6 = (page: Page) => visible(page).getByTestId('m6-page')

  /** A tagged master item, so the trip row carries a real category (FR-24.2). */
  async function createTaggedItem(page: Page, name: string, tag: string) {
    await page.goto('/tabs/items')
    await visible(page).getByTestId('m9-fab').click()
    await visible(page).getByTestId('m10-name').locator('input').fill(name)
    await visible(page).getByTestId('m10-tag-search').locator('input').fill(tag)
    const offer = visible(page).getByTestId(`m10-tag-offer-${tag}`)
    const create = visible(page).getByTestId('m10-tag-create')
    await expect(offer.or(create).first()).toBeVisible()
    if ((await offer.count()) > 0) await offer.click()
    else await create.click()
    await expect(visible(page).getByTestId(`m10-tag-assigned-${tag}`)).toBeVisible()
    await visible(page).getByTestId('m10-create').click()
    // The ADR-011 header is outside the router outlet, so it is never scoped.
    await expect(page.getByTestId('header-title')).toHaveText(name)
  }

  /**
   * Add through M6's own composer, into whichever tab is open.
   *
   * Scoped through `m6-page`, never `visiblePage`: ADR-012 leaves M4 mounted
   * and *visible* behind M6, so every shared testid — the composer's above all
   * — resolves twice there. This file's ledger section already names the trap;
   * it cost two runs to re-learn.
   */
  async function addOnOpenTab(page: Page, name: string, viaSuggestion = false) {
    // The composer stays open after an add (FR-25.13a), so the collapsed
    // trigger is there for the first row of a run and gone for the rest.
    // That tolerance is a fixture convenience only — the rule itself is
    // asserted in the open, below, so nothing here is covering it.
    const trigger = m6(page).getByTestId('quick-add-open')
    const field = m6(page).getByTestId('quick-add-input')
    await expect(trigger.or(field).first()).toBeVisible()
    if ((await trigger.count()) > 0) await trigger.click()
    const input = m6(page).getByTestId('quick-add-input').locator('input')
    await input.fill(viaSuggestion ? name.slice(0, 5) : name)
    if (viaSuggestion) {
      await m6(page).getByTestId('quick-add-suggestion').filter({ hasText: name }).click()
    } else {
      await m6(page).getByTestId('quick-add-confirm').click()
    }
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: name })).toBeVisible()
  }

  test('E2E-M6-01: two tabs, grouped by category, each counting things to buy', async ({
    page,
  }) => {
    await createTaggedItem(page, 'Sonnencreme', 'Drogerie')
    await createTripViaWizard(page, TRIP)
    await visible(page).getByTestId('m4-nav-shopping').click()
    await expect(m6(page)).toBeVisible()

    // Two rows on the departure tab: one with a category, one without.
    await addOnOpenTab(page, 'Sonnencreme', true)
    // Rows are entered in runs: the composer is still open, and its collapsed
    // trigger is therefore gone (FR-25.13a). Asserted rather than tolerated.
    await expect(m6(page).getByTestId('quick-add-input')).toBeVisible()
    await expect(m6(page).getByTestId('quick-add-open')).toHaveCount(0)
    await addOnOpenTab(page, 'Batterien')

    // Grouped by category — the row sits *inside* its group, which is the
    // assertion the promise makes; two rows on one screen prove nothing about
    // where they sit.
    await expect(
      m6(page).getByTestId('m6-group-Drogerie').getByTestId('m6-row'),
    ).toContainText('Sonnencreme')
    await expect(m6(page).getByTestId('m6-group-none').getByTestId('m6-row')).toContainText(
      'Batterien',
    )
    await expect(m6(page).getByTestId('m6-group-none')).toContainText('Uncategorized')

    // The label counts things to buy (FR-25.6), and the other tab is its own
    // list — a shared list would show two here.
    await expect(m6(page).getByTestId('m6-tab-before')).toContainText('(2)')
    await expect(m6(page).getByTestId('m6-tab-local')).toContainText('(0)')

    await m6(page).getByTestId('m6-tab-local').click()
    await expect(m6(page).getByTestId('m6-row')).toHaveCount(0)
    await addOnOpenTab(page, 'Eis')
    await expect(m6(page).getByTestId('m6-tab-local')).toContainText('(1)')
    await expect(m6(page).getByTestId('m6-tab-before')).toContainText('(2)')
  })

  test('E2E-M6-04: an empty shopping list drops M4’s badge, never the entry', async ({ page }) => {
    await createTripViaWizard(page, TRIP)

    // The destination exists either way — G-12's bar has no overflow to hide
    // it in, so hiding the entry would strand M6 on a trip that has yet to
    // need it. Only the badge answers to the count.
    const entry = visible(page).getByTestId('m4-nav-shopping')
    await expect(entry).toBeVisible()
    await expect(entry.locator('ion-badge')).toHaveCount(0)

    await entry.click()
    await expect(m6(page)).toBeVisible()
    await addOnOpenTab(page, 'Batterien')
    await page.getByTestId('header-back').click()
    await expect(visible(page).getByTestId('m4-nav-shopping')).toBeVisible()
    await expect(visible(page).getByTestId('m4-nav-shopping').locator('ion-badge')).toHaveText('1')
  })
})

