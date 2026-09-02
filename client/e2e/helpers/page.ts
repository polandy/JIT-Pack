/**
 * Which page is painted, and how wide the viewport is — the two questions
 * every other helper is built on.
 *
 * `visiblePage` is the suite's answer to the working agreement's "assert what
 * is rendered, never only the URL": a route change that does not repaint
 * keeps every URL assertion green. It had been copied into fifteen specs
 * under three names before it lived here; `scripts/e2e-helpers-gate.mjs`
 * keeps it from happening again.
 */
import type { Page } from '@playwright/test'

/** G-9's breakpoint: the width above which the desktop layout applies. */
export const DESKTOP_BREAKPOINT = 900

/**
 * The page that is actually painted. A route change alone proves nothing —
 * a navigation that does not repaint keeps every URL assertion green, and
 * during a transition two `.ion-page` elements exist at once.
 */
export function visiblePage(page: Page) {
  return page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')
}

/**
 * Runs the file's cases with the OS "reduce motion" preference on, so what a
 * case asserts is the outcome and never the length of a transition.
 *
 * The cast is the whole reason this is a helper. Playwright honours
 * `reducedMotion` in `test.use()` — it is forwarded into the browser context
 * — but its `PlaywrightTestOptions` declares `locale`, `offline` and
 * `timezoneId` and not this one, so every call site is an excess-property
 * error. One documented cast here beats seven undocumented ones, and if the
 * types gain the key this is the single place that drops it.
 */
export function useReducedMotion(test: { use: (options: Record<string, unknown>) => void }): void {
  test.use({ reducedMotion: 'reduce' })
}
