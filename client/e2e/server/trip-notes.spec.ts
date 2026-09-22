import { test, expect, createTripViaWizard, visiblePage } from '../fixtures'
import { addTripNote, openNotes, startTrip } from '../helpers/m4'
import { writesLanded } from '../helpers/page'
import { uniq } from '../serverMode'
import { PATH } from '../routes'

import { ACCOUNT_NAMES, loginAs, shareWith } from './fixtures'

/**
 * FR-7.9 on two identities — the promise ADR-073 exists for: a tick is a
 * row per (note, person), never a field the two readers' writes could
 * collide over. `local` (E2E-M25-10) covers the write, the sheet's `tel:`
 * link and the delete on one identity; what only a second one can prove —
 * "new for me", the tick, and who the sheet names — is here. The stricter
 * claim, that a third reader's "new" survives a second reader's tick, is
 * `isNoteNewForMe`'s own unit coverage (`domain/__tests__/tripNotes.spec.ts`)
 * and `TestStampActor_NoteAckUpsertCannotStealAnotherUsersRow`'s: both read
 * only the acting reader's own row, by construction, so a third identity
 * here would re-assert the same seam at a much higher cost per run.
 */
test.describe('Trip notes across identities (FR-7.9) @server', () => {
  test.slow()

  /**
   * E2E-M25-11: Alice writes a note. It is new for Bob — marked in the
   * list, counted on the segment — and never new or ticked on Alice's own
   * screen (decision 4). Bob's tick sinks and mutes his own row and clears
   * the segment's count; the sheet then names Bob, and only Bob.
   */
  test('E2E-M25-11: a note is new for another member, tickable, and names who ticked', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Karwendel ${id}`
    const code = `Schlüsselfach ${id}: 4711`

    // Bob logs in first: a user exists in the directory once the IdP has
    // vouched for them, and Alice can only share with somebody who is there.
    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')

    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    const tripPath = await createTripViaWizard(alice, { name: trip })
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)
    await alice.goto(tripPath)
    await addTripNote(alice, code)

    // Alice's own note: never new, never a tick, on her own screen.
    const aliceSection = await openNotes(alice)
    await expect(aliceSection.getByRole('button', { name: code })).toBeVisible()
    await expect(aliceSection.getByTestId('trip-note-new')).toHaveCount(0)
    await expect(aliceSection.locator('ion-checkbox.tick')).toHaveCount(0)

    await bob.goto(tripPath)
    const bobSection = await openNotes(bob)
    await expect(bobSection.getByRole('button', { name: code })).toBeVisible()
    await expect(bobSection.getByTestId('trip-note-new')).toBeVisible()
    await expect(visiblePage(bob).getByTestId('m25-segment-notes')).toContainText('1')

    // Bob ticks it — his own row sinks and mutes, and the segment's count
    // drops to none.
    await bobSection.getByTestId(/^trip-note-tick-/).click()
    await writesLanded(bob)
    await expect(bobSection.getByTestId('trip-note-new')).toHaveCount(0)
    await expect(visiblePage(bob).getByTestId('m25-segment-notes')).not.toContainText('1')

    // The sheet names who has ticked — Bob, and only Bob (decision 3).
    await bobSection.getByRole('button', { name: code }).click()
    const sheet = bob.getByTestId('note-sheet')
    await expect(sheet.getByTestId('note-sheet-acked')).toContainText(ACCOUNT_NAMES.bob)
    await expect(sheet.getByTestId('note-sheet-acked')).not.toContainText(ACCOUNT_NAMES.alice)

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M1-14: M1's *Neue Notizen* card, the one deliberate exception to
   * "M1 takes no actions" (decision 2). Bob's dashboard lists Alice's note
   * with its trip's name; ticking it there is the same write M25 offers,
   * so the card drops the row once it is no longer new; the words are the
   * separate way into the trip.
   */
  test('E2E-M1-14: M1 lists a new note across trips, ticks it, and the words lead into the trip', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Vinschgau ${id}`
    const code = `Pizzakurier ${id}: 044 555 01 00`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')

    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    const tripPath = await createTripViaWizard(alice, { name: trip })
    // M1's card reads only active trips (`activeTrips`) — a planned one
    // never reaches it, however many new notes it carries.
    await startTrip(alice)
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)
    await alice.goto(tripPath)
    await addTripNote(alice, code)

    await bob.goto(PATH.dashboard)
    const card = visiblePage(bob).getByTestId('dashboard-notes')
    await expect(card).toBeVisible()
    const row = card.getByRole('button', { name: new RegExp(code) })
    await expect(row).toContainText(trip)

    await card.getByTestId(/^dashboard-note-tick-/).click()
    await writesLanded(bob)
    await expect(row).toHaveCount(0)
    await expect(card).toHaveCount(0)

    // The words are the way in — asserted from a fresh note, since the one
    // above just left the card by being ticked.
    await addTripNote(alice, code + ' (zwei)')
    await bob.goto(PATH.dashboard)
    await visiblePage(bob)
      .getByTestId('dashboard-notes')
      .getByRole('button', { name: new RegExp(code) })
      .click()
    await expect(visiblePage(bob).getByTestId('m4-header')).toBeVisible()

    await ctxAlice.close()
    await ctxBob.close()
  })
})
