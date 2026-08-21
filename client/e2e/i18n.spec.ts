import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * E2E-M17-10 (NFR-4.12): choosing German actually changes the app.
 *
 * The migration this guards found two places where it could not: a nav
 * anchor stored its finished English label and a route stored its finished
 * English title, so the four anchors and the one header bar were English
 * whatever the user had chosen. Both are catalogue keys now — and a unit
 * test cannot see that, because the defect was in the wiring between the
 * route table, the chrome and the catalogue.
 *
 * Everything is asserted on the **visible** page: a language change repaints
 * nothing structurally, so a stale `.ion-page` left in the outlet would
 * otherwise answer for the screen the user is actually looking at.
 */

/**
 * Below G-9's 900 px breakpoint, where the four anchors are the bottom tab
 * bar. Fixed deliberately: above it the rail carries them and the bar is
 * `display: none`, so a default-width run would assert the label of an
 * element nobody can see.
 */
const MOBILE = { width: 390, height: 844 }

function onVisibleScreen(page: Page, testid: string) {
  return page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)').getByTestId(testid)
}

/** Drive M17's language select the way a user does — through its popover. */
async function chooseLanguage(page: Page, label: string) {
  await onVisibleScreen(page, 'settings-language').click()
  const popover = page.locator('ion-popover ion-select-popover')
  await expect(popover).toBeVisible()
  await popover.locator('ion-item', { hasText: label }).click()
  // Dismissal is part of the interaction, not a detail after it: the inner
  // `ion-select-popover` hides a frame before Ionic tears the host and its
  // backdrop down, and until it does the page behind them is not clickable.
  // Waiting on the *host's* absence is the state the app reaches by itself.
  await expect(page.locator('ion-popover')).toHaveCount(0)
}

test.describe('Language choice @local @nfr412', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M17-10: German reaches the chrome and the screens, and survives a reload', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tabs/trips')
    await expect(page.getByTestId('tab-trips')).toBeVisible()

    // The positive English signal first: without it, "the German word is
    // there" would pass on a build that had never rendered either.
    await expect(onVisibleScreen(page, 'trips-filter-planned')).toHaveText('Planned')
    await expect(page.getByTestId('tab-trips')).toHaveText('Trips')

    await page.goto('/tabs/settings')
    await chooseLanguage(page, 'German')

    // The chrome: the anchor label used to be a stored English string, so
    // this is the assertion the old shape could not satisfy.
    await expect(page.getByTestId('tab-trips')).toHaveText('Reisen')
    await expect(page.getByTestId('tab-templates')).toHaveText('Vorlagen')

    // The header bar's route title — the second stored string. M17 declares
    // one, so the bar has something to render.
    await expect(page.getByTestId('header-title')).toHaveText('Einstellungen')

    // And a screen's own words, on the screen the user navigates to next.
    await page.getByTestId('tab-trips').click()
    await expect(onVisibleScreen(page, 'trips-filter-planned')).toHaveText('Geplant')

    // Device-local and persisted (FR-21.3's pattern), so a reload keeps it.
    await page.reload()
    await expect(onVisibleScreen(page, 'trips-filter-planned')).toHaveText('Geplant')
    await expect(page.getByTestId('tab-trips')).toHaveText('Reisen')
  })
})
