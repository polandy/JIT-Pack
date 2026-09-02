import { test, expect, expectTripOpen } from './fixtures'
import {
  addToGroup,
  backToTemplateList as backToList,
  createTemplate,
  createTripFollowingGroup as tripFollowingGroup,
  addPosition,
  visiblePage as visible,
} from './fixtures'
import type { Page } from '@playwright/test'
import { PATH } from './routes'

/**
 * FR-27.4 — a group changes, and the trip that follows it is *asked*.
 *
 * Covers E2E-M8-09 (the group edit is offered, applying it puts the row on the
 * trip and M2's applied-changes chip is the record of it) and E2E-M8-19 (the
 * refusal: the trip keeps what it has and stops being asked). M8-09 lived in
 * `template-editor.spec.ts` while the refresh applied itself; the surface it
 * tests is M4 and M2, so it moved here with the question.
 *
 * Local Mode, deliberately: the whole refresh — diff, ledger, log — runs
 * client-side (invariant 4), so the mode without a server is where a missing
 * client rule shows up rather than hiding behind a round trip.
 */

/** Open the trip the way a user does — through M2, in-SPA. */
async function openTripFromList(page: Page, name: string) {
  await page.goto(`${PATH.trips}?status=planned`)
  await visible(page).getByTestId(`trip-row-${name}`).click()
  await expectTripOpen(page, name)
}

test.describe('FR-27.4 — the group asks before it changes a trip', () => {
  // Built entirely through M7/M8/M3 per spec §2.4; on WebKit that lands near
  // the default budget, so the budget is declared rather than raced.
  test.slow()

  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto(PATH.templates)
    await createTemplate(page, 'group', 'Makro')
    await addPosition(page, 'Kamera')
    await backToList(page)
  })

  test('E2E-M8-09: the trip is offered the group’s new position and takes it', async ({ page }) => {
    await tripFollowingGroup(page, 'Fototour 2026', 'Makro')
    await addToGroup(page, 'Makro', 'Stativ')

    // M2 first, and deliberately: the list is reached as a fresh document, so
    // the chip there proves the *app's own* startup sweep found the change —
    // not M4's on-open derivation. It is also the positive half of M8-19's
    // "no chip after a refusal", which alone would pass against no chip ever.
    await page.goto(`${PATH.trips}?status=planned`)
    await expect(visible(page).getByTestId('m2-proposed-chip-Fototour 2026')).toContainText('1')

    await openTripFromList(page, 'Fototour 2026')

    // Offered, not applied: the card names the change and the list has not
    // moved yet. Asserting the row's absence here is what separates "asked"
    // from "asked afterwards".
    const proposal = visible(page).getByTestId('m4-group-proposal')
    await expect(proposal).toContainText('Stativ')
    await expect(visible(page).getByText('Stativ')).toHaveCount(1)

    await proposal.getByTestId('m4-group-proposal-apply').click()

    // Now it is on the list, and the question is gone.
    await expect(visible(page).getByTestId('m4-group-proposal')).toHaveCount(0)
    await expect(visible(page).locator('ion-item').filter({ hasText: 'Stativ' })).toHaveCount(1)

    // M2 keeps the record of what the trip took over (the FR-27.4 log).
    await page.goto(`${PATH.trips}?status=planned`)
    const chip = visible(page).getByTestId('m2-applied-chip-Fototour 2026')
    await expect(chip).toContainText('1')
    await expect(visible(page).getByTestId('m2-applied-log-Fototour 2026')).toContainText('Stativ')
  })

  test('E2E-M8-19: a refused change is not applied and is not asked again', async ({ page }) => {
    await tripFollowingGroup(page, 'Fototour 2026', 'Makro')
    await addToGroup(page, 'Makro', 'Stativ')

    await openTripFromList(page, 'Fototour 2026')
    await visible(page).getByTestId('m4-group-proposal-decline').click()

    await expect(visible(page).getByTestId('m4-group-proposal')).toHaveCount(0)
    await expect(visible(page).locator('ion-item').filter({ hasText: 'Stativ' })).toHaveCount(0)

    // Leaving and coming back is the test that the refusal was recorded: the
    // trip re-derives on every open, so a refusal held only in memory would
    // ask again right here.
    await page.goto(`${PATH.trips}?status=planned`)
    await expect(visible(page).getByTestId('m2-proposed-chip-Fototour 2026')).toHaveCount(0)
    await visible(page).getByTestId('trip-row-Fototour 2026').click()
    await expectTripOpen(page, 'Fototour 2026')
    await expect(visible(page).getByTestId('m4-group-proposal')).toHaveCount(0)
    await expect(visible(page).locator('ion-item').filter({ hasText: 'Stativ' })).toHaveCount(0)
  })
})
