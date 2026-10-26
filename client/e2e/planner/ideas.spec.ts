import {
  test,
  expect,
  createTripViaWizard,
  fillIonic,
  visiblePage,
  writesLanded,
} from '../fixtures'
import { undoFromSnackbar } from '../helpers/m27'
import { TALL_PNG, TALL_PNG_WIDTH, WIDE_PNG, WIDE_PNG_WIDTH } from '../helpers/images'
import {
  addIdea,
  addPicture,
  ideaCard,
  ideaDetail,
  ideaMenu,
  mosaicPicture,
  moveIdea,
  openIdea,
  openIdeas,
  pictureViewer,
  showSegment,
} from './helpers/m28'

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
   * E2E-M28-28 (FR-29.22, ADR-107): an idea carries several links, each named
   * or not, in an order the grip sets. The third link is dragged to the top
   * and becomes the one *Titel & Bild* is read from; the card shows its site
   * and how many follow, the detail every link as a card in that order — a
   * named one by its name, the others by their site — and the sheet opens
   * again on the same order. A link removed is gone from the detail too.
   */
  test('E2E-M28-28: an idea carries several links, named and ordered by the grip', async ({
    page,
  }) => {
    await openIdeas(page)
    await page.getByTestId('m28-fab').click()
    const sheet = page.getByTestId('idea-edit')
    await fillIonic(sheet.getByTestId('idea-edit-name'), 'Bernina Express')
    const rows = sheet.getByTestId('idea-edit-link-row')
    await expect(rows).toHaveCount(1)
    await expect(sheet.getByTestId('idea-edit-link-grip')).toHaveCount(0)

    await fillIonic(rows.nth(0).getByTestId('idea-edit-link'), 'www.rhb.ch/bernina')
    await sheet.getByTestId('idea-edit-link-add').click()
    await fillIonic(rows.nth(1).getByTestId('idea-edit-link'), 'www.sbb.ch/fahrplan')
    await fillIonic(rows.nth(1).getByTestId('idea-edit-link-label'), 'Fahrplan')
    await sheet.getByTestId('idea-edit-link-add').click()
    await fillIonic(rows.nth(2).getByTestId('idea-edit-link'), 'www.tirano.it')
    await expect(rows.nth(0).getByTestId('idea-edit-link-first')).toBeVisible()

    const list = sheet.locator('[data-drop-target="links"]')
    await expect(list).toHaveAttribute('data-drag', 'idle')
    const grip = rows.nth(2).getByTestId('idea-edit-link-grip')
    await grip.hover()
    const g = (await grip.boundingBox())!
    const top = (await rows.nth(0).boundingBox())!
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    await page.mouse.move(g.x + g.width / 2, g.y - 4, { steps: 3 })
    await expect(list).toHaveAttribute('data-drag', 'dragging')
    await page.mouse.move(top.x + top.width / 2, top.y + 6, { steps: 8 })
    await expect(rows.nth(0)).toHaveClass(/gap-before/)
    await expect(page.locator('[data-drag-ghost] [data-carry-where]')).toHaveText('→ position 1')
    await page.mouse.up()
    await expect(list).toHaveAttribute('data-drag', 'idle')
    await expect(rows.nth(0).getByTestId('idea-edit-link').locator('input')).toHaveValue(
      'www.tirano.it',
    )
    await expect(rows.nth(0).getByTestId('idea-edit-link-first')).toBeVisible()

    await sheet.getByTestId('idea-edit-save').click()
    await expect(sheet.getByTestId('idea-edit-save')).toHaveCount(0)
    const card = ideaCard(page, 'Bernina Express')
    await expect(card.locator('[data-testid^="idea-card-link-"]')).toHaveText('tirano.it +2')
    await writesLanded(page)

    const detail = await openIdea(page, 'Bernina Express')
    const links = detail.getByTestId('idea-detail-link')
    await expect(links).toHaveCount(3)
    await expect(links.nth(0)).toHaveAttribute('href', 'https://www.tirano.it')
    await expect(links.nth(1)).toHaveAttribute('href', 'https://www.rhb.ch/bernina')
    await expect(links.nth(2)).toHaveAttribute('href', 'https://www.sbb.ch/fahrplan')
    await expect(links.nth(2)).toContainText('Fahrplan')
    await expect(links.nth(2)).toContainText('sbb.ch')

    await ideaMenu(page, detail, 'idea-menu-edit')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0).getByTestId('idea-edit-link').locator('input')).toHaveValue(
      'https://www.tirano.it',
    )
    await expect(rows.nth(2).getByTestId('idea-edit-link-label').locator('input')).toHaveValue(
      'Fahrplan',
    )
    await rows.nth(1).getByTestId('idea-edit-link-remove').click()
    await expect(rows).toHaveCount(2)
    await sheet.getByTestId('idea-edit-save').click()
    await expect(sheet.getByTestId('idea-edit-save')).toHaveCount(0)
    await expect(links).toHaveCount(2)
    await expect(links.nth(1)).toHaveAttribute('href', 'https://www.sbb.ch/fahrplan')
    await writesLanded(page)
  })

  /**
   * E2E-M28-02: an idea is moved by hand, and the board follows. The step
   * ahead and *Gemacht* are buttons of the detail's first block — no state
   * segment is left — and the seldom moves sit behind the head's ⋮: it leaves
   * *Ideas* for *Shortlist*, both counts say so, and the snackbar's undo
   * brings it back; ⋮ takes it off the shortlist and drops it, and a dropped
   * idea is taken up again, a done one reopened onto the shortlist. The
   * detail stands on the route (`?idea=`), so the browser's back closes it
   * and leaves the board where it was.
   */
  test('E2E-M28-02: an idea moves on with its first block and back through ⋮, undoably, on the route', async ({
    page,
  }) => {
    const board = await openIdeas(page)
    await addIdea(page, { title: 'Muottas Muragl', tag: 'Hiking' })

    const detail = await openIdea(page, 'Muottas Muragl')
    await expect(page).toHaveURL(/\/ideas\?idea=/)
    await expect(detail).toHaveAttribute('data-state', 'idea')
    await expect(detail.getByTestId('idea-acts')).toBeVisible()
    await expect(detail.locator('[data-testid^="idea-state-"]')).toHaveCount(0)

    await moveIdea(detail, 'idea-act-shortlist', 'shortlisted')
    await expect(board.getByTestId('m28-count-idea')).toHaveText('0')
    await expect(board.getByTestId('m28-count-shortlisted')).toHaveText('1')

    await undoFromSnackbar(page, /Muottas Muragl/)
    await expect(detail).toHaveAttribute('data-state', 'idea')
    await expect(board.getByTestId('m28-count-shortlisted')).toHaveText('0')

    await moveIdea(detail, 'idea-act-shortlist', 'shortlisted')
    await ideaMenu(page, detail, 'idea-menu-unshortlist')
    await expect(detail).toHaveAttribute('data-state', 'idea')
    await expect(board.getByTestId('m28-count-shortlisted')).toHaveText('0')

    await ideaMenu(page, detail, 'idea-menu-drop')
    await expect(detail).toHaveAttribute('data-state', 'dropped')
    await expect(detail.getByTestId('idea-status')).toHaveAttribute('data-state', 'dropped')
    await expect(detail.getByTestId('idea-acts')).toHaveCount(0)
    await expect(board.getByTestId('m28-count-dropped')).toHaveText('1')
    await moveIdea(detail, 'idea-act-reopen', 'idea')

    await moveIdea(detail, 'idea-act-done', 'done')
    await expect(board.getByTestId('m28-count-done')).toHaveText('1')
    await moveIdea(detail, 'idea-act-reopen', 'shortlisted')
    await moveIdea(detail, 'idea-act-done', 'done')

    await page.goBack()
    await expect(ideaDetail(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/ideas$/)
    await expect(board.getByTestId('m28-empty-idea')).toBeVisible()
    await showSegment(page, 'done')
    await expect(ideaCard(page, 'Muottas Muragl')).toBeVisible()
  })

  /**
   * E2E-M28-30 (G-9, ADR-064): on a desktop width the idea is the frame's
   * side panel beside the board, not a sheet over it — so another card is
   * still there to tap, and the panel swaps to it. The panel is driven by
   * `?idea=`: back returns to the idea before, ✕ closes it and the board
   * stays.
   */
  test('E2E-M28-30: on a desktop width an idea is a side panel beside the board', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const board = await openIdeas(page)
    await addIdea(page, { title: 'Muottas Muragl' })
    await addIdea(page, { title: 'Lej da Staz' })
    const boardBefore = await board.elementHandle()

    await ideaCard(page, 'Muottas Muragl').click()
    // Not scoped to the page: the panel is teleported into the frame's
    // second pane, outside `.ion-page`; nor is the modal's count, which an
    // IonModal teleported to the body would escape.
    const panel = page.getByTestId('m28-idea-panel')
    await expect(panel.getByTestId('idea-detail-title')).toHaveText('Muottas Muragl')
    await expect(page.getByTestId('m28-idea-modal')).toHaveCount(0)
    const first = await panel.getByTestId('idea-detail').getAttribute('data-idea')
    await expect(page).toHaveURL(new RegExp(`/ideas\\?idea=${first}$`))

    // Beside, not over: the panel is flush with the window and the board ends
    // where it begins — read as boxes, as E2E-M5-12 does.
    const panelBox = await panel.boundingBox()
    const boardBox = await board.boundingBox()
    const viewport = page.viewportSize()
    if (!panelBox || !boardBox || !viewport) throw new Error('no box to measure')
    expect(Math.round(panelBox.x + panelBox.width)).toBe(viewport.width)
    expect(boardBox.x + boardBox.width).toBeLessThanOrEqual(panelBox.x)

    // The board stays operable: a sheet's backdrop would take this tap.
    await ideaCard(page, 'Lej da Staz').click()
    await expect(panel.getByTestId('idea-detail-title')).toHaveText('Lej da Staz')
    await expect(panel).toHaveCount(1)
    const second = await panel.getByTestId('idea-detail').getAttribute('data-idea')
    expect(second).not.toBe(first)
    await expect(page).toHaveURL(new RegExp(`/ideas\\?idea=${second}$`))
    // The same board throughout, not a second mount of it (E2E-M5-12's reason).
    const boardAfter = await board.elementHandle()
    expect(await boardBefore!.evaluate((before, after) => before === after, boardAfter)).toBe(true)

    await page.goBack()
    await expect(panel.getByTestId('idea-detail-title')).toHaveText('Muottas Muragl')
    await expect(page).toHaveURL(new RegExp(`/ideas\\?idea=${first}$`))

    await panel.getByTestId('idea-detail-close').click()
    await expect(panel).toHaveCount(0)
    await expect(page).toHaveURL(/\/ideas$/)
    await expect(ideaCard(page, 'Muottas Muragl')).toBeVisible()
    await expect(ideaCard(page, 'Lej da Staz')).toBeVisible()
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

    await ideaMenu(page, detail, 'idea-menu-edit')
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

    await ideaMenu(page, detail, 'idea-menu-remove')
    const confirm = page.getByTestId('idea-remove-confirm')
    await expect(confirm).toContainText('Tandemflug')
    await confirm.getByRole('button', { name: /cancel/i }).click()
    await expect(confirm).toBeHidden()
    await expect(ideaCard(page, 'Tandemflug')).toBeVisible()

    detail = ideaDetail(page)
    await ideaMenu(page, detail, 'idea-menu-remove')
    await page
      .getByTestId('idea-remove-confirm')
      .getByRole('button', { name: /delete idea/i })
      .click()
    await expect(ideaCard(page, 'Tandemflug')).toHaveCount(0)
    await expect(board.getByTestId('m28-empty-idea')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m28-page')).toBeVisible()
  })

  /**
   * E2E-M28-07 (FR-29.5): pictures on an idea. The first becomes the card's
   * banner and fills the mosaic; a second shares it and the card counts
   * both. The viewer pages to the second and makes it the cover — the mosaic
   * and the banner follow — and removing a picture is asked first. What the
   * device kept survives a reload, since Local Mode's bytes are IndexedDB's.
   */
  test('E2E-M28-07: pictures fill the banner and the mosaic, change the cover and go when confirmed', async ({
    page,
  }) => {
    await openIdeas(page)
    await addIdea(page, { title: 'Lej da Staz' })
    const card = ideaCard(page, 'Lej da Staz')
    await expect(card.locator('[data-testid^="idea-card-cover-"]')).toHaveCount(0)

    const detail = await openIdea(page, 'Lej da Staz')
    await expect(detail.getByTestId('idea-mosaic')).toHaveCount(0)
    await addPicture(detail, 'wide.png', WIDE_PNG)
    await expect(mosaicPicture(detail, 0)).toHaveJSProperty('naturalWidth', WIDE_PNG_WIDTH)
    await expect(detail.getByTestId('idea-picture-count')).toHaveText('1 of 4')
    await expect(card.locator('[data-testid^="idea-card-cover-"] img')).toHaveJSProperty(
      'naturalWidth',
      WIDE_PNG_WIDTH,
    )
    await expect(card.locator('[data-testid^="idea-card-pictures-"]')).toHaveCount(0)

    await addPicture(detail, 'tall.png', TALL_PNG)
    await expect(detail.getByTestId('idea-mosaic')).toHaveAttribute('data-count', '2')
    await expect(mosaicPicture(detail, 1)).toHaveJSProperty('naturalWidth', TALL_PNG_WIDTH)
    await expect(card.locator('[data-testid^="idea-card-pictures-"]')).toHaveText('2 pictures')

    await detail.getByTestId('idea-mosaic-tile-0').click()
    const viewer = pictureViewer(page)
    await expect(viewer.getByTestId('idea-viewer-count')).toHaveText('Picture 1 of 2')
    await expect(viewer.getByTestId('idea-viewer-cover')).toBeVisible()
    await expect(viewer.getByTestId('idea-viewer-make-cover')).toHaveCount(0)
    await viewer.getByTestId('idea-viewer-next').click()
    await expect(viewer.getByTestId('idea-viewer-count')).toHaveText('Picture 2 of 2')
    await viewer.getByTestId('idea-viewer-make-cover').click()
    // The viewer goes with the picture it moved.
    await expect(viewer.getByTestId('idea-viewer-count')).toHaveText('Picture 1 of 2')
    await expect(viewer.locator('img')).toHaveJSProperty('naturalWidth', TALL_PNG_WIDTH)
    await expect(mosaicPicture(detail, 0)).toHaveJSProperty('naturalWidth', TALL_PNG_WIDTH)
    await expect(card.locator('[data-testid^="idea-card-cover-"] img')).toHaveJSProperty(
      'naturalWidth',
      TALL_PNG_WIDTH,
    )

    await viewer.getByTestId('idea-viewer-remove').click()
    const confirm = page.getByTestId('idea-picture-remove-confirm')
    await confirm.getByRole('button', { name: /cancel/i }).click()
    await expect(confirm).toBeHidden()
    await expect(viewer.getByTestId('idea-viewer-count')).toHaveText('Picture 1 of 2')
    await viewer.getByTestId('idea-viewer-remove').click()
    await page
      .getByTestId('idea-picture-remove-confirm')
      .getByRole('button', { name: /remove picture/i })
      .click()
    await expect(viewer.getByTestId('idea-viewer-count')).toHaveText('Picture 1 of 1')
    await expect(viewer.locator('img')).toHaveJSProperty('naturalWidth', WIDE_PNG_WIDTH)
    await viewer.getByTestId('idea-viewer-close').click()
    await expect(viewer).toBeHidden()
    await expect(detail.getByTestId('idea-mosaic')).toHaveAttribute('data-count', '1')

    await writesLanded(page)
    await page.reload()
    await openIdeas(page)
    await expect(
      ideaCard(page, 'Lej da Staz').locator('[data-testid^="idea-card-cover-"] img'),
    ).toHaveJSProperty('naturalWidth', WIDE_PNG_WIDTH)
  })

  /**
   * E2E-M28-10 (FR-29.16): a pasted link suggests its site as the title —
   * grey in the blank field — which takes one tap to confirm — nothing is filled without it — and the
   * idea is then saved under the site's name. Local Mode has no preview, so
   * the sheet shows no read starting: it stays idle rather than flickering
   * through one that cannot happen.
   */
  test('E2E-M28-10: a pasted link suggests its site as the title, confirmed in one tap, no read shown', async ({
    page,
  }) => {
    const board = await openIdeas(page)
    await board.getByTestId('m28-fab').click()
    const sheet = page.getByTestId('idea-edit')
    const name = sheet.getByTestId('idea-edit-name').locator('input')
    await fillIonic(sheet.getByTestId('idea-edit-link'), 'https://www.oeschinensee.ch/de/sommer')

    await expect(name).toHaveAttribute('placeholder', 'oeschinensee.ch')
    await expect(name).toHaveValue('')
    await expect(sheet.getByTestId('idea-edit-save')).toHaveAttribute('aria-disabled', 'true')
    await expect(sheet.locator('[data-preview]')).toHaveAttribute('data-preview', 'idle')
    await expect(sheet.getByTestId('idea-edit-preview-loading')).toHaveCount(0)

    await sheet.getByTestId('idea-edit-name-accept').click()
    await expect(name).toHaveValue('oeschinensee.ch')
    await sheet.getByTestId('idea-edit-save').click()
    await expect(ideaCard(page, 'oeschinensee.ch')).toBeVisible()
  })
})
