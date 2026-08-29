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
import type { Page } from '@playwright/test'

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
    // FR-25.21a: the head counts people, not units.
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toContainText('0/3')
    // The name is not repeated as its own row beside the cluster.
    await expect(list.getByTestId(`m4-row-${ITEM}`)).toHaveCount(0)
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

    // Two left, and the head counts people rather than units (FR-25.21a).
    await expect(visiblePage(page).getByTestId(`m4-cluster-${ITEM}`)).toContainText('0/2')

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

  test('E2E-M4-12/E2E-M4-58: pro Person adds one cluster, not N items sharing a name', async ({
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
    await expect(list.getByTestId(`m4-cluster-${ITEM}`)).toContainText('0/2')
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

  test('E2E-M4-60: with nobody to distribute over, the mode is absent (G-8)', async ({ page }) => {
    await createTripViaWizard(page, { name: 'Solo', travelers: ['Andy'] })
    await openQuickAdd(page)

    // Not disabled — absent. There is no membership to distribute, and a
    // control that can only say one thing is worse than no control.
    await expect(page.getByTestId('quick-add-mode-per-person')).toHaveCount(0)
    await expect(page.getByTestId('quick-add-input')).toBeVisible()
  })

  test('E2E-M4-61: a per-person add from the browse-sheet closes it first', async ({ page }) => {
    await page.goto('/tabs/items')
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
})
