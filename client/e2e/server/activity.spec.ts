/**
 * M30 — Aktivität (FR-32): who changed what, read by another person.
 *
 * The project's two identities are the point: a log that names its actor is
 * only proven by an actor who is not the reader, and the name has to be the
 * one the server stamped from the session (invariant 3), not one the device
 * that did the packing could have claimed.
 */
import { test, expect, createTripViaWizard, visiblePage } from '../fixtures'
import { addIdea, openIdea, openIdeas } from '../helpers/m28'
import { createMasterItem } from '../helpers/templates'
import { writesLanded } from '../helpers/page'
import { packItem, quickAddItem, uniq } from '../serverMode'
import { PATH } from '../routes'

import { ACCOUNT_NAMES, loginAs, shareWith } from './fixtures'

test.describe('Aktivität (M30) @server @m30', () => {
  /**
   * E2E-M30-01 (FR-32.1/32.2): Bob packs two things on Alice's trip; Alice
   * opens the trip's activity from the ⋮ and reads one line for the two
   * packs, named after Bob, which opens to the two things it was made of.
   */
  test("E2E-M30-01: a member's packing reads as one line in the trip's activity, named", async ({
    browser,
  }) => {
    const id = uniq()
    const first = `Eispickel-${id}`
    const second = `Stirnlampe-${id}`

    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const tripPath = await createTripViaWizard(alice, { name: `Bernina ${id}` })
    await quickAddItem(alice, first)
    await quickAddItem(alice, second)
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)

    await bob.goto(tripPath)
    await expect(visiblePage(bob).getByTestId(`m4-row-${first}`)).toBeVisible()
    await packItem(bob, first)
    await packItem(bob, second)
    await writesLanded(bob)

    await alice.goto(tripPath)
    await alice.getByTestId('header-overflow').click()
    await alice.locator('ion-action-sheet').getByTestId('m4-activity').click()

    const page = visiblePage(alice)
    await expect(alice.getByTestId('header-title')).toHaveText('Activity')
    const packed = page.locator('[data-testid="activity-row"][data-kind="packed"]')
    await expect(packed).toHaveCount(1)
    await expect(packed.getByTestId('activity-what')).toContainText('2× packed')
    await expect(packed.getByTestId('activity-meta')).toContainText(ACCOUNT_NAMES.bob)
    await expect(packed.getByTestId('activity-title')).toContainText(first)
    await expect(packed.getByTestId('activity-title')).toContainText(second)

    // Alice's own adds are the older line, and hers.
    const added = page.locator('[data-testid="activity-row"][data-kind="added"]').first()
    await expect(added.getByTestId('activity-meta')).toContainText(ACCOUNT_NAMES.alice)

    await packed.click()
    await expect(page.getByTestId('activity-member')).toHaveCount(2)

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M30-03 (FR-32.2): a feature module's row is read by the module — Bob's
   * vote on Alice's idea is a *voted* line under *Ideas*, not a bare *added*
   * row of an unknown table. Proves the composition root binds the planner's
   * reader (`kernel/activityReaders.ts`).
   */
  test("E2E-M30-03: a member's vote reads as voted, under Ideas @planner", async ({ browser }) => {
    const id = uniq()
    const title = `Kloster St. Johann ${id}`

    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const tripPath = await createTripViaWizard(alice, { name: `Val Müstair ${id}` })
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)
    await alice.goto(tripPath)
    await openIdeas(alice)
    await addIdea(alice, { title })
    await writesLanded(alice)

    await bob.goto(tripPath)
    await openIdeas(bob)
    const detail = await openIdea(bob, title)
    await detail.getByTestId('idea-vote-up').click()
    await expect(detail.getByTestId('idea-vote-up')).toHaveAttribute('aria-pressed', 'true')
    await writesLanded(bob)

    await alice.goto(tripPath)
    await alice.getByTestId('header-overflow').click()
    await alice.locator('ion-action-sheet').getByTestId('m4-activity').click()

    const voted = visiblePage(alice).locator('[data-testid="activity-row"][data-kind="voted"]')
    await expect(voted).toHaveCount(1)
    await expect(voted.getByTestId('activity-what')).toContainText('Ideas')
    await expect(voted.getByTestId('activity-meta')).toContainText(ACCOUNT_NAMES.bob)
    await expect(voted.getByTestId('activity-title')).toContainText(title)

    await ctxAlice.close()
    await ctxBob.close()
  })

  /**
   * E2E-M30-02 (FR-32.3): the inventory's log is everyone's — Bob reads the
   * item Alice created, from M9's ⋮.
   */
  test("E2E-M30-02: another account's new inventory item is in the inventory's activity", async ({
    browser,
  }) => {
    const item = `Kompass-${uniq()}`
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')
    await createMasterItem(alice, item)

    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    await bob.goto(PATH.items)
    await bob.getByTestId('header-overflow').click()
    await bob.locator('ion-action-sheet').getByTestId('m9-activity').click()

    await expect(bob.getByTestId('header-title')).toHaveText('Activity · inventory')
    const row = visiblePage(bob)
      .getByTestId('activity-row')
      .filter({ has: bob.getByTestId('activity-title').getByText(item) })
    await expect(row).toHaveAttribute('data-kind', 'added')
    await expect(row.getByTestId('activity-meta')).toContainText(ACCOUNT_NAMES.alice)

    await ctxAlice.close()
    await ctxBob.close()
  })
})
