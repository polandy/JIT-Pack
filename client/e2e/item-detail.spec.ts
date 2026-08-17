import { test, expect, createTripViaWizard, openQuickAdd } from './fixtures'

/**
 * M5 — item detail (UI-Test-Spec §4), rebuilt 2026-08-14 as a sheet over
 * the packing list.
 *
 * The cases are about the shape of the screen rather than its fields: it
 * opens *over* the list, it is driven by the route so a deep link and a
 * reload behave like a tap, and what it is opened for — packing, prep,
 * notes — is on the first level while the rest is folded away.
 */
const TRIP = { name: 'Samedan Sommer', endDate: '2026-12-31' }

test.describe('M5 item detail @local @m5', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M5-09 (UI-Spec M5): the sheet opens over M4 and the list stays.
  test('E2E-M5-09: opening a row shows the detail over the list, not instead of it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 400, height: 880 })
    const path = await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Zelt')
    await page.getByTestId('quick-add-confirm').click()

    await page.getByTestId('m4-row-Zelt').getByRole('heading').click()

    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await expect(page.getByTestId('m5-name')).toHaveText('Zelt')
    // The list is still there behind it — that is the point of a sheet.
    await expect(page.getByTestId('m4-header')).toBeVisible()

    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`${path}$`))
  })

  // E2E-M5-10 (G-4): the route is the state, so a cold boot straight onto
  // an item opens the sheet with the list behind it and no history.
  test('E2E-M5-10: a deep link opens the detail with the list behind it', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 880 })
    const path = await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Zelt')
    await page.getByTestId('quick-add-confirm').click()
    await page.getByTestId('m4-row-Zelt').getByRole('heading').click()
    const itemUrl = page.url()

    await expect(page.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'local')
    await page.goto(itemUrl)

    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await expect(page.getByTestId('m5-name')).toHaveText('Zelt')

    // On a phone the sheet's own ✕ is the way out: its backdrop covers the
    // app bar, so `‹ back` is deliberately unreachable while it is up. The
    // route rule behind back is unit-tested in backTarget.spec.ts, where it
    // governs the desktop panel and the browser's own back button.
    await page.getByTestId('m5-close').click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
  })

  // E2E-M5-11 (UI-Spec M5 rework): first level is packing, preparation and
  // notes; every attribute is folded behind Details.
  test('E2E-M5-11: the first level carries packing, prep and notes — the rest is folded', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 400, height: 880 })
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Zelt')
    await page.getByTestId('quick-add-confirm').click()
    await page.getByTestId('m4-row-Zelt').getByRole('heading').click()

    await expect(page.getByTestId('m5-pack')).toBeVisible()
    await expect(page.getByTestId('m5-todo-input')).toBeVisible()
    await expect(page.getByTestId('m5-note-input')).toBeVisible()
    // FR-25.15: the sheet confirms local capture — settled ✓ once open.
    await expect(page.getByTestId('m5-sheet').getByTestId('save-indicator')).toHaveAttribute(
      'title',
      'Saved',
    )
    // Folded: absent, not merely out of sight.
    await expect(page.getByTestId('m5-mode')).toHaveCount(0)

    await page.getByTestId('m5-details').click()
    await expect(page.getByTestId('m5-mode')).toBeVisible()
    await expect(page.getByTestId('m5-container')).toBeVisible()
  })

  // E2E-M5-12 (G-9): above the breakpoint the same content is a side panel
  // beside the list rather than a sheet over it.
  test('E2E-M5-12: on a desktop width the detail is a side panel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Zelt')
    await page.getByTestId('quick-add-confirm').click()
    await page.getByTestId('m4-row-Zelt').getByRole('heading').click()

    await expect(page.getByTestId('m5-panel')).toBeVisible()
    await expect(page.getByTestId('m5-modal')).toHaveCount(0)
    await expect(page.getByTestId('m4-header')).toBeVisible()
  })

  // E2E-M5-13 (ADR-011 §overlay): the *browser's* back with the sheet open
  // closes the sheet — like the chevron — instead of popping through the
  // replace-based history straight past M4 to the trip list. Found by the
  // owner clicking back on an item detail (2026-08-16).
  test('E2E-M5-13: browser back with the sheet open closes it, not the trip', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 880 })
    const path = await createTripViaWizard(page, TRIP)

    // The owner's history, built in-SPA — a `page.goto` here would start
    // a second document, and back across documents reboots the app
    // instead of reaching the router: list → trip → sheet.
    await page.getByTestId('header-back').click()
    await page.getByTestId('trips-filter-planned').click()
    await page.getByTestId(`trip-row-${TRIP.name}`).click()
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Zelt')
    await page.getByTestId('quick-add-confirm').click()
    await page.getByTestId('m4-row-Zelt').getByRole('heading').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    // Settled, not arrived: back during the sheet's enter animation would
    // race Ionic's transition queue (the M7 lesson, one layer down).
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(1)
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every((a) => a.playState !== 'running' || a.effect?.target?.closest?.('ion-spinner')),
    )

    await page.goBack()

    // The sheet is gone, and the *packing list* is what remains — a bug
    // here lands on /tabs/trips, two screens back.
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
  })
})
