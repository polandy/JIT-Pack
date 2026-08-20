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

  // E2E-M5-14 (G-14/FR-21.8): the header's two round controls are a pair,
  // so they share a diameter and a centre line. Owner-flagged on a rendered
  // phone (2026-08-16): the ✓ was 26 px against the ✕'s 34 px and both were
  // hung from the same top edge, which put their centres 4 px apart and made
  // the header read as crooked. Geometry rather than a stylesheet claim,
  // because only the rendered box shows the offset (invariant 9b's point).
  test('E2E-M5-14: the save indicator and the ✕ share a size and a centre line', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Wanderstöcke')
    await page.getByTestId('quick-add-confirm').click()
    await page.getByTestId('m4-row-Wanderstöcke').getByRole('heading').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    // Present before they are measured, so a missing control fails as a
    // missing control rather than as a null dereference inside the page.
    await expect(page.getByTestId('m5-sheet').getByTestId('save-indicator')).toBeVisible()
    await expect(page.getByTestId('m5-close')).toBeVisible()

    // Both boxes are read in *one* frame, inside the page. Two separate
    // `boundingBox()` calls land in different frames of the sheet's enter
    // animation and report a 5 px offset on an aligned header — a false red
    // this case produced before it was written this way. Under one shared
    // transform the difference between the two is exact whenever it is read.
    const [save, close] = await page.getByTestId('m5-sheet').evaluate((sheet) => {
      const box = (sel: string) => {
        const r = sheet.querySelector(sel)!.getBoundingClientRect()
        return { width: r.width, height: r.height, centerY: r.y + r.height / 2 }
      }
      return [box('[data-testid="save-indicator"]'), box('[data-testid="m5-close"]')]
    })

    expect(save.height).toBeCloseTo(close.height, 1)
    expect(save.width).toBeCloseTo(close.width, 1)
    expect(save.centerY).toBeCloseTo(close.centerY, 1)
  })
  // E2E-M5-17 (FR-9.1): the two trip-feedback flags are controls behind
  // *Details ▾*, and only while the trip runs. Until 2026-08-20 the sheet
  // printed them as a note, which left *unused* — the flag M14's assistant
  // is mostly about — unwritable anywhere in the app.
  test('E2E-M5-17: an item can be marked unused, but only once the trip runs', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Regenhose')
    await page.getByTestId('quick-add-confirm').click()
    await page.keyboard.press('Escape')
    await page.getByTestId('m4-row-Regenhose').getByRole('heading').click()
    await page.getByTestId('m5-details').click()

    // A judgement about a trip that has not happened yet means nothing.
    await expect(page.getByTestId('m5-flag-unused')).toHaveCount(0)

    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
    await page.getByTestId('m4-start').click()
    // The archive action appearing is the settled signal for the status write.
    await expect(page.getByTestId('m4-archive')).toBeVisible()

    await page.getByTestId('m4-row-Regenhose').getByRole('heading').click()
    await page.getByTestId('m5-details').click()
    await page.getByTestId('m5-flag-unused').click()

    // The glance chip renders off the stored row, so it is the flag itself
    // being read back and not the toggle's own state.
    await expect(page.getByTestId('m5-glance')).toContainText('Unused')
  })
})
