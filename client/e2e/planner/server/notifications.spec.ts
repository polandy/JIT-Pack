import { test, expect, createTripViaWizard, writesLanded } from '../../fixtures'
import { fillIonic } from '../../helpers/ionic'
import { addIdea, ideaDetail, moveIdea, openIdea, openIdeas } from '../../helpers/m28'
import { uniq, watchSubscribed } from '../../serverMode'

import { ACCOUNT_NAMES, loginAs, shareWith } from '../../server/fixtures'

/**
 * FR-29.8 on two identities: the planner's three notifications as their
 * recipient reads them. Who each one reaches — every co-traveller for a new
 * idea and the shortlist, the idea's participants for a comment, never the
 * actor, never a vote — is `TestPlanNotifications_Ideas_FR29_8`'s; that the
 * push produces them over HTTP is
 * `TestNotifications_Ideas_NewCommentedAndShortlisted_FR29_8`'s.
 */
test.describe('Idea notifications (FR-29.8) @server @planner', () => {
  test.slow()

  /**
   * E2E-M28-11: Alice puts up an idea; Bob is told, and the notice opens the
   * idea. Bob writes about it; Alice, its author, is told — and was never told
   * of her own idea. Alice moves it to the shortlist; Bob is told again.
   */
  test('E2E-M28-11: a new idea, a word about it and the shortlist each tell the other traveller', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Supramonte ${id}`
    const title = `Tiscali ${id}`
    const words = `Nur mit Guide ${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    const tripPath = await createTripViaWizard(alice, { name: trip })
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)

    const subscribedBob = watchSubscribed(bob)
    await bob.goto(tripPath)
    await openIdeas(bob)
    await subscribedBob

    const subscribedAlice = watchSubscribed(alice)
    await alice.goto(tripPath)
    await openIdeas(alice)
    await subscribedAlice
    await addIdea(alice, { title })
    await writesLanded(alice)

    // Filtered by the idea: a notification is addressed to the user, and a
    // parallel case as the same account puts its own toasts on this screen.
    const suggested = bob.locator('ion-toast').filter({ hasText: title })
    await expect(suggested).toContainText(`${ACCOUNT_NAMES.alice} suggested “${title}”`)
    // G-4: the notice opens the idea itself, asserted on the rendered detail.
    await suggested.getByRole('button', { name: /open/i }).click()
    const bobsView = ideaDetail(bob)
    await expect(bobsView.getByTestId('idea-detail-title')).toHaveText(title)

    await fillIonic(bobsView.getByTestId('idea-comment-input'), words)
    await bobsView.getByTestId('idea-comment-send').click()
    await writesLanded(bob)

    const commented = alice.locator('ion-toast').filter({ hasText: words })
    await expect(commented).toContainText(`${ACCOUNT_NAMES.bob} on “${title}”: ${words}`)
    // The comment's toast is the settled signal that Alice's notifications
    // have arrived — so her own idea's absence among them now means something.
    await expect(
      alice.locator('ion-toast').filter({ hasText: `${ACCOUNT_NAMES.alice} suggested` }),
    ).toHaveCount(0)

    const alicesView = await openIdea(alice, title)
    await moveIdea(alicesView, 'idea-act-shortlist', 'shortlisted')
    await writesLanded(alice)

    await expect(
      bob.locator('ion-toast').filter({ hasText: `“${title}” on the shortlist` }),
    ).toContainText(`${ACCOUNT_NAMES.alice} put “${title}” on the shortlist`)

    await ctxAlice.close()
    await ctxBob.close()
  })
})
