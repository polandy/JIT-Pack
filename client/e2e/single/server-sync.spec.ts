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

/**
 * Prove this page's **master** partition holds the trip before the network
 * is taken away.
 *
 * A page booted straight at a trip URL loads only the *trip* partition; M2's
 * list comes from the master one, and whether that pull had landed was
 * previously luck. With no reconnect drain (Track C) it may never land after
 * going offline, and `reopenTrip` then searches an empty list and reports the
 * absence as a sync failure — the documented flake that passed only on the
 * retry. Asserting the rendered row makes the precondition a fact, and
 * changes nothing about what the cases themselves prove.
 */
async function warmTripList(page: Page, tripName: string): Promise<void> {
  await page.getByTestId('header-back').click()
  await visiblePage(page).getByTestId('trips-filter-planned').click()
  await expect(visiblePage(page).getByTestId(`trip-row-${tripName}`)).toBeVisible()
  await visiblePage(page).getByTestId(`trip-row-${tripName}`).click()
  await expect(visiblePage(page).getByTestId('m4-fab')).toBeVisible()
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
    await warmTripList(pageB, trip)

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
  /**
   * E2E-G2-05: a mutation the server refuses is *parked*, and G-2 says so.
   *
   * This is the one claim the unit tests could not make. The parked surface
   * has existed since B2, but the client read the rejection under a key no
   * server has ever sent, so it had never once fired against a real
   * `jitpackd` — and both suites stayed green because the client's own fakes
   * answered that same wrong key.
   *
   * The story is ordinary rather than adversarial: Mia leaves the trip while
   * Andy is on a train. Andy's phone still holds her row and queues a pack
   * for it; by the time the queue drains, the row is gone server-side. The
   * push must answer that one mutation as a refusal — the whole batch used
   * to fail with a 500, which the outbox retries forever — and the client
   * must move it out of the queue and say so.
   */
  test('parks a refused mutation and reports it on G-2', async ({ browser }) => {
    const trip = `Refusal ${uniq()}`
    const item = `Regenjacke ${uniq()}`

    const ctxA = await browser.newContext()
    const pageA = await bootPage(ctxA)
    const tripPath = await createTripViaWizard(pageA, {
      name: trip,
      travelers: ['Andy', 'Mia'],
    })
    await quickAddItem(pageA, item)
    await assignTraveler(pageA, item, 'Mia')
    // Packed while online, so both devices agree it is packed. Only a packed
    // row is *deleted* when its traveller leaves — an untouched one is merely
    // detached, which is why this case has to pack first.
    await packItem(pageA, item)

    const ctxB = await browser.newContext()
    const pageB = await bootPage(ctxB, tripPath)
    await visiblePage(pageB).getByTestId('m4-done-bar').click()
    await expect(visiblePage(pageB).getByTestId(`m4-row-${item}`)).toBeVisible()

    // Andy loses the network and unpacks Mia's row — a perfectly ordinary
    // action against the state his device holds.
    await ctxA.setOffline(true)
    await visiblePage(pageA).getByTestId('m4-done-bar').click()
    await visiblePage(pageA).getByTestId(`m4-row-${item}`).getByTestId('row-check').click()
    const indicatorA = pageA.getByTestId('sync-indicator')
    await expect(indicatorA).toHaveAttribute('data-state', 'offline')
    await expect(indicatorA.getByTestId('sync-queue-count')).toHaveText('1')

    // Mia leaves the trip on the other device. Her packed row goes with her.
    await pageB.getByTestId('m4-edit').click()
    await expect(visiblePage(pageB).getByTestId('trip-edit-name')).toBeVisible()
    await visiblePage(pageB)
      .locator('ion-button[data-testid^="traveler-remove-"]')
      .nth(1)
      .click()
    // By role, not by label: the destructive choice is the one that takes
    // her packed rows with her, and the role survives both catalogues.
    await pageB.locator('ion-alert button.alert-button-role-destructive').click()
    await expect(visiblePage(pageB).getByTestId('traveler-row-Mia')).toHaveCount(0)

    // The row really is gone for everyone — proven on the device that
    // deleted it, so the refusal below cannot be blamed on a stale read.
    await pageB.getByTestId('header-back').click()
    await expect(visiblePage(pageB).getByTestId(`m4-row-${item}`)).toHaveCount(0)

    // Andy reconnects; the trip re-open is the app's own action that drains.
    await ctxA.setOffline(false)
    const areq: string[] = []
    pageA.on('request', (r) => {
      if (r.url().includes('/api/v1/sync/')) areq.push(`${r.method()} ${r.url().split('/api/v1')[1]}`)
    })
    await reopenTrip(pageA, trip)

    // The queue is empty because the mutation was answered — not because it
    // is still waiting, and not because it was silently dropped: G-2 names
    // it as refused and kept.
    await expect(indicatorA.getByTestId('sync-queue-count')).toHaveCount(0)
    await indicatorA.click()
    await expect(pageA.getByTestId('sync-detail-sheet')).toBeVisible()
    await expect(pageA.getByTestId('sync-detail-parked')).toContainText('1')
    await expect(pageA.getByTestId('sync-detail-parked-hint')).toBeVisible()

    await ctxA.close()
    await ctxB.close()
  })
  /**
   * E2E-FLOW-10 (NFR-4.1/4.2a, P-1): the pull cursor only ever comes from a
   * pull.
   *
   * The cursor is an exclusive lower bound (Sync-API §4), so whatever a
   * device sets it to, it can never go back for. The push response carries a
   * `pull_hint.next_cursor` naming the seq *that push* just wrote — later
   * than anything written while this device was offline. Adopting it as the
   * cursor steps over the other device's whole session without a symptom: no
   * error, no badge, just rows that are on the server and never on screen.
   *
   * Asserted on the wire rather than on the screen, and deliberately: three
   * drains overlap on a reconnect, and one of them — having read the cursor
   * before the push moved it — pulls from the older value and repairs the
   * skip by accident. The rows therefore arrive anyway most of the time, so
   * a screen assertion here would be green against the defect. The request
   * is the honest witness: every cursor this device sends must be one a pull
   * has handed it, and `5` after a push that only ever received `3` is the
   * whole bug in one line.
   */
  test('never pulls from a cursor the server handed it in a push', async ({ browser }) => {
    const id = uniq()
    const trip = `Flims ${id}`
    const mine = `Stirnlampe-${id}`
    const theirs = `Regenjacke-${id}`

    const ctxA = await browser.newContext()
    const pageA = await bootPage(ctxA)
    // Every cursor A sends must be one a *pull* has handed it; 0 is its own
    // starting point. Observing from the first request on, because a value
    // served before the observer exists would read as invented.
    const served = new Set([0])
    const asked: number[] = []
    // `route.fetch` runs outside the context, so it would sail straight
    // through `setOffline`. The handler has to honour the flag itself.
    let offline = false
    await pageA.route('**/api/v1/sync/**', async (route) => {
      if (offline) {
        await route.abort('internetdisconnected')
        return
      }
      const request = route.request()
      const cursor = new URL(request.url()).searchParams.get('cursor')
      const isPull = request.method() === 'GET' && cursor !== null
      if (isPull) asked.push(Number(cursor))
      const response = await route.fetch()
      if (isPull) {
        const body = await response.json().catch(() => null)
        if (body && typeof body.next_cursor === 'number') served.add(body.next_cursor)
      }
      await route.fulfill({ response })
    })

    const tripPath = await createTripViaWizard(pageA, { name: trip })
    await quickAddItem(pageA, mine)
    const indicatorA = pageA.getByTestId('sync-indicator')
    await expect(indicatorA).toHaveAttribute('data-state', 'synced')
    await warmTripList(pageA, trip)

    // B joins and is caught up before A leaves, so the only thing A can be
    // missing at the end is what B writes during the gap.
    const ctxB = await browser.newContext()
    const pageB = await bootPage(ctxB, tripPath)
    await expect(visiblePage(pageB).getByTestId(`m4-row-${mine}`)).toBeVisible()

    offline = true
    await ctxA.setOffline(true)
    await packItem(pageA, mine)
    await expect(indicatorA).toHaveAttribute('data-state', 'offline')
    await expect(indicatorA.locator('ion-badge')).toHaveText('1')

    // The gap: B writes a row A has never seen and cannot be told about.
    await quickAddItem(pageB, theirs)
    await expect(pageB.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced')

    offline = false
    await ctxA.setOffline(false)
    await reopenTrip(pageA, trip)
    await expect(indicatorA).toHaveAttribute('data-state', 'synced')
    await expect(indicatorA.locator('ion-badge')).toHaveCount(0)

    // A positive signal that the pulls above actually carried the gap, so
    // the cursor assertion is not passing over a silent connection.
    await expect(visiblePage(pageA).getByTestId(`m4-row-${theirs}`)).toBeVisible()
    expect(asked.length).toBeGreaterThan(0)
    expect(asked.filter((c) => !served.has(c))).toEqual([])

    // And A's own offline pack reached the server — the fix must not have
    // traded one direction for the other.
    await expect(visiblePage(pageB).getByTestId(`m4-row-${mine}`)).toBeHidden()

    await ctxA.close()
    await ctxB.close()
  })
})
