import { readFile } from 'node:fs/promises'

import { test, expect, createTripViaWizard, visiblePage as visible } from './fixtures'
import {
  addExcursionTrack,
  createExcursion,
  excursionMenu,
  excursionTrackRows,
  openExcursions,
} from './helpers/m27'
import {
  dragHandle,
  gpxFile,
  routeEditor,
  routeSettled,
  stubRouting,
  stubTiles,
  tapMap,
  trackViewer,
} from './helpers/m28'
import { writesLanded } from './helpers/page'

/**
 * M27 — GPX tracks on an excursion (FR-31.15, ADR-089), in Local Mode: an
 * idea's tracks, as quiet lines under the excursion's notes. The file is read
 * on the device in every mode; across identities, and the server's routes,
 * are `TestExcursionTrack_*`'s.
 *
 * The tiles and the router are answered on the device (`stubTiles`,
 * `stubRouting`), so no case reaches swisstopo, OpenStreetMap or BRouter.
 */

const TRIP = { name: 'Oberland Ausflüge', endDate: '2026-12-31', travelers: ['Andy'] }

/**
 * 3.3 km due north, 300 m up: hiked 1 h 25 (`tracks.spec.ts` derives it).
 */
const CLIMB = gpxFile(
  [
    [46.5, 7.7, 1000],
    [46.51, 7.7, 1100],
    [46.52, 7.7, 1200],
    [46.53, 7.7, 1300],
  ],
  { name: 'Aufstieg zur Alp' },
)

/** In Tuscany, without heights, ridden. */
const PIENZA = gpxFile(
  [
    [43.0766, 11.6789],
    [43.064, 11.695],
    [43.0645, 11.7182],
  ],
  { name: 'Pienza – Monticchiello', type: 'cycling' },
)

test.describe('M27 — an excursion’s GPX tracks (FR-31.15) @local @m27', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await stubTiles(page)
    await createTripViaWizard(page, TRIP)
    await openExcursions(page)
    await createExcursion(page, { name: 'Oeschinensee' })
  })

  /**
   * E2E-M27-15: a GPX file from the excursion's ⋮ becomes a line on its
   * route card, above the packing list — its kind, name, distance, climb and time — and M27's list says
   * the first one's distance and climb, with how many more. The line opens
   * the full-screen map on that track; there its time takes the pauses set
   * by hand, and its ⋮ renames, downloads and removes it (confirmed). A
   * sixth track is refused before a file is asked for.
   */
  test('E2E-M27-15: a track on an excursion is a line that opens its map, and its ⋮ works there', async ({
    page,
  }) => {
    await expect(excursionTrackRows(page)).toHaveCount(0)
    await addExcursionTrack(page, 'aufstieg.gpx', CLIMB)
    await addExcursionTrack(page, 'pienza.gpx', PIENZA)

    // The route comes first: its card stands above the progress card.
    const card = visible(page).getByTestId('track-summary')
    const progress = visible(page).getByTestId('m27-progress-card')
    expect((await card.boundingBox())!.y).toBeLessThan((await progress.boundingBox())!.y)
    await expect(
      card.getByTestId('track-summary-map').locator('svg path, path.jp-track-line'),
    ).not.toHaveCount(0)

    await card.getByTestId('track-summary-open').click()
    await expect(trackViewer(page)).toBeVisible()
    await expect(trackViewer(page).getByTestId('track-distance')).toHaveText('3.3 km')
    await trackViewer(page).getByTestId('track-viewer-close').click()
    await expect(trackViewer(page)).toBeHidden()

    const [climb, pienza] = [excursionTrackRows(page).nth(0), excursionTrackRows(page).nth(1)]
    await expect(climb).toContainText('Aufstieg zur Alp')
    await expect(climb).toContainText('3.3 km · ↑ 300 m · 1 h 25')
    await expect(pienza).toContainText('Pienza – Monticchiello')
    // No heights, no climb; a bike tour's own pace.
    await expect(pienza).not.toContainText('↑')

    await climb.click()
    const viewer = trackViewer(page)
    await expect(viewer).toBeVisible()
    await expect(viewer.getByTestId('track-distance')).toHaveText('3.3 km')
    await viewer.getByTestId('track-pause-more').click()
    await viewer.getByTestId('track-pause-more').click()
    await expect(viewer.getByTestId('track-pause')).toHaveText('0 h 30')

    await viewer.getByTestId('track-more').click()
    let sheet = page.locator('ion-action-sheet')
    await sheet.getByTestId('track-rename').click()
    await expect(sheet).toHaveCount(0)
    const prompt = page.getByTestId('track-rename-prompt')
    await prompt.getByRole('textbox', { name: 'name' }).fill('Alpweg')
    await prompt.getByRole('button', { name: 'Save' }).click()
    await expect(viewer.locator('[data-testid^="track-tab-"]').first()).toHaveText('Alpweg')

    const download = page.waitForEvent('download')
    await viewer.getByTestId('track-more').click()
    await page.locator('ion-action-sheet').getByTestId('track-download').click()
    const file = await download
    expect(file.suggestedFilename()).toBe('aufstieg.gpx')
    expect(await readFile((await file.path())!, 'utf8')).toBe(CLIMB)

    await viewer.getByTestId('track-viewer-close').click()
    await expect(viewer).toBeHidden()
    await expect(climb).toContainText('Alpweg')
    await expect(climb).toContainText('3.3 km · ↑ 300 m · 1 h 55')
    await writesLanded(page)

    // Folded for packing: the head alone, its first track's figures, and so after a reload.
    const toggle = visible(page).getByTestId('track-summary-toggle')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(visible(page).getByTestId('track-summary-map')).toHaveCount(0)
    await expect(excursionTrackRows(page)).toHaveCount(0)
    await expect(visible(page).getByTestId('track-summary-folded')).toHaveText(
      '3.3 km · ↑ 300 m · +1',
    )
    await writesLanded(page)
    await page.reload()
    await expect(visible(page).getByTestId('track-summary-folded')).toBeVisible()
    await visible(page).getByTestId('track-summary-toggle').click()

    // Kept.
    await page.reload()
    await expect(excursionTrackRows(page)).toHaveCount(2)
    await expect(excursionTrackRows(page).first()).toContainText('Alpweg')

    for (const name of ['c', 'd', 'e']) {
      await addExcursionTrack(page, `${name}.gpx`, CLIMB.replace('Aufstieg', name))
    }
    let asked = false
    page.on('filechooser', () => (asked = true))
    await excursionMenu(page, 'm27-track-add')
    await expect(page.locator('ion-toast').filter({ hasText: '5 tracks already' })).toBeVisible()
    expect(asked).toBe(false)

    await excursionTrackRows(page).nth(1).click()
    await expect(viewer).toBeVisible()
    await viewer.getByTestId('track-more').click()
    sheet = page.locator('ion-action-sheet')
    await sheet.getByTestId('track-remove').click()
    await page
      .getByTestId('track-remove-confirm')
      .getByRole('button', { name: 'Remove track' })
      .click()
    await expect(viewer).toBeHidden()
    await expect(excursionTrackRows(page)).toHaveCount(4)
    await expect(visible(page)).not.toContainText('Pienza – Monticchiello')

    // The list sums them up: the first one's figures, and how many more.
    await page.goBack()
    await expect(visible(page).getByTestId('m27-tracks-Oeschinensee')).toHaveText(
      '3.3 km · ↑ 300 m · +3',
    )
  })

  /**
   * E2E-M27-16: a route is drawn from the excursion's ⋮ along paths and
   * saved as its first track; *Bearbeiten* on the full-screen map opens the
   * editor on that track's own file, and a moved point saved as a new track
   * stands beside it.
   */
  test('E2E-M27-16: a route is drawn and edited on an excursion', async ({ page }) => {
    const asked = await stubRouting(page)

    await excursionMenu(page, 'm27-track-draw')
    const editor = routeEditor(page)
    await expect(editor).toBeVisible()
    await tapMap(editor, 0.3, 0.3)
    await routeSettled(editor, 1)
    await tapMap(editor, 0.6, 0.5)
    await routeSettled(editor, 2)
    expect(asked.paths.map((path) => path.profile)).toEqual(['hiking-mountain'])
    await editor.getByTestId('route-done').click()
    const save = editor.getByTestId('route-save')
    await expect(save.getByTestId('route-save-replace')).toHaveCount(0)
    await save.getByTestId('route-save-name').fill('Seeweg')
    await save.getByTestId('route-save-new').click()
    await expect(editor).toBeHidden()
    await expect(excursionTrackRows(page)).toHaveCount(1)
    await expect(excursionTrackRows(page).first()).toContainText('Seeweg')
    await expect(excursionTrackRows(page).first()).toContainText('↑ 150 m')

    await excursionTrackRows(page).first().click()
    const viewer = trackViewer(page)
    await viewer.getByTestId('track-viewer-edit').click()
    await expect(viewer).toBeHidden()
    // The file's own points: the drawn path's start, its bend and its end.
    await routeSettled(editor, 3)
    await dragHandle(editor, 1, 60, 0)
    await routeSettled(editor, 3)
    await editor.getByTestId('route-done').click()
    await expect(save.getByTestId('route-save-name')).toHaveValue('Seeweg (variant)')
    await save.getByTestId('route-save-new').click()
    await expect(editor).toBeHidden()
    await expect(excursionTrackRows(page)).toHaveCount(2)
    await expect(excursionTrackRows(page).nth(1)).toContainText('Seeweg (variant)')
  })
})
