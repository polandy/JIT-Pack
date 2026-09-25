import { test, expect, visiblePage as visible } from './fixtures'
import { addTripNote, openNotes, threadNamed, tripWithRows } from './helpers/m4'
import { writesLanded } from './helpers/page'

/**
 * M26 — a trip's notes as threads (FR-7.13), on one identity.
 *
 * Local Mode has nobody else to write for, so „new", the tick and the reply
 * push are the server file's (`server/trip-notes.spec.ts`, two real
 * identities). What a single writer can prove is the shape: the view of its
 * own, a thread opened with a title, a reply landing on top inside it and
 * lifting it in the list, the one level, the edit, the sheet's `tel:` link,
 * and the delete that takes the thread.
 */
test.describe('M26 — a trip’s notes as threads (FR-7.13) @local @m26', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M26-01: the notes are a view of their own, reached by their pill,
   * and M25 is one list again. A titled note is named by its title, a quick
   * one by its first line; its sheet links the phone number and keeps the
   * short code plain; deleting the first note takes the thread.
   */
  test('E2E-M26-01: notes have their own view, a thread is named, read in its sheet and deleted', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')

    // M25 no longer holds the notes — asserted on a screen that rendered.
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
    // Own notes: no tick renders (FR-7.9 decision 4) — nor could any in G-8's
    // Local Mode.
    await expect(notes.locator('ion-checkbox')).toHaveCount(0)

    const pizza = threadNamed(notes, 'Pizza 044 555 01 00')
    await pizza.getByTestId(/^note-thread-toggle-/).click()
    await pizza.getByTestId(/^note-entry-open-/).click()
    const sheet = page.getByTestId('note-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByTestId('note-sheet-body').locator('a.tel')).toHaveAttribute(
      'href',
      'tel:0445550100',
    )
    await sheet.getByTestId('note-sheet-remove').click()
    await writesLanded(page)

    await page.reload()
    const after = await openNotes(page)
    await expect(after.getByTestId('note-thread-name')).toHaveText(['Schlüsselbox'])
  })

  /**
   * E2E-M26-02: a reply lands on top inside its thread and lifts the thread
   * in the list (question 1); a reply cannot be replied to — one field per
   * thread, under the first note; the author's ✎ edits in place and the
   * entry says *bearbeitet*; and deleting the first note says how many
   * replies go with it, then takes them.
   */
  test('E2E-M26-02: a reply lands on top and lifts its thread, one level deep, and edits in place', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Samedan')
    await addTripNote(page, 'Code 4711', 'Schlüsselbox')
    await addTripNote(page, 'Fähre um 8')
    const notes = await openNotes(page)
    await expect(notes.getByTestId('note-thread-name')).toHaveText(['Fähre um 8', 'Schlüsselbox'])

    const box = threadNamed(notes, 'Schlüsselbox')
    await box.getByTestId(/^note-thread-toggle-/).click()
    for (const reply of ['Klemmt etwas', 'Parkplatz ist Nr. 12']) {
      await box
        .getByTestId(/^note-thread-reply-input-/)
        .locator('input')
        .fill(reply)
      await box.getByTestId(/^note-thread-reply-send-/).click()
      await expect(box.getByText(reply, { exact: true })).toBeVisible()
    }
    await writesLanded(page)

    // The thread with the reply is on top now, and says how many it holds.
    await expect(notes.getByTestId('note-thread-name')).toHaveText(['Schlüsselbox', 'Fähre um 8'])
    await expect(box.getByTestId('note-thread-meta')).toContainText('2 replies')
    // Inside it: the first note, then the replies newest first.
    await expect(box.getByTestId(/^note-entry-open-/)).toHaveText([
      'Code 4711',
      'Parkplatz ist Nr. 12',
      'Klemmt etwas',
    ])
    // One level: the thread offers one reply field, under its first note.
    await expect(box.getByTestId(/^note-thread-reply-input-/)).toHaveCount(1)

    // The author edits in place, title included.
    await box
      .getByTestId(/^note-entry-edit-/)
      .first()
      .click()
    await box.getByTestId('note-edit-title').locator('input').fill('Schlüsselbox Haus')
    await box.getByTestId('note-edit-body').locator('textarea').fill('Code 4712')
    await box.getByTestId('note-edit-save').click()
    await writesLanded(page)
    await page.reload()

    const reloaded = await openNotes(page)
    const edited = threadNamed(reloaded, 'Schlüsselbox Haus')
    await edited.getByTestId(/^note-thread-toggle-/).click()
    await expect(edited.getByTestId(/^note-entry-open-/).first()).toHaveText('Code 4712')
    await expect(edited.getByTestId(/^note-entry-meta-/).first()).toContainText('edited')

    // Deleting the first note names its replies, and takes them.
    await edited
      .getByTestId(/^note-entry-open-/)
      .first()
      .click()
    const remove = page.getByTestId('note-sheet').getByTestId('note-sheet-remove')
    await expect(remove).toHaveText(/Delete note, with 2 replies/)
    await remove.click()
    await writesLanded(page)
    await page.reload()
    const after = await openNotes(page)
    await expect(after.getByTestId('note-thread-name')).toHaveText(['Fähre um 8'])
    await expect(after.getByText('Parkplatz ist Nr. 12')).toHaveCount(0)
  })
})
