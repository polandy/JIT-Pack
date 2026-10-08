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
import { createExcursion, excursionMenu, openExcursions } from './helpers/m27'
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

  /**
   * E2E-M26-05 (FR-7.15): a thread may name the excursion it is about. The
   * sheet offers the trip's excursions as chips; the card names the chosen
   * one; the thread's first note links into its list, which lists the thread
   * and leads back to it. The author takes the link off in the edit, and the
   * excursion's list no longer names the thread — after a reload too.
   */
  test('E2E-M26-05: a note names its excursion, and each side leads to the other', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    await openExcursions(page)
    await createExcursion(page, { name: 'Hüttentour' })
    await addTripNote(page, 'Code 4711', 'Schlüsselbox')

    const notes = await openNotes(page)
    await notes.getByTestId('m26-fab').click()
    const sheet = page.getByTestId('m26-composer')
    await expect(sheet.getByTestId('m26-composer-title')).toBeVisible()
    await sheet.getByTestId('m26-title-input').locator('input').fill('Treffpunkt')
    await sheet.getByTestId('m26-input').locator('textarea').fill('7 Uhr an der Talstation')
    const chip = sheet.getByTestId(/^note-excursion-chip-/)
    await expect(chip).toHaveText(['Hüttentour'])
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await sheet.getByTestId('m26-add').click()
    await writesLanded(page)

    // The card names the excursion; the plain trip note names none.
    await expect(threadNamed(notes, 'Treffpunkt').getByTestId('note-thread-excursion')).toHaveText(
      'Hüttentour',
    )
    await expect(
      threadNamed(notes, 'Schlüsselbox').getByTestId('note-thread-excursion'),
    ).toHaveCount(0)

    // From the thread into the excursion's list…
    const thread = await openThread(page, 'Treffpunkt')
    await thread.getByTestId('note-excursion-link').click()
    const excursion = visible(page).getByTestId('m27-excursion-page')
    await expect(page.getByTestId('header-title')).toHaveText('Hüttentour')
    const lines = excursion.getByTestId('m27-notes').getByRole('button')
    await expect(lines).toHaveText(['Treffpunkt'])

    // …and back.
    await lines.click()
    const back = visible(page).getByTestId('m26-thread')
    await expect(back.getByTestId(/^note-entry-words-/)).toHaveText(['7 Uhr an der Talstation'])

    // The author takes the link off; the words stay as they were.
    const menu = await openEntryMenu(page, '7 Uhr an der Talstation')
    await menu.getByTestId('note-menu-edit').click()
    const pressed = back.getByTestId(/^note-excursion-chip-/)
    await expect(pressed).toHaveAttribute('aria-pressed', 'true')
    await pressed.click()
    await back.getByTestId('note-edit-save').click()
    await writesLanded(page)
    await expect(back.getByTestId(/^note-entry-words-/)).toHaveText(['7 Uhr an der Talstation'])
    await expect(back.getByTestId('note-excursion-link')).toHaveCount(0)
    await expect(back.getByTestId(/^note-entry-meta-/)).not.toContainText('edited')

    // The thread view carries no pills; the list does.
    await page.getByTestId('header-back').click()
    await expect(visible(page).getByTestId('m26-fab')).toBeVisible()
    await page.reload()
    await openExcursions(page)
    await visible(page).getByTestId('m27-excursion-Hüttentour').click()
    const reloaded = visible(page).getByTestId('m27-excursion-page')
    await expect(reloaded.getByTestId('m27-progress-card')).toBeVisible()
    await expect(reloaded.getByTestId('m27-notes')).toHaveCount(0)
  })

  /**
   * E2E-M26-06 (FR-7.15): deleting an excursion keeps the notes about it —
   * the thread is a plain trip note again, on the list and in its view.
   */
  test('E2E-M26-06: a deleted excursion leaves its notes as trip notes', async ({ page }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    await openExcursions(page)
    await createExcursion(page, { name: 'Bootsausflug' })

    const notes = await openNotes(page)
    await notes.getByTestId('m26-fab').click()
    const sheet = page.getByTestId('m26-composer')
    await sheet.getByTestId('m26-input').locator('textarea').fill('Schwimmwesten beim Verleih')
    await sheet.getByTestId(/^note-excursion-chip-/).click()
    await sheet.getByTestId('m26-add').click()
    await writesLanded(page)
    await expect(
      threadNamed(notes, 'Schwimmwesten beim Verleih').getByTestId('note-thread-excursion'),
    ).toHaveText('Bootsausflug')

    await openExcursions(page)
    await visible(page).getByTestId('m27-excursion-Bootsausflug').click()
    await expect(visible(page).getByTestId('m27-notes').getByRole('button')).toHaveText([
      'Schwimmwesten beim Verleih',
    ])
    await excursionMenu(page, 'm27-delete')
    await page
      .getByTestId('m27-delete-confirm')
      .locator('button')
      .filter({ hasText: 'Delete' })
      .click()
    await expect(visible(page).getByTestId('m27-empty')).toBeVisible()
    await writesLanded(page)

    await page.reload()
    const after = await openNotes(page)
    const card = threadNamed(after, 'Schwimmwesten beim Verleih')
    await expect(card).toBeVisible()
    await expect(card.getByTestId('note-thread-excursion')).toHaveCount(0)
    const thread = await openThread(page, 'Schwimmwesten beim Verleih')
    await expect(thread.getByTestId('note-excursion-link')).toHaveCount(0)
  })

  /**
   * E2E-M26-07: the thread view's head is the thread's own title, or *Note*
   * where it has none — never the untitled note's first line, which the card
   * under the head already shows in full. The seed's quick note, a number
   * and a time on one line, stands on the page once; the trip stays the
   * head's second line.
   */
  test('E2E-M26-07: the thread view heads with its title or *Note*, and an untitled note’s words stand once', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    await openNotes(page)
    await addTripNote(page, 'Pizzakurier: 044 555 01 00, ab 18 Uhr')
    await addTripNote(page, 'Code 4711, links neben der Haustür', 'Schlüsselbox')

    const pizza = await openThread(page, 'Pizzakurier: 044 555 01 00, ab 18 Uhr')
    await expect(page.getByTestId('header-title')).toHaveText('Note')
    await expect(page.getByTestId('header-meta')).toHaveText('Samedan')
    await expect(pizza.getByTestId(/^note-entry-words-/)).toHaveText(
      'Pizzakurier: 044 555 01 00, ab 18 Uhr',
    )
    await expect(page.getByTestId('page-head')).not.toContainText('044 555 01 00')
    await expect(visible(page).getByText('044 555 01 00', { exact: false })).toHaveCount(1)

    await page.getByTestId('header-back').click()
    const box = await openThread(page, 'Schlüsselbox')
    await expect(page.getByTestId('header-title')).toHaveText('Schlüsselbox')
    await expect(page.getByTestId('header-meta')).toHaveText('Samedan')
    await expect(box.getByTestId(/^note-entry-words-/)).toHaveText(
      'Code 4711, links neben der Haustür',
    )
  })
})
