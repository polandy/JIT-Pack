import { test, expect, createTripViaWizard, visiblePage } from '../fixtures'
import { addTripNote, openNotes, startTrip, threadNamed } from '../helpers/m4'
import { writesLanded } from '../helpers/page'
import { uniq } from '../serverMode'
import { PATH } from '../routes'

import { ACCOUNT_NAMES, loginAs, shareWith } from './fixtures'

/**
 * FR-7.9/FR-7.13 on two identities — the promises only a second reader can
 * see: a thread is new for somebody else and never for its writer, the tick
 * is per person (ADR-073), a reply after my tick makes the thread new again,
 * only an entry's author is offered ✎, and M1 quotes the newest thing I have
 * not seen. `local` (E2E-M26-01/02) covers the shape on one identity. That a
 * third reader's "new" survives a second reader's tick is `noteThreads`'s own
 * unit coverage (`domain/__tests__/tripNotes.spec.ts`) and
 * `TestStampActor_NoteAckUpsertCannotStealAnotherUsersRow`'s: both read only
 * the acting reader's own row, by construction. Who a reply notifies is
 * `TestPlanNotifications_NoteReply_ReachesTheParticipantsOnly_FR7_13`'s.
 */
test.describe('Trip notes across identities (FR-7.9, FR-7.13) @server', () => {
  test.slow()

  /**
   * E2E-M26-03: Alice writes a note. It is new for Bob — marked on the
   * thread, counted on the notes pill in the *neu* colour — and never new or
   * tickable on Alice's own screen (decision 4). Bob's tick clears the mark
   * and the pill; the sheet then names Bob, and only Bob.
   */
  test('E2E-M26-03: a note is new for another member, counted on its pill, and names who ticked', async ({
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
    const aliceNotes = await openNotes(alice)
    await expect(threadNamed(aliceNotes, code)).toBeVisible()
    await expect(aliceNotes.getByTestId('note-thread-new')).toHaveCount(0)
    await expect(aliceNotes.locator('ion-checkbox')).toHaveCount(0)

    await bob.goto(tripPath)
    await expect(bob.getByTestId('trip-view-notes-count')).toHaveText('1')
    const bobNotes = await openNotes(bob)
    const thread = threadNamed(bobNotes, code)
    await expect(thread.getByTestId('note-thread-new')).toBeVisible()

    await thread.getByTestId(/^note-thread-tick-/).click()
    await writesLanded(bob)
    await expect(thread.getByTestId('note-thread-new')).toHaveCount(0)
    await expect(bob.getByTestId('trip-view-notes')).toBeVisible()
    await expect(bob.getByTestId('trip-view-notes-count')).toHaveCount(0)

    // The sheet names who has ticked — Bob, and only Bob (decision 3).
    await thread.getByTestId(/^note-thread-toggle-/).click()
    await thread
      .getByTestId(/^note-entry-open-/)
      .first()
      .click()
    const sheet = bob.getByTestId('note-sheet')
    await expect(sheet.getByTestId('note-sheet-acked')).toContainText(ACCOUNT_NAMES.bob)
    await expect(sheet.getByTestId('note-sheet-acked')).not.toContainText(ACCOUNT_NAMES.alice)

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M26-04: Bob ticks Alice's thread; Alice replies; the thread is new
   * for Bob again, with only the reply counted (question 3's rule, applied
   * to a reply). Alice's own thread, answered by Bob, becomes tickable for
   * her. And ✎ is offered on one's own entries only (question 2).
   */
  test('E2E-M26-04: a reply re-opens a ticked thread for the other traveller, and only the author may edit', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Vercors ${id}`
    const title = `Schlüsselbox ${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    const tripPath = await createTripViaWizard(alice, { name: trip })
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)
    await alice.goto(tripPath)
    await addTripNote(alice, 'Code 4711', title)

    // Bob ticks it: nothing new.
    await bob.goto(tripPath)
    let bobThread = threadNamed(await openNotes(bob), title)
    await bobThread.getByTestId(/^note-thread-tick-/).click()
    await writesLanded(bob)
    await expect(bobThread.getByTestId('note-thread-new')).toHaveCount(0)

    // Bob answers too, and may not edit Alice's first note.
    await bobThread.getByTestId(/^note-thread-toggle-/).click()
    await expect(bobThread.getByTestId(/^note-entry-open-/)).toHaveText(['Code 4711'])
    await expect(bobThread.getByTestId(/^note-entry-edit-/)).toHaveCount(0)
    await bobThread
      .getByTestId(/^note-thread-reply-input-/)
      .locator('input')
      .fill('Danke!')
    await bobThread.getByTestId(/^note-thread-reply-send-/).click()
    await expect(bobThread.getByTestId(/^note-entry-edit-/)).toHaveCount(1)
    await writesLanded(bob)

    // Alice: Bob's reply is new in her own thread, which she can now tick.
    await alice.goto(tripPath)
    const aliceThread = threadNamed(await openNotes(alice), title)
    await expect(aliceThread.getByTestId('note-thread-new')).toHaveText('New')
    await aliceThread.getByTestId(/^note-thread-toggle-/).click()
    await expect(aliceThread.getByTestId(/^note-entry-edit-/)).toHaveCount(1)
    await aliceThread
      .getByTestId(/^note-thread-reply-input-/)
      .locator('input')
      .fill('Parkplatz 12')
    await aliceThread.getByTestId(/^note-thread-reply-send-/).click()
    await writesLanded(alice)
    // Replying is not ticking — but what she answered is behind her.
    await expect(aliceThread.getByTestId('note-thread-new')).toHaveCount(0)

    // Bob: his tick reached only as far as the first note, and his own reply
    // since — so Alice's newer reply alone makes the thread new again.
    await bob.goto(tripPath)
    await expect(bob.getByTestId('trip-view-notes-count')).toHaveText('1')
    bobThread = threadNamed(await openNotes(bob), title)
    await expect(bobThread.getByTestId('note-thread-new')).toHaveText('New')
    await bobThread.getByTestId(/^note-thread-toggle-/).click()
    await expect(bobThread.getByTestId(/^note-entry-open-/)).toHaveText([
      'Code 4711',
      'Parkplatz 12',
      'Danke!',
    ])
    await expect(bobThread.locator('[data-unseen]')).toHaveCount(1)
    await expect(bobThread.locator('[data-unseen]')).toContainText('Parkplatz 12')

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M1-14 (amended by FR-7.13): M1's *Neue Notizen* card, the one
   * deliberate exception to "M1 takes no actions" (decision 2). Bob's
   * dashboard lists Alice's thread by its title with the newest entry he has
   * not seen, and its trip; ticking it there is the same write M26 offers,
   * so the card drops the row; a reply brings it back, and the words open
   * the thread itself, expanded, on the notes view.
   */
  test('E2E-M1-14: M1 shows a thread’s newest unseen entry, ticks it, and the words open the thread', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Vinschgau ${id}`
    const title = `Pizzakurier ${id}`

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
    await addTripNote(alice, '044 555 01 00', title)

    await bob.goto(PATH.dashboard)
    const card = visiblePage(bob).getByTestId('dashboard-notes')
    const row = card.getByRole('button', { name: new RegExp(title) })
    await expect(row).toContainText(trip)
    await expect(row).toContainText(`${ACCOUNT_NAMES.alice}: 044 555 01 00`)

    await card.getByTestId(/^dashboard-note-tick-/).click()
    await writesLanded(bob)
    await expect(card).toHaveCount(0)

    // A reply brings the thread back, quoting the reply.
    const aliceThread = threadNamed(await openNotes(alice), title)
    await aliceThread.getByTestId(/^note-thread-toggle-/).click()
    await aliceThread
      .getByTestId(/^note-thread-reply-input-/)
      .locator('input')
      .fill('ab 18 Uhr')
    await aliceThread.getByTestId(/^note-thread-reply-send-/).click()
    await writesLanded(alice)

    await bob.goto(PATH.dashboard)
    const again = visiblePage(bob).getByTestId('dashboard-notes')
    await expect(again).toContainText(`${ACCOUNT_NAMES.alice}: ab 18 Uhr`)
    await again.getByRole('button', { name: new RegExp(title) }).click()

    // The words land on the thread itself, opened.
    const notes = visiblePage(bob).getByTestId('m26-page')
    await expect(threadNamed(notes, title).getByTestId(/^note-thread-body-/)).toBeVisible()

    await ctxAlice.close()
    await ctxBob.close()
  })
})
