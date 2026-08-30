import { test, expect, createTripViaWizard, visiblePage } from '../fixtures'
import { quickAddItem, uniq, wsSubscribed } from '../serverMode'

import { ACCOUNT_NAMES, loginAs, shareWith } from './fixtures'

/**
 * G-10 — trip presence (FR-4.6), the second of the three areas named as owed
 * when the `server` project landed.
 *
 * Presence is the one G-10 promise that cannot be faked from one identity:
 * the facepile renders only above one user, so in `single` and `local` it is
 * correctly invisible and there was nothing to assert. Which is why nothing
 * ever had — and why the faces were initialled from `PresenceUser.user_id`,
 * a random 32-hex-character primary key. The screen said who was here in a
 * code nobody can read. The name now comes from the same participant
 * directory the packing stamps use, and the assertion below is on the
 * initials themselves for that reason.
 */
test.describe('G-10 — who else is on this trip @server @g10', () => {
  // Two logins, a wizard and two live sockets (§2.4's cost).
  test.slow()

  test('E2E-G10-01: the facepile arrives with the second person, names them, and reports the group in sync', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Vercors ${id}`
    const item = `Klettergurt-${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    const tripPath = await createTripViaWizard(alice, { name: trip })
    await quickAddItem(alice, item)
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)

    const wsAlice = alice.waitForEvent('websocket')
    await alice.goto(tripPath)
    await expect(visiblePage(alice).getByTestId(`m4-row-${item}`)).toBeVisible()
    await wsSubscribed(alice, wsAlice)

    // Alone on the trip there is no facepile — asserted here, on a screen
    // that has demonstrably rendered its list, so the absence is the rule
    // and not a page that had not painted yet.
    await expect(visiblePage(alice).getByTestId('presence-facepile')).toHaveCount(0)

    const wsBob = bob.waitForEvent('websocket')
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${item}`)).toBeVisible()
    await wsSubscribed(bob, wsBob)

    // Bob subscribing is what makes the pile worth drawing, and it appears on
    // Alice's screen without her doing anything — the presence event is the
    // only thing that could have put it there.
    const pileAlice = visiblePage(alice).getByTestId('presence-facepile')
    await expect(pileAlice).toBeVisible()
    await expect(pileAlice.getByTestId(`presence-face-${ACCOUNT_NAMES.alice}`)).toBeVisible()
    await expect(pileAlice.getByTestId(`presence-face-${ACCOUNT_NAMES.bob}`)).toBeVisible()

    // The face's own text, which is where the defect lived. `AL` and `BO`
    // cannot come from a user id: those are hex strings, and neither L nor O
    // is a hex digit — so this assertion fails against any build that
    // initials the id, and it fails whichever ids the run happens to mint.
    await expect(pileAlice.getByTestId(`presence-face-${ACCOUNT_NAMES.alice}`)).toHaveText('AL')
    await expect(pileAlice.getByTestId(`presence-face-${ACCOUNT_NAMES.bob}`)).toHaveText('BO')

    // The hover title is the long form of the same answer (FR-4.6), and it
    // is the only place the device count and the catch-up state are worded.
    await expect(pileAlice.getByTestId(`presence-face-${ACCOUNT_NAMES.bob}`)).toHaveAttribute(
      'title',
      new RegExp(`^${ACCOUNT_NAMES.bob}`),
    )

    // Symmetry is the point of a facepile: Bob sees the same two people.
    const pileBob = visiblePage(bob).getByTestId('presence-facepile')
    await expect(pileBob.getByTestId(`presence-face-${ACCOUNT_NAMES.alice}`)).toBeVisible()
    await expect(pileBob.getByTestId(`presence-face-${ACCOUNT_NAMES.bob}`)).toBeVisible()

    // The group-sync badge is a settled state, not a moment: it appears once
    // every connected device has reported a cursor at the head, which both
    // have by the time each has drained the trip. Nothing is waited out —
    // the assertion retries on a state the server recomputes and pushes.
    await expect(visiblePage(alice).getByTestId('presence-in-sync')).toBeVisible()
    await expect(visiblePage(bob).getByTestId('presence-in-sync')).toBeVisible()
    // …and the badge that counts the stragglers is not also on screen. The
    // two are exclusive by construction, which is worth pinning: a pile
    // showing both answers at once is worse than showing neither.
    await expect(visiblePage(alice).getByTestId('presence-behind')).toHaveCount(0)

    // The tap that replaced G-10's specified sheet: a phone has no hover, so
    // the face's title is unreachable there and the tap says it in the page.
    await expect(visiblePage(alice).getByTestId('presence-named')).toHaveCount(0)
    await pileAlice.getByTestId(`presence-face-${ACCOUNT_NAMES.bob}`).click()
    const named = visiblePage(alice).getByTestId('presence-named')
    await expect(named).toContainText(ACCOUNT_NAMES.bob)
    // The state is in words rather than only in the ring, which is the whole
    // point of naming somebody on a device that cannot hover.
    await expect(named).toContainText(/up to date/i)

    // Tapping the same face again puts it away — paired with the pile still
    // standing, so a facepile that stopped rendering cannot pass the absence.
    await pileAlice.getByTestId(`presence-face-${ACCOUNT_NAMES.bob}`).click()
    await expect(visiblePage(alice).getByTestId('presence-named')).toHaveCount(0)
    await expect(pileAlice).toBeVisible()

    // Leaving takes the pile with it, which is what makes it mean "now"
    // rather than "ever": one person left is G-8's case again, and the whole
    // facepile goes rather than shrinking to a lone face of oneself. Paired
    // with the list still standing, so a screen that stopped rendering
    // altogether cannot satisfy the absence.
    await ctxBob.close()
    await expect(visiblePage(alice).getByTestId('presence-facepile')).toHaveCount(0)
    await expect(visiblePage(alice).getByTestId(`m4-row-${item}`)).toBeVisible()

    await ctxAlice.close()
  })

  /**
   * E2E-G10-02: the other half of the badge, and the amber ring — the state
   * G-10 exists for, which nothing had ever produced over the wire.
   *
   * The spec entry called this half unassertable: a device is behind only
   * while its reported cursor sits below the trip head, and the client
   * reports one the moment its pull returns, so a case could only race it.
   * That is true of a device that is *allowed* to pull. It stops being a
   * race once the device cannot: `drainTrip` reports the cursor only after
   * the pull returns, so a blocked pull leaves Bob's cursor where it was and
   * the lagging state stands still until the block is lifted. Nothing here
   * waits for a duration — every assertion is on a settled state the server
   * recomputes and pushes.
   *
   * What only a rendered two-identity case can say: both ends were covered
   * and the wire between them was not. `hub_test.go` computes `in_sync` from
   * cursors, `PresenceFacepile.spec.ts` rings whoever a prop says is behind,
   * and nothing said the server's answer is that prop.
   */
  test('E2E-G10-02: a device that cannot catch up is counted, ringed and named as behind', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Ecrins ${id}`
    const first = `Steigeisen-${id}`
    const second = `Pickel-${id}`
    const third = `Helm-${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    const tripPath = await createTripViaWizard(alice, { name: trip })
    await quickAddItem(alice, first)
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)

    const wsAlice = alice.waitForEvent('websocket')
    await alice.goto(tripPath)
    await expect(visiblePage(alice).getByTestId(`m4-row-${first}`)).toBeVisible()
    await wsSubscribed(alice, wsAlice)

    const wsBob = bob.waitForEvent('websocket')
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${first}`)).toBeVisible()
    await wsSubscribed(bob, wsBob)

    // Both have drained the trip, so the group is settled at the head — the
    // positive this case then moves away from. Without it, "behind" could be
    // the state the pile had been in all along.
    await expect(visiblePage(alice).getByTestId('presence-in-sync')).toBeVisible()

    // Bob's device stops being able to fetch the trip partition. It stays
    // connected and subscribed — this is a device that is *behind*, not one
    // that is gone, and the pile gives those two different answers.
    await bob.route('**/api/v1/trips/*/sync**', (route) => route.abort())

    // Alice moves the trip head, and her own drain reports her new cursor —
    // which is what makes the server recompute presence at all.
    await quickAddItem(alice, second)

    await expect(visiblePage(alice).getByTestId('presence-behind')).toBeVisible()
    await expect(visiblePage(alice).getByTestId('presence-behind-count')).toHaveText('1')
    // Exactly one of the two answers is on screen. Asserted in *this*
    // direction, because this is where a stale badge would survive: the ✓✓
    // is what was on screen a moment ago.
    await expect(visiblePage(alice).getByTestId('presence-in-sync')).toHaveCount(0)

    // The state is per face, and it is Bob's face that carries it — the pile
    // says *who*, which is the whole reason G-10 put the state on the faces
    // instead of behind a sheet. Read through the tap, because the ring
    // itself is a colour and the words are what a person acts on.
    const pile = visiblePage(alice).getByTestId('presence-facepile')
    await pile.getByTestId(`presence-face-${ACCOUNT_NAMES.bob}`).click()
    const named = visiblePage(alice).getByTestId('presence-named')
    await expect(named).toContainText(ACCOUNT_NAMES.bob)
    await expect(named).toContainText(/catching up/i)

    // And Alice, who is at the head, is named as up to date by the same
    // control — so "catching up" is a statement about a person rather than
    // about the trip.
    await pile.getByTestId(`presence-face-${ACCOUNT_NAMES.alice}`).click()
    await expect(visiblePage(alice).getByTestId('presence-named')).toContainText(/up to date/i)

    // Lifting the block settles it again: the next trip.changed reaches Bob,
    // his pull returns, he reports the head, and the badge flips back. That
    // the state recovers is what makes it a state rather than a latch.
    await bob.unroute('**/api/v1/trips/*/sync**')
    await quickAddItem(alice, third)
    await expect(visiblePage(bob).getByTestId(`m4-row-${second}`)).toBeVisible()
    await expect(visiblePage(alice).getByTestId('presence-in-sync')).toBeVisible()
    await expect(visiblePage(alice).getByTestId('presence-behind')).toHaveCount(0)

    await ctxBob.close()
    await ctxAlice.close()
  })
})
