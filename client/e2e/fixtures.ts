import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import type { Theme } from '../src/theme/theme'

/**
 * Shared E2E fixtures for JIT-Pack (dev-docs/UI_Test_Spec_v1.0.md §2.4).
 *
 * Run modes are selected by seeding the same localStorage keys the app
 * itself writes (see src/config.ts, src/App.vue) *before* the first
 * navigation, via `addInitScript`. Playwright gives each test an
 * isolated browser context, so there is no storage bleed between tests
 * and no manual clearing is needed.
 *
 * Backend-backed helpers (starting jitpackd, a mock IdP, seeding
 * OIDC tokens for the `server` multi-client cases) will extend this
 * file in later milestones; the scaffold ships only the backend-free
 * seeding used by the smoke path.
 */

export type Mode = 'local' | 'server'

export interface SeedOptions {
  /** Persisted `jitpack_mode`. Omit to leave first-launch (M19) showing. */
  mode?: Mode
  /** `jitpack_server_url` for Server / Single-User mode. */
  serverUrl?: string
  /**
   * Device-local theme preference (`jitpack_theme`).
   *
   * These are the values `readTheme` actually recognises. It used to read
   * `'dark' | 'light'`, which nothing in the app matches — anything but
   * `'latte'` resolves to Mocha, so seeding a light theme silently gave a
   * dark one and any case built on it would have been false-green.
   */
  theme?: Theme
}

/** Seed the app's localStorage before it boots. Call before `page.goto`. */
export async function seed(page: Page, opts: SeedOptions): Promise<void> {
  await page.addInitScript((o: SeedOptions) => {
    if (o.mode) localStorage.setItem('jitpack_mode', o.mode)
    if (o.serverUrl) localStorage.setItem('jitpack_server_url', o.serverUrl)
    // Literal, not the exported constant: addInitScript serialises this
    // function, so a closure variable would be undefined in the page.
    if (o.theme) localStorage.setItem('jitpack_theme', o.theme)
  }, opts)
}

interface Fixtures {
  /** Seed run-mode localStorage for the current test's page. */
  seedMode: (opts: SeedOptions) => Promise<void>
}

/** Minimum a trip needs to be creatable — the wizard's step-1 gate. */
export interface TripSeed {
  name: string
  /** Optional since FR-2.1b — only the year is required, and it is preselected. */
  endDate?: string
  startDate?: string
  /** Traveler names; each is added as an Adult (FR-2.5). */
  travelers?: string[]
  /**
   * Series name (FR-13.1). First use creates the series via "New
   * series…"; later seeds with the same name pick the existing one.
   */
  series?: string
}

/**
 * Create a trip by driving M3, and return the new trip's path.
 *
 * Spec §2.4 requires preconditions to be built through the app's own
 * mutation paths rather than injected, so every later unit that needs a
 * trip comes through here. Call after `seed`/`seedMode` — it navigates.
 */
export async function createTripViaWizard(page: Page, trip: TripSeed): Promise<string> {
  await page.goto('/trips/new')

  await page.getByTestId('wizard-name').locator('input').fill(trip.name)
  // FR-2.1c: the dates and the series live behind the "More options" row,
  // so a seed that wants them has to open it — one that does not never
  // sees it.
  if (trip.startDate || trip.endDate || trip.series) {
    await page.getByTestId('wizard-more').click()
    if (trip.startDate) {
      await page.getByTestId('wizard-start-date').locator('input').fill(trip.startDate)
    }
    if (trip.endDate) {
      await page.getByTestId('wizard-end-date').locator('input').fill(trip.endDate)
    }
    if (trip.series) {
      await page.getByTestId('wizard-series').click()
      const popover = page.locator('ion-popover ion-select-popover')
      await expect(popover).toBeVisible()
      // Prefer the existing series of that name; fall back to creating it.
      const existing = popover.locator('ion-item', { hasText: trip.series })
      if (await existing.count()) {
        await existing.click()
      } else {
        await popover.locator('ion-item', { hasText: 'New series' }).click()
        await expect(page.locator('ion-popover')).toHaveCount(0)
        await page.getByTestId('wizard-series-name').locator('input').fill(trip.series)
      }
      await expect(page.locator('ion-popover')).toHaveCount(0)
    }
  }
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-2')).toBeVisible()
  for (const name of trip.travelers ?? []) {
    await page.getByTestId('wizard-add-traveler').click()
    await page.getByTestId('wizard-traveler-name').last().locator('input').fill(name)
  }
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-3')).toBeVisible()
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-4')).toBeVisible()
  await page.getByTestId('wizard-create').click()

  // M4 has opened on the new trip; its path is the handle later steps need.
  await expect(page.getByTestId('header-title')).toHaveText(trip.name)
  return new URL(page.url()).pathname
}

export const test = base.extend<Fixtures>({
  seedMode: async ({ page }, use) => {
    await use((opts: SeedOptions) => seed(page, opts))
  },
})

export { expect }
