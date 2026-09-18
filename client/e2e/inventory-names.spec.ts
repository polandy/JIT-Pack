import type { Page } from '@playwright/test'
import {
  test,
  expect,
  createTripViaWizard,
  expectTripActionOffered,
  tripAction,
  fillIonic,
  openQuickAdd,
  tripActions,
  visiblePage as visible,
  writesLanded,
} from './fixtures'
import { createItem } from './helpers/m9'
import { PATH } from './routes'

/**
 * FR-27.16 — a trip row keeps the name it was written with; M4 takes the
 * inventory's newer name over on request, from the ⋮ (every name at once) or
 * from M5 (one row).
 *
 * Local Mode: the rule is client-side (invariant 4), so the mode without a
 * server is where a missing piece shows up.
 */

const MENU_LABEL = /^Names from the inventory/

/** Two inventory items, each on a new trip as an FR-27.3 row. Returns the paths. */
async function tripWithInventoryRows(page: Page, names: string[]) {
  const editors: Record<string, string> = {}
  for (const name of names) {
    await page.goto(PATH.items)
    await createItem(page, name)
    editors[name] = new URL(page.url()).pathname
  }
  const trip = await createTripViaWizard(page, { name: 'Fototour 2026', travelers: ['Andy'] })
  for (const name of names) {
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill(name.slice(0, 4))
    await page.getByTestId('quick-add-suggestion').filter({ hasText: name }).click()
    await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('quick-add-input')).toBeHidden()
  }
  await writesLanded(page)
  return { trip, editors }
}

/** Rename an item in M10, which is what the trip is then behind on. */
async function renameInInventory(page: Page, editor: string, name: string) {
  await page.goto(editor)
  await fillIonic(visible(page).getByTestId('m10-name'), name)
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('header-title')).toHaveText(name)
  await writesLanded(page)
}

test.describe('FR-27.16 — names are taken over from the inventory on request', () => {
  test.slow()

  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M4-103: the ⋮ offers every name the inventory moved on from, and „All" takes them over', async ({
    page,
  }) => {
    const { trip, editors } = await tripWithInventoryRows(page, ['Kamera', 'Ladegerät'])
    // The positive half of the absence asserted at the end: before any
    // rename, a populated menu without the entry.
    const before = await tripActions(page)
    expect(before.length).toBeGreaterThan(0)
    expect(before.some((l) => MENU_LABEL.test(l))).toBe(false)

    await renameInInventory(page, editors['Kamera']!, 'Kamera (Vollformat)')
    await renameInInventory(page, editors['Ladegerät']!, 'USB-C-Ladegerät')
    await page.goto(trip)

    // Nothing renamed itself: the trip still says what it said.
    await expect(visible(page).getByTestId('m4-row-Kamera')).toBeVisible()
    await expect(visible(page).getByTestId('m4-row-Ladegerät')).toBeVisible()

    await page.getByTestId('header-overflow').click()
    const menu = page.locator('ion-action-sheet')
    await menu.getByText('Names from the inventory (2)', { exact: true }).click()
    await expect(page.locator('ion-action-sheet')).toHaveCount(0)

    const sheet = page.getByTestId('inventory-names-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByTestId('inventory-names-count')).toHaveText('2 of 2 selected')
    // One unticked, and „All" puts it back — the control the owner asked for.
    await sheet.getByTestId('inventory-names-check-USB-C-Ladegerät').click()
    await expect(sheet.getByTestId('inventory-names-count')).toHaveText('1 of 2 selected')
    await sheet.getByTestId('inventory-names-all').click()
    await expect(sheet.getByTestId('inventory-names-apply')).toHaveText('Take all 2 over')
    await sheet.getByTestId('inventory-names-apply').click()

    await expect(page.getByTestId('inventory-names-sheet')).toHaveCount(0)
    await expect(visible(page).getByTestId('m4-row-Kamera (Vollformat)')).toBeVisible()
    await expect(visible(page).getByTestId('m4-row-USB-C-Ladegerät')).toBeVisible()
    await expect(visible(page).getByTestId('m4-row-Kamera')).toHaveCount(0)

    // The snackbar takes it back.
    const toast = page.locator('ion-toast.pack-toast')
    await expect(toast).toContainText('2 names taken over')
    await toast.getByRole('button', { name: /undo/i }).click()
    await expect(visible(page).getByTestId('m4-row-Kamera')).toBeVisible()
    await expect(visible(page).getByTestId('m4-row-Kamera (Vollformat)')).toHaveCount(0)
    await writesLanded(page)

    // Taken over again, and gone from the ⋮ once nothing differs — after a
    // reload, so the names reached IndexedDB rather than only the screen.
    await page.getByTestId('header-overflow').click()
    await page.locator('ion-action-sheet').getByText(MENU_LABEL).click()
    await page.getByTestId('inventory-names-apply').click()
    await expect(visible(page).getByTestId('m4-row-Kamera (Vollformat)')).toBeVisible()
    await writesLanded(page)
    await page.reload()
    await expect(visible(page).getByTestId('m4-row-Kamera (Vollformat)')).toBeVisible()
    await expect(visible(page).getByTestId('m4-row-USB-C-Ladegerät')).toBeVisible()
    const after = await tripActions(page)
    expect(after.length).toBeGreaterThan(0)
    expect(after.some((l) => MENU_LABEL.test(l))).toBe(false)
  })

  test('E2E-M4-104: an archived trip is offered the names too — renaming history is a choice, not a prompt', async ({
    page,
  }) => {
    const { trip, editors } = await tripWithInventoryRows(page, ['Kamera'])
    // Planning → active → archived, the only path the app offers (E2E-M4-43).
    await tripAction(page, 'start')
    await expectTripActionOffered(page, 'archive')
    await tripAction(page, 'archive')
    await page.getByTestId('m4-pass-finish').click()
    await expect(visible(page).getByTestId('m4-template-from-trip')).toBeVisible()
    await writesLanded(page)

    await renameInInventory(page, editors['Kamera']!, 'Kamera (Vollformat)')
    await page.goto(trip)
    await expect(visible(page).getByTestId('m4-template-from-trip')).toBeVisible()

    await page.getByTestId('header-overflow').click()
    await page
      .locator('ion-action-sheet')
      .getByText('Names from the inventory (1)', { exact: true })
      .click()
    await page.getByTestId('inventory-names-apply').click()
    await expect(page.getByTestId('inventory-names-sheet')).toHaveCount(0)
    await writesLanded(page)
    await page.reload()
    await expect(visible(page).getByTestId('m4-template-from-trip')).toBeVisible()
    await expect(visible(page).getByTestId('m4-row-Kamera (Vollformat)')).toBeVisible()
    await expect(visible(page).getByTestId('m4-row-Kamera')).toHaveCount(0)
    const after = await tripActions(page)
    expect(after.length).toBeGreaterThan(0)
    expect(after.some((l) => MENU_LABEL.test(l))).toBe(false)
  })

  test('E2E-M5-30: the item detail offers the inventory’s name for its own row', async ({
    page,
  }) => {
    const { trip, editors } = await tripWithInventoryRows(page, ['Kamera'])
    await page.getByTestId('m4-row-Kamera').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    // Nothing to offer yet: the detail is open and the line is not there.
    await expect(page.getByTestId('m5-name')).toHaveText('Kamera')
    await expect(page.getByTestId('m5-inventory-name')).toHaveCount(0)

    await renameInInventory(page, editors['Kamera']!, 'Kamera (Vollformat)')
    await page.goto(trip)
    await visible(page).getByTestId('m4-row-Kamera').click()
    const line = page.getByTestId('m5-inventory-name')
    await expect(line).toContainText('Kamera (Vollformat)')
    await line.getByTestId('m5-inventory-name-adopt').click()

    await expect(page.getByTestId('m5-name')).toHaveText('Kamera (Vollformat)')
    await expect(page.getByTestId('m5-inventory-name')).toHaveCount(0)
    await expect(page.locator('ion-toast.pack-toast')).toContainText('Name taken over')
  })
})
