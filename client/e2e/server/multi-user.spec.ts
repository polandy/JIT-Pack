import {
  test,
  expect,
  createTripViaWizard,
  openTripSwipe,
  tripSwipeActions,
  visiblePage,
} from '../fixtures'
import { packItem, quickAddItem, uniq, wsSubscribed } from '../serverMode'

import { ACCOUNT_NAMES, loginAs, shareWith } from './fixtures'

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
  /**
   * E2E-M2-05 (FR-4.5): the trip's own delete is the owner's alone, and the
   * confirm takes it off every list it was on.
   *
   * `canDelete` reads the roster for the caller's own role, so the rule is
   * meaningless with one account: outside a collaborative instance there is
   * a single account that owns everything and the option is always offered.
   * Bob is an Editor on Alice's trip, which is the only place the negative
   * half exists at all.
   */
  test('E2E-M2-05: only the owner is offered Delete, and the confirm takes the trip off both lists', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Ponte ${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    const tripPath = await createTripViaWizard(alice, { name: trip })
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)

    // Bob has the trip and every other action on it — and not this one.
    await bob.goto('/tabs/trips')
    await visiblePage(bob).getByTestId('trips-filter-planned').click()
    await expect(visiblePage(bob).getByTestId(`trip-row-${trip}`)).toBeVisible()
    const bobsOptions = await tripSwipeActions(bob, trip)
    expect(bobsOptions).toContain('Export trip')
    expect(bobsOptions).not.toContain('Delete trip')

    await alice.goto('/tabs/trips')
    await visiblePage(alice).getByTestId('trips-filter-planned').click()
    expect(await tripSwipeActions(alice, trip)).toContain('Delete trip')

    // Cancelled first: a destructive action that was not confirmed has to
    // leave the trip exactly where it was, or the confirm below proves
    // nothing about the confirming.
    await openTripSwipe(alice, trip)
    await visiblePage(alice).getByTestId(`m2-delete-${trip}`).click()
    await alice.locator('ion-alert').getByRole('button', { name: 'Cancel' }).click()
    await expect(alice.locator('ion-alert')).toHaveCount(0)
    await expect(visiblePage(alice).getByTestId(`trip-row-${trip}`)).toBeVisible()

    await openTripSwipe(alice, trip)
    await visiblePage(alice).getByTestId(`m2-delete-${trip}`).click()
    await alice.locator('ion-alert').getByRole('button', { name: 'Delete' }).click()
    await expect(visiblePage(alice).getByTestId(`trip-row-${trip}`)).toHaveCount(0)

    // And on the device that had no say in it. The count is asserted first:
    // it is the settled signal (FR-2.8's `countsKnown`), so the absence
    // below cannot pass against a list that has not arrived — the ADR-033
    // rule, which is exactly how a tombstone would look if it never came.
    await bob.reload()
    await visiblePage(bob).getByTestId('trips-filter-planned').click()
    await expect(
      visiblePage(bob).getByTestId('trips-filter-planned').locator('.segment-count'),
    ).toBeVisible()
    await expect(visiblePage(bob).getByTestId(`trip-row-${trip}`)).toHaveCount(0)
  })

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

    await claimRow(alice, `m4-row-${item}`)

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

    await claimRow(alice, `m4-row-${item}`)
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
   * E2E-NOTIFY-01 (NFR-4.12, ADR-037): the notification speaks the
   * recipient's language, not the sender's and not the code's.
   *
   * The last surface written as an English literal, and the reason it stayed
   * one so long is visible in this case's shape: producing a notification at
   * all needs two accounts, so no project could reach the wording before
   * ADR-029. Bob's device is German; Alice's is not, and hers is what fires
   * the notification.
   */
  test('the notification is written in the recipient’s language', async ({ browser }) => {
    const id = uniq()
    const trip = `Sprachprobe ${id}`
    const item = `Regenjacke-${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob', 'de')
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

    // The whole German sentence, not a substring of it: the name and the
    // item alone would be satisfied by the English wording too, which is
    // exactly what this case exists to fail against.
    // Filtered by the item for the reason FR-02's comment gives: Bob's other
    // sessions are told about their rows too.
    await expect(bob.locator('ion-toast').filter({ hasText: item })).toContainText(
      `${ACCOUNT_NAMES.alice} hat dir „${item}“ zugewiesen`,
    )

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
    //
    // Filtered to *this* row's toast: notifications are addressed to the
    // user, not to the page, so a second case running in parallel as the
    // same account puts a second toast on this screen and an unfiltered
    // `ion-toast` is then a strict-mode violation rather than an assertion.
    const notice = bob.locator('ion-toast').filter({ hasText: item })
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

    // …and the empty list says what actually happened. It used to report
    // „no matches · behind the filter" and offer to clear a search and
    // facets nobody had set: FR-25.20's hiding is not a filter, and this
    // state was unreachable until the assignment had a writer.
    const empty = visiblePage(alice).getByTestId('packing-empty')
    await expect(empty).toContainText(ACCOUNT_NAMES.bob)
    await expect(empty).not.toContainText(/filter/i)

    // E2E-M4-31's regression guard: hiding somebody else's rows is a *view*,
    // so the header must count the same trip either way. A filtered list that
    // also shortened the header would make the trip look further along than it
    // is — read before the reveal and after it, so the two are one assertion.
    const progress = await visiblePage(alice).getByTestId('m4-progress').textContent()

    // The action reveals rather than clearing something that was never on.
    await visiblePage(alice).getByTestId('m4-reset').click()
    await expect(visiblePage(alice).getByTestId(`m4-row-${item}`)).toBeVisible()
    await expect(visiblePage(alice).getByTestId('m4-progress')).toHaveText(progress ?? '')

    // E2E-M4-30 (FR-25.19), the half that needs two accounts: Bob is
    // responsible, Alice packs it, and the row has **one** right edge. The
    // precedence itself is unit-tested in `domain/packingView.spec.ts`; what
    // needs both identities is that the two columns hold different people at
    // the same time — with one account the rule is satisfied by accident.
    await packItem(alice, item)
    await visiblePage(alice).getByTestId('m4-done-bar').click()

    const edge = visiblePage(alice).getByTestId(`m4-row-${item}`).locator('.row-end .avatar')
    await expect(edge).toHaveCount(1)
    await expect(edge).toHaveAttribute('aria-label', ACCOUNT_NAMES.alice)
    // The packer variant is the one that carries the tick — the rendered
    // difference, not merely a class the row happens to have.
    await expect(edge.locator('.tick')).toHaveCount(1)

    await ctxAlice.close()
    await ctxBob.close()
  })
  /**
   * E2E-G3-04 (FR-25.21, G-3): the membership editor is frozen by a claim on
   * **any** instance of the item, and says whose.
   *
   * The claim is taken on one child row and the editor is opened from a
   * *different*, unclaimed one — which is the whole point: a conversion
   * rewrites the claimed row too, so a lock read off the row the sheet was
   * opened from answers a narrower question than the write asks. That is also
   * why the sheet has to name the holder itself: M5's own G-3 banner is
   * absent on an unclaimed row, and the editor is a modal above M5 anyway.
   *
   * The positive signal is the same sheet after Alice gives the row back —
   * a frozen editor and a broken one look identical from outside.
   */
  test('a claim on one instance freezes the membership editor on another', async ({ browser }) => {
    const id = uniq()
    const trip = `Elba ${id}`
    const item = `Kurze-Hosen-${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    const tripPath = await createTripViaWizard(alice, {
      name: trip,
      travelers: ['Andy', 'Leonardo'],
    })
    await quickAddItem(alice, item)
    await makePerPerson(alice, item, ['Andy', 'Leonardo'])
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)

    const wsBob = bob.waitForEvent('websocket')
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-child-${item}-Leonardo`)).toBeVisible()
    await wsSubscribed(bob, wsBob)

    await alice.goto(tripPath)
    await claimRow(alice, `m4-child-${item}-Andy`)

    // Bob opens the editor from Leonardo's row: unclaimed, so M5 itself is
    // not locked — asserted, because a locked M5 would make the rest of this
    // case prove the old, row-scoped rule instead of the new one.
    const leonardo = visiblePage(bob).getByTestId(`m4-child-${item}-Leonardo`)
    await leonardo.click()
    await expect(bob.getByTestId('m5-sheet')).toBeVisible()
    await expect(bob.getByTestId('m5-lock')).toHaveCount(0)
    await bob.getByTestId('m5-details').click()
    await bob.getByTestId('m5-membership').click()
    await expect(bob.getByTestId('membership-sheet')).toBeVisible()

    // G-3, one surface deeper than it used to reach: the reason is on the
    // screen and it carries Alice's name.
    await expect(bob.getByTestId('membership-lock')).toContainText(ACCOUNT_NAMES.alice)
    await expect(bob.getByTestId('membership-shared')).toHaveAttribute('disabled', '')
    await expect(bob.getByTestId('membership-plus-Leonardo')).toHaveAttribute('disabled', '')

    // FR-5.7: a claim ends by decision. Alice gives the row back, and Bob's
    // open sheet becomes operable without being reopened.
    await releaseRow(alice, `m4-child-${item}-Andy`)

    await expect(bob.getByTestId('membership-lock')).toHaveCount(0)
    await bob.getByTestId('membership-plus-Leonardo').click()
    await expect(bob.getByTestId('membership-qty-Leonardo')).toHaveText('2')

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

/**
 * Claim a row through M4's press-and-hold menu (G-3, FR-25.17).
 *
 * Addressed by test id rather than by item name: a per-person item has no
 * `m4-row-<name>` at all — it is a cluster head with child rows, which is the
 * very shape E2E-G3-04 needs to claim one of.
 */
async function claimRow(page: import('@playwright/test').Page, testId: string) {
  await visiblePage(page).getByTestId(testId).dispatchEvent('contextmenu')
  await expect(page.locator('ion-action-sheet')).toBeVisible()
  await page
    .locator('ion-action-sheet')
    .getByRole('button', { name: /^pack$/i })
    .click()
  await expect(page.locator('ion-action-sheet')).toHaveCount(0)
}

/**
 * Turn a shared row into an FR-25.1 cluster through the membership editor —
 * the only writer of that shape (FR-25.21).
 */
async function makePerPerson(
  page: import('@playwright/test').Page,
  item: string,
  travelers: string[],
) {
  await visiblePage(page).getByTestId(`m4-row-${item}`).click()
  await expect(page.getByTestId('m5-sheet')).toBeVisible()
  await page.getByTestId('m5-details').click()
  await page.getByTestId('m5-membership').click()
  await page.getByTestId('membership-per-person').click()
  for (const name of travelers) {
    await page.getByTestId(`membership-check-${name}`).click()
    await expect(page.getByTestId(`membership-qty-${name}`)).toHaveText('1')
  }
  await page.getByTestId('membership-close').click()
  await page.getByTestId('m5-close').click()
  await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
  await expect(visiblePage(page).getByTestId(`m4-child-${item}-${travelers[0]}`)).toBeVisible()
}

/** Give a held row back through the same menu that claimed it (FR-5.7). */
async function releaseRow(page: import('@playwright/test').Page, testId: string) {
  await visiblePage(page).getByTestId(testId).dispatchEvent('contextmenu')
  await expect(page.locator('ion-action-sheet')).toBeVisible()
  await page
    .locator('ion-action-sheet')
    .getByRole('button', { name: /give the item back/i })
    .click()
  await expect(page.locator('ion-action-sheet')).toHaveCount(0)
}
