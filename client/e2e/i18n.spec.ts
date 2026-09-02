import { test, expect, visiblePage } from './fixtures'
import type { Page } from '@playwright/test'
import { PATH } from './routes'

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

/** Above the breakpoint, where the rail is the anchors' other presentation. */
const DESKTOP = { width: 1280, height: 900 }

function onVisibleScreen(page: Page, testid: string) {
  return visiblePage(page).getByTestId(testid)
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
    await page.goto(PATH.trips)
    await expect(page.getByTestId('tab-trips')).toBeVisible()

    // The positive English signal first: without it, "the German word is
    // there" would pass on a build that had never rendered either.
    await expect(
      onVisibleScreen(page, 'trips-filter-planned').locator('.segment-label'),
    ).toHaveText('Planned')
    await expect(page.getByTestId('tab-trips')).toHaveText('Trips')

    await page.goto(PATH.settings)
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
    await expect(
      onVisibleScreen(page, 'trips-filter-planned').locator('.segment-label'),
    ).toHaveText('Geplant')

    // The desktop half of the same anchor: the rail and the bar read one list,
    // so the key has to reach both — and only one of them exists at a time.
    await page.setViewportSize(DESKTOP)
    await expect(page.getByTestId('rail-trips')).toBeVisible()
    await expect(page.getByTestId('rail-trips')).toHaveText('Reisen')
    await page.setViewportSize(MOBILE)

    // Device-local and persisted (FR-21.3's pattern), so a reload keeps it.
    await page.reload()
    await expect(
      onVisibleScreen(page, 'trips-filter-planned').locator('.segment-label'),
    ).toHaveText('Geplant')
    await expect(page.getByTestId('tab-trips')).toHaveText('Reisen')
  })

  /*
   * E2E-M17-11 (NFR-4.12): M17 itself. It was the last half-translated screen
   * — ten t() calls beside about fifteen literals — and the screen the
   * language switch *lives on* is the one place where an untranslated section
   * is most visible: the user changes the setting and half the page ignores
   * them. Asserted per section rather than on one word, because a section is
   * the unit of this migration.
   */
  test('E2E-M17-11: the settings screen follows its own language switch', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto(PATH.settings)

    // English first, so the German assertions below cannot pass vacuously.
    await expect(onVisibleScreen(page, 'settings-section-profile')).toHaveText('Profile')
    await expect(onVisibleScreen(page, 'settings-section-data')).toHaveText('Data')
    await expect(onVisibleScreen(page, 'settings-section-about')).toHaveText('About')

    await chooseLanguage(page, 'German')

    await expect(onVisibleScreen(page, 'settings-section-profile')).toHaveText('Profil')
    await expect(onVisibleScreen(page, 'settings-section-appearance')).toHaveText('Darstellung')
    await expect(onVisibleScreen(page, 'settings-section-data')).toHaveText('Daten')
    await expect(onVisibleScreen(page, 'settings-section-conflicts')).toHaveText(
      'Konfliktprotokoll',
    )
    await expect(onVisibleScreen(page, 'settings-section-about')).toHaveText('Über')

    // Not only the headings: the Local Mode note under Data is a sentence the
    // screen renders inline, which is where the literals actually were.
    await expect(onVisibleScreen(page, 'settings-storage-details')).toHaveText('Speicherdetails')
  })
})
