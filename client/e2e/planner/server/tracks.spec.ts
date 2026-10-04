import { readFile } from 'node:fs/promises'

import { test, expect, createTripViaWizard } from '../../fixtures'
import {
  addIdea,
  addTrack,
  gpxFile,
  ideaCard,
  openIdea,
  openIdeas,
  stubTiles,
  trackAction,
} from '../../helpers/m28'
import { uniq } from '../../serverMode'

import { ACCOUNT_NAMES, loginAs, shareWith } from '../../server/fixtures'

/**
 * FR-29.17 across identities: a track's file is the trip's. One member
 * uploads it with what their device read from it; another sees the line and
 * the figures from the row alone and downloads the file with their own
 * session. That a stranger is refused both is the server's
 * (`TestIdeaTrack_AStrangerNeitherUploadsNorDownloads_FR29_17`).
 */
test.describe('Idea tracks across identities (FR-29.17) @server @planner', () => {
  test.slow()

  const CLIMB = gpxFile(
    [
      [46.5, 7.7, 1000],
      [46.53, 7.7, 1300],
    ],
    { name: 'Aufstieg zur Alp' },
  )

  /**
   * E2E-M28-13: Alice adds a track to an idea on a trip she shares with
   * Bob. Bob's board carries its line and distance, his open idea its
   * figures, and ⋮ hands him the file as Alice gave it. On an instance that
   * draws no tiles, his maps are the lines alone and ask no tile server.
   */
  test('E2E-M28-13: a track one member adds is the other’s to see and download; tiles off draws lines', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Oberland ${id}`
    const title = `Alp ${id}`

    // Bob logs in first: only an existing account can be shared with.
    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    await stubTiles(bob)
    // The instance's switch, as `JITPACK_MAP_TILES=false` answers it.
    await bob.route('**/api/v1/instance/config', async (route) => {
      const response = await route.fetch()
      await route.fulfill({ response, json: { ...(await response.json()), map_tiles: false } })
    })
    let tileAsked = false
    bob.on('request', (request) => {
      if (/wmts\.geo\.admin\.ch|tile\.openstreetmap\.org/.test(request.url())) tileAsked = true
    })

    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    await stubTiles(alice)
    const tripPath = await createTripViaWizard(alice, { name: trip })
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)
    await alice.goto(tripPath)
    await openIdeas(alice)
    await addIdea(alice, { title })
    await addTrack(await openIdea(alice, title), 'aufstieg.gpx', CLIMB)

    // A reload, so Bob's device starts with the switch the instance answers.
    await bob.goto(tripPath)
    await bob.reload()
    await openIdeas(bob)
    await expect(ideaCard(bob, title).locator('[data-testid^="idea-card-track-"]')).toHaveText(
      '3.3 km · ↑ 300 m',
    )
    const card = (await openIdea(bob, title)).getByTestId('track-card')
    // The engine's ICU picks the Swiss group mark: WebKit's writes ’, Chromium's '.
    await expect(card.getByTestId('track-highest')).toHaveText(/^1['’]300 m$/)
    await expect(card.getByTestId('track-map')).toHaveAttribute('data-tiles', 'off')
    await expect(card.getByTestId('track-map').locator('svg path.line')).toHaveCount(1)
    await expect(card.getByTestId('track-map-offline')).toHaveCount(0)

    const download = bob.waitForEvent('download')
    await trackAction(card, 'download')
    const file = await download
    expect(file.suggestedFilename()).toBe('aufstieg.gpx')
    expect(await readFile((await file.path())!, 'utf8')).toBe(CLIMB)
    expect(tileAsked).toBe(false)

    await ctxAlice.close()
    await ctxBob.close()
  })
})
