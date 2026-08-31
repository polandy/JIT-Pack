import {
  test,
  expect,
  assignToContainer,
  chooseInSelect,
  closeContainerSheet as closeSheet,
  createContainer,
  createTripViaWizard,
  openLuggage,
  openQuickAdd,
} from './fixtures'
import type { Page } from '@playwright/test'

/**
 * M11 — Container Management (UI-Test-Spec §4, unit "M11 containers").
 *
 * Local Mode throughout: containers are trip-partition data and every rule
 * here — weight budgets, pairing, the unassigned bucket — is client-side
 * (invariant 4).
 *
 * The pairing *write semantics* (both sides at once, exclusive, released
 * on delete) are specified in src/domain/__tests__/containers.spec.ts;
 * these cases assert what the user can see of them across two sheets.
 */

const TRIP = { name: 'Veloferien Elba', travelers: ['Andy', 'Sia'] }

/** The visible page, per the working agreement: assert what is rendered. */
function visible(page: Page) {
  return page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')
}

/** Ionic inputs hydrate late; filling before that goes nowhere. */
async function fillIonic(field: ReturnType<Page['locator']>, value: string) {
  await expect(field).toHaveClass(/hydrated/)
  const input = field.locator('input')
  await input.click()
  await input.fill('')
  await input.pressSequentially(value)
  await expect(input).toHaveValue(value)
}

// openLuggage, createContainer, closeSheet and assignToContainer live in
// fixtures.ts: the M12 unit needs the same three to render the Gepäck
// dimension over a real bag (FR-10.4), and one navigation sequence copied
// into two specs is how the M9 unit lost a wait.

function card(page: Page, name: string) {
  return visible(page).getByTestId('m11-container-card').filter({ hasText: name })
}

async function openCard(page: Page, name: string) {
  await card(page, name).click()
  await expect(page.getByTestId('m11-sheet')).toBeVisible()
}

/** The pairing/carrier chips inside the open sheet, by label. */
function sheetChip(page: Page, label: string) {
  return page.getByTestId('m11-sheet').getByRole('button', { name: label, exact: true })
}

test.describe('M11 containers @local @m11', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M11-01/05 (FR-10.1, FR-24.5, FR-25.15): the ＋ FAB creates a
  // container and opens its sheet; name, carrier and limit commit with no
  // save button; pairing is set on both sides at once and cleared on both.
  test('E2E-M11-01, E2E-M11-05: creating is the FAB, edits commit in the sheet, pairing is symmetric', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openLuggage(page)

    await expect(visible(page).getByTestId('m11-empty')).toBeVisible()

    await createContainer(page, 'Links', '9')
    await expect(card(page, 'Links')).toContainText('9.0 kg')

    // Carrier commits on tap; the card shows who carries it (FR-10.1).
    await openCard(page, 'Links')
    // FR-25.15: the indicator stands *instead of* a Save button, and the
    // traceability matrix has credited this case with saying so since the
    // rebuild. Asserted 2026-08-30: the visible indicator is the positive
    // signal the absence beside it is worth anything against.
    await expect(page.getByTestId('save-indicator')).toBeVisible()
    await expect(
      page.getByTestId('m11-sheet').getByRole('button', { name: /save|speichern/i }),
    ).toHaveCount(0)
    await sheetChip(page, 'Andy').click()
    await expect(sheetChip(page, 'Andy')).toHaveClass(/sel/)
    await closeSheet(page)
    await expect(card(page, 'Links')).toContainText('Andy')

    // Pair from the *other* side and read it back on this one.
    await createContainer(page, 'Rechts')
    await openCard(page, 'Rechts')
    await sheetChip(page, 'Links').click()
    await expect(sheetChip(page, 'Links')).toHaveClass(/sel/)
    await closeSheet(page)

    await openCard(page, 'Links')
    await expect(sheetChip(page, 'Rechts')).toHaveClass(/sel/)
    // Clearing here must release Rechts too.
    await sheetChip(page, 'Rechts').click()
    await expect(sheetChip(page, 'Rechts')).not.toHaveClass(/sel/)
    await closeSheet(page)

    await openCard(page, 'Rechts')
    await expect(sheetChip(page, 'Links')).not.toHaveClass(/sel/)
  })

  // E2E-M11-07 (UX pass 2026-08-25): with no containers, "everything is
  // assigned to a container" would be a lie right under "no containers yet".
  // The unassigned section says nothing until there is either a container to
  // assign to or something unassigned to list — the first container is the
  // positive signal that the section can still appear.
  test('E2E-M11-07: with no containers the unassigned section is absent, and the first container brings it back', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openLuggage(page)

    await expect(visible(page).getByTestId('m11-empty')).toBeVisible()
    await expect(visible(page).getByTestId('m11-unassigned-title')).toHaveCount(0)
    await expect(visible(page).getByTestId('m11-unassigned-none')).toHaveCount(0)

    await createContainer(page, 'Duffel')
    await expect(visible(page).getByTestId('m11-unassigned-title')).toContainText(
      'Unassigned items (0)',
    )
    await expect(visible(page).getByTestId('m11-unassigned-none')).toBeVisible()
  })

  // E2E-M11-02 (FR-10.3): the weight bar grades against the limit —
  // amber at 90 %, red beyond — driven by a real item weight that came
  // in through the app's own paths (master item → quick-add suggestion).
  test('E2E-M11-02: the weight bar turns amber at 90 % and red over the limit', async ({
    page,
  }) => {
    // A master item with weight, created in M10's minimal form.
    await page.goto('/tabs/items')
    await visible(page).getByTestId('m9-fab').click()
    await expect(visible(page).getByTestId('m10-new-hint')).toBeVisible()
    await fillIonic(visible(page).getByTestId('m10-name'), 'Zelt')
    await visible(page).getByTestId('m10-more').click()
    await fillIonic(visible(page).getByTestId('m10-weight'), '5000')
    await visible(page).getByTestId('m10-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Zelt')

    await createTripViaWizard(page, TRIP)

    // Quick-add via the suggestion, so the row carries the master weight.
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Zel')
    await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Zelt' }).click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    await openLuggage(page)
    await createContainer(page, 'Packsack', '5.5')

    // Assign Zelt (5 kg) → 5 of 5.5 kg is 91 %: amber.
    await assignToContainer(page, 'Zelt', 'Packsack')

    await expect(card(page, 'Packsack')).toContainText('5.0 kg of 5.5 kg')
    await expect(card(page, 'Packsack').locator('.weight-fill')).toHaveClass(/warn/)

    // Tighten the limit below the load: red, and the sheet says why.
    await openCard(page, 'Packsack')
    await fillIonic(page.getByTestId('m11-max-input'), '4')
    await page.getByTestId('m11-max-input').locator('input').press('Tab')
    await expect(page.getByTestId('m11-sheet-load')).toContainText('Over the weight limit')
    await closeSheet(page)
    await expect(card(page, 'Packsack').locator('.weight-fill')).toHaveClass(/over/)
  })

  // E2E-M5-22 (FR-10.2): moving an item from one bag to another. E2E-M11-06
  // covers the *first* assignment, from the unassigned bucket through M11's
  // own picker; changing an existing one has only ever been possible from
  // M5, and E2E-M11-03 said so in writing ("re-assignment lives in M5's
  // container control, and belongs to that screen's cases") without the case
  // ever being written. Until now `m5-container` was asserted visible and
  // never operated.
  //
  // The readback is deliberately on M11 and by weight: the two cards are the
  // only surface that states where the thing actually is, and a control that
  // merely repaints its own value would satisfy an assertion made in the
  // sheet. The bucket count is the third assertion — a move that dropped the
  // old assignment without writing the new one leaves the item nowhere, and
  // both card assertions would still pass.
  test('E2E-M5-22: the sheet moves an item from one bag to another', async ({ page }) => {
    await page.goto('/tabs/items')
    await visible(page).getByTestId('m9-fab').click()
    await expect(visible(page).getByTestId('m10-new-hint')).toBeVisible()
    await fillIonic(visible(page).getByTestId('m10-name'), 'Zelt')
    await visible(page).getByTestId('m10-more').click()
    await fillIonic(visible(page).getByTestId('m10-weight'), '3000')
    await visible(page).getByTestId('m10-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Zelt')

    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Zel')
    await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Zelt' }).click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    await page.keyboard.press('Escape')

    await openLuggage(page)
    await createContainer(page, 'Packsack')
    await createContainer(page, 'Seesack')

    // The first assignment is M11's own path — this case is about the second.
    await assignToContainer(page, 'Zelt', 'Packsack')
    await expect(card(page, 'Packsack')).toContainText('3.0 kg')

    await page.getByTestId('header-back').click()
    await expect(visible(page).getByTestId('m4-row-Zelt')).toBeVisible()
    await visible(page).getByTestId('m4-row-Zelt').getByRole('heading').click()
    await page.getByTestId('m5-details').click()
    await chooseInSelect(page, 'm5-container', 'Seesack')
    // The glance row renders off the stored row, so it is the write being
    // read back rather than the select's own value.
    await expect(page.getByTestId('m5-glance')).toContainText('Seesack')
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    await openLuggage(page)
    await expect(card(page, 'Seesack')).toContainText('3.0 kg')
    // An empty bag reads "0 g" — `formatWeight` switches unit rather than
    // padding kilograms, so the emptiness is asserted in the words the
    // screen actually uses.
    await expect(card(page, 'Packsack')).toContainText('0 g')
    // It moved between bags — it did not fall out of both.
    await expect(visible(page).getByTestId('m11-unassigned-row')).toHaveCount(0)
  })

  // E2E-M11-04 (FR-10.3): paired containers show the live imbalance once
  // it exceeds the threshold (default 15 %).
  test('E2E-M11-04: a skewed pair shows its imbalance on both cards', async ({ page }) => {
    await page.goto('/tabs/items')
    await visible(page).getByTestId('m9-fab').click()
    await expect(visible(page).getByTestId('m10-new-hint')).toBeVisible()
    await fillIonic(visible(page).getByTestId('m10-name'), 'Zelt')
    await visible(page).getByTestId('m10-more').click()
    await fillIonic(visible(page).getByTestId('m10-weight'), '5000')
    await visible(page).getByTestId('m10-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Zelt')

    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Zel')
    await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Zelt' }).click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    await openLuggage(page)
    await createContainer(page, 'Links')
    await createContainer(page, 'Rechts')

    await openCard(page, 'Rechts')
    await sheetChip(page, 'Links').click()
    await expect(sheetChip(page, 'Links')).toHaveClass(/sel/)
    await closeSheet(page)

    // All of the weight on one side: 100 % against the threshold's 15 — the
    // *default*, because nothing in the app can write the per-trip override
    // FR-10.3 promises (see the UI-Test-Spec's M11 block).
    await assignToContainer(page, 'Zelt', 'Links')

    await expect(card(page, 'Links').getByTestId('m11-imbalance')).toContainText('100 %')
    await expect(card(page, 'Rechts').getByTestId('m11-imbalance')).toContainText('100 %')

    // Deleting one side releases the other. This is the *visible* half of
    // `releasePartnersOnDelete`, and the state above is what makes it
    // assertable at all: a survivor left pointing at a deleted partner
    // still weighs itself against nothing and would go on reporting this
    // 100 %. An empty pair could not tell the two apart.
    await openCard(page, 'Rechts')
    await page.getByTestId('m11-delete').click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByTestId('m11-sheet')).toHaveCount(0)
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    await expect(card(page, 'Links')).toBeVisible()
    await expect(card(page, 'Links').getByTestId('m11-imbalance')).toHaveCount(0)
  })

  // E2E-M11-06/03 (FR-10.2, FR-25.5): one plain row per unassigned item —
  // no per-container button grid —, the picker shows each container's
  // load, and deleting a container unassigns its items rather than
  // removing them from the packing list.
  test('E2E-M11-06: the bucket is rows, the picker shows loads, delete unassigns', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Zelt')
    await page.getByTestId('quick-add-confirm').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    await page.getByTestId('quick-add-input').locator('input').fill('Kocher')
    await page.getByTestId('quick-add-confirm').click()
    await expect(page.getByTestId('m4-row-Kocher')).toBeVisible()

    await openLuggage(page)
    await createContainer(page, 'Kiste', '10')

    // One row per item, and none carries an inline assign control — the
    // rejected wall was one ion-select per row (concept round 2026-08-08).
    // Not `button`: Playwright CSS pierces shadow DOM, where ion-item's
    // own tap surface is a native button.
    await expect(visible(page).getByTestId('m11-unassigned-row')).toHaveCount(2)
    await expect(visible(page).getByTestId('m11-unassigned-row').locator('ion-select')).toHaveCount(
      0,
    )

    // The picker answers "which bag?" where the load is visible.
    await visible(page).getByTestId('m11-unassigned-row').filter({ hasText: 'Zelt' }).click()
    await expect(page.getByTestId('m11-picker')).toBeVisible()
    await expect(page.getByTestId('m11-picker-option')).toContainText(['Kiste'])
    await expect(page.getByTestId('m11-picker-option').filter({ hasText: 'Kiste' })).toContainText(
      'of 10.0 kg',
    )
    await page.getByTestId('m11-picker-option').click()
    await expect(page.getByTestId('m11-picker')).toHaveCount(0)
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    await expect(visible(page).getByTestId('m11-unassigned-row')).toHaveCount(1)

    // Deleting the container frees its item — back in the bucket…
    await openCard(page, 'Kiste')
    await page.getByTestId('m11-delete').click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByTestId('m11-sheet')).toHaveCount(0)
    await expect(visible(page).getByTestId('m11-container-card')).toHaveCount(0)
    await expect(visible(page).getByTestId('m11-unassigned-row')).toHaveCount(2)

    // …and still on the packing list (the rule the delete wording states).
    await page.getByTestId('header-back').click()
    await expect(visible(page).getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(visible(page).getByTestId('m4-row-Kocher')).toBeVisible()
  })
})
