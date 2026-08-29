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

  test('E2E-M5-19: removing a packed traveler is confirmed, and cancelling keeps the row', async ({
    page,
  }) => {
    await seedTrip(page)

    await openMembership(page, ITEM)
    await page.getByTestId('membership-per-person').click()
    await setMember(page, 'Andy', 2)
    await setMember(page, 'Leonardo', 2)
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

    // One member left: FR-25.1's flat fallback, not a one-child cluster.
    await expect(visiblePage(page).getByTestId(`m4-cluster-${ITEM}`)).toHaveCount(0)
  })

  test('E2E-M5-20: collapsing back to shared sums the amounts', async ({ page }) => {
    await seedTrip(page)

    await openMembership(page, ITEM)
    await page.getByTestId('membership-per-person').click()
    await setMember(page, 'Andy', 2)
    await setMember(page, 'Leonardo', 3)

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
  })
})
