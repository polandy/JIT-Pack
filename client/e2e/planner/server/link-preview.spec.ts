import type { Page, Route } from '@playwright/test'

import { test, expect, createTripViaWizard, fillIonic, writesLanded } from '../../fixtures'
import { WIDE_PNG, WIDE_PNG_WIDTH } from '../../helpers/images'
import { ideaCard, openIdeas } from '../../helpers/m28'
import { uniq } from '../../serverMode'

import { loginAs } from '../../server/fixtures'

/**
 * FR-29.16: a pasted link fills the idea from its page. The page is read by
 * the server, and a test page would be on loopback — exactly the address
 * the server's own policy refuses to fetch (`internal/linkpreview`, where
 * the fetch and that refusal are tested). So the route's answer is planted
 * here, and everything around it is real: the sheet reading the link, the
 * blanks it fills, the picture it offers, and the picture's upload to the
 * server when the idea is saved.
 */

const LINK = 'https://www.oeschinensee.ch/de/sommer'
const PICTURE = 'https://www.oeschinensee.ch/see.jpg'

/**
 * Answers the trip's two preview routes: the page at once, its picture only
 * when the case releases it — so the case can see the words arrive before
 * the picture, which is the point of reading them apart.
 */
async function plantPreview(
  page: Page,
  preview: { title: string; description: string },
): Promise<{ asked: string[]; holdPicture: () => () => void }> {
  const asked: string[] = []
  let gate = Promise.resolve()
  /** Holds the next picture back; the returned function lets it through. */
  const holdPicture = () => {
    let release = () => {}
    gate = new Promise<void>((resolve) => (release = resolve))
    return release
  }
  await page.route('**/api/v1/trips/*/link-preview/image', async (route: Route) => {
    asked.push((route.request().postDataJSON() as { url: string }).url)
    await gate
    await route.fulfill({ json: { image: WIDE_PNG.toString('base64'), image_type: 'image/png' } })
  })
  await page.route('**/api/v1/trips/*/link-preview', async (route: Route) => {
    asked.push((route.request().postDataJSON() as { url: string }).url)
    await route.fulfill({
      json: { title: preview.title, description: preview.description, image_url: PICTURE },
    })
  })
  return { asked, holdPicture }
}

test.describe('Ideas from a link (FR-29.16) @server @planner', () => {
  test.slow()

  /**
   * E2E-M28-09: a link pasted into a new idea's sheet is read — the blank
   * title and note take the page's words while its picture is still held
   * back, then the picture is offered — and the saved idea carries it as
   * its cover. A title typed before the link stays, a picture declined with
   * ✕ is not added, and one still coming when the idea is saved follows it.
   */
  test('E2E-M28-09: a pasted link fills the blanks and brings its picture along', async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    const alice = await loginAs(ctx, 'alice')
    await createTripViaWizard(alice, { name: `Kandersteg ${uniq()}` })
    const board = await openIdeas(alice)
    const { asked, holdPicture } = await plantPreview(alice, {
      title: 'Oeschinensee',
      description: 'Ein Bergsee über Kandersteg',
    })

    let releasePicture = holdPicture()
    await board.getByTestId('m28-fab').click()
    const sheet = alice.getByTestId('idea-edit')
    await fillIonic(sheet.getByTestId('idea-edit-link'), LINK)
    // The words while the picture is still held back: they do not wait for it.
    await expect(sheet.locator('[data-preview="done"]')).toBeVisible()
    await expect(sheet.getByTestId('idea-edit-name').locator('input')).toHaveValue('Oeschinensee')
    await expect(sheet.getByTestId('idea-edit-note').locator('textarea')).toHaveValue(
      'Ein Bergsee über Kandersteg',
    )
    await expect(sheet.getByTestId('idea-edit-preview-picture')).toHaveAttribute(
      'data-coming',
      'true',
    )
    expect(asked).toEqual([LINK, PICTURE])
    releasePicture()
    await expect(sheet.getByTestId('idea-edit-preview-picture').locator('img')).toHaveJSProperty(
      'naturalWidth',
      WIDE_PNG_WIDTH,
    )
    await sheet.getByTestId('idea-edit-save').click()

    const card = ideaCard(alice, 'Oeschinensee')
    await expect(card.locator('[data-testid^="idea-card-cover-"] img')).toHaveJSProperty(
      'naturalWidth',
      WIDE_PNG_WIDTH,
    )
    await writesLanded(alice)

    // A typed title is the writer's, and a declined picture stays behind.
    await board.getByTestId('m28-fab').click()
    await fillIonic(sheet.getByTestId('idea-edit-name'), 'Seerundgang')
    await fillIonic(sheet.getByTestId('idea-edit-link'), `${LINK}/rundweg`)
    await expect(sheet.locator('[data-preview="done"]')).toBeVisible()
    await expect(sheet.getByTestId('idea-edit-name').locator('input')).toHaveValue('Seerundgang')
    await sheet.getByTestId('idea-edit-preview-picture-drop').click()
    await expect(sheet.getByTestId('idea-edit-preview-picture')).toHaveCount(0)
    await sheet.getByTestId('idea-edit-save').click()
    await expect(ideaCard(alice, 'Seerundgang')).toBeVisible()

    // Saved while the picture is still coming: it follows the idea.
    releasePicture = holdPicture()
    await board.getByTestId('m28-fab').click()
    await fillIonic(sheet.getByTestId('idea-edit-link'), `${LINK}/huette`)
    await expect(sheet.getByTestId('idea-edit-preview-picture')).toHaveAttribute(
      'data-coming',
      'true',
    )
    await fillIonic(sheet.getByTestId('idea-edit-name'), 'Hütte')
    await sheet.getByTestId('idea-edit-save').click()
    await expect(ideaCard(alice, 'Hütte')).toBeVisible()
    releasePicture()
    await expect(
      ideaCard(alice, 'Hütte').locator('[data-testid^="idea-card-cover-"] img'),
    ).toHaveJSProperty('naturalWidth', WIDE_PNG_WIDTH)

    // The declined one has none — asserted after the uploads above landed.
    await writesLanded(alice)
    await expect(
      ideaCard(alice, 'Seerundgang').locator('[data-testid^="idea-card-cover-"]'),
    ).toHaveCount(0)

    await ctx.close()
  })
})
