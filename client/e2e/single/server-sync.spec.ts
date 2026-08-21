import type { BrowserContext, Page } from '@playwright/test'

import { test, expect, seed, createTripViaWizard, visiblePage } from '../fixtures'

/**
 * Backend-backed sync (UI-Test-Spec §2.2, mode `single`) — the first unit
 * that runs against a real `jitpackd`.
 *
 * Harness (reused by later backend-backed units, Track C included): the
 * `single` Playwright project boots one Single-User jitpackd per run on a
 * fresh temp-file database (playwright.config.ts), and `vite preview`
 * proxies /api, /ws and /health to it (vite.config.ts) because the API is
 * same-origin-only. The client is seeded into its `server` mode with no
 * server URL, so it talks to the preview origin exactly the way a real
 * deployment talks to nginx. Single-User discovery is the app's own:
 * `/api/v1/auth/config` answers 501, so no login is offered and the app
 * lands on M1 (invariant 5).
 *
 * Isolation: the database lives for the whole run, so every test builds its
 * world under names unique to that test — the master partition (items,
 * trips) is shared state here, unlike in the `local` units.
 *
 * Honesty notes (also in dev-docs/e2e-tests.md):
 *  - Both browser contexts are the same Single-User identity. The
 *    multi-context cases prove real-time convergence over the wire, not
 *    multi-identity semantics (locks, attribution) — those stay with the
 *    future mock-IdP `server` project.
 *  - There is still no reconnect drain: the queue moves on the app's next
 *    own action (a mutation, a trip open, a WS ping) — or on the next app
 *    start, which the durable outbox added (B2). Track C stopped there
 *    deliberately; an `online`-event drain is not built.
 */

/** Suffix that keeps one test's master data out of another's. */
function uniq(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/** A page in server mode. The context owns the network (setOffline). */
async function bootPage(context: BrowserContext, path = '/'): Promise<Page> {
  const page = await context.newPage()
  await seed(page, { mode: 'server' })
  await page.goto(path)
  return page
}

/** FR-25.13 quick-add on M4, committed via the ＋ confirm. */
async function quickAddItem(page: Page, name: string) {
  const input = visiblePage(page).getByTestId('quick-add-input')
  if (!(await input.isVisible().catch(() => false))) {
    await visiblePage(page).getByTestId('m4-fab').click()
    await expect(input).toBeVisible()
  }
  await input.locator('input').fill(name)
  await page.getByTestId('quick-add-confirm').click()
  await expect(visiblePage(page).getByTestId(`m4-row-${name}`)).toBeVisible()
}

/** Pack a row via its checkbox (G-6: the control acts, it never navigates). */
async function packItem(page: Page, name: string) {
  await visiblePage(page)
    .getByTestId(`m4-row-${name}`)
    .getByTestId('row-check')
    .locator('ion-checkbox')
    .click()
}

/**
 * Assign the item to a traveler through M5's popover select — the app's one
 * way of making a row somebody's (FR-25.1). Same driving as the M12 unit.
 */
async function assignTraveler(page: Page, itemName: string, travelerName: string) {
  await visiblePage(page).getByTestId(`m4-row-${itemName}`).click()
  await expect(page.getByTestId('m5-sheet')).toBeVisible()
  await page.getByTestId('m5-details').click()
  await page.getByTestId('m5-traveler').click()
  const popover = page.locator('ion-popover ion-select-popover')
  await popover.locator('ion-item', { hasText: travelerName }).click()
  await expect(page.locator('ion-popover')).toHaveCount(0)
  await page.getByTestId('m5-close').click()
  await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
}

/** Leave M4 for the trip list and re-open the trip — M4's mount drains. */
async function reopenTrip(page: Page, tripName: string) {
  await page.getByTestId('header-back').click()
  // The wizard creates *planning* trips and M2 opens on Active — the row
  // lives behind the Planned segment (same lesson as the M18 unit).
  await visiblePage(page).getByTestId('trips-filter-planned').click()
  await expect(visiblePage(page).getByTestId(`trip-row-${tripName}`)).toBeVisible()
  await visiblePage(page).getByTestId(`trip-row-${tripName}`).click()
  await expect(visiblePage(page).getByTestId('m4-fab')).toBeVisible()
}

/**
 * Wait until this page's WebSocket subscription for the trip is registered
 * server-side. Deterministic, not hopeful: the hub answers a subscribe with
 * a `presence` broadcast to the trip's subscribers — the subscriber
 * included — so receiving that frame proves the hub has the connection in
 * the trip's set, and every later `trip.changed` must reach it.
 */
async function wsSubscribed(page: Page, wsPromise: Promise<import('@playwright/test').WebSocket>) {
  const ws = await wsPromise
  await ws.waitForEvent('framereceived', {
    predicate: (frame) => String(frame.payload).includes('"presence"'),
  })
}

/**
 * Settled means: the registration is active *and* this page is controlled —
 * both real lifecycle signals, never a wait. Same shape as the E2E-PWA unit;
 * it is repeated rather than shared because the two files have no common
 * helper module and one import across projects would couple them.
 */
async function serviceWorkerControlsPage(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (navigator.serviceWorker.controller) return
    await new Promise<void>((resolve) =>
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }),
    )
  })
}

test.describe('Single-User backend sync @single', () => {
  // Every case boots at least two documents and builds its world through
  // the UI over a real network stack — the §2.4 cost, paid knowingly.
  test.slow()

  /**
   * E2E-FLOW-01 (partial: convergence half; no locks/attribution — same
   * Single-User identity in both contexts). Context A packs; context B's
   * open packing list reflects it without a reload, via the WS ping.
   */
  test('a pack on one device arrives on another without reload', async ({ browser }) => {
    const id = uniq()
    const trip = `Elba ${id}`
    const item = `Zelt-${id}`

    const ctxA = await browser.newContext()
    const pageA = await bootPage(ctxA)
    const tripPath = await createTripViaWizard(pageA, { name: trip })
    await quickAddItem(pageA, item)

    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    await seed(pageB, { mode: 'server' })
    const wsB = pageB.waitForEvent('websocket')
    await pageB.goto(tripPath)
    // The row arriving proves the pull; the presence frame proves the
    // subscription — the pull alone would leave the WS half unproven.
    await expect(visiblePage(pageB).getByTestId(`m4-row-${item}`)).toBeVisible()
    await wsSubscribed(pageB, wsB)

    await packItem(pageA, item)

    // FR-25.2: on B the packed row leaves the open list and the reveal bar
    // appears — the positive signal that the state *arrived*, not merely
    // that something vanished.
    await expect(visiblePage(pageB).getByTestId('m4-done-bar')).toBeVisible()
    await expect(visiblePage(pageB).getByTestId(`m4-row-${item}`)).toBeHidden()

    await ctxA.close()
    await ctxB.close()
  })

  /**
   * E2E-G2-01 (queue half) + E2E-FLOW-06 (NFR-4.1, G-2, G-5): offline edits
   * queue and are announced; the queue drains on the app's next own action
   * once the network is back; the server converges.
   */
  test('offline edits queue, announce themselves, and drain on reconnect', async ({ browser }) => {
    const id = uniq()
    const trip = `Arosa ${id}`
    const item = `Lampe-${id}`

    const ctx = await browser.newContext()
    const page = await bootPage(ctx)
    const tripPath = await createTripViaWizard(page, { name: trip })
    await quickAddItem(page, item)
    const indicator = page.getByTestId('sync-indicator')
    await expect(indicator).toHaveAttribute('data-state', 'synced')

    await ctx.setOffline(true)
    await packItem(page, item)

    // G-5: the pack rendered optimistically (the reveal bar is up) while
    // the glyph — not a blocking dialog — reports offline with the count.
    await expect(visiblePage(page).getByTestId('m4-done-bar')).toBeVisible()
    await expect(indicator).toHaveAttribute('data-state', 'offline')
    await expect(indicator.locator('ion-badge')).toHaveText('1')

    // The G-2 detail states the queue (server half of the sheet).
    await indicator.click()
    const sheet = page.getByTestId('sync-detail-sheet')
    await expect(sheet).toBeVisible()
    await expect(page.getByTestId('sync-detail-pending')).toContainText('1')
    await page.getByTestId('sync-detail-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    // Back online. Nothing drains by itself (no reconnect loop — Track C);
    // re-opening the trip is the user action that does, via M4's mount.
    await ctx.setOffline(false)
    await reopenTrip(page, trip)
    await expect(indicator).toHaveAttribute('data-state', 'synced')
    await expect(indicator.locator('ion-badge')).toHaveCount(0)

    // Convergence, as a positive signal on a device that never saw the
    // offline edit: a fresh context reads the packed state off the server.
    const ctxFresh = await browser.newContext()
    const pageFresh = await bootPage(ctxFresh, tripPath)
    await expect(visiblePage(pageFresh).getByTestId('m4-done-bar')).toBeVisible()
    await expect(visiblePage(pageFresh).getByTestId(`m4-row-${item}`)).toBeHidden()

    await ctx.close()
    await ctxFresh.close()
  })

  /**
   * E2E-G2-01 (conflict half) + E2E-FLOW-08/E2E-NFR-04 (partial: one side
   * offline rather than both; same identity): two devices set the same
   * field, the older write loses field-level (NFR-4.2a), both converge, and
   * the loss is a readable line in the trip's conflict log.
   */
  test('a losing offline edit converges and lands in the conflict log', async ({ browser }) => {
    const id = uniq()
    const trip = `Tessin ${id}`
    const item = `Seil-${id}`

    const ctxA = await browser.newContext()
    const pageA = await bootPage(ctxA)
    const tripPath = await createTripViaWizard(pageA, {
      name: trip,
      travelers: ['Andy', 'Mia'],
    })
    await quickAddItem(pageA, item)

    const ctxB = await browser.newContext()
    const pageB = await bootPage(ctxB, tripPath)
    await expect(visiblePage(pageB).getByTestId(`m4-row-${item}`)).toBeVisible()

    // B edits first, offline — the strictly older HLC, so B is the side
    // that must lose. A's same-field edit happens visibly later.
    await ctxB.setOffline(true)
    await assignTraveler(pageB, item, 'Mia')
    await expect(pageB.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'offline')

    await assignTraveler(pageA, item, 'Andy')
    // The server having A's value is a precondition of B's push losing, so
    // it is proven, not assumed: a fresh context reads it back.
    const ctxCheck = await browser.newContext()
    const pageCheck = await bootPage(ctxCheck, tripPath)
    await visiblePage(pageCheck).getByTestId(`m4-row-${item}`).click()
    await expect(pageCheck.getByTestId('m5-sheet')).toBeVisible()
    await pageCheck.getByTestId('m5-details').click()
    await expect(pageCheck.getByTestId('m5-traveler')).toContainText('Andy')
    await ctxCheck.close()

    // B reconnects and drains through the trip re-open; its rendered state
    // converges to the winning value.
    await ctxB.setOffline(false)
    await reopenTrip(pageB, trip)
    await expect(pageB.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced')
    await visiblePage(pageB).getByTestId(`m4-row-${item}`).click()
    await expect(pageB.getByTestId('m5-sheet')).toBeVisible()
    await pageB.getByTestId('m5-details').click()
    await expect(pageB.getByTestId('m5-traveler')).toContainText('Andy')
    await pageB.getByTestId('m5-close').click()
    await expect(pageB.getByTestId('m5-sheet')).toHaveCount(0)

    // Inside a trip the G-2 detail leads to the conflict log (E2E-G2-01),
    // and the log names exactly the one field that lost.
    await pageB.getByTestId('sync-indicator').click()
    await expect(pageB.getByTestId('sync-detail-sheet')).toBeVisible()
    await pageB.getByTestId('sync-detail-conflicts').click()
    await expect(visiblePage(pageB).getByTestId('conflict-row')).toHaveCount(1)
    await expect(visiblePage(pageB).getByTestId('conflict-field')).toHaveText(
      'trip_items · assigned_traveler_id',
    )
    // The page's whole promise is "what lost, what won" — both values must
    // render as something, not as blanks (the raw values are traveler ids,
    // so *which* string is not this case's business).
    await expect(visiblePage(pageB).getByTestId('conflict-losing')).not.toBeEmpty()
    await expect(visiblePage(pageB).getByTestId('conflict-winning')).not.toBeEmpty()

    await ctxA.close()
    await ctxB.close()
  })

  /**
   * E2E-G2-01 (outside-a-trip clause): with no trip open the sheet says
   * where the conflict log lives instead of offering a dead button — and it
   * is the *server* half of the sheet, not Local Mode's storage story.
   */
  test('the G-2 detail outside a trip points at the log instead of a dead button', async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    const page = await bootPage(ctx)

    const indicator = page.getByTestId('sync-indicator')
    await expect(indicator).toHaveAttribute('data-state', 'synced')
    await indicator.click()

    await expect(page.getByTestId('sync-detail-sheet')).toBeVisible()
    await expect(page.getByTestId('sync-detail-conflicts-hint')).toBeVisible()
    await expect(page.getByTestId('sync-detail-conflicts')).toHaveCount(0)
    // The positive companion: this is the server half — Local Mode's
    // storage block, the other half's anchor, is absent.
    await expect(page.getByTestId('sync-detail-storage')).toHaveCount(0)

    await ctx.close()
  })
  /**
   * E2E-G2-04 (B2, NFR-4.1): the queue is on the device, not in the tab.
   *
   * The scenario the MVP plan calls B2: a phone in a hotel with no wifi,
   * packing, and the browser drops the tab. Before the durable outbox the
   * reload lost every unsent mutation *silently* — the glyph came back
   * clean. Here the reload happens while still offline (the app shell is
   * the PWA's, E2E-PWA-01), the count survives it, and the change reaches
   * the server once the app does something with a network again.
   */
  test('an offline change survives a reload and still reaches the server', async ({ browser }) => {
    const id = uniq()
    const trip = `Davos ${id}`
    const item = `Ski-${id}`

    const ctx = await browser.newContext()
    const page = await bootPage(ctx)
    const tripPath = await createTripViaWizard(page, { name: trip })
    await quickAddItem(page, item)
    // The reload below happens offline, so the shell has to come from the
    // service worker — this is the point at which it provably can.
    await serviceWorkerControlsPage(page)

    const indicator = page.getByTestId('sync-indicator')
    await ctx.setOffline(true)
    await packItem(page, item)
    await expect(indicator).toHaveAttribute('data-state', 'offline')
    await expect(indicator.getByTestId('sync-queue-count')).toHaveText('1')

    // The kill. Everything the old outbox held lived in this document.
    await page.reload()

    // The app painted from the shell cache — asserted on what is rendered,
    // and inside a trip the app bar carries the back button rather than the
    // logo (the logo assertion the E2E-PWA unit uses would be looking for a
    // control this screen does not have).
    await expect(visiblePage(page)).toBeVisible()
    await expect(page.getByTestId('header-back')).toBeVisible()
    await expect(indicator).toHaveAttribute('data-state', 'offline')
    await expect(indicator.getByTestId('sync-queue-count')).toHaveText('1')

    // G-2 says it in words too, and says where it is kept — the promise
    // the durable outbox is allowed to make.
    await indicator.click()
    await expect(page.getByTestId('sync-detail-sheet')).toBeVisible()
    await expect(page.getByTestId('sync-detail-pending')).toContainText('1')
    await expect(page.getByTestId('sync-detail-pending-durable')).toBeVisible()
    await page.getByTestId('sync-detail-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    // Network back; the trip open is the app's own action that drains.
    await ctx.setOffline(false)
    await page.goto(tripPath)
    await expect(visiblePage(page).getByTestId('m4-fab')).toBeVisible()
    await expect(indicator).toHaveAttribute('data-state', 'synced')
    await expect(indicator.getByTestId('sync-queue-count')).toHaveCount(0)

    // The positive signal that it was the *change* that survived and not
    // merely a counter: a device that never saw the pack reads it back.
    const ctxFresh = await browser.newContext()
    const pageFresh = await bootPage(ctxFresh, tripPath)
    await expect(visiblePage(pageFresh).getByTestId('m4-done-bar')).toBeVisible()
    await expect(visiblePage(pageFresh).getByTestId(`m4-row-${item}`)).toBeHidden()

    await ctx.close()
    await ctxFresh.close()
  })
})
