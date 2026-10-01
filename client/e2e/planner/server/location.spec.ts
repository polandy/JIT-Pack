import { test, expect, createTripViaWizard } from '../../fixtures'
import {
  addIdea,
  addTrack,
  gpxFile,
  openIdea,
  openIdeas,
  stubTiles,
  trackViewer,
} from '../../helpers/m28'
import { uniq } from '../../serverMode'

import { ACCOUNT_NAMES, loginAs, shareWith } from '../../server/fixtures'

/**
 * FR-29.19 across identities: a position is the sharer's to give. Nothing is
 * shared until switched on; once it is, the other traveller's map carries a
 * mark with the sharer's name, which their own switch hides and the sharer's
 * stop takes away. That nobody else is told and nothing is kept is the
 * server's (`TestLiveLocation_*`, `TestWS_ALocationReachesTheTripsOtherMember…`).
 */
test.describe('Where the others are (FR-29.19) @server @planner', () => {
  test.slow()

  const WALK = gpxFile(
    [
      [46.53, 9.87, 1720],
      [46.55, 9.89, 1900],
    ],
    { name: 'Rundweg' },
  )

  /**
   * E2E-M28-17: Bob's map shows nobody while Alice has not switched sharing
   * on; once she has, it shows her mark, named; his *Show fellow travellers*
   * hides it and brings it back; her stop takes it off.
   */
  test('E2E-M28-17: a shared position is on the other’s map, named, until it is stopped', async ({
    browser,
  }) => {
    const id = uniq()
    const title = `Rundweg ${id}`
    const geo = { permissions: ['geolocation'] }

    const ctxBob = await browser.newContext({
      ...geo,
      geolocation: { latitude: 46.52, longitude: 9.86 },
    })
    const bob = await loginAs(ctxBob, 'bob')
    await stubTiles(bob)

    const ctxAlice = await browser.newContext({
      ...geo,
      geolocation: { latitude: 46.54, longitude: 9.88 },
    })
    const alice = await loginAs(ctxAlice, 'alice')
    await stubTiles(alice)
    const tripPath = await createTripViaWizard(alice, { name: `Engadin ${id}` })
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)
    await alice.goto(tripPath)
    await openIdeas(alice)
    await addIdea(alice, { title })
    await addTrack(await openIdea(alice, title), 'rundweg.gpx', WALK)

    await bob.goto(tripPath)
    await openIdeas(bob)
    await openIdea(bob, title)
    const bobsMap = await openViewer(bob)
    const aliceMark = bobsMap.locator('[data-testid="map-mark-person"]')
    await expect(bobsMap.getByTestId('track-share')).toHaveAttribute('aria-pressed', 'false')
    await expect(bobsMap.getByTestId('track-show-others')).toHaveAttribute('aria-pressed', 'true')

    const alicesMap = await openViewer(alice)
    await expect(alicesMap.getByTestId('track-share')).toHaveAttribute('aria-pressed', 'false')
    // Her own position, before anything is shared: Bob is told nothing of it.
    await alicesMap.getByTestId('track-locate').click()
    await expect(alicesMap.locator('path.jp-me')).toBeAttached()
    await expect(aliceMark).toHaveCount(0)

    await alicesMap.getByTestId('track-share').click()
    await expect(alicesMap.getByTestId('track-share')).toHaveAttribute('aria-pressed', 'true')
    await expect(aliceMark).toHaveAttribute('title', new RegExp(`^${ACCOUNT_NAMES.alice} · `))
    await expect(aliceMark).toHaveText('AL')

    await bobsMap.getByTestId('track-show-others').click()
    await expect(aliceMark).toHaveCount(0)
    await bobsMap.getByTestId('track-show-others').click()
    await expect(aliceMark).toHaveCount(1)

    await alicesMap.getByTestId('track-share').click()
    await expect(alicesMap.getByTestId('track-share')).toHaveAttribute('aria-pressed', 'false')
    await expect(aliceMark).toHaveCount(0)

    await ctxAlice.close()
    await ctxBob.close()
  })
})

async function openViewer(page: import('@playwright/test').Page) {
  await page.getByTestId('track-card').getByTestId('track-map-open').click()
  const viewer = trackViewer(page)
  await expect(viewer.getByTestId('track-viewer-map')).toHaveAttribute('data-tiles', 'on')
  return viewer
}
