import {
  test,
  expect,
  createTripViaWizard,
  expectTripOpen,
  openTripSwipe,
  tripSwipeActions,
  visiblePage,
  itemDetail,
  tripAction,
} from '../fixtures'
import {
  FOR_WHOM_M5,
  addTripTodo,
  chooseInRowMenu,
  lightTraveler,
  openCluster,
  openRowMenu,
  openTripTodos,
} from '../helpers/m4'
import { fillIonic } from '../helpers/ionic'
import { writesLanded } from '../helpers/page'
import { packItem, quickAddItem, uniq, watchSubscribed } from '../serverMode'

import { ACCOUNT_NAMES, loginAs, shareWith } from './fixtures'
import { PATH } from '../routes'

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
  test('E2E-FLOW-01: a shared trip converges, and a packed row says who packed it', async ({
    browser,
  }) => {
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
    await alice.goto(PATH.trips)
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
    const subscribedBob = watchSubscribed(bob)
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${item}`)).toBeVisible()
    await subscribedBob

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
   * E2E-FLOW-01b (FR-4.4, Sync-API P-1): the direction E2E-FLOW-01 does not
   * drive — the **member** packs and the **owner's** open screen reflects it.
   * The two directions are the same server code, and it was still this one
   * that failed on the family instance (2026-09-01): the owner's tab had lost
   * its socket and the member's had not, so one direction converged and the
   * other did not, and a case that only ever packs on the owner's device
   * could not have seen it. The stamp names Bob — the server's own attribution
   * (invariant 3), which a one-account project cannot produce.
   */
  test("E2E-FLOW-01b: a member's pack reaches the owner's open screen, named", async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Engadin ${id}`
    const item = `Sonnenhut-${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    const tripPath = await createTripViaWizard(alice, { name: trip })
    await quickAddItem(alice, item)
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)

    // Alice's screen is the one under test: it is open, subscribed, and then
    // touched by nothing on her side.
    const subscribedAlice = watchSubscribed(alice)
    await alice.goto(tripPath)
    await expect(visiblePage(alice).getByTestId(`m4-row-${item}`)).toBeVisible()
    await subscribedAlice

    const subscribedBob = watchSubscribed(bob)
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${item}`)).toBeVisible()
    await subscribedBob
    await packItem(bob, item)

    await expect(visiblePage(alice).getByTestId('m4-done-bar')).toBeVisible()
    await visiblePage(alice).getByTestId('m4-done-bar').click()
    await expect(
      visiblePage(alice).getByTestId(`m4-row-${item}`).getByTestId('m4-packed-stamp'),
    ).toContainText(ACCOUNT_NAMES.bob)

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-FLOW-01c (FR-4.4, Sync-API P-1): the header's figures follow another
   * person's packing. E2E-FLOW-01b proves a *row* arrives on the owner's open
   * screen; the progress figure above the list is computed from those rows, so
   * it is a second claim — one that would fail if the figure were read from a
   * value cached at open rather than derived. Alice touches nothing between
   * Bob's two packs, and the ring's own label is read as well as the text,
   * because the ring is what a glance at the header actually reads.
   */
  test("E2E-FLOW-01c: a member's packing moves the owner's progress figure and ring", async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Bernina ${id}`
    const first = `Eispickel-${id}`
    const second = `Stirnlampe-${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    const tripPath = await createTripViaWizard(alice, { name: trip })
    await quickAddItem(alice, first)
    await quickAddItem(alice, second)
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)

    const subscribedAlice = watchSubscribed(alice)
    await alice.goto(tripPath)
    await expect(visiblePage(alice).getByTestId(`m4-row-${first}`)).toBeVisible()
    await subscribedAlice

    const subscribedBob = watchSubscribed(bob)
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${first}`)).toBeVisible()
    await subscribedBob

    // The starting figure is asserted first: without it "1/2" could be what
    // the header had said all along.
    const header = visiblePage(alice).getByTestId('m4-header')
    await expect(header.getByTestId('m4-progress')).toContainText('0/2')
    await expect(header.getByTestId('progress-ring')).toHaveAttribute('aria-label', '0%')

    await packItem(bob, first)
    await expect(header.getByTestId('m4-progress')).toContainText('1/2')
    await expect(header.getByTestId('progress-ring')).toHaveAttribute('aria-label', '50%')

    // A second pack moves it again, so the figure is live rather than
    // refreshed once by the first event.
    await packItem(bob, second)
    await expect(header.getByTestId('m4-progress')).toContainText('2/2')
    await expect(header.getByTestId('progress-ring')).toHaveAttribute('aria-label', '100%')

    await ctxAlice.close()
    await ctxBob.close()
  })

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
    await bob.goto(PATH.trips)
    await visiblePage(bob).getByTestId('trips-filter-planned').click()
    await expect(visiblePage(bob).getByTestId(`trip-row-${trip}`)).toBeVisible()
    const bobsOptions = await tripSwipeActions(bob, trip)
    expect(bobsOptions).toContain('Export trip')
    expect(bobsOptions).not.toContain('Delete trip')

    await alice.goto(PATH.trips)
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

  /**
   * E2E-M17-01 (FR-6.2, M17): a notification preference turned off in the
   * settings screen actually reaches the rule that suppresses the
   * notification — and does so **per kind**, not as a global mute.
   *
   * The two ends were covered and the wire between them was not: the store
   * refuses to create a suppressed notification (Go's
   * `TestNotificationPrefs_DisabledKindSuppressesCreation`) and the client's
   * toggle PUTs the prefs (`composables/__tests__/settings.spec.ts`), while
   * nothing said that the switch the user flips is the value the server
   * then reads.
   *
   * The absence is asserted against two positive signals, because a toast
   * that has not arrived *yet* looks exactly like one that never will: the
   * same pair of pages produces a delegation toast before the preference is
   * touched, and afterwards a **mention** — the kind Carol left on — is what
   * says the channel is still live and the suppressed delegation had its
   * chance. Each of the three items carries its own unique word, so no
   * assertion can be answered by another one's toast.
   *
   * **Carol rather than Bob, and the preference is put back.** A preference
   * belongs to the account, not to a trip, so unlike everything else in this
   * file it is *shared-run state*: leaving Bob's delegations off broke
   * E2E-NOTIFY-01 and E2E-FLOW-02, which expect him to be told. Carol is
   * this file's own (see `mockIdp.mjs` — the admin cases used to share her,
   * and deactivated her under this case on a second worker), and the
   * preference is set through a helper that is idempotent in both
   * directions, so a retry starts from the state the case assumes.
   */
  test('E2E-M17-01: a preference turned off in M17 silences that kind and only that kind', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Hardanger ${id}`
    const heard = `Steigeisen-${id}`
    const silenced = `Pickel-${id}`
    const mentioned = `Seil-${id}`

    const ctxCarol = await browser.newContext()
    const carol = await loginAs(ctxCarol, 'carol')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    const tripPath = await createTripViaWizard(alice, { name: trip })
    await quickAddItem(alice, heard)
    await quickAddItem(alice, silenced)
    await quickAddItem(alice, mentioned)
    await shareWith(alice, tripPath, ACCOUNT_NAMES.carol)

    await carol.goto(PATH.settings)
    await setDelegations(carol, true)

    const subscribedCarol = watchSubscribed(carol)
    await carol.goto(tripPath)
    await expect(visiblePage(carol).getByTestId(`m4-row-${heard}`)).toBeVisible()
    await subscribedCarol

    // With the preference on, the delegation reaches Carol. This is the
    // control: the same chain and the same pages the suppressed one runs on.
    await alice.goto(tripPath)
    await assignTo(alice, heard, ACCOUNT_NAMES.carol)
    await expect(carol.locator('ion-toast').filter({ hasText: heard })).toContainText(
      ACCOUNT_NAMES.alice,
    )

    // Carol turns delegations off in her own settings, and only those. She
    // stays on that screen: a notification is addressed to the *user*, so it
    // reaches whatever page she has open — which is also what makes the
    // absence below assertable without a second trip subscription.
    await carol.goto(PATH.settings)
    await setDelegations(carol, false)
    // Persisted rather than merely toggled: the reload reads it back off the
    // server, which is the half of this case that is about M17 itself.
    await carol.reload()
    await expect(delegationToggle(carol)).toHaveAttribute('aria-checked', 'false')

    await alice.goto(tripPath)
    await assignTo(alice, silenced, ACCOUNT_NAMES.carol)
    // Alice's own screen proves the delegation happened at all: FR-25.20
    // hides a row that is somebody else's job, and names them.
    await expect(visiblePage(alice).getByTestId(`m4-row-${silenced}`)).toHaveCount(0)
    await expect(visiblePage(alice).getByTestId('m4-others-bar')).toContainText(ACCOUNT_NAMES.carol)

    // A mention, fired after the suppressed delegation and over the same
    // connection. Its toast is the settled signal that the delegation had
    // every chance to land — and that the switch is per kind, not a mute.
    await visiblePage(alice).getByTestId(`m4-row-${mentioned}`).click()
    await expect(itemDetail(alice).getByTestId('m5-sheet')).toBeVisible()
    await itemDetail(alice)
      .getByTestId('m5-note-input')
      .locator('input')
      .fill(`@${ACCOUNT_NAMES.carol} ${mentioned}`)
    await itemDetail(alice).getByTestId('m5-note-add').click()

    await expect(carol.locator('ion-toast').filter({ hasText: mentioned })).toBeVisible()
    await expect(carol.locator('ion-toast').filter({ hasText: silenced })).toHaveCount(0)

    // Put the account back the way it was found.
    await setDelegations(carol, true)

    await ctxAlice.close()
    await ctxCarol.close()
  })

  /**
   * E2E-G3-01 (the identity half, owed since 2026-08-22) + E2E-G3-03's
   * identity half: a row Alice is packing names *Alice* on Bob's screen —
   * on the list row and again in the sheet one tap below it.
   *
   * `single` proves the mechanism (a foreign claim locks the row); only
   * here can the rendered name be wrong and be caught.
   */
  test("E2E-G3-01, E2E-G3-03: a claimed row names its holder on the other account's screen", async ({
    browser,
  }) => {
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

    const subscribedBob = watchSubscribed(bob)
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${item}`)).toBeVisible()
    await subscribedBob

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
  test('E2E-G3-02: a claim can be taken over, and the holder is told', async ({ browser }) => {
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

    const subscribedBob = watchSubscribed(bob)
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${item}`)).toBeVisible()
    await subscribedBob

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
  test('E2E-NOTIFY-01: the notification is written in the recipient’s language', async ({
    browser,
  }) => {
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

    const subscribedBob = watchSubscribed(bob)
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${item}`)).toBeVisible()
    await subscribedBob

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
  /**
   * E2E-M1-03 (FR-6.1/6.3/4.4): the dashboard's standing surface for a
   * delegation, and that it arrives without a refresh.
   *
   * Delegation has been *delivered* since 2026-08-25 — as an FR-6.2 toast,
   * which E2E-FLOW-02 above asserts. A toast is gone by the time the app is
   * next opened, and until 2026-08-31 nothing on M1 read `packer_user_id` at
   * all: there was no badge of any kind on the screen for FR-4.4 to update.
   *
   * The live half is asserted the way this file asserts every live half —
   * against the settled section, with the WebSocket subscription awaited
   * first. Bob never reloads after Alice writes.
   */
  test('E2E-M1-03: a delegation reaches the dashboard, marked new, without a reload', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Senja ${id}`
    const item = `Steigeisen-${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    const tripPath = await createTripViaWizard(alice, { name: trip })
    // M1 aggregates *active* trips, so the trip has to have started for the
    // dashboard to carry it at all.
    await tripAction(alice, 'start')
    await quickAddItem(alice, item)
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)

    // Bob opens the trip so his device holds its partition, then goes to the
    // dashboard and stays there — the section has to arrive on its own.
    const subscribedBob = watchSubscribed(bob)
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${item}`)).toBeVisible()
    await subscribedBob
    await bob.goto(PATH.dashboard)
    // The absence stands against a screen that demonstrably rendered: the
    // trip is on it either way.
    //
    // Scoped to *this* row rather than to the section. The instance is shared
    // and every case here logs in as the same accounts, so a sibling case
    // delegating something else to Bob puts a section on this screen — the
    // same reason E2E-FLOW-02 below filters its toast by item.
    await expect(visiblePage(bob).getByTestId(`dashboard-trip-${trip}`)).toBeVisible()
    await expect(visiblePage(bob).getByTestId(`dashboard-delegated-${item}`)).toHaveCount(0)

    await alice.goto(tripPath)
    await assignTo(alice, item, ACCOUNT_NAMES.bob)

    // No reload: the section appears because the row arrived over the socket.
    const section = visiblePage(bob).getByTestId('dashboard-delegated')
    await expect(section).toBeVisible()
    await expect(section.getByTestId(`dashboard-delegated-${item}`)).toBeVisible()
    // Marked *new*, because this device has never shown it before — the half
    // FR-6.1 asks for beyond "assigned to me". Read off the row, for the same
    // reason as above: the card's badge counts every trip's delegations.
    await expect(visiblePage(bob).getByTestId(`dashboard-delegated-${item}`)).toHaveAttribute(
      'data-new',
      'true',
    )

    // And it is the way to the row.
    await section.getByTestId(`dashboard-delegated-${item}`).click()
    await expect(itemDetail(bob).getByTestId('m5-sheet')).toContainText(item)

    // Coming back, the same row is no longer news: leaving the screen is what
    // marks it read, so the highlight is spent and the row stays listed.
    await bob.goto(PATH.dashboard)
    await expect(
      visiblePage(bob)
        .getByTestId('dashboard-delegated')
        .getByTestId(`dashboard-delegated-${item}`),
    ).toBeVisible()
    await expect(visiblePage(bob).getByTestId(`dashboard-delegated-${item}`)).not.toHaveAttribute(
      'data-new',
      'true',
    )
  })

  test('E2E-FLOW-02: a row handed to the other account notifies them, and the notice leads to the row', async ({
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

    const subscribedBob = watchSubscribed(bob)
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${item}`)).toBeVisible()
    await subscribedBob

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
    await expect(itemDetail(bob).getByTestId('m5-sheet')).toBeVisible()
    await expect(itemDetail(bob).getByTestId('m5-sheet')).toContainText(item)

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
   * E2E-M4-90 (FR-25.25): the row's own avatar hands it over.
   *
   * The `server` project is the only one that can ask it: the picker offers
   * the trip's *other* members, and Local and Single-User Mode have none, so
   * there the control is absent rather than empty (G-8, asserted as
   * E2E-M4-89). What needs two accounts is that the control writes the
   * assignment — with one account there is nobody in the sheet to pick.
   */
  test('E2E-M4-90: a row is handed over from its own avatar, without opening M5', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Hardangervidda ${id}`
    const item = `Schlafsack-${id}`

    // Bob logs in first and is otherwise a bystander: the instance's directory
    // knows an account only once it has authenticated, so the member picker
    // Alice is about to use would be empty without this.
    const ctxBob = await browser.newContext()
    await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    const tripPath = await createTripViaWizard(alice, { name: trip })
    await quickAddItem(alice, item)
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)
    await alice.goto(tripPath)

    // An unassigned row carries the empty seat: the control is on the row
    // that most needs it, which is the one with nobody on it.
    const seat = visiblePage(alice).getByTestId(`m4-assign-${item}`)
    await expect(seat).toBeVisible()
    await expect(seat.getByTestId('user-avatar')).toHaveCount(0)

    await seat.click()
    const picker = alice.locator('ion-action-sheet')
    await expect(picker).toBeVisible()
    await picker.getByRole('button', { name: ACCOUNT_NAMES.bob }).click()
    await expect(picker).toHaveCount(0)

    // FR-25.20: the row is Bob's job now, so it leaves Alice's list — and the
    // reveal bar names him rather than the row simply going. That departure
    // is also the settled signal that the write landed, without a sheet to
    // read it back from.
    await expect(visiblePage(alice).getByTestId(`m4-row-${item}`)).toHaveCount(0)
    await expect(visiblePage(alice).getByTestId('m4-others-bar')).toContainText(ACCOUNT_NAMES.bob)

    // Revealed, the row names Bob on the edge it was assigned from, and the
    // seat is filled rather than merely gone.
    await visiblePage(alice).getByTestId('m4-reset').click()
    const filled = visiblePage(alice).getByTestId(`m4-assign-${item}`)
    await expect(filled.getByTestId('user-avatar')).toHaveAttribute('aria-label', ACCOUNT_NAMES.bob)

    // And the same control takes it back: an assignment nobody can undo from
    // where they made it is a one-way door.
    await filled.click()
    await expect(picker).toBeVisible()
    await picker.getByRole('button', { name: /nobody/i }).click()
    await expect(picker).toHaveCount(0)
    await expect(
      visiblePage(alice).getByTestId(`m4-assign-${item}`).getByTestId('user-avatar'),
    ).toHaveCount(0)

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M4-133 (FR-7.5): a trip todo is handed over from its own seat, the
   * way a row is (E2E-M4-90) — and the assignee is told, sees it on the task,
   * and finds it named on M1.
   *
   * Two accounts are the whole point: the seat is absent where nobody else
   * can be picked (E2E-M4-134), and „I was told" needs a second person.
   */
  test('E2E-M4-133: a trip todo is handed to the other account from its seat, and they are told', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Sarek ${id}`
    const task = `Pflanzen giessen ${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    const tripPath = await createTripViaWizard(alice, { name: trip })
    await tripAction(alice, 'start')
    await addTripTodo(alice, task)
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)

    const subscribedBob = watchSubscribed(bob)
    await bob.goto(tripPath)
    const bobsTodo = visiblePage(bob).getByTestId(`trip-todo-${task}`)
    await expect(bobsTodo).toBeVisible()
    await subscribedBob

    // An unassigned todo carries the empty seat, as an unassigned row does.
    await alice.goto(tripPath)
    const section = await openTripTodos(alice)
    const seat = section.getByTestId(`trip-todo-assign-${task}`)
    await expect(seat).toBeVisible()
    await expect(seat.getByTestId('user-avatar')).toHaveCount(0)

    // The picker is the row's, with one difference that is the rule: a todo
    // can be taken on oneself, so Alice is offered too — a row's picker
    // leaves her out (FR-25.20).
    await seat.click()
    const picker = alice.locator('ion-action-sheet')
    await expect(picker).toBeVisible()
    await expect(picker.getByRole('button', { name: ACCOUNT_NAMES.alice })).toBeVisible()
    await picker.getByRole('button', { name: ACCOUNT_NAMES.bob }).click()
    await expect(picker).toHaveCount(0)
    await expect(seat.getByTestId('user-avatar')).toHaveAttribute('aria-label', ACCOUNT_NAMES.bob)

    // FR-6.2: Bob is told, in the delegation's words, naming the task.
    const notice = bob.locator('ion-toast').filter({ hasText: task })
    await expect(notice).toContainText(ACCOUNT_NAMES.alice)

    // …and his own screen names him on the task, from the server's copy.
    await expect(
      bobsTodo.getByTestId(`trip-todo-assign-${task}`).getByTestId('user-avatar'),
    ).toHaveAttribute('aria-label', ACCOUNT_NAMES.bob)

    // M1 reports it: the open todo carries whose job it is.
    await bob.goto(PATH.dashboard)
    await expect(
      visiblePage(bob).getByTestId(`dashboard-trip-todo-assignee-${task}`),
    ).toContainText(ACCOUNT_NAMES.bob)

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M22-13 (FR-2.5, ADR-058): M22 records which account a traveller is,
   * and the server keeps it.
   *
   * The `server` project is the only one that can ask this at all: the
   * picker offers `trip_members` and nothing else, and a trip with one
   * member — every Local and Single-User one — renders no control (G-8).
   *
   * The reload is the whole assertion. The link is written optimistically
   * like every other row edit, so the value standing straight after the tap
   * says only that the screen painted it; a link the server refused
   * (`not_a_trip_member`) is rolled back (ADR-031), and what survives a
   * reload is therefore what the instance accepted rather than what this
   * device drew.
   */
  test('E2E-M22-13: a traveller is recorded as an account, and the instance keeps it', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Vercors ${id}`

    // Bob logs in first: the directory carries an account once the IdP has
    // vouched for it, and Alice can only share with somebody who is there.
    const ctxBob = await browser.newContext()
    await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    const tripPath = await createTripViaWizard(alice, {
      name: trip,
      travelers: ['Bo'],
    })
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)

    await alice.goto(`${tripPath}/edit`)
    const roster = visiblePage(alice).getByTestId('traveler-row-Bo')
    await expect(roster).toBeVisible()

    // `.select-text` is the *rendered value*, and reading anything wider is
    // how this case was false-green for an hour: an `ion-select`'s own text
    // content is its whole option list, so „contains Bob" was satisfied by
    // the choice being offered rather than by its being taken.
    const link = roster.locator('ion-select .select-text')

    // Before the pick the row says the traveller is nobody's account, which
    // is what makes the assertion after it a change rather than a coincidence.
    await expect(link).toHaveText('No account')

    await roster.locator('ion-select').click()
    await alice
      .locator('ion-popover ion-select-popover ion-item')
      .filter({ hasText: ACCOUNT_NAMES.bob })
      .click()
    await expect(link).toHaveText(ACCOUNT_NAMES.bob)
    await writesLanded(alice)

    await alice.reload()
    await expect(
      visiblePage(alice).getByTestId('traveler-row-Bo').locator('ion-select .select-text'),
    ).toHaveText(ACCOUNT_NAMES.bob)

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M22-14 (FR-2.5, owner 2026-09-13): the add row records the account in
   * the same act as the name.
   *
   * The reload is the assertion for the same reason as in E2E-M22-13: the
   * link is optimistic, and only what survives the reload is what the
   * instance accepted. This case additionally proves the *order* the client
   * writes in — the link is a second mutation after the rows FR-27.4
   * generates — because a link that had ridden on the insert would be
   * refused by nothing here and would merely notify the account once per
   * generated row, which no assertion in the browser can see.
   */
  test('E2E-M22-14: a traveller can be added as an account in one act', async ({ browser }) => {
    const id = uniq()
    const trip = `Chartreuse ${id}`

    const ctxBob = await browser.newContext()
    await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    const tripPath = await createTripViaWizard(alice, {
      name: trip,
      travelers: ['Bo'],
    })
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)

    await alice.goto(`${tripPath}/edit`)
    const page = visiblePage(alice)
    const addLink = page.getByTestId('traveler-add-link')
    await expect(addLink).toBeVisible()

    // Picked before the name is typed, which is the order the control is
    // built for: the account is a property of the person being added, not a
    // correction made afterwards.
    await addLink.click()
    await alice
      .locator('ion-popover ion-select-popover ion-item')
      .filter({ hasText: ACCOUNT_NAMES.bob })
      .click()
    await page.getByTestId('traveler-add-input').locator('input').fill('Kim')
    await page.getByTestId('traveler-add').click()

    const kim = page.getByTestId('traveler-row-Kim')
    await expect(kim).toBeVisible()
    // `.select-text` is the rendered value; an `ion-select`'s own text is its
    // whole option list and would read „Bob" before anything was picked.
    await expect(kim.locator('ion-select .select-text')).toHaveText(ACCOUNT_NAMES.bob)
    // And the picker is back at nobody for the next person.
    await expect(addLink.locator('.select-text')).toHaveText('No account')
    await writesLanded(alice)

    await alice.reload()
    await expect(
      visiblePage(alice).getByTestId('traveler-row-Kim').locator('ion-select .select-text'),
    ).toHaveText(ACCOUNT_NAMES.bob)

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-G3-04 (FR-25.21, G-3): the for-whom strip is frozen by a claim on
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
  test('E2E-G3-04: a claim on one instance freezes the for-whom strip on another', async ({
    browser,
  }) => {
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

    const subscribedBob = watchSubscribed(bob)
    await bob.goto(tripPath)
    // FR-25.23: the cluster is shut on arrival, and the fold is per device —
    // both of them have to open it before a traveler's own row exists.
    await openCluster(bob, item)
    await expect(visiblePage(bob).getByTestId(`m4-child-${item}-Leonardo`)).toBeVisible()
    await subscribedBob

    await alice.goto(tripPath)
    await openCluster(alice, item)
    await claimRow(alice, `m4-child-${item}-Andy`)

    // Bob opens M5 from Leonardo's row: unclaimed, so M5 itself is
    // not locked — asserted, because a locked M5 would make the rest of this
    // case prove the old, row-scoped rule instead of the new one.
    const leonardo = visiblePage(bob).getByTestId(`m4-child-${item}-Leonardo`)
    await leonardo.click()
    await expect(bob.getByTestId('m5-sheet')).toBeVisible()
    await expect(bob.getByTestId('m5-lock')).toHaveCount(0)
    const strip = bob.getByTestId(`for-whom-strip-${FOR_WHOM_M5}`)
    await expect(strip).toBeVisible()

    // G-3, one surface deeper than it used to reach: the reason is on the
    // screen and it carries Alice's name.
    const lock = bob.getByTestId(`for-whom-lock-${FOR_WHOM_M5}`)
    const more = bob.getByTestId(`for-whom-plus-${FOR_WHOM_M5}-Leonardo`)
    await expect(lock).toContainText(ACCOUNT_NAMES.alice)
    await expect(bob.getByTestId(`for-whom-shared-${FOR_WHOM_M5}`)).toBeDisabled()
    await expect(more).toBeDisabled()

    // FR-5.7: a claim ends by decision. Alice gives the row back, and Bob's
    // open strip becomes operable without being reopened.
    await releaseRow(alice, `m4-child-${item}-Andy`)

    await expect(lock).toHaveCount(0)
    await more.click()
    await expect(bob.getByTestId(`for-whom-qty-${FOR_WHOM_M5}-Leonardo`)).toHaveText('2')

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M3-24 (FR-2.5, FR-4.5): a traveler picked from the accounts in M3 is
   * a collaborator of the trip at once — no separate share step. The proof is
   * on Bob's screen: he opens a trip Alice never shared through the roster.
   */
  test('E2E-M3-24: an account added as a traveler in the wizard is a member of the new trip', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Wallis ${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    await alice.goto(PATH.newTrip)
    await alice.getByTestId('wizard-name').locator('input').fill(trip)
    await alice.getByTestId('wizard-next').click()
    await expect(alice.getByTestId('wizard-step-2')).toBeVisible()

    await alice.getByTestId('wizard-add-account-traveler').click()
    await alice
      .locator('ion-popover ion-select-popover ion-item')
      .filter({ hasText: ACCOUNT_NAMES.bob })
      .click()
    // The row carries the account's name and the role a share would.
    await expect(alice.getByTestId('wizard-traveler-name').last().locator('input')).toHaveValue(
      ACCOUNT_NAMES.bob,
    )
    await expect(alice.getByTestId('wizard-traveler-role')).toBeVisible()

    await alice.getByTestId('wizard-next').click()
    await expect(alice.getByTestId('wizard-step-3')).toBeVisible()
    await alice.getByTestId('wizard-next').click()
    await expect(alice.getByTestId('wizard-step-4')).toBeVisible()
    await alice.getByTestId('wizard-create').click()
    await expectTripOpen(alice, trip)
    await writesLanded(alice)
    const tripPath = new URL(alice.url()).pathname

    await alice.goto(`${tripPath}/members`)
    await expect(visiblePage(alice).getByTestId(`member-row-${ACCOUNT_NAMES.bob}`)).toBeVisible()

    const subscribedBob = watchSubscribed(bob)
    await bob.goto(tripPath)
    await expectTripOpen(bob, trip)
    await subscribedBob

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M17-18 (FR-2.5a): a default traveller picked from the accounts in M17
   * comes back in M3's step 2 as that account — linked and a member, like a
   * traveller picked there. The pick is device-local, so it is made in the same
   * context that then opens the wizard.
   */
  test('E2E-M17-18: an account picked as a default traveller starts the wizard as that account', async ({
    browser,
  }) => {
    // Bob signs in first: the directory lists only accounts that have.
    const ctxBob = await browser.newContext()
    await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    await alice.goto(PATH.settings)
    await alice.getByTestId('default-traveler-user').click()
    await alice
      .locator('ion-popover ion-select-popover ion-item')
      .filter({ hasText: ACCOUNT_NAMES.bob })
      .click()
    await expect(alice.getByTestId(`default-traveler-remove-${ACCOUNT_NAMES.bob}`)).toBeVisible()

    await alice.goto(PATH.newTrip)
    await alice.getByTestId('wizard-name').locator('input').fill(`Bündner ${uniq()}`)
    await alice.getByTestId('wizard-next').click()
    await expect(alice.getByTestId('wizard-step-2')).toBeVisible()
    await expect(alice.getByTestId('wizard-traveler-name').locator('input')).toHaveValue(
      ACCOUNT_NAMES.bob,
    )
    await expect(alice.getByTestId('wizard-traveler-role')).toBeVisible()

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M10-29 (FR-1.9): an item's default assignee, set in M10, reaches M3.
   *
   * Bob is chosen on the item, and on step 2 Alice records her traveler "Bob"
   * as Bob's account — then the review row for that item names Bob and is
   * *not* labelled per person (it is a trip-global row that was handed over,
   * not a fan-out). The unlinked half is a unit case (`instantiate.spec.ts`).
   */
  test('E2E-M10-29: an item assigned to Bob in M10 arrives on his linked traveler in the wizard', async ({
    browser,
  }) => {
    const id = uniq()
    const item = `Drohne ${id}`

    // Bob has to have logged in once to be in the directory Alice picks from.
    const ctxBob = await browser.newContext()
    await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    await alice.goto(PATH.newItem)
    await fillIonic(visiblePage(alice).getByTestId('m10-name'), item)
    await visiblePage(alice).getByTestId('m10-assignee').click()
    await alice
      .locator('ion-popover ion-select-popover ion-item')
      .filter({ hasText: ACCOUNT_NAMES.bob })
      .click()
    await visiblePage(alice).getByTestId('m10-create').click()
    await expect(alice.getByTestId('header-title')).toHaveText(item)
    // Settled on the saved item: the choice survived the create, which a
    // draft that was dropped on the way would not have.
    await expect(visiblePage(alice).getByTestId('m10-assignee')).toContainText(ACCOUNT_NAMES.bob)
    await writesLanded(alice)

    await alice.goto(PATH.newTrip)
    await fillIonic(visiblePage(alice).getByTestId('wizard-name'), `Reise ${id}`)
    await alice.getByTestId('wizard-next').click()
    await expect(alice.getByTestId('wizard-step-2')).toBeVisible()
    await alice.getByTestId('wizard-add-traveler').click()
    await fillIonic(alice.getByTestId('wizard-traveler-name').last(), ACCOUNT_NAMES.bob)
    await visiblePage(alice).getByTestId('wizard-share-add').click()
    await alice
      .locator('ion-popover ion-select-popover ion-item')
      .filter({ hasText: ACCOUNT_NAMES.bob })
      .click()
    // The share popover must be gone, or the account popover opens beside it and
    // the option below matches twice.
    await expect(alice.locator('ion-popover')).toHaveCount(0)
    await visiblePage(alice).getByTestId('wizard-traveler-account').click()
    await alice
      .locator('ion-popover ion-select-popover ion-item')
      .filter({ hasText: ACCOUNT_NAMES.bob })
      .click()
    await alice.getByTestId('wizard-next').click()

    await expect(alice.getByTestId('wizard-step-3')).toBeVisible()
    await alice.getByTestId('wizard-item-search').locator('input').fill(item)
    await alice
      .getByTestId(/^wizard-item-suggestion-/)
      .first()
      .click()
    await alice.getByTestId('wizard-next').click()

    await expect(alice.getByTestId('wizard-step-4')).toBeVisible()
    const row = visiblePage(alice).getByTestId('wizard-review-row').filter({ hasText: item })
    await expect(row).toContainText(ACCOUNT_NAMES.bob)
    await expect(row).not.toContainText(/per person/i)

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M9-27 (FR-1.9 over FR-24.9): the default assignee, set for several
   * inventory rows at once.
   *
   * Server Mode is the only place the action exists at all — G-8 hides it
   * where the directory holds fewer than two accounts, which is every Local
   * and Single-User instance — so this is where both halves are asserted: the
   * action is *offered*, and what it writes is on the rows afterwards. The
   * rows are picked by name rather than with „All N", because master data is
   * instance-wide and the inventory carries every other case's items too.
   */
  test('E2E-M9-27: several inventory rows are assigned to Bob in one act', async ({ browser }) => {
    const id = uniq()
    const items = [`Zeltheringe ${id}`, `Zeltstangen ${id}`]

    // Bob has to have logged in once to be in the directory Alice picks from.
    const ctxBob = await browser.newContext()
    await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    for (const name of items) {
      await alice.goto(PATH.newItem)
      await fillIonic(visiblePage(alice).getByTestId('m10-name'), name)
      await visiblePage(alice).getByTestId('m10-create').click()
      await expect(alice.getByTestId('header-title')).toHaveText(name)
      // Nobody, until the batch says otherwise — the assertion below is only
      // worth making because this one holds first. `.select-text` is the
      // rendered *value*; an `ion-select`'s own text is its whole option list,
      // which names Bob before anything has been written (E2E-M22-13).
      await expect(
        visiblePage(alice).getByTestId('m10-assignee').locator('.select-text'),
      ).toHaveText('Nobody')
    }
    await writesLanded(alice)

    // In-app rather than `goto`: a fresh load of a tab route in Server Mode
    // comes up on the dashboard, and the case would then be filling a search
    // field that is not on screen. The rail, not the tab bar — this project
    // runs at desktop width, where G-9 hands navigation to the rail.
    const openInventory = async () => {
      await alice.getByTestId('rail-items').click()
      await expect(visiblePage(alice).getByTestId('items-search-input')).toBeVisible()
      await visiblePage(alice).getByTestId('items-search-input').fill(id)
    }

    const list = visiblePage(alice)
    await openInventory()
    await expect(list.getByTestId('m9-row')).toHaveCount(2)

    await alice.getByTestId('m9-select').click()
    for (const name of items) await list.getByTestId(`m9-row-check-${name}`).click()
    await expect(list.getByTestId('m9-select-count')).toContainText('2')

    await list.getByTestId('m9-bulk-more').click()
    await alice.locator('ion-action-sheet').getByText('Usually assigned to').click()
    await expect(alice.getByTestId('m9-bulk-assignee-sheet')).toHaveAttribute(
      'data-presented',
      'true',
    )
    await alice.getByTestId(`m9-bulk-assignee-${ACCOUNT_NAMES.bob}`).click()
    await expect(list.getByTestId('m9-selbar')).toHaveCount(0)
    await writesLanded(alice)

    for (const name of items) {
      await list.getByTestId('m9-row').filter({ hasText: name }).click()
      await expect(alice.getByTestId('header-title')).toHaveText(name)
      await expect(
        visiblePage(alice).getByTestId('m10-assignee').locator('.select-text'),
      ).toHaveText(ACCOUNT_NAMES.bob)
      await alice.getByTestId('header-back').click()
      await openInventory()
    }

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M9-29 (FR-1.9 over FR-24.4/24.7): the inventory *shows* who an item
   * is usually for, and finds it by that name.
   *
   * Until this, the flag could only be read by opening the item — an
   * inventory of two hundred rows answered „was ist üblicherweise meins?"
   * one editor at a time. Server Mode again, and for the same G-8 reason as
   * E2E-M9-27: the property is not offered where there is only one account,
   * so the toggle's own presence is part of what is asserted.
   *
   * Three claims, each needing the one before it: the toggle exists, the row
   * carries the name once it is on, and the search reaches the same row
   * through that name. The **second** item stays unassigned throughout, or
   * „the name is on the row" would be satisfied by a list that printed it on
   * every row.
   */
  test('E2E-M9-29: the inventory names who an item is usually for, and finds it by that name', async ({
    browser,
  }) => {
    const id = uniq()
    const mine = `Stirnlampe ${id}`
    const nobodys = `Zeltunterlage ${id}`

    const ctxBob = await browser.newContext()
    await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    for (const name of [mine, nobodys]) {
      await alice.goto(PATH.newItem)
      await fillIonic(visiblePage(alice).getByTestId('m10-name'), name)
      await visiblePage(alice).getByTestId('m10-create').click()
      await expect(alice.getByTestId('header-title')).toHaveText(name)
    }
    // Only the first one gets an account, in M10's own field.
    await alice.goto(PATH.items)
    await visiblePage(alice).getByTestId('items-search-input').fill(mine)
    await visiblePage(alice).getByTestId('m9-row').filter({ hasText: mine }).click()
    await expect(alice.getByTestId('header-title')).toHaveText(mine)
    await visiblePage(alice).getByTestId('m10-assignee').click()
    await alice
      .locator('ion-popover ion-select-popover ion-item')
      .filter({ hasText: ACCOUNT_NAMES.bob })
      .click()
    await expect(visiblePage(alice).getByTestId('m10-assignee')).toContainText(ACCOUNT_NAMES.bob)
    await writesLanded(alice)

    const openInventory = async (query: string) => {
      await alice.getByTestId('rail-items').click()
      await expect(visiblePage(alice).getByTestId('items-search-input')).toBeVisible()
      await visiblePage(alice).getByTestId('items-search-input').fill(query)
    }
    const list = visiblePage(alice)
    await openInventory(id)
    await expect(list.getByTestId('m9-row')).toHaveCount(2)
    // Lean by default (FR-24.4): nothing says it until the device asks.
    await expect(list.getByTestId('m9-row-assignee')).toHaveCount(0)

    await alice.getByTestId('m9-properties').click()
    await expect(alice.getByTestId('m9-properties-sheet')).toBeVisible()
    await alice.getByTestId('m9-property-assignee').click()
    await alice.keyboard.press('Escape')

    // One row names Bob; the other names nobody rather than „Nobody".
    await expect(list.getByTestId('m9-row-assignee')).toHaveCount(1)
    await expect(
      list.getByTestId('m9-row').filter({ hasText: mine }).getByTestId('m9-row-assignee'),
    ).toContainText(ACCOUNT_NAMES.bob)

    // FR-24.7's fourth field: the account's name is a query, which is what
    // stands in for a filter by account.
    await openInventory(ACCOUNT_NAMES.bob)
    await expect(list.getByTestId('m9-row')).toHaveCount(1)
    await expect(list.getByTestId('m9-row')).toContainText(mine)

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M4-130 (FR-5.1, FR-25.25): the late-packer flag is trip state, not a
   * view preference — what Alice marks „pack later" is marked for Bob too.
   *
   * Reported by the owner as not arriving; the case found it does, and it is
   * kept because no other case had a second account look at the flag. It is
   * asserted three ways: live on Bob's open screen, after his reload (the
   * server's copy rather than a socket frame), and in the clearing direction,
   * because a flag that could only be set would strand a row as „later".
   */
  test("E2E-M4-130: a late-packer flag set by one account shows on the other's screen", async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Spaeter ${id}`
    const item = `Spaetpacker-${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    const tripPath = await createTripViaWizard(alice, { name: trip })
    await quickAddItem(alice, item)
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)

    const subscribedBob = watchSubscribed(bob)
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${item}`)).toBeVisible()
    await subscribedBob
    const bobsFlag = visiblePage(bob).getByTestId(`m4-row-${item}`).getByTestId('row-late')
    await expect(bobsFlag).toHaveCount(0)

    await alice.goto(tripPath)
    await openRowMenu(alice, item)
    await chooseInRowMenu(alice, /late packer on/i)
    await expect(
      visiblePage(alice).getByTestId(`m4-row-${item}`).getByTestId('row-late'),
    ).toBeVisible()

    await expect(bobsFlag).toBeVisible()
    await bob.reload()
    await expect(bobsFlag).toBeVisible()

    await openRowMenu(alice, item)
    await chooseInRowMenu(alice, /late packer off/i)
    await expect(bobsFlag).toHaveCount(0)

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
 * Turn a shared row into an FR-25.1 cluster through M5's for-whom strip
 * (FR-25.28).
 */
async function makePerPerson(
  page: import('@playwright/test').Page,
  item: string,
  travelers: string[],
) {
  await visiblePage(page).getByTestId(`m4-row-${item}`).click()
  await expect(page.getByTestId('m5-sheet')).toBeVisible()
  for (const name of travelers) await lightTraveler(page, FOR_WHOM_M5, name)
  await page.getByTestId('m5-close').click()
  await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
  await openCluster(page, item)
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

/** M17's *Delegations* switch on whichever settings page is open. */
function delegationToggle(page: import('@playwright/test').Page) {
  return visiblePage(page)
    .locator('ion-item')
    .filter({ hasText: 'Delegations' })
    .locator('ion-toggle')
}

/**
 * Put the preference in a known state, clicking only when it is not there
 * already. Idempotent in both directions on purpose: the preference belongs
 * to the account rather than to a trip, so a case that toggles blindly
 * cannot survive its own retry and leaves the account changed for everyone
 * else in the run.
 */
async function setDelegations(page: import('@playwright/test').Page, on: boolean) {
  const toggle = delegationToggle(page)
  await expect(toggle).toHaveCount(1)
  if ((await toggle.getAttribute('aria-checked')) !== String(on)) await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', String(on))
}
