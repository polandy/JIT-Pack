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
