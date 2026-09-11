/**
 * FR-25.21 — who needs an item, and how many each.
 *
 * The assertions are made on the **rendered M4 cluster**, never on a row count:
 * FR-25.8's own history records an implementation that satisfied "one row per
 * traveler" with N unrelated items sharing a name, and every count-based check
 * passed against it. What proves the feature is that the item is named *once*
 * and its children carry *different* amounts.
 */
import { test, expect, createTripViaWizard, openQuickAdd, visiblePage } from './fixtures'
import { createMasterItem } from './helpers/templates'
import type { Page } from '@playwright/test'
import { PATH } from './routes'

const TRIP = { name: 'Sommerferien Elba', travelers: ['Andy', 'Leonardo', 'Mia'] }
const ITEM = 'Kurze Hosen'

/** A trip with a roster and one shared, ad-hoc row to make per-person. */
async function seedTrip(page: Page) {
  await createTripViaWizard(page, TRIP)
  await openQuickAdd(page)
  await page.getByTestId('quick-add-input').locator('input').fill(ITEM)
  await page.getByTestId('quick-add-confirm').click()
  await expect(page.getByTestId(`m4-row-${ITEM}`)).toBeVisible()
}

/**
 * Open M5 and reach the membership sheet behind Details.
 *
 * `from` names a traveler once the item is per-person: there is then no
 * `m4-row-<name>` any more — the item is a cluster head with child rows, which
 * is the very shape these cases assert.
 */
async function openMembership(page: Page, itemName: string, from?: string) {
  const target = from
    ? visiblePage(page).getByTestId(`m4-child-${itemName}-${from}`)
    : visiblePage(page).getByTestId(`m4-row-${itemName}`)
  await target.click()
  await expect(page.getByTestId('m5-sheet')).toBeVisible()
  await page.getByTestId('m5-details').click()
  await page.getByTestId('m5-membership').click()
  await expect(page.getByTestId('membership-sheet')).toBeVisible()
}

async function closeAll(page: Page) {
  await page.getByTestId('membership-close').click()
  await expect(page.getByTestId('membership-sheet')).toHaveCount(0)
  await page.getByTestId('m5-close').click()
  await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
}

/** Check a traveler and step their amount to `quantity`, settling on each write. */
async function setMember(page: Page, name: string, quantity: number) {
  await page.getByTestId(`membership-check-${name}`).click()
  await expect(page.getByTestId(`membership-qty-${name}`)).toHaveText('1')
  for (let n = 1; n < quantity; n += 1) {
    await page.getByTestId(`membership-plus-${name}`).click()
    await expect(page.getByTestId(`membership-qty-${name}`)).toHaveText(String(n + 1))
  }
}

test.describe('FR-25.21 membership with per-person amounts @local @m5', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M5-18: three travelers, three different amounts, one cluster', async ({ page }) => {
    await seedTrip(page)

    await openMembership(page, ITEM)
    await page.getByTestId('membership-per-person').click()
    await setMember(page, 'Andy', 2)
    await setMember(page, 'Leonardo', 3)
    await setMember(page, 'Mia', 1)
    await expect(page.getByTestId('membership-summary')).toContainText('6')
    await closeAll(page)

    // The item is named once — the cluster head — with one child per traveler.
    const list = visiblePage(page)
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toBeVisible()
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`)).toContainText('0/2')
    await expect(list.getByTestId(`m4-child-${ITEM}-Leonardo`)).toContainText('0/3')
    // G-6: a quantity of one renders a checkbox rather than a stepper, so Mia's
    // amount shows as its control. That difference *is* the assertion — the
    // three children carry three different amounts.
    await expect(list.getByTestId(`m4-child-${ITEM}-Mia`).getByTestId('row-check')).toBeVisible()
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`).getByTestId('row-plus')).toBeVisible()
    // FR-25.22: the head counts units, so it is the sum of the three children
    // (2 + 3 + 1) and not a count of the people under it — which would be the
    // one line on the cluster that cannot be added up from the rest.
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toContainText('0/6')
    // The name is not repeated as its own row beside the cluster.
    await expect(list.getByTestId(`m4-row-${ITEM}`)).toHaveCount(0)
  })

  /*
   * FR-21.16. Read off the *rendered* type, because that is the only place the
   * defect existed: both blocks used legal tokens (invariant 9b), the
   * component's own comment described the intended order correctly, and the
   * stylesheet under it did the opposite. A screenshot would catch it too, but
   * only a person comparing two baselines — this states the rule.
   */
  test('E2E-M5-24: a cluster names its item louder than its people (FR-21.16)', async ({
    page,
  }) => {
    const PLAIN = 'Zahnbürste'
    await seedTrip(page)

    await openMembership(page, ITEM)
    await page.getByTestId('membership-per-person').click()
    await setMember(page, 'Andy', 1)
    await setMember(page, 'Leonardo', 1)
    await closeAll(page)

    // A plain row, to pin the head to the app's row size rather than only to
    // "bigger than its child" — which a head three steps too large also passes.
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill(PLAIN)
    await page.getByTestId('quick-add-confirm').click()
    const list = visiblePage(page)
    await expect(list.getByTestId(`m4-row-${PLAIN}`)).toBeVisible()

    const type = (locator: ReturnType<Page['getByTestId']>) =>
      locator.evaluate((el) => {
        const style = getComputedStyle(el)
        return { size: parseFloat(style.fontSize), weight: Number(style.fontWeight) }
      })

    const head = await type(list.getByTestId(`m4-cluster-${ITEM}`).locator('.cluster-name'))
    const child = await type(list.getByTestId(`m4-child-${ITEM}-Andy`).locator('h3'))
    const plainRow = await type(list.getByTestId(`m4-row-${PLAIN}`).locator('h3'))

    // The item is what is being packed; the person only qualifies it.
    expect(head.size).toBeGreaterThan(child.size)
    expect(head.weight).toBeGreaterThan(child.weight)
    // And the head is a row name, not a size of its own.
    expect(head.size).toBe(plainRow.size)
  })

  /*
   * FR-25.21c. The tap is made from a *partial* membership carrying a chosen
   * amount, because that is the half a select-all can get wrong: the missing
   * travelers arrive at one and Leonardo's three stay three. The head's own
   * state is read before and after — mixed, then checked — so the case cannot
   * pass against a control that only writes and never reports.
   */
  test('E2E-M5-26: one tap adds the missing travelers and leaves a chosen amount alone', async ({
    page,
  }) => {
    await seedTrip(page)

    await openMembership(page, ITEM)
    await page.getByTestId('membership-per-person').click()
    await setMember(page, 'Leonardo', 3)

    const all = page.getByTestId('membership-check-all')
    await expect(all).toHaveAttribute('aria-checked', 'mixed')
    await expect(page.getByTestId('membership-qty-Andy')).toHaveCount(0)

    await all.click()

    await expect(page.getByTestId('membership-qty-Andy')).toHaveText('1')
    await expect(page.getByTestId('membership-qty-Mia')).toHaveText('1')
    await expect(page.getByTestId('membership-qty-Leonardo')).toHaveText('3')
    await expect(page.getByTestId('membership-summary')).toContainText('5')
    // Nothing left to add, and the head says so as an ordinary checked box —
    // not a faded one, which is the G-3 lock's sentence about a claimed row.
    await expect(all).toHaveAttribute('aria-checked', 'true')
    await expect(all).not.toHaveClass(/checkbox-disabled/)

    // Tapping it again therefore has to be answerable: it changes nothing, and
    // the box comes back checked rather than following its own toggle.
    await all.click()
    await expect(all).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('membership-qty-Leonardo')).toHaveText('3')
    await expect(page.getByTestId('membership-summary')).toContainText('5')

    // The decision sits where M4's pack control sits — read off the rendered
    // geometry, because the row's order is the whole rule and a DOM order is
    // not it: `flex-direction` alone would satisfy the markup and fail the eye.
    const box = async (testId: string) => {
      const rect = await page.getByTestId(testId).boundingBox()
      if (!rect) throw new Error(`${testId} has no box`)
      return rect
    }
    const check = await box('membership-check-Andy')
    const stepper = await box('membership-qty-Andy')
    const row = await box('membership-sheet')
    expect(check.x).toBeGreaterThan(stepper.x + stepper.width)
    expect(check.x).toBeGreaterThan(row.x + row.width / 2)
    const headCheck = await box('membership-check-all')
    expect(headCheck.x).toBeGreaterThan(row.x + row.width / 2)

    await closeAll(page)

    const list = visiblePage(page)
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`).getByTestId('row-check')).toBeVisible()
    await expect(list.getByTestId(`m4-child-${ITEM}-Leonardo`)).toContainText('0/3')
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toContainText('0/5')
  })

  test('E2E-M5-19: removing a packed traveler is confirmed; removing a costless one is not', async ({
    page,
  }) => {
    await seedTrip(page)

    await openMembership(page, ITEM)
    await page.getByTestId('membership-per-person').click()
    await setMember(page, 'Andy', 2)
    await setMember(page, 'Leonardo', 2)
    await setMember(page, 'Mia', 1)
    await closeAll(page)

    // Pack one of Leonardo's, so removing him would cost something.
    const child = visiblePage(page).getByTestId(`m4-child-${ITEM}-Leonardo`)
    await child.getByTestId('row-plus').click()
    await expect(child).toContainText('1/2')

    await openMembership(page, ITEM, 'Andy')
    await page.getByTestId('membership-check-Leonardo').click()
    const alert = page.locator('ion-alert')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('1')

    // Cancelling is the positive signal: the removal is a decision, not a side
    // effect of tapping the checkbox.
    await alert.getByRole('button', { name: /Abbrechen|Cancel/ }).click()
    await expect(alert).toBeHidden()
    await expect(page.getByTestId('membership-qty-Leonardo')).toHaveText('2')

    await page.getByTestId('membership-check-Leonardo').click()
    await page
      .locator('ion-alert')
      .getByRole('button', { name: /Bestätigen|Confirm/ })
      .click()
    await expect(page.getByTestId('membership-qty-Leonardo')).toHaveCount(0)
    await closeAll(page)

    // Two left — Andy's 2 and Mia's 1, which is what the head reports (FR-25.22).
    await expect(visiblePage(page).getByTestId(`m4-cluster-${ITEM}`)).toContainText('0/3')

    // Mia's row carries nothing — no progress, no thread, no todo — so it is
    // written without a question. The disappearing amount is the positive
    // signal; the absent alert is what proves the question is raised by cost
    // and not by the control.
    await openMembership(page, ITEM, 'Andy')
    await page.getByTestId('membership-check-Mia').click()
    await expect(page.getByTestId('membership-qty-Mia')).toHaveCount(0)
    await expect(page.locator('ion-alert')).toBeHidden()
    await closeAll(page)

    // One member left: FR-25.1's flat fallback (E2E-M4-13) — an ordinary row
    // carrying the person's name, not a one-child cluster. Both halves are the
    // assertion: a cluster of one would also "show Andy" in its child.
    await expect(visiblePage(page).getByTestId(`m4-cluster-${ITEM}`)).toHaveCount(0)
    await expect(visiblePage(page).getByTestId(`m4-row-${ITEM}`)).toContainText(`${ITEM} · Andy`)
  })

  test('E2E-M5-20: collapsing back to shared sums the amounts and keeps the row', async ({
    page,
  }) => {
    await seedTrip(page)

    await openMembership(page, ITEM)
    await page.getByTestId('membership-per-person').click()
    await setMember(page, 'Andy', 2)
    await setMember(page, 'Leonardo', 3)
    await closeAll(page)

    // A preparation todo on Leonardo's row (FR-7.3). It makes his the survivor
    // — content leads the ladder — and it is the thing ADR-036's keep-and-repoint
    // exists to protect: delete-and-recreate would collapse the amounts just as
    // correctly and lose this.
    const TODO = 'Groesse pruefen'
    await visiblePage(page).getByTestId(`m4-child-${ITEM}-Leonardo`).click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId('m5-todo-input').locator('input').fill(TODO)
    await page.getByTestId('m5-todo-add').click()
    await expect(page.getByTestId('m5-sheet')).toContainText(TODO)
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    await openMembership(page, ITEM, 'Leonardo')
    await page.getByTestId('membership-shared').click()
    const alert = page.locator('ion-alert')
    await expect(alert).toBeVisible()
    // The sum, stated before it is written — not the largest.
    await expect(alert).toContainText('5')
    await alert.getByRole('button', { name: /Bestätigen|Confirm/ }).click()

    await expect(page.getByTestId('membership-summary')).toContainText('5')
    await closeAll(page)

    await expect(visiblePage(page).getByTestId(`m4-cluster-${ITEM}`)).toHaveCount(0)
    await expect(visiblePage(page).getByTestId(`m4-row-${ITEM}`)).toContainText('0/5')

    // The surviving row is the row, not a new one wearing its name.
    await visiblePage(page).getByTestId(`m4-row-${ITEM}`).click()
    await expect(page.getByTestId('m5-sheet')).toContainText(TODO)
  })
})

/**
 * FR-25.8 — the quick-add's own per-person path (E2E-M4-12 + E2E-M4-58).
 *
 * The two spec entries name one rendered outcome and this case asserts every
 * clause of both: the `0/2` head M4-12 asks for, the absence of a second
 * top-level row wearing the name — the 2026-08-07 regression, where each row
 * was individually right and only the grouping was wrong — and M4-58's
 * differing amounts on rows that have no `source_item_id`, which is what makes
 * this the case that proves the folded-name cluster key.
 */
test.describe('FR-25.8 per-person quick-add @local @m4', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M4-12, E2E-M4-58: pro Person adds one cluster, not N items sharing a name', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)

    await page.getByTestId('quick-add-mode-per-person').click()
    await page.getByTestId('quick-add-input').locator('input').fill(ITEM)
    await page.getByTestId('quick-add-confirm').click()

    // The mode is the answer to which tab this is: the editor opens on the
    // roster, and the first check is what fans the row out.
    await expect(page.getByTestId('membership-sheet')).toBeVisible()
    await expect(page.getByTestId('membership-check-Andy')).toBeVisible()
    await setMember(page, 'Andy', 2)
    await setMember(page, 'Leonardo', 3)
    await page.getByTestId('membership-close').click()
    await expect(page.getByTestId('membership-sheet')).toHaveCount(0)

    const list = visiblePage(page)
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toContainText('0/5')
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`)).toContainText('0/2')
    await expect(list.getByTestId(`m4-child-${ITEM}-Leonardo`)).toContainText('0/3')
    // Each child carries its own working control (E2E-M4-12), not one shared
    // by the cluster: two rows reading 0/2 and 0/3 could still be drawn by a
    // head that packs them together.
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`).getByTestId('row-plus')).toBeVisible()
    await expect(
      list.getByTestId(`m4-child-${ITEM}-Leonardo`).getByTestId('row-plus'),
    ).toBeVisible()
    // Mia was never checked, so she has no row at all — a quantity of 0 would
    // be FR-5.5's *skipped*, which is a different statement (FR-25.21).
    await expect(list.getByTestId(`m4-child-${ITEM}-Mia`)).toHaveCount(0)
    // The name is not repeated as a top-level row beside the cluster.
    await expect(list.getByTestId(`m4-row-${ITEM}`)).toHaveCount(0)
  })

  test('E2E-M4-64: with nobody to distribute over, the mode is absent (G-8)', async ({ page }) => {
    await createTripViaWizard(page, { name: 'Solo', travelers: ['Andy'] })
    await openQuickAdd(page)

    // Not disabled — absent. There is no membership to distribute, and a
    // control that can only say one thing is worse than no control.
    await expect(page.getByTestId('quick-add-mode-per-person')).toHaveCount(0)
    await expect(page.getByTestId('quick-add-input')).toBeVisible()
  })

  /**
   * FR-25.13g/h — the whole point of the verb is that the run does not stop:
   * no editor opens, the sheet stays up, and the rows are there when it
   * closes. TRIP has exactly three travelers, so 👥 here is the same write
   * three avatar taps would make (FR-25.13h) — `assigning`, not the bulk
   * `acted` verb, precisely so the three it just picked stay deselectable
   * (found live: no way back from 👥's own "all three" once it closed the
   * row). Asserted on the rendered cluster for this file's own reason, and
   * the sheet being *visible* afterwards is the positive signal that nothing
   * was presented over it (E2E-M4-65 is the same question the other way
   * round).
   */
  test('E2E-M4-78: „für alle" gives every traveler a row without leaving the sheet', async ({
    page,
  }) => {
    await createMasterItem(page, 'Sonnenhut')
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await visiblePage(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    await expect(sheet).toBeVisible()

    const row = sheet.getByTestId('browse-row-free').filter({ hasText: 'Sonnenhut' })
    await row.getByTestId('browse-for-all').click()

    // The line says who it reached — roster order, the same label an avatar
    // tap would leave (FR-25.13h).
    await expect(sheet.getByTestId('browse-assigned-now')).toContainText('Andy, Leonardo, Mia')
    // Every avatar it just selected is still there and still deselectable —
    // the exact thing 👥's old bulk verb took away.
    await expect(row.getByTestId('browse-assign-Andy')).toHaveClass(/selected/)
    await expect(row.getByTestId('browse-assign-Leonardo')).toHaveClass(/selected/)
    await expect(row.getByTestId('browse-assign-Mia')).toHaveClass(/selected/)
    await expect(sheet).toBeVisible()
    await expect(page.getByTestId('membership-sheet')).toHaveCount(0)

    await sheet.getByTestId('browse-close').click()
    await expect(sheet).toHaveCount(0)
    const list = visiblePage(page)
    for (const traveler of TRIP.travelers) {
      await expect(list.getByTestId(`m4-child-Sonnenhut-${traveler}`)).toBeVisible()
    }
    // Named once: three rows sharing a name is the shape FR-25.8 forbids.
    await expect(list.getByTestId('m4-row-Sonnenhut')).toHaveCount(0)
  })

  /**
   * The same verb on a line the trip already carries — the correction for a
   * shared row that turns out to be everybody's (ADR-036 keep-and-repoint).
   * Within one run of the sheet a line the run itself added offers the way
   * *back* and nothing else, so the sheet is closed and reopened here, which
   * is also the state a second visit is in.
   */
  test('E2E-M4-79: „für alle" spreads a row the trip already carries', async ({ page }) => {
    await createMasterItem(page, 'Sonnenhut')
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await visiblePage(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    await sheet.getByTestId('browse-row-free').filter({ hasText: 'Sonnenhut' }).click()
    await expect(sheet.getByTestId('browse-added-now')).toBeVisible()
    await sheet.getByTestId('browse-close').click()
    await expect(sheet).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m4-row-Sonnenhut')).toBeVisible()

    await visiblePage(page).getByTestId('quick-add-browse-open').click()
    await expect(sheet).toBeVisible()
    await sheet
      .getByTestId('browse-row-carried')
      .filter({ hasText: 'Sonnenhut' })
      .getByTestId('browse-for-all')
      .click()
    await expect(sheet.getByTestId('browse-for-all-now')).toContainText('3')

    await sheet.getByTestId('browse-close').click()
    await expect(sheet).toHaveCount(0)
    const list = visiblePage(page)
    for (const traveler of TRIP.travelers) {
      await expect(list.getByTestId(`m4-child-Sonnenhut-${traveler}`)).toBeVisible()
    }
    // The shared row is gone as a row of its own: it *became* one of the three
    // (ADR-036), rather than being left beside them.
    await expect(list.getByTestId('m4-row-Sonnenhut')).toHaveCount(0)
  })

  test('E2E-M4-65: a per-person add from the browse-sheet closes it first', async ({ page }) => {
    await page.goto(PATH.items)
    await page.getByTestId('m9-fab').click()
    await page.getByTestId('m10-name').locator('input').fill('Sonnenhut')
    await page.getByTestId('m10-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Sonnenhut')

    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-mode-per-person').click()
    await visiblePage(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    await expect(sheet).toBeVisible()
    await sheet.getByTestId('browse-row').filter({ hasText: 'Sonnenhut' }).click()

    // The sheet is gone rather than merely covered, and the editor is
    // *operable*: a modal presented under it renders behind it, greyed, and
    // the click below is what tells the two apart — a visible-only assertion
    // passes against the broken build.
    await expect(sheet).toHaveCount(0)
    await expect(page.getByTestId('membership-sheet')).toBeVisible()
    await page.getByTestId('membership-check-Andy').click()
    await expect(page.getByTestId('membership-qty-Andy')).toHaveText('1')
  })

  /**
   * FR-25.13h — the browse-sheet's per-traveler avatar buttons, up to three
   * travelers, multi-select. TRIP has exactly three, so this is also the
   * boundary the long-press menu takes over above.
   */
  test('E2E-M4-80: avatar buttons multi-select — tap adds, a second tap on the same one removes', async ({
    page,
  }) => {
    await createMasterItem(page, 'Sonnenhut')
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await visiblePage(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    const row = sheet.getByTestId('browse-row-free').filter({ hasText: 'Sonnenhut' })
    await expect(row).toBeVisible()

    // 👥 is still there and still one tap, exactly as FR-25.13g left it — the
    // avatar buttons are an addition, not a replacement.
    await expect(row.getByTestId('browse-for-all')).toBeVisible()
    await row.getByTestId('browse-assign-Leonardo').click()

    await expect(sheet.getByTestId('browse-assigned-now')).toContainText('Leonardo')
    // The row stays `browse-row-free` — unlike every other verb, this one
    // has to keep the avatar buttons reachable for a second tap.
    await expect(row).toHaveAttribute('data-testid', 'browse-row-free')

    // A second traveler joins the same row instead of starting a new one.
    await row.getByTestId('browse-assign-Mia').click()
    await expect(sheet.getByTestId('browse-assigned-now')).toContainText('Leonardo, Mia')

    // Tapping the first traveler again takes just that one back off.
    await row.getByTestId('browse-assign-Leonardo').click()
    await expect(sheet.getByTestId('browse-assigned-now')).toContainText('Mia')
    await expect(sheet.getByTestId('browse-assigned-now')).not.toContainText('Leonardo')

    await sheet.getByTestId('browse-close').click()
    await expect(sheet).toHaveCount(0)

    // Named once, not a cluster: one traveler ended up on the row, not a
    // spread — the shape FR-25.13g's own case would leave behind instead.
    const list = visiblePage(page)
    await expect(list.getByTestId('m4-row-Sonnenhut')).toBeVisible()
    await expect(list.getByTestId('m4-cluster-Sonnenhut')).toHaveCount(0)
  })

  /**
   * FR-25.13h above three travelers: the line keeps FR-25.13g's shape and a
   * long press on 👥 opens the menu instead. `dispatchEvent('contextmenu')`
   * is the same seam `E2E-M7-04` drives — the handler a real touch long-press
   * fires into, without a real-time 500 ms hold (see `useLongPress`).
   */
  test('E2E-M4-81: a long press on 👥 opens a menu above three travelers', async ({ page }) => {
    const FOUR = { name: 'Familienskiwoche', travelers: ['Andy', 'Leonardo', 'Mia', 'Theo'] }
    // Both items exist before the trip, so the run stays inside one open
    // sheet (FR-25.13d) rather than leaving M4 mid-test to create the second.
    await createMasterItem(page, 'Sonnenhut')
    await createMasterItem(page, 'Sonnenschirm')
    await createTripViaWizard(page, FOUR)
    await openQuickAdd(page)
    await visiblePage(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    const hutRow = sheet.getByTestId('browse-row-free').filter({ hasText: 'Sonnenhut' })
    await expect(hutRow).toBeVisible()

    // No avatar buttons at four — the line stays exactly the shape E2E-M4-78
    // renders it in, room for 👥/✓/✕ and nothing else.
    await expect(hutRow.getByTestId(/^browse-assign-/)).toHaveCount(0)

    await hutRow.getByTestId('browse-for-all').dispatchEvent('contextmenu')
    const menu = page.locator('ion-action-sheet')
    await expect(menu).toBeVisible()
    await menu.getByRole('button', { name: 'Theo' }).click()
    await expect(sheet.getByTestId('browse-assigned-now')).toContainText('Theo')
    // The outgoing sheet stays in the DOM (`overlay-hidden`) through its
    // dismiss animation; `openTravelerMenu`'s own re-entrancy guard means a
    // long press in that window is a no-op, not a second overlay — so the
    // second press has to wait for the first sheet to actually be gone
    // rather than racing it (a settled-state wait, not a timing guess).
    await expect(menu).toHaveCount(0)

    // FR-25.13h's multi-select over the menu too: a second long press picks
    // a second traveler for the *same* row — an action sheet has no way to
    // show a pick as already selected, so this path only ever adds.
    // `hutRow` still resolves it: an `assigning` line keeps `browse-row-free`
    // rather than moving to `browse-row-carried` the way `acted` lines do
    // (E2E-M4-78/79's reason) — it has to stay reachable for the next pick.
    await hutRow.getByTestId('browse-for-all').dispatchEvent('contextmenu')
    await expect(menu).toBeVisible()
    await menu.getByRole('button', { name: 'Mia' }).click()
    // Roster order (Andy, Leonardo, Mia, Theo), not tap order — the label is
    // built by filtering the roster to the selected set, so it stays stable
    // regardless of which traveler was picked first.
    await expect(sheet.getByTestId('browse-assigned-now')).toContainText('Mia, Theo')

    // The plain tap on a different line still means „für alle" —
    // unconditionally, whichever gesture the line beside it just took.
    await sheet
      .getByTestId('browse-row-free')
      .filter({ hasText: 'Sonnenschirm' })
      .getByTestId('browse-for-all')
      .click()
    await expect(sheet.getByTestId('browse-for-all-now')).toContainText('4')
  })
})

/**
 * FR-25.21 / FR-5.5 — a conversion never leaves a row claiming a state its own
 * numbers no longer support.
 *
 * The route is FR-25.13f's ✕ (*„zu Hause gelassen"*), which writes quantity 0
 * and state *skipped*, followed by FR-25.8's per-person mode, whose smallest
 * membership is 1. Before this rule the row came back with quantity 1 and the
 * skipped state intact — and `isDone` reads *skipped* as done, so FR-25.2 took
 * the row straight off the list. The assertion is therefore that the row is
 * **on the list**: an invisible row is the defect, and only a visible one
 * disproves it.
 */
test.describe('FR-25.21 the state follows the numbers @local @m5', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M5-21: taking a skipped row along again is asked, then visible', async ({ page }) => {
    await page.goto(PATH.items)
    await page.getByTestId('m9-fab').click()
    await page.getByTestId('m10-name').locator('input').fill(ITEM)
    await page.getByTestId('m10-create').click()
    await expect(page.getByTestId('header-title')).toHaveText(ITEM)

    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-mode-per-person').click()
    await visiblePage(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    await sheet
      .getByTestId('browse-row-free')
      .filter({ hasText: ITEM })
      .getByTestId('browse-skip')
      .click()

    await expect(page.getByTestId('membership-sheet')).toBeVisible()
    await page.getByTestId('membership-check-Andy').click()

    // The decision is undone as a side effect of a checkbox, so it is asked —
    // and cancelling is the positive signal that the question is a gate: the
    // amount does not appear.
    const alert = page.locator('ion-alert')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText(ITEM)
    await alert.getByRole('button', { name: /Abbrechen|Cancel/ }).click()
    await expect(page.getByTestId('membership-qty-Andy')).toHaveCount(0)
    // The dismissed alert has to be *closed*, not merely answered — the
    // element stays in the DOM either way. A second one opening while the
    // first tears down ends up under the modal, and its buttons take no clicks.
    await expect(alert).toBeHidden()

    await page.getByTestId('membership-check-Andy').click()
    await page
      .locator('ion-alert')
      .getByRole('button', { name: /Bestätigen|Confirm/ })
      .click()
    await expect(page.getByTestId('membership-qty-Andy')).toHaveText('1')
    await page.getByTestId('membership-close').click()

    // On the list, not hidden as a done row.
    await expect(visiblePage(page).getByTestId(`m4-row-${ITEM}`)).toContainText(`${ITEM} · Andy`)
  })

  /**
   * E2E-M4-14 (FR-25.1/25.2): packing one instance leaves the cluster standing.
   *
   * The rule — decide cluster-vs-flat over the *full* set, not over what is
   * currently on screen — is unit-tested twice in `domain/packingView.spec.ts`.
   * What no unit can see is M4's own wiring: the screen holds two sets, the
   * full one and the hidden-done one, and handing the wrong one to the view
   * builder restructures the list under the user's finger mid-tap. Andy's row
   * would become a flat „Kurze Hosen · Andy" the instant Leonardo's was packed,
   * moving the control the finger is already on.
   */
  test('E2E-M4-14: packing one instance of a cluster does not flatten the other', async ({
    page,
  }) => {
    await seedTrip(page)

    await openMembership(page, ITEM)
    await page.getByTestId('membership-per-person').click()
    await setMember(page, 'Andy', 1)
    await setMember(page, 'Leonardo', 1)
    await closeAll(page)

    const list = visiblePage(page)
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toContainText('0/2')

    await list.getByTestId(`m4-child-${ITEM}-Leonardo`).getByTestId('row-check').click()

    // The packed child drops out (FR-25.2), and the head still counts over the
    // full set — so the number goes up rather than the denominator down.
    await expect(list.getByTestId(`m4-child-${ITEM}-Leonardo`)).toHaveCount(0)
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toContainText('1/2')

    // The assertion this case exists for: Andy's instance is still a *child*.
    // A flat row would also be visible and also say "Andy", so the negative
    // half — no top-level row by that name — is what carries it.
    await expect(list.getByTestId(`m4-child-${ITEM}-Andy`)).toBeVisible()
    // The flat row is testid'd by the item *name* (the „· Andy" is only in the
    // label), so this one locator is the whole negative half.
    await expect(list.getByTestId(`m4-row-${ITEM}`)).toHaveCount(0)
  })
})
