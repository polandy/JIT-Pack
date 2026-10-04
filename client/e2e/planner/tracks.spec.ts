import { readFile } from 'node:fs/promises'

import { test, expect, createTripViaWizard, writesLanded } from '../fixtures'
import {
  addIdea,
  addTrack,
  gpxFile,
  ideaCard,
  openIdea,
  openIdeas,
  stubTiles,
  tilesFrom,
  trackAction,
  trackViewer,
} from '../helpers/m28'

/**
 * M28 — GPX tracks on an idea (UI-Test-Spec §28, FR-29.17, ADR-085). Local
 * Mode throughout: the file is read on the device in every mode, and here it
 * is also kept there. Across identities is `server/tracks.spec.ts`'s.
 *
 * The tiles are answered on the device (`stubTiles`), so no case reaches
 * swisstopo or OpenStreetMap; a tile drawn from one is the signal a map drew.
 */

const TRIP = { name: 'Oberland Tracks', endDate: '2026-12-31', travelers: ['Andy'] }

/**
 * 3.3 km due north at 7.70° E, 300 m up in three even steps: hiked it is
 * 0.79 h on the flat and 1 h up, so 1 h + 0.79 / 2 = 1 h 25.
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

/** In Tuscany, outside the Landeskarte's bounds, and without heights. */
const PIENZA = gpxFile(
  [
    [43.0766, 11.6789],
    [43.064, 11.695],
    [43.0645, 11.7182],
  ],
  { name: 'Pienza – Monticchiello', type: 'cycling' },
)

test.describe('M28 GPX tracks @local @planner', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await stubTiles(page)
    await createTripViaWizard(page, TRIP)
  })

  /**
   * E2E-M28-12: a GPX file becomes a track — its four figures, the time a
   * hike takes and what *Mit Kind*, a bike and the pauses make of it — and
   * the board's card shows its line and its distance. Every setting is
   * written at once and is still there after a reload.
   */
  test('E2E-M28-12: a track shows its figures and its time, set by hand, and stays', async ({
    page,
  }) => {
    await openIdeas(page)
    await addIdea(page, { title: 'Alp' })
    const detail = await openIdea(page, 'Alp')
    await expect(detail.getByTestId('track-card')).toHaveCount(0)

    await addTrack(detail, 'aufstieg.gpx', CLIMB)
    const card = detail.getByTestId('track-card')
    await expect(detail.getByTestId('idea-track-count')).toHaveText('1 of 5')
    await expect(card.locator('[data-testid^="track-tab-"]')).toHaveText('Aufstieg zur Alp')
    await expect(card.getByTestId('track-distance')).toHaveText('3.3 km')
    await expect(card.getByTestId('track-ascent')).toHaveText('↑ 300 m')
    await expect(card.getByTestId('track-descent')).toHaveText('↓ 0 m')
    // The engine's ICU picks the Swiss group mark: WebKit's writes ’, Chromium's '.
    await expect(card.getByTestId('track-highest')).toHaveText(/^1['’]300 m$/)
    await expect(card.getByTestId('track-file')).toHaveText('aufstieg.gpx · 4 points')
    await expect(card.getByTestId('track-kind-hike')).toHaveAttribute('aria-pressed', 'true')
    await expect(card.getByTestId('track-moving')).toHaveText('1 h 25')
    await expect(card.getByTestId('track-pause')).toHaveText('0 h 00')
    await expect(card.getByTestId('track-pause-less')).toBeDisabled()
    await expect(card.getByTestId('track-total')).toHaveText('1 h 25')
    await expect(card.getByTestId('track-pace')).toHaveText('The Swiss hiking trails’ formula')

    // A child's pace: 1.5 h up, 1.11 h on the flat → 2 h 05.
    await card.getByTestId('track-kid').click()
    await expect(card.getByTestId('track-kid')).toHaveAttribute('aria-pressed', 'true')
    await expect(card.getByTestId('track-moving')).toHaveText('2 h 05')
    await card.getByTestId('track-pause-more').click()
    await expect(card.getByTestId('track-pause')).toHaveText('0 h 15')
    await expect(card.getByTestId('track-total')).toHaveText('2 h 20')

    // By bike with the child: 3.3 km / 12 + 300 m / 350 → 1 h 10.
    await card.getByTestId('track-kind-bike').click()
    await expect(card.getByTestId('track-moving')).toHaveText('1 h 10')
    await expect(card.getByTestId('track-pace')).toHaveText(/12 km\/h on the flat, 350 m/)

    const boardCard = ideaCard(page, 'Alp')
    await expect(boardCard.locator('[data-testid^="idea-card-trace-"] svg path')).not.toHaveCount(0)
    await expect(boardCard.locator('[data-testid^="idea-card-track-"]')).toHaveText(
      '3.3 km · ↑ 300 m',
    )

    await writesLanded(page)
    await page.reload()
    await openIdeas(page)
    await expect(ideaCard(page, 'Alp').locator('[data-testid^="idea-card-track-"]')).toHaveText(
      '3.3 km · ↑ 300 m',
    )
    const again = (await openIdea(page, 'Alp')).getByTestId('track-card')
    await expect(again.getByTestId('track-kind-bike')).toHaveAttribute('aria-pressed', 'true')
    await expect(again.getByTestId('track-kid')).toHaveAttribute('aria-pressed', 'true')
    await expect(again.getByTestId('track-pause')).toHaveText('0 h 15')
    await expect(again.getByTestId('track-total')).toHaveText('1 h 25')
  })

  /**
   * E2E-M28-14: an idea's tracks share one map. A new track is the chosen
   * one; a track outside Switzerland puts the map on OpenStreetMap and
   * keeps the Landeskarte from being chosen, and without it the map is the
   * Landeskarte again. The full-screen map switches between the two, and
   * offline every map is the lines alone.
   */
  test('E2E-M28-14: several tracks share a map, its source follows them, and offline it is the lines', async ({
    page,
    context,
  }) => {
    await openIdeas(page)
    await addIdea(page, { title: 'Zwei Länder' })
    const detail = await openIdea(page, 'Zwei Länder')
    await addTrack(detail, 'aufstieg.gpx', CLIMB)
    const card = detail.getByTestId('track-card')
    await expect(tilesFrom(card.getByTestId('track-map'), 'swisstopo').first()).toBeAttached()
    await expect(card.getByTestId('track-map')).toHaveAttribute('data-source', 'swisstopo')
    await expect(card.getByTestId('track-map')).toHaveAttribute('data-tiles', 'on')

    await addTrack(detail, 'pienza.gpx', PIENZA)
    const tabs = card.locator('[data-testid^="track-tab-"]')
    await expect(tabs).toHaveText(['Aufstieg zur Alp', 'Pienza – Monticchiello'])
    await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true')
    // The file said cycling, and has no heights.
    await expect(card.getByTestId('track-kind-bike')).toHaveAttribute('aria-pressed', 'true')
    await expect(card.getByTestId('track-ascent')).toHaveText('–')
    await expect(card.getByTestId('track-map')).toHaveAttribute('data-source', 'osm')
    await tabs.nth(0).click()
    await expect(card.getByTestId('track-distance')).toHaveText('3.3 km')

    await card.getByTestId('track-map-open').click()
    const viewer = trackViewer(page)
    await expect(tilesFrom(viewer.getByTestId('track-viewer-map'), 'osm').first()).toBeAttached()
    await expect(viewer.getByTestId('track-source-osm')).toHaveAttribute('aria-pressed', 'true')
    await expect(viewer.getByTestId('track-source-swisstopo')).toBeDisabled()
    await expect(viewer.getByTestId('track-distance')).toHaveText('3.3 km')
    await viewer.locator('[data-testid^="track-tab-"]').nth(1).click()
    await expect(viewer.getByTestId('track-ascent')).toHaveText('–')
    await viewer.getByTestId('track-viewer-close').click()
    await expect(viewer).toBeHidden()
    // The viewer's choice is the card's.
    await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true')

    await trackAction(card, 'remove')
    await page
      .getByTestId('track-remove-confirm')
      .getByRole('button', { name: 'Remove track' })
      .click()
    await expect(tabs).toHaveText(['Aufstieg zur Alp'])
    await expect(card.getByTestId('track-map')).toHaveAttribute('data-source', 'swisstopo')

    await card.getByTestId('track-map-open').click()
    await expect(viewer.getByTestId('track-source-swisstopo')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(
      tilesFrom(viewer.getByTestId('track-viewer-map'), 'swisstopo').first(),
    ).toBeAttached()
    await viewer.getByTestId('track-source-osm').click()
    await expect(tilesFrom(viewer.getByTestId('track-viewer-map'), 'osm').first()).toBeAttached()
    await expect(tilesFrom(viewer.getByTestId('track-viewer-map'), 'swisstopo')).toHaveCount(0)
    await expect(viewer.getByTestId('track-viewer-map')).toHaveAttribute('data-source', 'osm')
    await viewer.getByTestId('track-viewer-close').click()
    await expect(viewer).toBeHidden()

    await context.setOffline(true)
    await expect(card.getByTestId('track-map')).toHaveAttribute('data-tiles', 'offline')
    await expect(card.getByTestId('track-map-offline')).toHaveText('Map offline')
    await expect(card.getByTestId('track-map').locator('svg path.line')).toHaveCount(1)
    await context.setOffline(false)
    await expect(card.getByTestId('track-map')).toHaveAttribute('data-tiles', 'on')
  })

  /**
   * E2E-M28-15: what ⋮ does to a track — renamed, downloaded as it was
   * given, replaced by another file with what was set kept, and removed only
   * when confirmed — and the files that are no track, refused with nothing
   * kept.
   */
  test('E2E-M28-15: a track is renamed, downloaded, replaced and removed; no track is no track', async ({
    page,
  }) => {
    await openIdeas(page)
    await addIdea(page, { title: 'Alp' })
    const detail = await openIdea(page, 'Alp')

    await detail.getByTestId('idea-track-file').setInputFiles({
      name: 'orte.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from('<gpx><wpt lat="46.5" lon="7.7"/></gpx>'),
    })
    await expect(
      page.locator('ion-toast').filter({ hasText: 'There is no track in this file.' }),
    ).toBeVisible()
    await expect(detail.getByTestId('track-card')).toHaveCount(0)

    await addTrack(detail, 'aufstieg.gpx', CLIMB)
    const card = detail.getByTestId('track-card')
    await card.getByTestId('track-pause-more').click()
    await expect(card.getByTestId('track-pause')).toHaveText('0 h 15')

    await trackAction(card, 'rename')
    const prompt = page.getByTestId('track-rename-prompt')
    await prompt.getByRole('textbox', { name: 'name' }).fill('Alpweg')
    await prompt.getByRole('button', { name: 'Save' }).click()
    await expect(card.locator('[data-testid^="track-tab-"]')).toHaveText('Alpweg')

    const download = page.waitForEvent('download')
    await trackAction(card, 'download')
    const file = await download
    expect(file.suggestedFilename()).toBe('aufstieg.gpx')
    expect(await readFile((await file.path())!, 'utf8')).toBe(CLIMB)

    // Half the climb, the same name, kind and pauses.
    const chooser = page.waitForEvent('filechooser')
    await trackAction(card, 'replace')
    await (
      await chooser
    ).setFiles({
      name: 'kurz.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(
        gpxFile([
          [46.5, 7.7, 1000],
          [46.51, 7.7, 1150],
        ]),
      ),
    })
    await expect(card.getByTestId('track-file')).toHaveText('kurz.gpx · 2 points')
    await expect(card.getByTestId('track-ascent')).toHaveText('↑ 150 m')
    await expect(card.locator('[data-testid^="track-tab-"]')).toHaveText('Alpweg')
    await expect(card.getByTestId('track-pause')).toHaveText('0 h 15')
    await expect(detail.getByTestId('idea-track-count')).toHaveText('1 of 5')

    await trackAction(card, 'remove')
    const confirm = page.getByTestId('track-remove-confirm')
    await confirm.getByRole('button', { name: /cancel/i }).click()
    await expect(confirm).toBeHidden()
    await expect(card).toBeVisible()
    await trackAction(card, 'remove')
    await page
      .getByTestId('track-remove-confirm')
      .getByRole('button', { name: 'Remove track' })
      .click()
    await expect(detail.getByTestId('track-card')).toHaveCount(0)
    await expect(detail.getByTestId('idea-track-count')).toHaveCount(0)
    await expect(ideaCard(page, 'Alp').locator('[data-testid^="idea-card-trace-"]')).toHaveCount(0)
  })
})
