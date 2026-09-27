import {
  test,
  expect,
  createTripViaWizard,
  fillIonic,
  visiblePage,
  writesLanded,
} from '../fixtures'
import { undoFromSnackbar } from '../helpers/m27'
import { addIdea, ideaCard, ideaDetail, openIdea, openIdeas, showSegment } from '../helpers/m28'

/**
 * M28 — a trip's ideas (UI-Test-Spec §28, §3.29 FR-29.1–29.6, FR-29.10,
 * FR-29.12). The planner is a module of its own (FR-29.9); its cases live in
 * this directory.
 *
 * Local Mode throughout: every rule here runs in the browser. Local Mode has
 * one person on the device, so it is also where the votes, the vote order
 * and the authors are absent (G-8) — the votes themselves are the server
 * case's (`server/votes.spec.ts`).
 */

const TRIP = { name: 'Engadin Ideen', endDate: '2026-12-31', travelers: ['Andy'] }

test.describe('M28 ideas @local @planner', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await createTripViaWizard(page, TRIP)
  })

  /**
   * E2E-M28-01: an empty board says what belongs on it. An idea is written
   * through the ＋ with a bare address, a tag and the rain mark; its card
   * shows all three — the address read as a site — and the switcher's pill
   * counts it. A link that is not a web link keeps the sheet from writing.
   */
  test('E2E-M28-01: an idea is written with its link, tag and rain mark, and counted on the pill', async ({
    page,
  }) => {
    const board = await openIdeas(page)
    await expect(board.getByTestId('m28-empty-idea')).toBeVisible()
    await expect(page.getByTestId('trip-view-ideas')).toHaveAccessibleName('Ideas')

    await board.getByTestId('m28-fab').click()
    const sheet = page.getByTestId('idea-edit')
    await fillIonic(sheet.getByTestId('idea-edit-name'), 'Segantini-Museum')
    await fillIonic(sheet.getByTestId('idea-edit-link'), 'javascript:alert(1)')
    await expect(sheet.getByTestId('idea-edit-link-invalid')).toBeVisible()
    await expect(sheet.getByTestId('idea-edit-save')).toHaveAttribute('aria-disabled', 'true')
    await sheet.getByTestId('idea-edit-close').click()
    await expect(page.getByTestId('idea-edit-save')).toHaveCount(0)

    await addIdea(page, {
      title: 'Segantini-Museum',
      link: 'www.segantini-museum.ch',
      tag: 'Culture',
      rainProof: true,
    })
    const card = ideaCard(page, 'Segantini-Museum')
    await expect(card.locator('[data-testid^="idea-card-tag-"]')).toHaveText('Culture')
    await expect(card.locator('[data-testid^="idea-card-rain-"]')).toBeVisible()
    await expect(card.locator('[data-testid^="idea-card-link-"]')).toHaveText('segantini-museum.ch')
    await expect(board.getByTestId('m28-count-idea')).toHaveText('1')
    await expect(page.getByTestId('trip-view-ideas')).toHaveAccessibleName('Ideas (1)')
    await writesLanded(page)

    // The address was stored as a web link, opened outside the app.
    const detail = await openIdea(page, 'Segantini-Museum')
    const link = detail.getByTestId('idea-detail-link')
    await expect(link).toHaveAttribute('href', 'https://www.segantini-museum.ch')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  /**
   * E2E-M28-02: an idea is moved by hand, and the board follows — it leaves
   * *Ideas* for *Shortlist*, both counts say so, and the snackbar's undo
   * brings it back. The detail stands on the route (`?idea=`), so the
   * browser's back closes it and leaves the board where it was.
   */
  test('E2E-M28-02: an idea moves between the four segments by hand, undoably, on the route', async ({
    page,
  }) => {
    const board = await openIdeas(page)
    await addIdea(page, { title: 'Muottas Muragl', tag: 'Hiking' })

    const detail = await openIdea(page, 'Muottas Muragl')
    await expect(page).toHaveURL(/\/ideas\?idea=/)
    await expect(detail.getByTestId('idea-state-idea')).toHaveAttribute('aria-pressed', 'true')
    await detail.getByTestId('idea-state-shortlisted').click()
    await expect(detail.getByTestId('idea-state-shortlisted')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(board.getByTestId('m28-count-idea')).toHaveText('0')
    await expect(board.getByTestId('m28-count-shortlisted')).toHaveText('1')

    await undoFromSnackbar(page, /Muottas Muragl/)
    await expect(detail.getByTestId('idea-state-idea')).toHaveAttribute('aria-pressed', 'true')
    await expect(board.getByTestId('m28-count-shortlisted')).toHaveText('0')

    await detail.getByTestId('idea-state-done').click()
    await expect(board.getByTestId('m28-count-done')).toHaveText('1')

    await page.goBack()
    await expect(ideaDetail(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/ideas$/)
    await expect(board.getByTestId('m28-empty-idea')).toBeVisible()
    await showSegment(page, 'done')
    await expect(ideaCard(page, 'Muottas Muragl')).toBeVisible()
  })

  /**
   * E2E-M28-03: the idea's discussion — a word written in the detail is
   * counted on its card, its writer edits it in place (marked *edited*) and
   * takes it back through its menu. An edit of the idea changes what the
   * card shows.
   */
  test('E2E-M28-03: an idea is discussed and edited, and its card says so', async ({ page }) => {
    await openIdeas(page)
    await addIdea(page, { title: 'Capuns probieren', tag: 'Food' })

    const detail = await openIdea(page, 'Capuns probieren')
    await fillIonic(detail.getByTestId('idea-comment-input'), 'Im Gasthaus Staz')
    await detail.getByTestId('idea-comment-send').click()
    const word = detail
      .locator('[data-testid^="idea-comment-"]')
      .filter({ hasText: 'Im Gasthaus Staz' })
    await expect(word).toBeVisible()
    await expect(
      ideaCard(page, 'Capuns probieren').locator('[data-testid^="idea-card-comments-"]'),
    ).toHaveText('1')

    // The writer edits their words in place; the entry then says it was edited.
    await word.click()
    await page.getByTestId('idea-comment-menu-edit').click()
    await expect(page.locator('ion-action-sheet')).toHaveCount(0)
    await detail
      .getByTestId('idea-comment-edit-body')
      .locator('textarea')
      .fill('Im Gasthaus Staz, Montag zu')
    await detail.getByTestId('idea-comment-edit-save').click()
    const edited = detail
      .locator('[data-testid^="idea-comment-"]')
      .filter({ hasText: 'Im Gasthaus Staz, Montag zu' })
    await expect(edited.locator('[data-testid^="idea-comment-meta-"]')).toContainText('edited')

    await edited.click()
    await page.getByTestId('idea-comment-menu-remove').click()
    await expect(edited).toHaveCount(0)
    await expect(
      ideaCard(page, 'Capuns probieren').locator('[data-testid^="idea-card-comments-"]'),
    ).toHaveCount(0)

    await detail.getByTestId('idea-detail-edit').click()
    const sheet = page.getByTestId('idea-edit')
    await expect(sheet.getByTestId('idea-edit-name').locator('input')).toHaveValue(
      'Capuns probieren',
    )
    await fillIonic(sheet.getByTestId('idea-edit-name'), 'Capuns in Bever')
    await sheet.getByTestId('idea-edit-save').click()
    await expect(ideaCard(page, 'Capuns in Bever')).toBeVisible()
    await expect(ideaCard(page, 'Capuns probieren')).toHaveCount(0)
  })

  /**
   * E2E-M28-04 (FR-29.10/29.12): the chips offer only what the segment
   * carries, a tag narrows the board to its ideas, the rain chip to what
   * suits a wet day, and *All* shows the segment whole again.
   */
  test('E2E-M28-04: the chips narrow the board to a tag or to a rainy day', async ({ page }) => {
    const board = await openIdeas(page)
    await addIdea(page, { title: 'Lej da Staz', tag: 'Swimming' })
    await addIdea(page, { title: 'Nationalparkzentrum', tag: 'Culture', rainProof: true })
    await addIdea(page, { title: 'Bernina Express', tag: 'Outing', rainProof: true })

    await expect(board.locator('[data-testid^="m28-chip-tag-"]')).toHaveText([
      'Swimming',
      'Culture',
      'Outing',
    ])
    await expect(board.getByTestId('m28-chip-tag-hiking')).toHaveCount(0)

    await board.getByTestId('m28-chip-tag-culture').click()
    await expect(board.locator('[data-testid^="idea-card-"][data-state]')).toHaveCount(1)
    await expect(ideaCard(page, 'Nationalparkzentrum')).toBeVisible()

    await board.getByTestId('m28-chip-all').click()
    await board.getByTestId('m28-chip-rain').click()
    await expect(board.locator('[data-testid^="idea-card-"][data-state]')).toHaveCount(2)
    await expect(ideaCard(page, 'Lej da Staz')).toHaveCount(0)

    await board.getByTestId('m28-chip-all').click()
    await expect(board.locator('[data-testid^="idea-card-"][data-state]')).toHaveCount(3)
  })

  /**
   * E2E-M28-05: deleting is asked first — declined, the idea stays — and
   * once confirmed the idea is gone. Local Mode has nobody else to vote, so
   * the open idea offers no votes and names no author (G-8).
   */
  test('E2E-M28-05: an idea is deleted only when confirmed; alone on the device it shows no votes', async ({
    page,
  }) => {
    const board = await openIdeas(page)
    await addIdea(page, { title: 'Tandemflug' })

    let detail = await openIdea(page, 'Tandemflug')
    await expect(detail.getByTestId('idea-discussion')).toBeVisible()
    await expect(detail.getByTestId('idea-vote-up')).toHaveCount(0)
    await expect(detail.getByTestId('idea-detail-meta')).not.toContainText('Andy')
    await expect(
      ideaCard(page, 'Tandemflug').locator('[data-testid^="idea-card-up-"]'),
    ).toHaveCount(0)

    await detail.getByTestId('idea-detail-remove').click()
    const confirm = page.getByTestId('idea-remove-confirm')
    await expect(confirm).toContainText('Tandemflug')
    await confirm.getByRole('button', { name: /cancel/i }).click()
    await expect(confirm).toBeHidden()
    await expect(ideaCard(page, 'Tandemflug')).toBeVisible()

    detail = ideaDetail(page)
    await detail.getByTestId('idea-detail-remove').click()
    await page
      .getByTestId('idea-remove-confirm')
      .getByRole('button', { name: /delete idea/i })
      .click()
    await expect(ideaCard(page, 'Tandemflug')).toHaveCount(0)
    await expect(board.getByTestId('m28-empty-idea')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m28-page')).toBeVisible()
  })
})
