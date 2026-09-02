import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import type { Theme } from '../src/theme/theme'
import { visiblePage } from './helpers/page'

/**
 * Shared E2E fixtures for JIT-Pack (dev-docs/UI_Test_Spec_v1.0.md §2.4).
 *
 * Run modes are selected by seeding the same localStorage keys the app
 * itself writes (see src/config.ts, src/App.vue) *before* the first
 * navigation, via `addInitScript`. Playwright gives each test an
 * isolated browser context, so there is no storage bleed between tests
 * and no manual clearing is needed.
 *
 * What a screen *is* — a trip, a Vorlage, luggage, an inventory row — lives
 * beside this file in `helpers/`, one module per seam, and is re-exported
 * here so a spec keeps one import. This file owns the seeding and the `test`
 * extension: the two things that are about the run rather than about a
 * screen. Backend-backed driving (jitpackd, the mock IdP, OIDC tokens for
 * the `server` cases) is `serverMode.ts`.
 */

export * from './helpers/page'
export * from './helpers/ionic'
export * from './helpers/templates'
export * from './helpers/trips'
export * from './helpers/containers'

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
  /**
   * App language (`jitpack_locale`). Defaults to English, and that default is
   * load-bearing rather than incidental: the browser locale is `de-CH` so the
   * suite runs on the device the family holds, and without this the app would
   * follow `navigator.languages` into German and every English assertion in
   * the suite would fail. A case that wants the German UI asks for it.
   */
  locale?: 'en' | 'de'
}

/** Seed the app's localStorage before it boots. Call before `page.goto`. */
export async function seed(page: Page, opts: SeedOptions): Promise<void> {
  await page.addInitScript((o: SeedOptions) => {
    if (o.mode) localStorage.setItem('jitpack_mode', o.mode)
    if (o.serverUrl) localStorage.setItem('jitpack_server_url', o.serverUrl)
    // Literal, not the exported constant: addInitScript serialises this
    // function, so a closure variable would be undefined in the page.
    if (o.theme) localStorage.setItem('jitpack_theme', o.theme)
    // Only when absent. addInitScript runs before *every* navigation, so an
    // unconditional write would re-seed after a reload and overwrite a choice
    // the user made in the app — which is what E2E-M17-10 asserts survives.
    // This is the device's default language, not an override of the app's.
    if (!localStorage.getItem('jitpack_locale')) {
      localStorage.setItem('jitpack_locale', o.locale ?? 'en')
    }
  }, opts)
}

interface Fixtures {
  /** Seed run-mode localStorage for the current test's page. */
  seedMode: (opts: SeedOptions) => Promise<void>
  /**
   * ADR-012's invariant, checked after every case: the one router outlet
   * shows exactly one page.
   *
   * A leaked page is invisible from inside the case that leaks it — the URL
   * is right, the screen looks right, and the stale page underneath only
   * surfaces later, as somebody else's strict-mode violation or as a tap
   * that goes nowhere. It has happened twice: the four navigation anchors
   * (2026-08-31, ADR-012 amendment 3) and E2E-M5-12 on `main` at 4dab0d46,
   * which failed with two unhidden M4s and no way to tell which navigation
   * had produced them.
   *
   * Automatic, so a case cannot forget it, and skipped when the test has
   * already failed — a failing case has its own story and this would only
   * bury it.
   */
  oneLivePage: void
}

// --- M11 containers, shared by the M11 and M12 units ------------------------

export const test = base.extend<Fixtures>({
  seedMode: async ({ page }, use) => {
    await use((opts: SeedOptions) => seed(page, opts))
  },
  oneLivePage: [
    async ({ page }, use, testInfo) => {
      await use()
      if (testInfo.status !== testInfo.expectedStatus) return
      // A case may end its own page on purpose — E2E-PWA-04 closes it to make
      // the browser drop the last client of the old service worker, which is
      // what „takes over on the next launch" means. There is no outlet left to
      // read, and nothing to leak.
      if (page.isClosed()) return
      const live = visiblePage(page)
      // Polled, and that is what separates a leak from a transition: a page
      // on its way out is unhidden for as long as the animation lasts, so a
      // one-shot read at the end of a case that navigated last would report
      // every push as a defect. A *leaked* page stays for good.
      // Zero is fine — a login screen has no outlet.
      let count = 0
      try {
        await expect
          .poll(async () => (count = await live.count()), { timeout: 4000 })
          .toBeLessThan(2)
      } catch {
        const named = await live.evaluateAll((nodes) =>
          nodes.map((n) => n.querySelector('[data-testid]')?.getAttribute('data-testid') ?? '?'),
        )
        throw new Error(
          `ADR-012: the outlet is still showing ${count} pages after this case, ` +
            `led by [${named.join(', ')}]. A leaked page eats taps meant for the ` +
            `one on screen, and the case that leaked it is this one.`,
        )
      }
    },
    { auto: true },
  ],
})

export { expect }
