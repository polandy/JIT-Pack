import { test, expect, createTripViaWizard } from '../../fixtures'
import { WIDE_PNG, WIDE_PNG_WIDTH } from '../../helpers/images'
import { addIdea, addPicture, ideaCard, mosaicPicture, openIdea, openIdeas } from '../../helpers/m28'
import { uniq } from '../../serverMode'

import { ACCOUNT_NAMES, loginAs, shareWith } from '../../server/fixtures'

/**
 * FR-29.5 across identities: an idea picture is the trip's, not the
 * instance's. Its bytes are uploaded by one member and fetched by another
 * with their own credentials — a path Local Mode never takes, since there
 * the bytes never leave the device. That a stranger is refused both the
 * upload and the read is the server's
 * (`TestIdeaImage_AStrangerNeitherUploadsNorReads_FR29_5`).
 */
test.describe('Idea pictures across identities (FR-29.5) @server @planner', () => {
  test.slow()

  /**
   * E2E-M28-08: Alice adds a picture to an idea on a trip she shares with
   * Bob. Bob's board shows it as the card's banner and his open idea in the
   * mosaic — the same bytes, fetched with his own session.
   */
  test('E2E-M28-08: a picture one member adds is the other member’s to see', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Oberengadin ${id}`
    const title = `Lej da Staz ${id}`

    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    const tripPath = await createTripViaWizard(alice, { name: trip })
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)
    await alice.goto(tripPath)
    await openIdeas(alice)
    await addIdea(alice, { title })
    const detail = await openIdea(alice, title)
    await addPicture(detail, 'wide.png', WIDE_PNG)
    await expect(mosaicPicture(detail, 0)).toHaveJSProperty('naturalWidth', WIDE_PNG_WIDTH)

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    await bob.goto(tripPath)
    await openIdeas(bob)
    await expect(
      ideaCard(bob, title).locator('[data-testid^="idea-card-cover-"] img'),
    ).toHaveJSProperty('naturalWidth', WIDE_PNG_WIDTH)
    const bobsView = await openIdea(bob, title)
    await expect(mosaicPicture(bobsView, 0)).toHaveJSProperty('naturalWidth', WIDE_PNG_WIDTH)

    await ctxAlice.close()
    await ctxBob.close()
  })
})
