import { test, expect, createTripViaWizard } from './fixtures'
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

/** M4 → M11 via the luggage button, waiting for *settled*, not arrived. */
async function openLuggage(page: Page) {
  await visible(page).getByTestId('m4-nav-luggage').click()
  await expect(visible(page).getByTestId('m11-fab')).toBeVisible()
  // While the outgoing M4 still fades, both pages read as visible.
  await expect(visible(page).getByTestId('m4-nav-luggage')).toHaveCount(0)
}

/**
 * Close the sheet and wait for the overlay to be fully gone — a click
 * arriving during the dismiss animation is swallowed by the backdrop.
 */
async function closeSheet(page: Page) {
  await page.getByTestId('m11-sheet-close').click()
  await expect(page.getByTestId('m11-sheet')).toHaveCount(0)
  await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
}

/** FAB → sheet → name (＋ optional limit) — the FR-24.5 creation path. */
async function createContainer(page: Page, name: string, limitKg?: string) {
  await visible(page).getByTestId('m11-fab').click()
  await expect(page.getByTestId('m11-sheet')).toBeVisible()
  await fillIonic(page.getByTestId('m11-name-input'), name)
  await page.getByTestId('m11-name-input').locator('input').press('Enter')
  await expect(page.getByTestId('m11-sheet-name')).toHaveText(name)
  if (limitKg) {
    await fillIonic(page.getByTestId('m11-max-input'), limitKg)
    // The commit seam is blur (G-5) — Tab moves focus and produces one.
    await page.getByTestId('m11-max-input').locator('input').press('Tab')
  }
  await closeSheet(page)
}

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
  test('E2E-M11-05: creating is the FAB, edits commit in the sheet, pairing is symmetric', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openLuggage(page)

    await expect(visible(page).getByTestId('m11-empty')).toBeVisible()

    await createContainer(page, 'Links', '9')
    await expect(card(page, 'Links')).toContainText('9.0 kg')

    // Carrier commits on tap; the card shows who carries it (FR-10.1).
    await openCard(page, 'Links')
    await expect(page.getByTestId('save-indicator')).toBeVisible()
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
    await page.getByTestId('m4-fab').click()
    await page.getByTestId('quick-add-input').locator('input').fill('Zel')
    await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Zelt' }).click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    await openLuggage(page)
    await createContainer(page, 'Packsack', '5.5')

    // Assign Zelt (5 kg) → 5 of 5.5 kg is 91 %: amber.
    await visible(page).getByTestId('m11-unassigned-row').filter({ hasText: 'Zelt' }).click()
    await expect(page.getByTestId('m11-picker')).toBeVisible()
    await page.getByTestId('m11-picker-option').filter({ hasText: 'Packsack' }).click()
    await expect(page.getByTestId('m11-picker')).toHaveCount(0)
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

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
    await page.getByTestId('m4-fab').click()
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

    // All of the weight on one side: 100 % against the threshold's 15.
    await visible(page).getByTestId('m11-unassigned-row').filter({ hasText: 'Zelt' }).click()
    await expect(page.getByTestId('m11-picker')).toBeVisible()
    await page.getByTestId('m11-picker-option').filter({ hasText: 'Links' }).click()
    await expect(page.getByTestId('m11-picker')).toHaveCount(0)

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
    await page.getByTestId('m4-fab').click()
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
