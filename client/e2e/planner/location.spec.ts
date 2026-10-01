import { test, expect, createTripViaWizard } from '../fixtures'
import {
  addIdea,
  addTrack,
  gpxFile,
  openIdea,
  openIdeas,
  stubTiles,
  trackViewer,
} from '../helpers/m28'

/**
 * FR-29.19 on one device: the 📍 on the full-screen map shows where the
 * device is, once the browser allows it, and says so when it does not.
 * Local Mode has nobody to share with, so it offers no sharing (G-8); the
 * sharing itself is `server/location.spec.ts`'s.
 */

const TRIP = { name: 'Engadin Karte', endDate: '2026-12-31', travelers: ['Andy'] }
const WALK = gpxFile(
  [
    [46.53, 9.87, 1720],
    [46.55, 9.89, 1900],
  ],
  { name: 'Rundweg' },
)

test.describe('M28 where I am on the map @local @planner', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await stubTiles(page)
    await createTripViaWizard(page, TRIP)
    await openIdeas(page)
    await addIdea(page, { title: 'Rundweg Samedan' })
    await addTrack(await openIdea(page, 'Rundweg Samedan'), 'rundweg.gpx', WALK)
  })

  /**
   * E2E-M28-16: refused, the 📍 says the location is not allowed and draws
   * nothing; allowed — after a reload, as a person granting it in the
   * browser does — it draws the device's own mark. No sharing is offered.
   */
  test('E2E-M28-16: the 📍 shows my position once allowed, and offers no sharing alone', async ({
    page,
    context,
  }) => {
    let viewer = await openViewer(page)
    await expect(viewer.getByTestId('track-people')).toHaveCount(0)
    await viewer.getByTestId('track-locate').click()
    await expect(viewer.getByTestId('track-locate-note')).toHaveText(/Location not allowed/)
    await expect(viewer.locator('path.jp-me')).toHaveCount(0)

    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 46.54, longitude: 9.88 })
    await page.reload()
    viewer = await openViewer(page)
    await viewer.getByTestId('track-locate').click()
    await expect(viewer.locator('path.jp-me')).toBeAttached()
    await expect(viewer.getByTestId('track-locate')).toHaveAttribute('aria-pressed', 'true')
    await expect(viewer.getByTestId('track-locate-note')).toHaveCount(0)
  })
})

async function openViewer(page: import('@playwright/test').Page) {
  await page.getByTestId('track-card').getByTestId('track-map-open').click()
  const viewer = trackViewer(page)
  await expect(viewer.getByTestId('track-viewer-map')).toHaveAttribute('data-tiles', 'on')
  return viewer
}
