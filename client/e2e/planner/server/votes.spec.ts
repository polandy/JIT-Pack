import { test, expect, createTripViaWizard, writesLanded } from '../../fixtures'
import { addIdea, ideaCard, openIdea, openIdeas } from '../../helpers/m28'
import { uniq } from '../../serverMode'

import { ACCOUNT_NAMES, loginAs, shareWith } from '../../server/fixtures'

/**
 * FR-29.3 on two identities — the promises only a second person can see: a
 * vote is cast per account and shown with its voter's name, tapping the vote
 * cast withdraws it, and the idea names who wrote it. `planner/ideas.spec.ts`
 * covers the board on one identity, where votes are not shown at all (G-8).
 * That nobody can cast or change a vote in somebody else's name is the
 * server's (`TestStampActor_VoteUpsertCannotTakeOverAnotherUsersVote_FR29_3`,
 * `TestApplyMutation_OnlyTheVoterMayChangeAVote_FR29_3`).
 */
test.describe('Ideas across identities (FR-29.3) @server @planner', () => {
  test.slow()

  /**
   * E2E-M28-06: Alice writes an idea on a trip she shares with Bob. Bob sees
   * it with Alice named as its author and votes for it; Alice sees the vote
   * on the card and, in the idea, Bob's name behind it. Bob's second tap
   * withdraws it, and Alice's count goes back to nothing.
   */
  test('E2E-M28-06: a vote carries its voter’s name, and a second tap withdraws it', async ({
    browser,
  }) => {
    const id = uniq()
    const trip = `Val Müstair ${id}`
    const title = `Kloster St. Johann ${id}`

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')

    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    const tripPath = await createTripViaWizard(alice, { name: trip })
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)
    await alice.goto(tripPath)
    await openIdeas(alice)
    await addIdea(alice, { title, tag: 'Culture' })
    await writesLanded(alice)

    await bob.goto(tripPath)
    await openIdeas(bob)
    const bobsView = await openIdea(bob, title)
    await expect(bobsView.getByTestId('idea-detail-meta')).toContainText(ACCOUNT_NAMES.alice)
    await bobsView.getByTestId('idea-vote-up').click()
    await expect(bobsView.getByTestId('idea-vote-up')).toHaveAttribute('aria-pressed', 'true')
    await expect(bobsView.getByTestId('idea-vote-up-count')).toHaveText('1')
    await writesLanded(bob)

    await alice.reload()
    await openIdeas(alice)
    await expect(ideaCard(alice, title).locator('[data-testid^="idea-card-up-"]')).toContainText(
      '1',
    )
    const alicesView = await openIdea(alice, title)
    await expect(alicesView.getByTestId('idea-vote-names')).toHaveText(
      `${ACCOUNT_NAMES.bob} for it`,
    )
    // Where votes are shown the board can be read by them or by age: the ⋮ offers the other order.
    await alice.getByTestId('header-overflow').click()
    await expect(alice.locator('ion-action-sheet')).toContainText('Newest first')
    await alice
      .locator('ion-action-sheet')
      .getByRole('button', { name: /cancel/i })
      .click()
    await expect(alice.locator('ion-action-sheet')).toHaveCount(0)
    // Bob's vote is not Alice's: her own button stays unpressed.
    await expect(alicesView.getByTestId('idea-vote-up')).toHaveAttribute('aria-pressed', 'false')

    await bobsView.getByTestId('idea-vote-up').click()
    await expect(bobsView.getByTestId('idea-vote-up')).toHaveAttribute('aria-pressed', 'false')
    await expect(bobsView.getByTestId('idea-vote-up-count')).toHaveText('0')
    await writesLanded(bob)

    await alice.reload()
    await openIdeas(alice)
    await expect(ideaCard(alice, title).locator('[data-testid^="idea-card-up-"]')).toContainText(
      '0',
    )

    await ctxAlice.close()
    await ctxBob.close()
  })
})
