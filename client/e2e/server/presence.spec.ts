import { test, expect, createTripViaWizard, visiblePage } from '../fixtures'
import { quickAddItem, uniq, watchSubscribed } from '../serverMode'

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

    const subscribedAlice = watchSubscribed(alice)
    await alice.goto(tripPath)
    await expect(visiblePage(alice).getByTestId(`m4-row-${item}`)).toBeVisible()
    await subscribedAlice

    // Alone on the trip there is no facepile — asserted here, on a screen
    // that has demonstrably rendered its list, so the absence is the rule
    // and not a page that had not painted yet.
    await expect(visiblePage(alice).getByTestId('presence-facepile')).toHaveCount(0)

    const subscribedBob = watchSubscribed(bob)
    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${item}`)).toBeVisible()
    await subscribedBob

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
})
