import type { Page, Route } from '@playwright/test'

import { test, expect, createTripViaWizard, fillIonic, writesLanded } from '../../fixtures'
import { WIDE_PNG, WIDE_PNG_WIDTH } from '../../helpers/images'
import { ideaCard, openIdeas } from '../../helpers/m28'
import { uniq } from '../../serverMode'

import { loginAs } from '../../server/fixtures'

/**
 * FR-29.16: a pasted link suggests the idea's words and brings its picture.
 * The page is read by the server, and a test page would be on loopback —
 * exactly the address the server's own policy refuses to fetch
 * (`internal/linkpreview`, where the fetch and that refusal are tested). So
 * the routes' answers are planted here, and everything around them is real:
 * the sheet reading the link, the suggestion and its confirmation, and the
 * picture's background upload to the server after the save. That a picture
 * never replaces one the idea already has is `planner/__tests__/sync.spec.ts`.
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
   * E2E-M28-09: a link pasted into a new idea's sheet is read, and the page's
   * title and description come as a suggestion — nothing changes until it is
   * confirmed. The picture is fetched in the background and reaches the idea
   * after it was saved. A suggestion dismissed leaves the typed title, and
   * the picture still comes, since the idea has none.
   */
  test('E2E-M28-09: a link suggests its words, and its picture follows the saved idea', async ({
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

    const releasePicture = holdPicture()
    await board.getByTestId('m28-fab').click()
    const sheet = alice.getByTestId('idea-edit')
    const name = sheet.getByTestId('idea-edit-name').locator('input')
    const note = sheet.getByTestId('idea-edit-note').locator('textarea')
    await fillIonic(sheet.getByTestId('idea-edit-link'), LINK)
    await expect(sheet.locator('[data-preview="done"]')).toBeVisible()
    const suggestion = sheet.getByTestId('idea-edit-suggestion')
    await expect(suggestion.getByTestId('idea-edit-suggestion-title')).toHaveText('Oeschinensee')
    await expect(suggestion.getByTestId('idea-edit-suggestion-description')).toHaveText(
      'Ein Bergsee über Kandersteg',
    )
    // A suggestion, not a fill: the fields keep the site name and nothing.
    await expect(name).toHaveValue('oeschinensee.ch')
    await expect(note).toHaveValue('')
    await suggestion.getByTestId('idea-edit-suggestion-accept').click()
    await expect(name).toHaveValue('Oeschinensee')
    await expect(note).toHaveValue('Ein Bergsee über Kandersteg')
    await expect(suggestion).toHaveCount(0)

    // Saved while the picture is still held back: it follows the idea.
    await sheet.getByTestId('idea-edit-save').click()
    const card = ideaCard(alice, 'Oeschinensee')
    await expect(card).toBeVisible()
    expect(asked).toEqual([LINK, PICTURE])
    releasePicture()
    await expect(card.locator('[data-testid^="idea-card-cover-"] img')).toHaveJSProperty(
      'naturalWidth',
      WIDE_PNG_WIDTH,
    )

    // Dismissed: the typed title stays — and the picture still comes.
    await board.getByTestId('m28-fab').click()
    await fillIonic(sheet.getByTestId('idea-edit-name'), 'Seerundgang')
    await fillIonic(sheet.getByTestId('idea-edit-link'), `${LINK}/rundweg`)
    await expect(suggestion).toBeVisible()
    await suggestion.getByTestId('idea-edit-suggestion-dismiss').click()
    await expect(suggestion).toHaveCount(0)
    await expect(name).toHaveValue('Seerundgang')
    await expect(note).toHaveValue('')
    await sheet.getByTestId('idea-edit-save').click()
    await expect(
      ideaCard(alice, 'Seerundgang').locator('[data-testid^="idea-card-cover-"] img'),
    ).toHaveJSProperty('naturalWidth', WIDE_PNG_WIDTH)
    await writesLanded(alice)

    await ctx.close()
  })
})
