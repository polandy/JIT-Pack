import { test, expect, createTripViaWizard, visiblePage } from '../fixtures'
import {
  addTripNote,
  openEntryMenu,
  openNotes,
  openThread,
  replyInThread,
  startTrip,
  threadNamed,
} from '../helpers/m4'
import { writesLanded } from '../helpers/page'
import { uniq } from '../serverMode'
import { PATH } from '../routes'

import { ACCOUNT_NAMES, loginAs, shareWith } from './fixtures'

/**
 * FR-7.9/FR-7.13 on two identities — the promises only a second reader can
 * see: a thread is new for somebody else and never for its writer, *Gelesen*
 * is per person (ADR-073), a reply after it makes the thread new again with a
 * divider where the new begins, only an entry's author is offered *Edit*,
 * and M1 quotes the newest thing I have not seen. `local` (E2E-M26-01/02) covers the shape on one identity. That a
 * third reader's "new" survives a second reader's tick is `noteThreads`'s own
 * unit coverage (`domain/__tests__/tripNotes.spec.ts`) and
 * `TestStampActor_NoteAckUpsertCannotStealAnotherUsersRow`'s: both read only
 * the acting reader's own row, by construction. Who a reply notifies is
 * `TestPlanNotifications_NoteReply_ReachesTheParticipantsOnly_FR7_13`'s.
 */
test.describe('Trip notes across identities (FR-7.9, FR-7.13) @server', () => {
  test.slow()

  /**
   * E2E-M26-03: Alice writes a note. It is new for Bob — marked on the card,
   * counted on the notes pill in the *neu* colour — and never new, nor
   * offered *Gelesen*, on Alice's own screen (decision 4). Bob's *Gelesen*
   * clears the mark and the pill; the thread then names Bob, and only Bob,
   * as having seen it.
   */
  test('E2E-M26-03: a note is new for another member, counted on its pill, and names who has read it', async ({
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

    // Alice's own note: never new, nothing to say *read* about.
    const aliceNotes = await openNotes(alice)
    await expect(threadNamed(aliceNotes, code)).toBeVisible()
    await expect(aliceNotes.getByTestId('note-thread-new')).toHaveCount(0)
    await openThread(alice, code)
    await expect(alice.getByTestId('note-thread-read')).toHaveCount(0)

    await bob.goto(tripPath)
    await expect(bob.getByTestId('trip-view-notes-count')).toHaveText('1')
    const bobNotes = await openNotes(bob)
    await expect(threadNamed(bobNotes, code).getByTestId('note-thread-new')).toBeVisible()

    const thread = await openThread(bob, code)
    await thread.getByTestId('note-thread-read').click()
    await writesLanded(bob)
    await expect(thread.getByTestId('note-thread-read')).toHaveCount(0)
    // The thread names who has read it — Bob, and only Bob (decision 3).
    await expect(thread.getByTestId('note-entry-seen-by')).toContainText(ACCOUNT_NAMES.bob)
    await expect(thread.getByTestId('note-entry-seen-by')).not.toContainText(ACCOUNT_NAMES.alice)

    await bob.getByTestId('header-back').click()
    const back = visiblePage(bob).getByTestId('m26-page')
    await expect(threadNamed(back, code)).toBeVisible()
    await expect(back.getByTestId('note-thread-new')).toHaveCount(0)
    await expect(bob.getByTestId('trip-view-notes')).toBeVisible()
    await expect(bob.getByTestId('trip-view-notes-count')).toHaveCount(0)

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M26-04: Bob reads Alice's thread and answers; Alice replies; the
   * thread is new for Bob again, with only the reply counted and a divider
   * above it (question 3's rule, applied to a reply). Alice's own thread,
   * answered by Bob, is new for her. And *Edit* is offered on one's own
   * entries only (question 2).
   */
  test('E2E-M26-04: a reply re-opens a read thread for the other traveller, and only the author may edit', async ({
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

    // Bob reads it, answers, and may not edit Alice's first note.
    await bob.goto(tripPath)
    const bobThread = await openThread(bob, title)
    await bobThread.getByTestId('note-thread-read').click()
    await writesLanded(bob)
    await expect(bobThread.getByTestId('note-thread-read')).toHaveCount(0)
    let menu = await openEntryMenu(bob, 'Code 4711')
    await expect(menu.getByTestId('note-menu-copy')).toBeVisible()
    await expect(menu.getByTestId('note-menu-edit')).toHaveCount(0)
    await menu.getByRole('button', { name: 'Cancel' }).click()
    await expect(menu).toHaveCount(0)
    await replyInThread(bob, 'Danke!')
    await writesLanded(bob)
    menu = await openEntryMenu(bob, 'Danke!')
    await expect(menu.getByTestId('note-menu-edit')).toBeVisible()
    await menu.getByRole('button', { name: 'Cancel' }).click()
    await expect(menu).toHaveCount(0)

    // Alice: Bob's reply is new in her own thread.
    await alice.goto(tripPath)
    const aliceNotes = await openNotes(alice)
    await expect(threadNamed(aliceNotes, title).getByTestId('note-thread-new')).toHaveText('New')
    await openThread(alice, title)
    await replyInThread(alice, 'Parkplatz 12')
    await writesLanded(alice)
    // Replying is not reading — but what she answered is behind her.
    await expect(alice.getByTestId('note-thread-read')).toHaveCount(0)

    // Bob: his *Gelesen* reached only as far as the first note, and his own
    // reply since — so Alice's newer reply alone makes the thread new again.
    await bob.goto(tripPath)
    await expect(bob.getByTestId('trip-view-notes-count')).toHaveText('1')
    const again = await openNotes(bob)
    await expect(threadNamed(again, title).getByTestId('note-thread-new')).toHaveText('New')
    const reread = await openThread(bob, title)
    await expect(reread.getByTestId(/^note-entry-words-/)).toHaveText([
      'Code 4711',
      'Danke!',
      'Parkplatz 12',
    ])
    await expect(reread.locator('[data-unseen]')).toHaveCount(1)
    await expect(reread.locator('[data-unseen]')).toContainText('Parkplatz 12')
    // The divider stands between what he has seen and what he has not.
    const entries = reread.locator(
      '[data-testid="note-thread-divider"], [data-testid^="note-entry-words-"]',
    )
    await expect(entries).toHaveText([
      'Code 4711',
      'Danke!',
      'New since your last visit',
      'Parkplatz 12',
    ])

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M1-14 (amended by FR-7.13): M1's *Neue Notizen* card, the one
   * deliberate exception to "M1 takes no actions" (decision 2). Bob's
   * dashboard lists Alice's thread by its title with the newest entry he has
   * not seen, and its trip; ticking it there is the same write M26 offers,
   * so the card drops the row; a reply brings it back, and the words open
   * the thread's own view.
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
    await openThread(alice, title)
    await replyInThread(alice, 'ab 18 Uhr')
    await writesLanded(alice)

    await bob.goto(PATH.dashboard)
    const again = visiblePage(bob).getByTestId('dashboard-notes')
    await expect(again).toContainText(`${ACCOUNT_NAMES.alice}: ab 18 Uhr`)
    await again.getByRole('button', { name: new RegExp(title) }).click()

    // The words land on the thread's own view.
    const thread = visiblePage(bob).getByTestId('m26-thread')
    await expect(thread.getByTestId(/^note-entry-words-/)).toHaveText([
      '044 555 01 00',
      'ab 18 Uhr',
    ])
    await expect(bob.getByTestId('header-title')).toHaveText(title)

    await ctxAlice.close()
    await ctxBob.close()
  })
})
