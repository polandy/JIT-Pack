import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import type { Theme } from '../src/theme/theme'
import { unwrappedNavigation } from './helpers/navigation'
import { visiblePage, writesSettled } from './helpers/page'

/**
 * Shared E2E fixtures for JIT-Pack (dev-docs/ui-test-spec/README.md §2.4).
 *
 * Run modes are selected by seeding the same localStorage keys the app
 * itself writes (see src/config.ts, src/App.vue) *before* the first
 * navigation, via `addInitScript`. Playwright gives each test an
 * isolated browser context, so there is no storage bleed between tests
 * and no manual clearing is needed.
 *
 * What a screen *is* — a trip, a Vorlage, luggage, an inventory row — lives
 * beside this file in `helpers/`, one module per seam. The five re-exported
 * below come from `'./fixtures'` along with `test`; `helpers/m4` and
 * `helpers/m9` are imported by path, because a spec that packs rows or seeds
 * inventory is asking for a screen rather than for the harness. This file
 * owns the seeding and the `test` extension: the two things that are about
 * the run rather than about a screen. Backend-backed driving (jitpackd, the
 * mock IdP, OIDC tokens for the `server` cases) is `serverMode.ts`.
 *
 * The catalogue of every helper, and how to run one case, is `README.md`.
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
   * These are the values `readTheme` actually recognises — anything but
   * `'day'` (or the pre-ADR-048 `'latte'`) resolves to Nacht, so a
   * `'dark' | 'light'` type would let a case seed a light theme, silently get
   * a dark one and go false-green.
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
  /**
   * Keep the start animation (FR-21.29) on for this tab. Every context
   * switches it off by default (`quietStart` below), so only a case about
   * the greeting asks for it. Written once per tab, not per navigation: a
   * case that switches it off in M17 must find it off after the reload.
   */
  splash?: boolean
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
    if (o.splash && !sessionStorage.getItem('jitpack_e2e_splash_seeded')) {
      localStorage.setItem('jitpack_splash', 'on')
      sessionStorage.setItem('jitpack_e2e_splash_seeded', '1')
    }
  }, opts)
}

/**
 * The start animation (FR-21.29) off, unless the device already chose —
 * through M17's own switch, so the suite needs no test-only door into the
 * app. A greeting over every case's first screen would hold each first tap
 * back by its length. Only when absent: `seed`'s `splash` writes `on`, and
 * the order of a context's and a page's init scripts is not defined.
 */
function quietStart(): void {
  try {
    if (localStorage.getItem('jitpack_splash') === null)
      localStorage.setItem('jitpack_splash', 'off')
  } catch {
    // about:blank has no storage, and no app to greet in.
  }
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
   * that goes nowhere — two unhidden M4s, and no way to tell which navigation
   * produced them.
   *
   * Automatic, so a case cannot forget it, and skipped when the test has
   * already failed — a failing case has its own story and this would only
   * bury it.
   */
  oneLivePage: void
}

export const test = base.extend<Fixtures>({
  /**
   * Every context the suite opens starts quiet — the default `context` as
   * well as each `browser.newContext()` a multi-user case opens for its
   * second person.
   */
  browser: [
    async ({ browser }, use) => {
      const newContext = browser.newContext.bind(browser)
      browser.newContext = async (options) => {
        const context = await newContext(options)
        await context.addInitScript(quietStart)
        return context
      }
      await use(browser)
    },
    { scope: 'worker' },
  ],
  context: async ({ context }, use) => {
    await context.addInitScript(quietStart)
    await use(context)
  },
  /**
   * Every navigation waits for the device's writes to land first.
   *
   * The defect this closes is one line long: act, then `page.goto` or
   * `page.reload`. A write is on the device once the outbox has it, and the
   * reload that proves it persisted is racing that persist — green when the
   * machine is idle, red on a loaded CI shard, and red in a way that names the
   * assertion rather than the navigation (a template task lost once in three
   * runs, an inventory item once in 925 cases).
   *
   * `writesLanded` exists for exactly this, but as something a case has to
   * remember. Here it is what a navigation *is*, so remembering is not part of
   * writing a case. A case that means to navigate mid-write calls
   * `navigateWhileWriting`, which says so.
   */
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page)
    const reload = page.reload.bind(page)
    unwrappedNavigation.set(page, { goto, reload })
    page.goto = async (url, options) => {
      await writesSettled(page)
      return goto(url, options)
    }
    page.reload = async (options) => {
      await writesSettled(page)
      return reload(options)
    }
    await use(page)
  },
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
