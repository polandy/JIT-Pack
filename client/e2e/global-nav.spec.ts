import { test, expect, createTripViaWizard, openQuickAdd } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * Global navigation and the app bar (UI-Test-Spec §3: G-1, G-9, G-12).
 *
 * These exist because every one of them broke in a way the per-screen
 * suites could not see: the URL changed while the previous screen stayed
 * on the display, `‹ back` left the packing list showing, and one
 * screen's search icon went on filtering that screen after the user had
 * left it. A green M3 and M4 unit said nothing about any of it.
 *
 * The shape of every assertion is therefore the same and is the point:
 * **assert what is rendered, never only the URL.** A route change that
 * does not repaint is precisely the class of defect being guarded.
 */

const TRIP = { name: 'Samedan Sommer', endDate: '2026-12-31' }

const DESKTOP = { width: 1280, height: 900 }
const MOBILE = { width: 400, height: 860 }

/**
 * An element, but only where it sits on a screen the user can see.
 *
 * A locator rather than a read, deliberately: `expect` retries this while
 * Ionic finishes its transition, where a one-shot read would assert
 * against whichever frame it happened to catch — the timing dependency
 * the project forbids anywhere in its suites.
 */
function onVisibleScreen(page: Page, testid: string) {
  return page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)').getByTestId(testid)
}

test.describe('Global navigation @local @g9 @g1 @g12', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-G9-09 (G-9): the desktop rail. The regression it guards left the
  // outgoing screen painted while the URL had already moved on.
  test('E2E-G9-09: the desktop rail navigates, and the target screen is the one rendered', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/tabs/dashboard')
    await expect(page.getByTestId('rail-trips')).toBeVisible()

    await page.getByTestId('rail-trips').click()

    await expect(page).toHaveURL(/\/tabs\/trips$/)
    await expect(onVisibleScreen(page, 'trips-new')).toBeVisible()
  })

  // E2E-G1-01 (G-1): below the breakpoint the same four anchors are the
  // bottom bar. Mobile had no way between them at all.
  test('E2E-G1-01: the mobile tab bar carries the four anchors and navigates', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tabs/dashboard')

    await expect(page.getByTestId('rail-trips')).toBeHidden()
    for (const anchor of ['dashboard', 'trips', 'templates', 'items']) {
      await expect(page.getByTestId(`tab-${anchor}`)).toBeVisible()
    }

    await page.getByTestId('tab-items').click()
    await expect(page).toHaveURL(/\/tabs\/items$/)
    await expect(page.getByTestId('tab-items')).toBeVisible()
  })

  // E2E-G1-02 (§3.25): M4 is full-screen to win list height — and is the
  // only screen that hides the bar, because `‹ back` is what leads out.
  test('E2E-G1-02: the tab bar hides on the packing list and nowhere else', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await createTripViaWizard(page, TRIP)

    await expect(page.getByTestId('m4-header')).toBeVisible()
    await expect(page.getByTestId('tab-trips')).toBeHidden()

    await page.getByTestId('header-back').click()
    await expect(page.getByTestId('tab-trips')).toBeVisible()
  })

  // E2E-G1-03 (G-1, ADR-012): "nowhere else" above is the whole rule, and
  // the rule was over-applied — `/trips/new` matched the same shape as
  // `/trips/:id`, so the wizard silently lost its anchors too. Its own
  // screen, because M3 is where a first-time user starts.
  test('E2E-G1-03: the trip wizard keeps the tab bar — only the packing list drops it', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tabs/trips')

    await page.getByTestId('trips-new').click()

    await expect(onVisibleScreen(page, 'wizard-step-1')).toBeVisible()
    await expect(page.getByTestId('tab-trips')).toBeVisible()
  })

  // E2E-G9-10 (ADR-011): back is the way out of a drill-down, so it has
  // to *land*. It moved the URL and left the packing list on screen.
  test('E2E-G9-10: back from the packing list renders the trip list', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await createTripViaWizard(page, TRIP)

    await page.getByTestId('header-back').click()

    await expect(page).toHaveURL(/\/tabs\/trips$/)
    await expect(onVisibleScreen(page, 'trips-new')).toBeVisible()
    // Nothing of the screen just left may still be on the bar (G-12).
    await expect(page.getByTestId('m4-search')).toHaveCount(0)
    await expect(page.getByTestId('m4-filter')).toHaveCount(0)
  })

  // E2E-G9-11 (G-12, ADR-011): M11 is reached from the packing list's
  // app-bar cluster and left by back. The M11 unit exercises the screen;
  // this owns getting *to* and *from* it — the class of defect the working
  // agreement added this file for, after four navigation bugs that both
  // green screen suites had missed.
  test('E2E-G9-11: the luggage button reaches the containers and back returns', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await createTripViaWizard(page, TRIP)

    await onVisibleScreen(page, 'm4-nav-luggage').click()
    await expect(onVisibleScreen(page, 'm11-fab')).toBeVisible()
    // The bar belongs to the screen now shown, not the one that left (G-12).
    await expect(page.getByTestId('m4-search')).toHaveCount(0)
    await expect(page.getByTestId('m4-filter')).toHaveCount(0)

    await page.getByTestId('header-back').click()
    await expect(onVisibleScreen(page, 'm4-fab')).toBeVisible()
    // …and coming back restores it, rather than leaving a bar with nothing
    // behind it.
    await expect(page.getByTestId('m4-nav-luggage')).toBeVisible()
    await expect(page.getByTestId('m11-fab')).toHaveCount(0)
  })

  // E2E-G12-01 (G-12, FR-25.11k): the magnifier searches the screen the
  // user is on. It used to keep filtering the one they had left.
  test('E2E-G12-01: the magnifier searches the current screen', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await createTripViaWizard(page, TRIP)
    await page.getByTestId('header-back').click()
    await expect(onVisibleScreen(page, 'trips-new')).toBeVisible()

    // The wizard leaves a *planning* trip, and the list opens on Active.
    await page.getByTestId('trips-filter-planned').click()
    await expect(page.getByTestId('trip-row-Samedan Sommer')).toBeVisible()

    await page.getByTestId('search').click()
    const field = onVisibleScreen(page, 'trips-search-input')
    await expect(field).toBeVisible()

    await field.fill('Samedan')
    await expect(page.getByTestId('trip-row-Samedan Sommer')).toBeVisible()

    await field.fill('Kajakwoche')
    await expect(page.getByTestId('trip-row-Samedan Sommer')).toHaveCount(0)
  })

  // E2E-G12-02: the same mechanism on a second screen, so "current
  // context" is a property of the pattern rather than of one page.
  test('E2E-G12-02: the magnifier travels to the item inventory and searches it there', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/tabs/items')

    await page.getByTestId('search').click()
    await expect(onVisibleScreen(page, 'items-search-input')).toBeVisible()
    // The trip list's field belongs to the trip list, not to this screen.
    await expect(page.getByTestId('trips-search-input')).toHaveCount(0)
  })

  // E2E-M4-32: a cold boot straight into M4. The teleported app-bar
  // actions crashed the render mid-patch, and an empty list read as lost
  // data — the rows were in IndexedDB the whole time.
  test('E2E-M4-32: a reload straight into the packing list still shows its rows', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    const path = await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Zelt')
    await page.getByTestId('quick-add-confirm').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    // Wait for the *state*, never for a duration: the indicator returns
    // to "on this device" when the IndexedDB write has actually landed
    // (FR-19.2), which is the thing a reload depends on.
    await expect(page.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'local')
    await page.goto(path)

    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(page.getByTestId('m4-progress')).toContainText('0/1')
  })

  // E2E-M3-15 (FR-2.1b): a trip needs only its year. The wizard's step 1
  // must let you through with a name alone — the year is preselected —
  // and the trip then reads by its year where a date would have stood.
  test('E2E-M3-15: a trip can be created with no dates at all', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/trips/new')

    await page.getByTestId('wizard-name').locator('input').fill('Samedan irgendwann')
    // No date touched anywhere: straight through the wizard.
    await expect(page.getByTestId('wizard-next')).toBeEnabled()
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-2')).toBeVisible()
    await page.getByTestId('wizard-next').click()
    await page.getByTestId('wizard-next').click()
    await page.getByTestId('wizard-create').click()

    await expect(page.getByTestId('m4-header')).toBeVisible()

    // In the list it is named by its year, since nothing finer is known.
    await page.getByTestId('header-back').click()
    await page.getByTestId('trips-filter-planned').click()
    const row = page.getByTestId('trip-row-Samedan irgendwann')
    await expect(row).toBeVisible()
    await expect(row.getByTestId('trip-when')).toHaveText(String(new Date().getFullYear()))
  })

  // E2E-M3-16 (FR-2.1c): step 1 shows what it requires and folds the rest
  // away, but never hides *state*: a set value appears on the folded row.
  test('E2E-M3-16: the optional trip fields are folded, and say so when set', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/trips/new')

    // Folded: the optional inputs are absent, not merely invisible.
    await expect(page.getByTestId('wizard-start-date')).toHaveCount(0)
    await expect(page.getByTestId('wizard-more-summary')).toBeVisible()

    await page.getByTestId('wizard-more').click()
    await page.getByTestId('wizard-end-date').locator('input').fill('2026-09-20')
    await page.getByTestId('wizard-more').click()

    // Folded again — with what was set now stated on the row itself.
    await expect(page.getByTestId('wizard-end-date')).toHaveCount(0)
    await expect(page.getByTestId('wizard-more-summary')).toContainText('2026-09-20')
  })

  // E2E-G8-02: the dev sample-trip seed is a development affordance, not
  // Demo Mode returning. This suite runs the production build, where it
  // must not exist at all.
  test('E2E-G8-02: no dev seeding affordance exists in a production build', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/tabs/trips')

    await expect(page.getByTestId('trips-new')).toBeVisible()
    await expect(page.getByTestId('dev-sample-trip')).toHaveCount(0)
  })
})
