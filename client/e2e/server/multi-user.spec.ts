import { test, expect, createTripViaWizard, visiblePage } from '../fixtures'
import { packItem, quickAddItem, uniq, wsSubscribed } from '../serverMode'

import { ACCOUNT_NAMES, loginAs } from './fixtures'

/**
 * Two accounts on one instance (UI-Test-Spec §2.3, mode `server`) — the
 * first unit that can ask *who*.
 *
 * Harness: `playwright.config.ts` boots `e2e/server/backend.mjs`, which
 * starts the mock IdP and then a jitpackd brokering logins against it
 * (ADR-007), with a second `vite preview` in front of that backend so the
 * client reaches it same-origin. Both contexts here log in for real — the
 * display names asserted below are the ones UserInfo supplied and the
 * server JIT-provisioned.
 *
 * What this unit is for, stated as plainly as the ledger states it: every
 * multi-identity promise in G-3 and FR-5.7 was covered by Go tests and
 * orchestrator units, and by no screen. `single` cannot cover them for a
 * structural reason — its two contexts are one identity, so a takeover
 * there is a takeover of one's own claim, which the server refuses by
 * design.
 *
 * Isolation: one backend per run and a shared master partition, so every
 * test names its trip and its items uniquely (`uniq`), exactly as the
 * `single` unit does.
 */
test.describe('Two accounts on one instance @server', () => {
  // Two logins, a wizard and a real network stack per case (§2.4's cost).
  test.slow()

  /**
   * E2E-FLOW-01 (server half) + FR-4.5: Alice shares a trip with Bob, and a
   * row Alice packs arrives on Bob's screen carrying *her* name.
   *
   * The attribution is the half `single` could never show: invariant 3 has
   * the server stamp `packed_by_user_id` itself, so the name on Bob's row
   * is the server's answer to "who packed this", not a field Alice's client
   * filled in.
   */
  test('a shared trip converges, and a packed row says who packed it', async ({ browser }) => {
    const id = uniq()
    const trip = `Sardinien ${id}`
    const item = `Schnorchel-${id}`

    // Bob logs in first: a user exists in the directory once the IdP has
    // vouched for them, and Alice can only share with somebody who is there.
    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')

    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    const tripPath = await createTripViaWizard(alice, { name: trip })
    await quickAddItem(alice, item)

    // G-8's positive half: with a real session the trip offers Share at all.
    // Presence in the DOM, not visibility — the option lives behind M2's
    // slide gesture, and what is asserted here is the `collaborative` gate.
    await alice.goto('/tabs/trips')
    await visiblePage(alice).getByTestId('trips-filter-planned').click()
    await expect(visiblePage(alice).getByTestId(`m2-share-${trip}`)).toHaveCount(1)

    await alice.goto(`${tripPath}/members`)
    // Alice's own row proves the JIT provisioning carried the IdP's display
    // name through: nothing in the client ever typed "Alice".
    await expect(visiblePage(alice).getByTestId(`member-row-${ACCOUNT_NAMES.alice}`)).toBeVisible()
    await visiblePage(alice).getByTestId('members-add').click()
    await alice
      .locator('ion-popover ion-select-popover ion-item')
      .filter({ hasText: ACCOUNT_NAMES.bob })
      .click()
    await expect(visiblePage(alice).getByTestId(`member-row-${ACCOUNT_NAMES.bob}`)).toBeVisible()

    // Bob can now open the trip at all — the membership is what makes the
    // trip partition readable to him (P-3).
    const wsBob = bob.waitForEvent('websocket')
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${item}`)).toBeVisible()
    await wsSubscribed(bob, wsBob)

    await alice.goto(tripPath)
    await expect(visiblePage(alice).getByTestId(`m4-row-${item}`)).toBeVisible()
    await packItem(alice, item)

    // On Bob's screen without a reload: the row is done, and its stamp
    // names Alice.
    await visiblePage(bob).getByTestId('m4-done-bar').click()
    await expect(
      visiblePage(bob).getByTestId(`m4-row-${item}`).getByTestId('m4-packed-stamp'),
    ).toContainText(ACCOUNT_NAMES.alice)

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-G3-01 (the identity half, owed since 2026-08-22) + E2E-G3-03's
   * identity half: a row Alice is packing names *Alice* on Bob's screen —
   * on the list row and again in the sheet one tap below it.
   *
   * `single` proves the mechanism (a foreign claim locks the row); only
   * here can the rendered name be wrong and be caught.
   */
  test("a claimed row names its holder on the other account's screen", async ({ browser }) => {
    const id = uniq()
    const trip = `Engadin ${id}`
    const item = `Steigeisen-${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    const tripPath = await createTripViaWizard(alice, { name: trip })
    await quickAddItem(alice, item)
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)
    await alice.goto(tripPath)
    await expect(visiblePage(alice).getByTestId(`m4-row-${item}`)).toBeVisible()

    const wsBob = bob.waitForEvent('websocket')
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${item}`)).toBeVisible()
    await wsSubscribed(bob, wsBob)

    await claimRow(alice, item)

    const rowBob = visiblePage(bob).getByTestId(`m4-row-${item}`)
    await expect(rowBob.getByTestId('m4-lock-note')).toContainText(ACCOUNT_NAMES.alice)

    // G-3 promises the lock reaches the sheet, and the sheet names the
    // holder too — the same sentence, one tap deeper.
    await rowBob.click()
    await expect(bob.getByTestId('m5-lock')).toContainText(ACCOUNT_NAMES.alice)

    // And Alice's own row says the claim is hers, rather than saying
    // nothing: "locked for everyone including me" is the obvious wrong fix.
    await expect(
      visiblePage(alice).getByTestId(`m4-row-${item}`).getByTestId('m4-own-claim'),
    ).toBeVisible()

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-G3-02 (the half `single` could not reach) — FR-5.7, ADR-028: a
   * claim ends by decision. Bob takes Alice's row over, confirming against
   * her name; the row ends up claimed by *Bob*, never free in between, and
   * Alice is told by an FR-6.2 `lock_taken` notification.
   */
  test('a claim can be taken over, and the holder is told', async ({ browser }) => {
    const id = uniq()
    const trip = `Lofoten ${id}`
    const item = `Trockenanzug-${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    const tripPath = await createTripViaWizard(alice, { name: trip })
    await quickAddItem(alice, item)
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)
    await alice.goto(tripPath)
    await expect(visiblePage(alice).getByTestId(`m4-row-${item}`)).toBeVisible()

    const wsBob = bob.waitForEvent('websocket')
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${item}`)).toBeVisible()
    await wsSubscribed(bob, wsBob)

    await claimRow(alice, item)
    const rowBob = visiblePage(bob).getByTestId(`m4-row-${item}`)
    await expect(rowBob.getByTestId('m4-lock-note')).toContainText(ACCOUNT_NAMES.alice)

    // The menu on a foreign claim offers exactly one way past it.
    await rowBob.dispatchEvent('contextmenu')
    const sheet = bob.locator('ion-action-sheet')
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: /take over/i }).click()

    // The confirmation names whom it interrupts, and what it interrupts —
    // that naming is the requirement, not the politeness (FR-5.7).
    const alert = bob.locator('ion-alert')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText(ACCOUNT_NAMES.alice)
    await expect(alert).toContainText(item)
    await alert.getByRole('button', { name: /take over/i }).click()

    // The row is Bob's now — on his screen as his own claim, on Alice's as
    // a foreign one naming him. Both halves, because a takeover that only
    // freed the row would satisfy either one alone.
    await expect(
      visiblePage(bob).getByTestId(`m4-row-${item}`).getByTestId('m4-own-claim'),
    ).toBeVisible()
    await expect(
      visiblePage(alice).getByTestId(`m4-row-${item}`).getByTestId('m4-lock-note'),
    ).toContainText(ACCOUNT_NAMES.bob)

    // FR-6.2's fourth kind, delivered over the socket to the person who
    // lost the row.
    await expect(alice.getByText(new RegExp(`${ACCOUNT_NAMES.bob}.*${item}`))).toBeVisible()

    await ctxAlice.close()
    await ctxBob.close()
  })
  /**
   * E2E-FLOW-02 (FR-4.3 → FR-6.2 → FR-6.3, FR-25.19/25.20): Alice hands a
   * row to Bob, Bob is told, and the telling leads back to the row.
   *
   * The whole chain was unreachable until 2026-08-24. The server has always
   * fired `notifyDelegation` on a push carrying `packer_user_id` — Go tests
   * cover it — but no client surface ever wrote that column: it was set
   * once when a row was generated and never again, so the FR-6.2 delegation
   * notification could not be produced by using the app. M5's *Zugewiesen
   * an* picker is the writer; this case is the proof that the writer, the
   * notification, the deep link and FR-25.20's filter are one chain rather
   * than four separately-tested pieces.
   */
  test('a row handed to the other account notifies them, and the notice leads to the row', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Lofoten ${id}`
    const item = `Trockenanzug-${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    const tripPath = await createTripViaWizard(alice, { name: trip })
    await quickAddItem(alice, item)
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)

    const wsBob = bob.waitForEvent('websocket')
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${item}`)).toBeVisible()
    await wsSubscribed(bob, wsBob)

    await alice.goto(tripPath)
    await assignTo(alice, item, ACCOUNT_NAMES.bob)

    // FR-6.2's in-app channel: the toast is the delivery — there is no
    // inbox screen — and it names who handed over what.
    const notice = bob.locator('ion-toast')
    await expect(notice).toContainText(ACCOUNT_NAMES.alice)
    await expect(notice).toContainText(item)

    // FR-6.3/G-4: the notice leads to the item context, asserted on the
    // rendered sheet rather than on the URL.
    await notice.getByRole('button', { name: /open/i }).click()
    await expect(visiblePage(bob).getByTestId('m5-sheet')).toBeVisible()
    await expect(visiblePage(bob).getByTestId('m5-sheet')).toContainText(item)

    // FR-25.20, reachable for the first time: the row is Bob's job now, so
    // Alice's list hides it — and says so rather than hiding it silently.
    await alice.goto(tripPath)
    await expect(visiblePage(alice).getByTestId(`m4-row-${item}`)).toHaveCount(0)
    await expect(visiblePage(alice).getByTestId('m4-others-bar')).toContainText(ACCOUNT_NAMES.bob)

    await ctxAlice.close()
    await ctxBob.close()
  })
})

/** Hand a row to somebody through M5's *Zugewiesen an* picker (FR-25.19). */
async function assignTo(page: import('@playwright/test').Page, item: string, name: string) {
  await visiblePage(page).getByTestId(`m4-row-${item}`).getByRole('heading').click()
  await expect(page.getByTestId('m5-sheet')).toBeVisible()
  await page.getByTestId('m5-details').click()
  await page.getByTestId('m5-assignee').click()
  await page.locator('ion-popover ion-select-popover ion-item').filter({ hasText: name }).click()
  // The sheet's own avatar is the settled signal that the write landed.
  await expect(page.getByTestId('m5-sheet')).toContainText(name)
  await page.getByTestId('m5-close').click()
  await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
}

/** Add a member to a trip through M4's own roster screen (FR-4.5). */
async function shareWith(page: import('@playwright/test').Page, tripPath: string, name: string) {
  await page.goto(`${tripPath}/members`)
  await visiblePage(page).getByTestId('members-add').click()
  await page.locator('ion-popover ion-select-popover ion-item').filter({ hasText: name }).click()
  await expect(visiblePage(page).getByTestId(`member-row-${name}`)).toBeVisible()
}

/** Claim a row through M4's press-and-hold menu (G-3, FR-25.17). */
async function claimRow(page: import('@playwright/test').Page, item: string) {
  await visiblePage(page).getByTestId(`m4-row-${item}`).dispatchEvent('contextmenu')
  await expect(page.locator('ion-action-sheet')).toBeVisible()
  await page
    .locator('ion-action-sheet')
    .getByRole('button', { name: /^pack$/i })
    .click()
  await expect(page.locator('ion-action-sheet')).toHaveCount(0)
}
