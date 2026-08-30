import {
  test,
  expect,
  createTripViaWizard,
  openQuickAdd,
  tripAction,
  expectTripOpen,
  visiblePage as visible,
} from './fixtures'
import type { Page } from '@playwright/test'

/**
 * M1 — Dashboard (UI-Test-Spec §4, unit "M1 dashboard").
 *
 * The **populated** dashboard, which until the 2026-08-30 audit of backlog
 * item 6 no test had ever rendered: three `data-testid`s stood on the
 * screen, all three in its empty state, and the visual baseline is taken on
 * a fresh Local Mode with no trips. Every case here therefore needs an
 * *active* trip — the wizard leaves one in `planning`, which M1 does not
 * show at all, so the trip is started through M4's own menu.
 *
 * Local Mode throughout: what M1 aggregates is read out of the stores, and
 * the two clauses of its spec that need a server (delegation highlighting,
 * live badge counts — E2E-M1-03) describe a surface that is not built.
 */

const TRIP = { name: 'Samedan Sommer', endDate: '2026-12-31', travelers: ['Andy'] }

/** Four rows: the smallest list on which "three and a remainder" is visible. */
const ITEMS = ['Zelt', 'Schlafsack', 'Kocher', 'Stirnlampe']

/** Adds rows through the quick-add, which is the only add path M4 has. */
async function quickAdd(page: Page, names: string[]) {
  await openQuickAdd(page)
  for (const name of names) {
    await page.getByTestId('quick-add-input').locator('input').fill(name)
    await page.getByTestId('quick-add-confirm').click()
    await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
  }
  await page.keyboard.press('Escape')
}

/** An active trip with the given rows on it, left on M4. */
async function activeTripWith(page: Page, items: string[]) {
  await createTripViaWizard(page, TRIP)
  await tripAction(page, 'start')
  await quickAdd(page, items)
}

test.describe('M1 dashboard @local @m1', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M1-01 (FR-6.1), with the built half of E2E-M1-04 (FR-6.3/G-4).
   *
   * The card counts what is open and previews **three** of it, which is the
   * one number on this screen that can be wrong without looking wrong:
   * a preview of everything and a preview of the first three are the same
   * picture on a short list. Four rows is the smallest list that tells them
   * apart, and the "+1 more" line is where the remainder has to show up.
   *
   * The empty state is asserted absent beside it — not for its own sake but
   * because it is the positive signal that the trip is *active*: M1 filters
   * on the status, so a wizard trip nobody started renders exactly the same
   * screen as no trip at all.
   */
  test('E2E-M1-01: an active trip is a card counting what is open and previewing three of it', async ({
    page,
  }) => {
    await activeTripWith(page, ITEMS)
    await page.goto('/tabs/dashboard')

    const card = visible(page).getByTestId(`dashboard-trip-${TRIP.name}`)
    await expect(card).toBeVisible()
    await expect(visible(page).getByTestId('dashboard-empty')).toHaveCount(0)

    const summary = visible(page).getByTestId(`dashboard-summary-${TRIP.name}`)
    await expect(summary).toContainText('0/4 packed')
    await expect(summary).toContainText('4 open')

    // Three of the four, and the fourth counted rather than dropped.
    // *Which* three is deliberately not asserted: the preview is the first
    // three of the store's own array, whose order after a reload is
    // IndexedDB's key order over random ids — so "the next 3" in the spec
    // names an ordering neither this screen nor the store defines (found
    // 2026-08-30; the case flaked on it before it asserted the rule the
    // screen actually keeps).
    await expect(card.locator('[data-testid^="dashboard-preview-"]')).toHaveCount(3)
    const previewed = await card
      .locator('[data-testid^="dashboard-preview-"]')
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute('data-testid')!.replace('dashboard-preview-', '')),
      )
    expect(ITEMS).toEqual(expect.arrayContaining(previewed))
    await expect(card.getByTestId(`dashboard-more-${TRIP.name}`)).toHaveText('+1 more')

    // E2E-M1-04's built half: the card is the way into the trip. (Landing
    // *at the item* is not built — the preview rows are not links.)
    await card.click()
    await expectTripOpen(page, TRIP.name)
  })

  /**
   * E2E-M1-02 (FR-7.3): the prep card, and that ticking a todo on it is a
   * real resolution rather than a row leaving the screen.
   *
   * The card disappearing proves only that this view stopped listing the
   * todo, which is also what a purely local toggle would look like. So the
   * case follows the card into the trip it came from and reads M4's prep
   * badge, which counts *open* preparation off the todos themselves
   * (FR-7.3's "derived, never stored") — the row still on the list is the
   * positive signal beside that absence.
   */
  test('E2E-M1-02: the prep card lists open todos by item, and ticking one resolves it', async ({
    page,
  }) => {
    const TODO = 'Akku laden'
    await activeTripWith(page, ['Kamera'])

    await visible(page).getByTestId('m4-row-Kamera').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId('m5-todo-input').locator('input').fill(TODO)
    await page.getByTestId('m5-todo-add').click()
    await expect(page.getByTestId(`m5-todo-${TODO}`)).toBeVisible()
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    await page.goto('/tabs/dashboard')

    const prep = visible(page).getByTestId('dashboard-prep')
    await expect(prep).toContainText('Prep to do (1)')
    // Grouped by item (the FR's own word), not a flat list of task bodies.
    await expect(prep.getByTestId('dashboard-prep-item-Kamera')).toBeVisible()
    await expect(prep.getByTestId(`dashboard-todo-${TODO}`)).toBeVisible()

    await prep.getByTestId(`dashboard-todo-${TODO}`).locator('ion-checkbox').click()

    // The trip's only open todo is resolved, so the card has nothing left.
    await expect(visible(page).getByTestId('dashboard-prep')).toHaveCount(0)

    // And it resolved it *on the trip*: M4's badge counts open preparation.
    await visible(page).getByTestId(`dashboard-trip-${TRIP.name}`).click()
    await expectTripOpen(page, TRIP.name)
    await expect(visible(page).getByTestId('m4-row-Kamera')).toBeVisible()
    await expect(visible(page).getByTestId('m4-prep-badge-Kamera')).toHaveCount(0)
  })
})
