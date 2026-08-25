import type { Page } from '@playwright/test'

import { test, expect, seed, createTripViaWizard, visiblePage } from '../fixtures'
import { bootPage, packItem, quickAddItem, uniq, wsSubscribed } from '../serverMode'

// Both sync endpoints, whichever partition: the path leads with its scope
// (NFR-4.14, ADR-027), so no single prefix covers them any more.
const SYNC_PATH = /\/api\/v1\/(?:trips\/[^/]+|master)\/sync/

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
 *    multi-identity semantics (locks, attribution) — those live in the
 *    `server` project (e2e/server/, ADR-029).
 *  - There is still no reconnect drain: the queue moves on the app's next
 *    own action (a mutation, a trip open, a WS ping) — or on the next app
 *    start, which the durable outbox added (B2). Track C stopped there
 *    deliberately; an `online`-event drain is not built.
 */

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

/** Rename the trip through M22's editor (FR-2.7); commits on blur. */
async function renameTrip(page: Page, name: string) {
  await page.getByTestId('m4-edit').click()
  const field = visiblePage(page).getByTestId('trip-edit-name').locator('input')
  await expect(field).toBeVisible()
  await field.fill(name)
  await field.blur()
  await page.getByTestId('header-back').click()
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
   * E2E-G3-01 (partial) + E2E-G3-03 (G-3): a row somebody else is packing
   * names its holder, and is read-only one tap deeper.
   *
   * Both contexts are the same Single-User identity, so this does not
   * prove *whose* name is rendered — it proves the mechanism: B never
   * claimed the row, so B's client treats the claim as foreign, exactly
   * as it would a second account's. What is asserted is the pair that was
   * missing, the padlock's name and the sheet's refusal, not the identity
   * semantics the `server` project owns.
   */
  test('a row another device is packing names its holder and refuses edits', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Sils ${id}`
    const item = `Stirnlampe-${id}`

    const ctxA = await browser.newContext()
    const pageA = await bootPage(ctxA)
    const tripPath = await createTripViaWizard(pageA, { name: trip })
    await quickAddItem(pageA, item)

    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    await seed(pageB, { mode: 'server' })
    const wsB = pageB.waitForEvent('websocket')
    await pageB.goto(tripPath)
    await expect(visiblePage(pageB).getByTestId(`m4-row-${item}`)).toBeVisible()
    await wsSubscribed(pageB, wsB)

    // A claims the row (FR-5.2), through the row menu M4 offers.
    await visiblePage(pageA).getByTestId(`m4-row-${item}`).dispatchEvent('contextmenu')
    await expect(pageA.locator('ion-action-sheet')).toBeVisible()
    await pageA
      .locator('ion-action-sheet')
      .getByRole('button', { name: /^pack$/i })
      .click()
    await expect(pageA.locator('ion-action-sheet')).toHaveCount(0)

    // G-3 on B: the row says who has it, not merely that it is unavailable.
    const rowB = visiblePage(pageB).getByTestId(`m4-row-${item}`)
    await expect(rowB.getByTestId('m4-lock-note')).toBeVisible()
    await expect(rowB.getByTestId('m4-lock-note')).toContainText(/packing this right now/i)

    // One tap deeper the sheet used to hand the row over in full.
    await rowB.click()
    await expect(pageB.getByTestId('m5-sheet')).toBeVisible()
    await expect(pageB.getByTestId('m5-lock')).toContainText(/packing this right now/i)
    await expect(pageB.getByTestId('m5-name')).toHaveText(item)
    // The controls are gone rather than dimmed — nothing to tap and lose.
    await expect(pageB.getByTestId('m5-skip')).toHaveCount(0)
    await expect(pageB.getByTestId('m5-note-add')).toHaveCount(0)
    // The stepper is the exception, and deliberately so: it is where the
    // count is read, so it stays on screen and stops writing instead.
    await expect(
      pageB.getByTestId('m5-sheet').getByTestId('row-check').locator('ion-checkbox'),
    ).toBeDisabled()
    await pageB.getByTestId('m5-details').click()
    await expect(pageB.getByTestId('m5-late')).toBeDisabled()

    // A, who holds it, keeps every control: the lock is for the others.
    await visiblePage(pageA).getByTestId(`m4-row-${item}`).click()
    await expect(pageA.getByTestId('m5-sheet')).toBeVisible()
    await expect(pageA.getByTestId('m5-lock')).toHaveCount(0)
    await expect(pageA.getByTestId('m5-skip')).toBeVisible()

    await ctxA.close()
    await ctxB.close()
  })

  /**
   * E2E-G3-02 (G-3, FR-5.7): where there is no second account, a claimed
   * row offers no way past the claim.
   *
   * This is the half of FR-5.7 that *can* run here, and the reason the
   * other half cannot is worth stating: both contexts are the same
   * Single-User identity, so a takeover would be a takeover of one's own
   * claim, which the server refuses by design. The taking-over path lives
   * in the `server` project, exactly as E2E-G3-01's identity half does.
   * What is asserted here is the G-8 promise — the surface is *absent*,
   * not shown and then refused.
   */
  test('a claimed row offers no takeover where there is no second account', async ({ browser }) => {
    const id = uniq()
    const trip = `Maloja ${id}`
    const item = `Pickel-${id}`

    const ctxA = await browser.newContext()
    const pageA = await bootPage(ctxA)
    const tripPath = await createTripViaWizard(pageA, { name: trip })
    await quickAddItem(pageA, item)

    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    await seed(pageB, { mode: 'server' })
    const wsB = pageB.waitForEvent('websocket')
    await pageB.goto(tripPath)
    await expect(visiblePage(pageB).getByTestId(`m4-row-${item}`)).toBeVisible()
    await wsSubscribed(pageB, wsB)

    await visiblePage(pageA).getByTestId(`m4-row-${item}`).dispatchEvent('contextmenu')
    await expect(pageA.locator('ion-action-sheet')).toBeVisible()
    await pageA
      .locator('ion-action-sheet')
      .getByRole('button', { name: /^pack$/i })
      .click()
    await expect(pageA.locator('ion-action-sheet')).toHaveCount(0)

    // The positive signal the absence below needs: the row really is
    // claimed on B, so "no menu" is the mode gate rather than an unread
    // row or a row that never arrived.
    const rowB = visiblePage(pageB).getByTestId(`m4-row-${item}`)
    await expect(rowB.getByTestId('m4-lock-note')).toBeVisible()

    await rowB.dispatchEvent('contextmenu')
    await expect(pageB.locator('ion-action-sheet')).toHaveCount(0)

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

    /*
     * E2E-G2-07 (NFR-4.2a): the loss is *announced*, not only recorded. A
     * `merged` push used to be indistinguishable from an applied one, so
     * the only way to learn an edit had been overwritten was to go looking
     * for a log nothing gave you a reason to suspect. It lives inside this
     * case rather than in its own because this is the one place in the
     * suite where a real server merges a real edit away.
     *
     * Asserted **immediately** after the drain and then dismissed by hand:
     * a toast auto-dismisses on a timer, so every later step would be
     * racing it. Nothing below this point depends on it existing.
     */
    const toast = pageB.locator('ion-toast')
    await expect(toast).toContainText('1')
    await toast.evaluate((el: HTMLIonToastElement) => el.dismiss())
    await expect(toast).toHaveCount(0)

    await visiblePage(pageB).getByTestId(`m4-row-${item}`).click()
    await expect(pageB.getByTestId('m5-sheet')).toBeVisible()
    await pageB.getByTestId('m5-details').click()
    await expect(pageB.getByTestId('m5-traveler')).toContainText('Andy')
    await pageB.getByTestId('m5-close').click()
    await expect(pageB.getByTestId('m5-sheet')).toHaveCount(0)

    // Inside a trip the G-2 detail leads to the conflict log (E2E-G2-01),
    // and the log names exactly the one field that lost.
    await pageB.getByTestId('sync-indicator').click()
    await expect(pageB.getByTestId('sync-detail-conflicted')).toContainText('1')
    await expect(pageB.getByTestId('sync-detail-sheet')).toBeVisible()
    await pageB.getByTestId('sync-detail-conflicts').click()
    await expect(visiblePage(pageB).getByTestId('conflict-row')).toHaveCount(1)
    // The row names the *thing*, not the table it lives in: `trip_items` is
    // a schema fact and the reader has never seen it.
    await expect(visiblePage(pageB).getByTestId('conflict-field')).toHaveText(
      `${item} · Assigned to`,
    )
    // And the values are the two travelers, not the two uuids the column
    // stores. This is the assertion the case could not make before: it read
    // "both render as something", which a pair of raw ids satisfies.
    await expect(visiblePage(pageB).getByTestId('conflict-losing')).toHaveText('Mia')
    await expect(visiblePage(pageB).getByTestId('conflict-winning')).toHaveText('Andy')

    await ctxA.close()
    await ctxB.close()
  })

  /**
   * E2E-G2-01 (outside-a-trip clause): with no trip open the trip-scoped
   * log has no subject, so it is not offered — but the master partition's
   * is, because it belongs to no trip. And it is the *server* half of the
   * sheet, not Local Mode's storage story.
   */
  test('the G-2 detail outside a trip offers the log that belongs to no trip', async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    const page = await bootPage(ctx)

    const indicator = page.getByTestId('sync-indicator')
    await expect(indicator).toHaveAttribute('data-state', 'synced')
    await indicator.click()

    await expect(page.getByTestId('sync-detail-sheet')).toBeVisible()
    await expect(page.getByTestId('sync-detail-conflicts')).toHaveCount(0)
    await expect(page.getByTestId('sync-detail-master-conflicts')).toBeVisible()
    // The positive companion: this is the server half — Local Mode's
    // storage block, the other half's anchor, is absent.
    await expect(page.getByTestId('sync-detail-storage')).toHaveCount(0)

    await ctx.close()
  })

  /**
   * E2E-G2-06 (NFR-4.2a): a conflict on a **trip's own field** is a master
   * partition conflict — `trips` is merged there, not in the trip's own
   * partition — and it has to be readable.
   *
   * Every ingredient of the trip-scoped case is unchanged; only the field
   * moves. That is the point: the same loss, one partition over, used to be
   * written to a log that was filtered by `trip_id` and so returned nothing
   * for the rows that have none.
   */
  test('a conflict on the trip itself lands in the master log, which is reachable', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Wallis ${id}`

    const ctxA = await browser.newContext()
    const pageA = await bootPage(ctxA)
    const tripPath = await createTripViaWizard(pageA, { name: trip, travelers: ['Andy'] })

    const ctxB = await browser.newContext()
    const pageB = await bootPage(ctxB, tripPath)
    await expect(visiblePage(pageB).getByTestId('m4-fab')).toBeVisible()
    await warmTripList(pageB, trip)

    // B renames offline — the strictly older HLC, so B is the side that
    // must lose. A's rename of the same field happens visibly later.
    await ctxB.setOffline(true)
    await renameTrip(pageB, `${trip} B`)
    await expect(pageB.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'offline')

    await renameTrip(pageA, `${trip} A`)

    // A reload rather than a trip re-open: the queue moves on the app's next
    // own action, and the trip partition's actions are not the master
    // partition's — the rename is queued there. App start drains it (B2).
    await ctxB.setOffline(false)
    await pageB.reload()
    await expect(pageB.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced')
    // Convergence first, so a failure below is about the log rather than
    // about the merge: B's own screen now carries A's name.
    await expect(pageB.getByTestId('header-title')).toContainText(`${trip} A`)

    // Read the log from the trip list rather than from inside the trip:
    // the master log must not need one open, which is the whole gap.
    await pageB.getByTestId('header-back').click()
    await pageB.getByTestId('sync-indicator').click()
    await expect(pageB.getByTestId('sync-detail-sheet')).toBeVisible()
    await pageB.getByTestId('sync-detail-master-conflicts').click()

    // Filtered by this test's own losing value, not by `trips · name`: the
    // master partition is shared for the whole run (one database), so
    // every case that loses a rename adds another row that would match.
    // E2E-G2-10 is one, and it only passed here by running second.
    const row = visiblePage(pageB)
      .getByTestId('conflict-row')
      .filter({ hasText: `${trip} B` })
    await expect(row).toHaveCount(1)
    // What lost and what won, both rendered — the page's whole promise.
    // `toHaveText`, not `toContainText`: the column stores the JSON of the
    // mutation field, so the unfixed page rendered `"Engadin 7 B"` quotes
    // and all, and a containment assertion is green either way.
    await expect(row.getByTestId('conflict-losing')).toHaveText(`${trip} B`)
    await expect(row.getByTestId('conflict-winning')).toHaveText(`${trip} A`)
    // The timestamp follows the app's language, not the device's. The suite
    // runs on a de-CH device with the app pinned to English (see the config):
    // `toLocaleString()` took the device and rendered `22.08.2026`.
    await expect(row.getByTestId('conflict-time')).toContainText(/[A-Z][a-z]{2} \d{1,2}, \d{4}/)

    await ctxA.close()
    await ctxB.close()
  })

  /**
   * E2E-G2-10 (NFR-4.2a, ADR-023): the log's second promise — the loser
   * can be put back. The audit half shipped without it, so the page named
   * a value it could do nothing about.
   *
   * The same scenario as E2E-G2-06, carried one step further: B loses the
   * rename, reads the loss from the master log, reverts it, and the name
   * B wanted is what the trip is called again — on B's own screen, which
   * only got it by pulling the revert the server wrote. Nothing here waits
   * on a timer: the revert drains the master partition before it resolves,
   * and the assertion is on the repainted header.
   */
  test('a loss recorded in the master log can be taken back', async ({ browser }) => {
    const id = uniq()
    const trip = `Engadin ${id}`

    const ctxA = await browser.newContext()
    const pageA = await bootPage(ctxA)
    const tripPath = await createTripViaWizard(pageA, { name: trip, travelers: ['Andy'] })

    const ctxB = await browser.newContext()
    const pageB = await bootPage(ctxB, tripPath)
    await expect(visiblePage(pageB).getByTestId('m4-fab')).toBeVisible()
    await warmTripList(pageB, trip)

    await ctxB.setOffline(true)
    await renameTrip(pageB, `${trip} B`)
    await expect(pageB.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'offline')

    await renameTrip(pageA, `${trip} A`)

    await ctxB.setOffline(false)
    await pageB.reload()
    await expect(pageB.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced')
    await expect(pageB.getByTestId('header-title')).toContainText(`${trip} A`)

    await pageB.getByTestId('header-back').click()
    await pageB.getByTestId('sync-indicator').click()
    await expect(pageB.getByTestId('sync-detail-sheet')).toBeVisible()
    await pageB.getByTestId('sync-detail-master-conflicts').click()

    // This trip's own row, named by the value it lost — `trips · name`
    // matches every other rename case in the shared master log.
    const row = visiblePage(pageB)
      .getByTestId('conflict-row')
      .filter({ hasText: `${trip} B` })
    await expect(row).toHaveCount(1)
    await row.getByTestId('conflict-revert').click()

    // The entry is spent, and the page says so where the button was — a
    // revert is a fact about the entry, not a repeatable command.
    await expect(row.getByTestId('conflict-reverted')).toBeVisible()
    await expect(row.getByTestId('conflict-revert')).toHaveCount(0)
    // And the value is back where the user can see it. This is the half
    // that proves the revert travelled: B's own copy of the trip was
    // holding A's name a moment ago and only the pull changed it.
    // The header bar is the app's single one and lives *outside* the
    // router outlet (ADR-011), so it is the one control here that must not
    // be scoped to the visible page.
    await pageB.getByTestId('header-back').click()
    await visiblePage(pageB).getByTestId('trips-filter-planned').click()
    await expect(visiblePage(pageB).getByTestId(`trip-row-${trip} B`)).toBeVisible()

    await ctxA.close()
    await ctxB.close()
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
    // Wait for the setup writes to drain before going offline: without it the
    // queue holds whatever quickAddItem left plus the pack, and "1" below is
    // a race the test wins most of the time — the pattern every other offline
    // case here already follows.
    await expect(indicator).toHaveAttribute('data-state', 'synced')
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
    await visiblePage(pageB).locator('ion-button[data-testid^="traveler-remove-"]').nth(1).click()
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
    await pageA.route(SYNC_PATH, async (route) => {
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
  /**
   * E2E-M15-05 (FR-16.1/16.2, FR-2.1b): the legacy spreadsheet import
   * reaches the server, not only the screen that started it.
   *
   * It is a backend case on purpose. `createImportedTrip` omitted `year`,
   * which `trips` declares NOT NULL, so every imported trip was refused —
   * and nothing on the importing device could tell: the optimistic row was
   * already in its own store, so M2 showed the migration that had not
   * happened. Only a device that never saw the optimistic write can say
   * whether the wire carried it, which is what context B is here.
   *
   * The CSV is the layout the wizard was taught to read: the year above the
   * trip's name (two header rows) and the category in its own column.
   */
  test('a spreadsheet import lands on the server, not only on the device', async ({ browser }) => {
    const id = uniq()
    const trip = `Laos ${id}`
    const net = `Moskitonetz-${id}`
    const boots = `Wanderschuhe-${id}`
    const csv = [`,,2016`, `,,${trip}`, `Reise,${net},2`, `,${boots},1`].join('\n')

    const ctxA = await browser.newContext()
    const pageA = await bootPage(ctxA, '/import')

    await visiblePage(pageA).getByTestId('import-paste').locator('textarea').fill(csv)
    await visiblePage(pageA).getByTestId('import-analyze').click()

    // The header block gave the column both halves of its identity: the
    // name from the row that names it, the date from the row above.
    const row = visiblePage(pageA).getByTestId('import-trip-2')
    await expect(row.locator('ion-input').first().locator('input')).toHaveValue(trip)
    await expect(row.locator('ion-input').nth(1).locator('input')).toHaveValue('2016')

    // Both column pickers offer *candidates*, not every column: a column that
    // holds quantities can be neither of the two they choose. With one trip
    // column in this sheet, the category picker is "none" plus two — it listed
    // all three before, and on a thirty-column sheet that is the whole defect.
    const columnPicker = visiblePage(pageA).getByTestId('category-column')
    await expect(columnPicker.locator('ion-segment-button')).toHaveCount(3)
    await expect(
      visiblePage(pageA).getByTestId('item-column').locator('ion-segment-button'),
    ).toHaveCount(2)
    await expect(columnPicker.locator('ion-segment-button.segment-button-checked')).toHaveText(
      'Col 1',
    )

    await visiblePage(pageA).getByTestId('import-next').click()
    await expect(visiblePage(pageA).getByTestId(`import-summary-${trip}`)).toBeVisible()
    await visiblePage(pageA).getByTestId('import-commit').click()

    // FR-16.2 imports history, so the wizard names the segment it lands on.
    await expect(visiblePage(pageA).getByTestId(`trip-row-${trip}`)).toBeVisible()
    await expect(pageA.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced')

    const ctxB = await browser.newContext()
    const pageB = await bootPage(ctxB, '/tabs/trips')
    await visiblePage(pageB).getByTestId('trips-filter-archived').click()
    await expect(visiblePage(pageB).getByTestId(`trip-row-${trip}`)).toBeVisible()

    // And the rows travelled with it — behind M4's done bar, because
    // FR-16.2 imports them already packed.
    await visiblePage(pageB).getByTestId(`trip-row-${trip}`).click()
    await visiblePage(pageB).getByTestId('m4-done-bar').click()
    await expect(visiblePage(pageB).getByTestId(`m4-row-${net}`)).toBeVisible()
    await expect(visiblePage(pageB).getByTestId(`m4-row-${boots}`)).toBeVisible()

    await ctxA.close()
    await ctxB.close()
  })
  /**
   * E2E-M15-09 (FR-24.2/16.3): the imported category reaches the server as a
   * tag *on the item*, and a repeated name arrives once.
   *
   * Both halves were refused at the wire and neither was visible on the
   * importing device. The tag assignment names its item by foreign key and was
   * enqueued before the item's own insert, so a whole inventory arrived with
   * every tag created and nothing filed under one; and `items` is UNIQUE
   * (name), so the sheet's second "Regenhosen" was dropped with its amounts.
   * Context B is the only place either shows.
   */
  test('an imported item reaches the server filed under its category', async ({ browser }) => {
    const id = uniq()
    const tag = `Velo-${id}`
    const item = `Regenhose-${id}`
    const other = `Pumpe-${id}`
    const csv = [
      `,,2019`,
      `,,Ausfahrt ${id}`,
      `${tag},${item},1`,
      `Werkzeug-${id},${other},1`,
      // The same thing again, under the other category — one item, not two,
      // and it keeps the category of its first appearance.
      `,${item},2`,
    ].join('\n')

    const ctxA = await browser.newContext()
    const pageA = await bootPage(ctxA, '/import')
    await visiblePage(pageA).getByTestId('import-paste').locator('textarea').fill(csv)
    await visiblePage(pageA).getByTestId('import-analyze').click()
    await visiblePage(pageA).getByTestId('import-next').click()
    // Two items out of three rows — the repeat folded before anything was sent.
    await expect(visiblePage(pageA).getByTestId('import-summary-line')).toContainText('2 new items')
    await visiblePage(pageA).getByTestId('import-commit').click()
    await expect(pageA.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced')

    const ctxB = await browser.newContext()
    const pageB = await bootPage(ctxB, '/tabs/items')
    // The tag axis carries the imported category, and filtering to it leaves
    // the item standing — which is the link, not merely the tag's existence.
    await visiblePage(pageB).getByTestId(`m9-tag-chip-${tag}`).click()
    await expect(visiblePage(pageB).getByText(item)).toBeVisible()
    await expect(visiblePage(pageB).getByText(other)).toHaveCount(0)

    await ctxA.close()
    await ctxB.close()
  })

  /*
   * E2E-SYNC-01 (Sync-API §4): a partition bigger than one page arrives whole.
   *
   * The pull asked once and ignored `has_more`, so a device only ever saw the
   * first page of the feed while the G-2 glyph read *synced*. Found on the
   * family instance 2026-08-25: 717 master rows, the trips sitting behind the
   * first 500 in `change_log`, and M2 saying "no archived trips".
   *
   * The rows are pushed straight at the API rather than built through the UI:
   * this case is about the size of a partition, and five hundred trips of
   * clicking would be a different test. What it then asserts is the *app* —
   * the last item of the feed rendered on a device that booted after them.
   */
  test('E2E-SYNC-01: a master partition larger than one page arrives whole', async ({
    browser,
    baseURL,
  }) => {
    test.slow()
    const tag = uniq()
    // Comfortably more than PULL_PAGE_SIZE (500, useSyncOutbox.ts). The
    // request-count assertion below is what keeps this honest if that number
    // ever changes: one page would mean one request, and the case fails.
    const ROWS = 520
    const PUSH_BATCH = 200 // MAX_PUSH_BATCH (Sync-API §9)
    const last = `zz-last-${tag}`
    // An HLC's device id must be lowercase hex — `parseHLC` refuses anything
    // else, and since the pull snapshot started carrying `updated_hlc` the
    // client actually parses what this fixture mints. `uniq()` is not hex, so
    // it is folded into hex here rather than sliced raw.
    const device = [...tag]
      .map((c) => c.charCodeAt(0).toString(16))
      .join('')
      .slice(0, 8)
      .padEnd(8, '0')

    const api = await browser.newContext({ baseURL })
    for (let start = 0; start < ROWS; start += PUSH_BATCH) {
      const mutations = []
      for (let i = start; i < Math.min(start + PUSH_BATCH, ROWS); i++) {
        const name = i === ROWS - 1 ? last : `bulk-${tag}-${i}`
        mutations.push({
          mutation_id: `${tag}-${i}-0000-0000-000000000000`.padEnd(36, '0').slice(0, 36),
          op: 'upsert',
          table: 'items',
          id: `${tag}-item-${i}`,
          fields: { name },
          hlc: `000000000${String(1000 + i).padStart(4, '0')}-0000-${device}`,
        })
      }
      const resp = await api.request.post('/api/v1/master/sync', {
        data: { client_hlc: mutations[mutations.length - 1]!.hlc, mutations },
      })
      expect(resp.ok(), await resp.text()).toBe(true)
    }
    await api.close()

    // A device that has never talked to this instance before.
    const fresh = await browser.newContext({ baseURL })
    const page = await fresh.newPage()
    let pulls = 0
    page.on('request', (r) => {
      if (r.method() === 'GET' && /\/api\/v1\/master\/sync/.test(r.url())) pulls++
    })
    await seed(page, { mode: 'server' })
    await page.goto('/tabs/items')

    // The last row of the feed, on screen. Before the fix it was unreachable:
    // it sits past the first page, and the pull stopped there.
    await expect(visiblePage(page).getByText(last, { exact: true })).toBeVisible({
      timeout: 30_000,
    })
    // More than one request, or the seed above no longer exceeds a page and
    // this case would be proving nothing.
    expect(pulls).toBeGreaterThan(1)

    await fresh.close()
  })
})
