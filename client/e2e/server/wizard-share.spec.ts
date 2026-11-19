import { test, expect, expectTripOpen, visiblePage } from '../fixtures'
import { writesLanded } from '../helpers/page'
import { uniq } from '../serverMode'
import { PATH } from '../routes'

import { ACCOUNT_NAMES, loginAs } from './fixtures'

/**
 * M3 step 2 on three identities: the share made at creation (FR-4.1/4.5/4.7)
 * and what each role may do on the trip afterwards.
 */
test.describe('Sharing in the trip wizard (FR-4.5, FR-4.7) @server', () => {
  test.slow()

  /**
   * E2E-M3-04: Alice shares with Bob (default role) and Carol (set to Admin)
   * on step 2. The picker never offers Alice herself. After creation the roster carries
   * both roles, Carol may manage members, and Bob sees the roster read-only.
   */
  test('E2E-M3-04: a share made in the wizard grants its role, and the role decides the rights', async ({
    browser,
  }) => {
    const trip = `Engadin ${uniq()}`

    // They log in first: the directory lists only accounts that have, and Dave
    // stays a candidate so that an Admin's picker is non-empty.
    const ctxDave = await browser.newContext()
    await loginAs(ctxDave, 'dave')
    const ctxBob = await browser.newContext()
    const bob = await loginAs(ctxBob, 'bob')
    const ctxCarol = await browser.newContext()
    const carol = await loginAs(ctxCarol, 'carol')
    const ctxAlice = await browser.newContext()
    const alice = await loginAs(ctxAlice, 'alice')

    await alice.goto(PATH.newTrip)
    await alice.getByTestId('wizard-name').locator('input').fill(trip)
    await alice.getByTestId('wizard-next').click()
    await expect(alice.getByTestId('wizard-step-2')).toBeVisible()

    const popoverItems = alice.locator('ion-popover ion-select-popover ion-item')
    await alice.getByTestId('wizard-share-add').click()
    await expect(popoverItems.filter({ hasText: ACCOUNT_NAMES.bob })).toBeVisible()
    await expect(popoverItems.filter({ hasText: ACCOUNT_NAMES.alice })).toHaveCount(0)
    await popoverItems.filter({ hasText: ACCOUNT_NAMES.bob }).click()
    await expect(alice.locator('ion-popover')).toHaveCount(0)

    await alice.getByTestId('wizard-share-add').click()
    await popoverItems.filter({ hasText: ACCOUNT_NAMES.carol }).click()
    await expect(alice.locator('ion-popover')).toHaveCount(0)

    const carolShare = alice.locator('ion-item[data-testid^="wizard-share-"]', {
      hasText: ACCOUNT_NAMES.carol,
    })
    await carolShare.locator('ion-select').click()
    await alice
      .locator('ion-popover ion-select-popover ion-item')
      .filter({ hasText: 'Admin' })
      .click()
    await expect(alice.locator('ion-popover')).toHaveCount(0)
    await expect(carolShare.locator('ion-select')).toHaveJSProperty('value', 'admin')

    await alice.getByTestId('wizard-next').click()
    await expect(alice.getByTestId('wizard-step-3')).toBeVisible()
    await alice.getByTestId('wizard-next').click()
    await expect(alice.getByTestId('wizard-step-4')).toBeVisible()
    await alice.getByTestId('wizard-create').click()
    await expectTripOpen(alice, trip)
    await writesLanded(alice)
    const tripPath = new URL(alice.url()).pathname

    await alice.goto(`${tripPath}/members`)
    const roster = visiblePage(alice)
    await expect(
      roster.getByTestId(`member-row-${ACCOUNT_NAMES.bob}`).locator('ion-select'),
    ).toHaveJSProperty('value', 'editor')
    await expect(
      roster.getByTestId(`member-row-${ACCOUNT_NAMES.carol}`).locator('ion-select'),
    ).toHaveJSProperty('value', 'admin')

    await carol.goto(`${tripPath}/members`)
    await expect(visiblePage(carol).getByTestId('members-add')).toBeVisible()

    await bob.goto(`${tripPath}/members`)
    await expect(visiblePage(bob).getByTestId(`member-row-${ACCOUNT_NAMES.carol}`)).toBeVisible()
    await expect(visiblePage(bob).getByTestId('members-add')).toHaveCount(0)

    await ctxAlice.close()
    await ctxBob.close()
    await ctxCarol.close()
    await ctxDave.close()
  })
})
