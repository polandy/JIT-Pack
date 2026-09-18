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
import { PANEL_HOST_SELECTOR } from '../frameSlots'
import type { Locator, Page } from '@playwright/test'

/**
 * The page that is actually painted. A route change alone proves nothing —
 * a navigation that does not repaint keeps every URL assertion green, and
 * during a transition two `.ion-page` elements exist at once.
 */
/**
 * The one popover that is actually *on screen*.
 *
 * Ionic keeps an `ion-popover` declared with `:is-open` in the DOM while it
 * is shut and marks it `overlay-hidden`, so "no `ion-popover` at all" stopped
 * being the same question as "the options are gone" the moment a screen kept
 * one mounted — M4's amount editor (FR-25.24) is one. Every wait for a select
 * to close asks for *this*, which is also still true mid-dismissal: the inner
 * `ion-select-popover` hides a frame before Ionic tears the host and its
 * backdrop down, and until it does the page behind them is not clickable.
 */
export const PRESENTED_POPOVER = 'ion-popover:not(.overlay-hidden)'

export function visiblePage(page: Page) {
  return page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')
}

/**
 * M5's detail, wherever the width put it.
 *
 * Below the G-9 breakpoint it is a sheet inside the screen; above it, it is
 * the frame's second pane and lives outside `ion-router-outlet` entirely
 * (ADR-064). So `visiblePage(page).getByTestId('m5-…')` is right at phone
 * width and silently matches nothing at desktop width — which is how the
 * `server` project, whose device is Desktop Chrome, went red on cases that
 * had nothing to do with layout.
 *
 * Both halves are named here rather than dropping the scope altogether: an
 * unscoped `getByTestId` would also match a detail belonging to a screen
 * Ionic has merely hidden, which is the defect `visiblePage` exists for.
 */
export function itemDetail(page: Page) {
  return page.locator(`ion-router-outlet > .ion-page:not(.ion-page-hidden), ${PANEL_HOST_SELECTOR}`)
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
 * outranks `local` while a Local Mode save is open), so `local` is the
 * settled signal and a rendered row is the optimistic one. Against a server
 * the write is on the device once it is in the outbox: `synced` after the
 * push, or `offline` with it queued — a device taken offline on purpose
 * (E2E-FLOW-08) is not one that is still writing. The difference is a reload: the orchestrator's own comment says a
 * reload in that window lost the row, and E2E-M18-08 went red on `main`
 * (`b6d2f0d5`, Chromium) on exactly that — a position added, `page.goto`,
 * the position gone. Slowing the persist by 100 ms in the bundle makes it
 * certain: the helpers without this wait lose the position twice out of
 * twice, the helpers with it pass twice out of twice on the same build.
 */
export async function writesLanded(page: Page) {
  // A context that has never loaded the app has made no write. This is the
  // one absence the helper accepts, and it is named rather than probed: the
  // visual spec calls a wizard helper first thing, and `about:blank` has no
  // indicator to ask. An app page without the indicator stays a failure.
  if (page.url() === 'about:blank') return
  await expect(page.getByTestId('sync-indicator')).toHaveAttribute(
    'data-state',
    /^(local|synced|offline)$/,
  )
}

/**
 * Wait until the outlet holds exactly one painted page — the settled state
 * between two Ionic transitions.
 *
 * `visiblePage` answers *which* page is painted; this answers *whether the
 * app has finished moving*. Ionic marks an incoming page `ion-page-invisible`
 * until its transition completes and leaves the outgoing one in the DOM
 * meanwhile, so a locator can be visible, resolve, and then be detached
 * mid-click. That is not a flake to retry: it is a navigation issued into a
 * transition, and the second one lands somewhere neither the URL nor the
 * screen agrees with. Measured on `‹ back` out of M6 — with the URL already
 * at M4, the outlet still had M6 painted and M4 `ion-page-invisible`.
 *
 * The menu the trip switcher replaced had this wait by accident, in
 * `sheet.onDidDismiss()`; a control that navigates directly needs it named.
 */
export async function pageSettled(page: Page) {
  await expect(
    page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden):not(.ion-page-invisible)'),
  ).toHaveCount(1)
}

export function useReducedMotion(test: { use: (options: Record<string, unknown>) => void }): void {
  test.use({ reducedMotion: 'reduce' })
}

/** How far two paired figures' lines may sit apart and still read as one level: sub-pixel rounding. */
const PAIR_TOLERANCE_PX = 1

/**
 * FR-7.4: two `ProgressFigure`s shown as a pair read as one — the same ring,
 * and either side by side (both headlines on one line, both tracks on
 * another, equally long) or, where two columns would not fit, one above the
 * other (rings and tracks on one edge, equally long). Neither sentence is
 * cut short in either arrangement. `pair` holds exactly the two figures
 * (M4's header line, M1's hero).
 */
export async function expectFiguresPaired(pair: Locator): Promise<void> {
  const figures = pair.locator('.figure')
  await expect(figures).toHaveCount(2)
  const box = async (figure: Locator, part: string) => (await figure.locator(part).boundingBox())!
  const near = (x: number, y: number) =>
    expect(Math.abs(x - y)).toBeLessThanOrEqual(PAIR_TOLERANCE_PX)
  const [a, b] = [figures.nth(0), figures.nth(1)]
  const [ringA, ringB] = [await box(a, '.ring'), await box(b, '.ring')]
  const [trackA, trackB] = [await box(a, '.track'), await box(b, '.track')]
  expect(ringA.width).toBe(ringB.width)
  near(trackA.width, trackB.width)
  if (ringB.y >= ringA.y + ringA.height) {
    near(ringA.x, ringB.x)
    near(trackA.x, trackB.x)
  } else {
    near(ringA.y, ringB.y)
    near((await box(a, '.headline')).y, (await box(b, '.headline')).y)
    near(trackA.y, trackB.y)
  }
  // A pair squeezed into too little width ellipsizes its sentences while
  // every line above still agrees.
  for (const figure of [a, b]) {
    const clipped = await figure
      .locator('.headline')
      .evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(clipped).toBe(false)
  }
}
