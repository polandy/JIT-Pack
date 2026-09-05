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
import { expect } from '@playwright/test'
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
/**
 * Wait until every write this device has made is *on* the device. The G-2
 * indicator follows the write, not the tap (`useSyncStatus`: `syncing`
 * outranks `local` while a Local Mode save is open), so `local` — or `synced`
 * against a server — is the settled signal; a rendered row is the optimistic
 * one. The difference is a reload: the orchestrator's own comment says a
 * reload in that window lost the row, and E2E-M18-08 went red on `main`
 * (`b6d2f0d5`, Chromium) on exactly that — a position added, `page.goto`,
 * the position gone. Slowing the persist by 100 ms in the bundle makes it
 * certain: the helpers without this wait lose the position twice out of
 * twice, the helpers with it pass twice out of twice on the same build.
 */
export async function writesLanded(page: Page) {
  await expect(page.getByTestId('sync-indicator')).toHaveAttribute('data-state', /^(local|synced)$/)
}

export function useReducedMotion(test: { use: (options: Record<string, unknown>) => void }): void {
  test.use({ reducedMotion: 'reduce' })
}
