import { test, expect, visiblePage as visible } from './fixtures'
import {
  addTripNote,
  openEntryMenu,
  openNotes,
  openThread,
  replyInThread,
  threadNamed,
  tripWithRows,
} from './helpers/m4'
import { writesLanded } from './helpers/page'

/**
 * M26 — a trip's notes as threads (FR-7.13), on one identity.
 *
 * Local Mode has nobody else to write for, so „new", *Gelesen* and the reply
 * push are the server file's (`server/trip-notes.spec.ts`, two real
 * identities). What a single writer can prove is the shape: the view of its
 * own, a card that shows what is in a thread, the thread's own view read top
 * to bottom with the reply field at the bottom, the one level, the edit and
 * the delete behind an entry's menu, and the `tel:` link and code chip.
 */
test.describe('M26 — a trip’s notes as threads (FR-7.13) @local @m26', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M26-01: the notes are a view of their own, reached by their pill,
   * and M25 is one list again. A note is written from the FAB's sheet; a
   * titled one is named by its title with its words on the card, a quick one
   * by its first line. Its thread links the phone number and makes the code a
   * chip; deleting the first note from its menu takes the thread and returns
   * to the list.
   */
  test('E2E-M26-01: notes have their own view, a card shows a thread’s words, and a thread is deleted from its menu', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')

    // M25 does not hold the notes — asserted on a screen that rendered.
    await page.getByTestId('trip-view-tasks').click()
    await expect(visible(page).getByTestId('m25-before')).toBeVisible()
    await expect(visible(page).locator('ion-segment')).toHaveCount(0)

    const notes = await openNotes(page)
    await expect(page.getByTestId('trip-view-notes')).toHaveAttribute('aria-current', 'page')
    await expect(notes.getByTestId('m26-empty')).toBeVisible()

    await addTripNote(page, 'Pizza 044 555 01 00\nab 18 Uhr')
    await addTripNote(page, 'Code 4711, links neben der Tür', 'Schlüsselbox')
    await expect(notes.getByTestId('m26-empty')).toHaveCount(0)
    // Newest activity first; the quick note is named by its first line.
    await expect(notes.getByTestId('note-thread-name')).toHaveText([
      'Schlüsselbox',
      'Pizza 044 555 01 00',
    ])
    // The card says what is in it — the lookup needs no tap.
    await expect(threadNamed(notes, 'Schlüsselbox').getByTestId('note-thread-preview')).toHaveText(
      'Code 4711, links neben der Tür',
    )
    await expect(
      threadNamed(notes, 'Pizza 044 555 01 00').getByTestId('note-thread-preview'),
    ).toHaveText('ab 18 Uhr')
    // Own notes: nothing to tick (FR-7.9 decision 4) — nor could any be in
    // G-8's Local Mode.
    await expect(notes.locator('ion-checkbox')).toHaveCount(0)

    const box = await openThread(page, 'Schlüsselbox')
    await expect(box.getByTestId('note-code')).toHaveText('4711')

    await page.getByTestId('header-back').click()
    const pizza = await openThread(page, 'Pizza 044 555 01 00')
    await expect(pizza.locator('a.tel')).toHaveAttribute('href', 'tel:0445550100')

    const menu = await openEntryMenu(page, 'Pizza 044 555 01 00')
    await menu.getByTestId('note-menu-remove').click()
    await writesLanded(page)
    // The thread is gone, and so is its view: back on the list.
    const after = visible(page).getByTestId('m26-page')
    await expect(after.getByTestId('note-thread-name')).toHaveText(['Schlüsselbox'])

    await page.reload()
    const reloaded = await openNotes(page)
    await expect(reloaded.getByTestId('note-thread-name')).toHaveText(['Schlüsselbox'])
  })

  /**
   * E2E-M26-02: the thread reads top to bottom — the first note, then the
   * replies in the order they were written, each landing at the bottom where
   * it was written — and a reply lifts the thread in the list, whose card
   * quotes it. One reply field per thread. The author edits from the menu,
   * title included, and the entry says *bearbeitet*; deleting the first note
   * says how many replies go with it, then takes them.
   */
  test('E2E-M26-02: a thread reads top to bottom, a reply lifts it, and the menu edits and deletes', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    await addTripNote(page, 'Code 4711', 'Schlüsselbox')
    await addTripNote(page, 'Fähre um 8')
    const notes = await openNotes(page)
    await expect(notes.getByTestId('note-thread-name')).toHaveText(['Fähre um 8', 'Schlüsselbox'])

    const thread = await openThread(page, 'Schlüsselbox')
    for (const reply of ['Klemmt etwas', 'Parkplatz ist Nr. 12']) {
      await replyInThread(page, reply)
    }
    await writesLanded(page)
    // Top to bottom: the first note, then the replies as they were written.
    await expect(thread.getByTestId(/^note-entry-words-/)).toHaveText([
      'Code 4711',
      'Klemmt etwas',
      'Parkplatz ist Nr. 12',
    ])
    // One level: one reply field for the thread, and none on an entry.
    await expect(visible(page).getByTestId('note-thread-reply-input')).toHaveCount(1)

    // The author edits from the first note's menu, title included.
    const menu = await openEntryMenu(page, 'Code 4711')
    await menu.getByTestId('note-menu-edit').click()
    await thread.getByTestId('note-edit-title').locator('input').fill('Schlüsselbox Haus')
    await thread.getByTestId('note-edit-body').locator('textarea').fill('Code 4712')
    await thread.getByTestId('note-edit-save').click()
    await writesLanded(page)

    // Back on the list: the thread with the replies is on top, quoting the
    // newest, and says how many it holds.
    await page.getByTestId('header-back').click()
    const list = visible(page).getByTestId('m26-page')
    await expect(list.getByTestId('note-thread-name')).toHaveText([
      'Schlüsselbox Haus',
      'Fähre um 8',
    ])
    const card = threadNamed(list, 'Schlüsselbox Haus')
    await expect(card.getByTestId('note-thread-meta')).toContainText('2 replies')
    await expect(card.getByTestId('note-thread-last')).toContainText('Parkplatz ist Nr. 12')

    await page.reload()
    const edited = await openThread(page, 'Schlüsselbox Haus')
    await expect(edited.getByTestId(/^note-entry-words-/).first()).toHaveText('Code 4712')
    await expect(edited.getByTestId(/^note-entry-meta-/).first()).toContainText('edited')

    // Deleting the first note names its replies, and takes them.
    const rootMenu = await openEntryMenu(page, 'Code 4712')
    const remove = rootMenu.getByTestId('note-menu-remove')
    await expect(remove).toHaveText(/Delete note, with 2 replies/)
    await remove.click()
    await writesLanded(page)
    await page.reload()
    const after = await openNotes(page)
    await expect(after.getByTestId('note-thread-name')).toHaveText(['Fähre um 8'])
    await expect(after.getByText('Parkplatz ist Nr. 12')).toHaveCount(0)
  })
})
