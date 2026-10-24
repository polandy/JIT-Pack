import type { Page, Route } from '@playwright/test'

import { test, expect, createTripViaWizard, fillIonic, writesLanded } from '../../fixtures'
import { WIDE_PNG, WIDE_PNG_WIDTH } from '../../helpers/images'
import { ideaCard, openIdeas } from '../helpers/m28'
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
   * title and description are suggested at their fields — grey in a blank
   * one — and nothing changes until each is confirmed there. The picture is fetched in the
   * background, shown coming in the sheet and then on the saved idea's card,
   * and reaches the idea after the save. Over a typed title the suggestion
   * is a line under the field that changes nothing left alone, and the
   * picture still comes, since the idea has none.
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
    // Suggested at each field — grey in the blank field — and not filled.
    await expect(name).toHaveAttribute('placeholder', 'Oeschinensee')
    await expect(note).toHaveAttribute('placeholder', 'Ein Bergsee über Kandersteg')
    await expect(name).toHaveValue('')
    await expect(note).toHaveValue('')
    // The picture shows itself coming while it is held back.
    await expect(sheet.getByTestId('idea-edit-link-picture')).toHaveAttribute('data-coming', 'true')
    await expect(sheet.getByTestId('idea-edit-save')).toHaveAttribute('aria-disabled', 'true')
    // Each field takes its own half.
    await sheet.getByTestId('idea-edit-name-accept').click()
    await expect(name).toHaveValue('Oeschinensee')
    await expect(note).toHaveValue('')
    await sheet.getByTestId('idea-edit-note-accept').click()
    await expect(note).toHaveValue('Ein Bergsee über Kandersteg')
    await expect(sheet.getByTestId('idea-edit-name-accept')).toHaveCount(0)
    await expect(sheet.getByTestId('idea-edit-note-accept')).toHaveCount(0)

    // Saved while the picture is still held back: it follows the idea.
    await sheet.getByTestId('idea-edit-save').click()
    const card = ideaCard(alice, 'Oeschinensee')
    await expect(card.locator('[data-testid^="idea-card-picture-coming-"]')).toBeVisible()
    expect(asked).toEqual([LINK, PICTURE])
    releasePicture()
    await expect(card.locator('[data-testid^="idea-card-cover-"] img')).toHaveJSProperty(
      'naturalWidth',
      WIDE_PNG_WIDTH,
    )
    await expect(card.locator('[data-testid^="idea-card-picture-coming-"]')).toHaveCount(0)

    // Over a typed title the suggestion is a line under the field, and left
    // alone it changes nothing — the picture still comes.
    await board.getByTestId('m28-fab').click()
    await fillIonic(sheet.getByTestId('idea-edit-name'), 'Seerundgang')
    await fillIonic(sheet.getByTestId('idea-edit-link'), `${LINK}/rundweg`)
    await expect(sheet.getByTestId('idea-edit-name-suggestion')).toHaveText(
      'Suggested: Oeschinensee',
    )
    await expect(name).toHaveValue('Seerundgang')
    await expect(note).toHaveValue('')
    await sheet.getByTestId('idea-edit-save').click()
    await expect(
      ideaCard(alice, 'Seerundgang').locator('[data-testid^="idea-card-cover-"] img'),
    ).toHaveJSProperty('naturalWidth', WIDE_PNG_WIDTH)
    await writesLanded(alice)

    await ctx.close()
  })
  /**
   * E2E-M28-29 (FR-29.22): a further link is read for its page's title too,
   * which stands grey in its blank name until *Übernehmen* keeps it — the
   * first link's left blank, so the detail, which reads no page, names that
   * one by its site. Only the first link brings a picture.
   */
  test('E2E-M28-29: a further link takes its page title as its name, and only the first brings a picture', async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    const alice = await loginAs(ctx, 'alice')
    await createTripViaWizard(alice, { name: `Kandersteg ${uniq()}` })
    const board = await openIdeas(alice)
    const TIMETABLE = 'https://www.sbb.ch/de/fahrplan'
    const titles: Record<string, string> = { [LINK]: 'Oeschinensee', [TIMETABLE]: 'SBB Fahrplan' }
    const pictures: string[] = []
    await alice.route('**/api/v1/trips/*/link-preview/image', async (route: Route) => {
      pictures.push((route.request().postDataJSON() as { url: string }).url)
      await route.fulfill({ json: { image: WIDE_PNG.toString('base64'), image_type: 'image/png' } })
    })
    await alice.route('**/api/v1/trips/*/link-preview', async (route: Route) => {
      const { url } = route.request().postDataJSON() as { url: string }
      await route.fulfill({
        json: { title: titles[url], description: '', image_url: `${url}.jpg` },
      })
    })

    await board.getByTestId('m28-fab').click()
    const sheet = alice.getByTestId('idea-edit')
    await fillIonic(sheet.getByTestId('idea-edit-name'), 'Seerundgang')
    const rows = sheet.getByTestId('idea-edit-link-row')
    await fillIonic(rows.nth(0).getByTestId('idea-edit-link'), LINK)
    await sheet.getByTestId('idea-edit-link-add').click()
    await fillIonic(rows.nth(1).getByTestId('idea-edit-link'), TIMETABLE)
    const first = rows.nth(0).getByTestId('idea-edit-link-label').locator('input')
    const second = rows.nth(1).getByTestId('idea-edit-link-label').locator('input')
    await expect(first).toHaveAttribute('placeholder', 'Oeschinensee')
    await expect(second).toHaveAttribute('placeholder', 'SBB Fahrplan')
    await expect(second).toHaveValue('')
    await rows.nth(1).getByTestId('idea-edit-link-label-accept').click()
    await expect(second).toHaveValue('SBB Fahrplan')
    await expect(rows.nth(1).getByTestId('idea-edit-link-label-accept')).toHaveCount(0)
    await expect(first).toHaveValue('')

    await sheet.getByTestId('idea-edit-save').click()
    const card = ideaCard(alice, 'Seerundgang')
    await expect(card.locator('[data-testid^="idea-card-cover-"] img')).toHaveJSProperty(
      'naturalWidth',
      WIDE_PNG_WIDTH,
    )
    await expect(card.locator('[data-testid^="idea-card-link-"]')).toHaveText('oeschinensee.ch +1')
    expect(pictures).toEqual([`${LINK}.jpg`])
    await writesLanded(alice)

    await card.click()
    const links = alice.getByTestId('idea-detail-link')
    await expect(links).toHaveCount(2)
    await expect(links.nth(0)).toHaveText('oeschinensee.ch')
    await expect(links.nth(1)).toContainText('SBB Fahrplan')

    await ctx.close()
  })
})
