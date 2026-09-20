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
/**
 * The same wait, made safe to run before **every** navigation (the `page`
 * fixture does exactly that).
 *
 * Two differences from {@link writesLanded}, both about what an *unconditional*
 * check may assume. It tolerates a page with no indicator at all — a login
 * screen, a context that has not booted the app — because a surface that shows
 * no outbox has no write of this device's to lose; `writesLanded`, called
 * deliberately by a case that has just written something, keeps treating that
 * absence as the failure it is there. And it is bounded: a navigation must not
 * inherit the full assertion timeout on a device that is genuinely stuck, or a
 * hung outbox would be reported as a timeout inside whatever came next.
 */
export async function writesSettled(page: Page) {
  if (page.url() === 'about:blank') return
  const indicator = page.getByTestId('sync-indicator')
  if ((await indicator.count()) === 0) return
  await expect(indicator).toHaveAttribute('data-state', /^(local|synced|offline)$/, {
    timeout: SETTLE_BEFORE_NAVIGATION_MS,
  })
}

/**
 * How long a navigation waits for the outbox. Generous next to a write that
 * lands in milliseconds, short next to the 60 s a case has: the number is a
 * ceiling on a pathology, not a budget for the normal path.
 */
const SETTLE_BEFORE_NAVIGATION_MS = 15_000

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

/** One figure's geometry, all of it read in the same layout pass. */
type FigureGeometry = {
  ring: { x: number; y: number; height: number; width: number }
  track: { x: number; y: number; width: number }
  headline: { y: number; clipped: boolean }
}

/**
 * FR-7.4: two `ProgressFigure`s shown as a pair read as one — the same ring,
 * and either side by side (both headlines on one line, both tracks on
 * another, equally long) or, where two columns would not fit, one above the
 * other (rings and tracks on one edge, equally long). Neither sentence is
 * cut short in either arrangement. `pair` holds exactly the two figures
 * (M4's header line, M1's hero).
 *
 * Every rectangle comes from **one** `evaluate`, because the question is
 * where the two figures sit relative to each other. Reading them one call
 * at a time compares positions from different moments, and the header line
 * is still settling while the first ones are taken: measured that way the
 * rings sat 1.7 px apart on one machine and agreed in CI, which is a
 * property of the two hosts rather than of the layout.
 */
export async function expectFiguresPaired(pair: Locator): Promise<void> {
  const figures = pair.locator('.figure')
  await expect(figures).toHaveCount(2)
  const { a, b } = await pair.evaluate((root): { a: FigureGeometry; b: FigureGeometry } => {
    const read = (figure: Element): FigureGeometry => {
      // Picked apart by hand: a DOMRect keeps its numbers on the prototype
      // and would cross the evaluate boundary as an empty object.
      const rect = (selector: string) => {
        const { x, y, width, height } = figure.querySelector(selector)!.getBoundingClientRect()
        return { x, y, width, height }
      }
      const headline = figure.querySelector('.headline')!
      return {
        ring: rect('.ring'),
        track: rect('.track'),
        headline: {
          y: rect('.headline').y,
          clipped: headline.scrollWidth > headline.clientWidth,
        },
      }
    }
    const figures = [...root.querySelectorAll('.figure')]
    return { a: read(figures[0]!), b: read(figures[1]!) }
  })
  const near = (x: number, y: number) =>
    expect(Math.abs(x - y)).toBeLessThanOrEqual(PAIR_TOLERANCE_PX)
  expect(a.ring.width).toBe(b.ring.width)
  near(a.track.width, b.track.width)
  if (b.ring.y >= a.ring.y + a.ring.height) {
    near(a.ring.x, b.ring.x)
    near(a.track.x, b.track.x)
  } else {
    near(a.ring.y, b.ring.y)
    near(a.headline.y, b.headline.y)
    near(a.track.y, b.track.y)
  }
  // A pair squeezed into too little width ellipsizes its sentences while
  // every line above still agrees.
  for (const figure of [a, b]) expect(figure.headline.clipped).toBe(false)
}
