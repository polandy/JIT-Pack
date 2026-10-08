import { test, expect, expectTripOpen, openTripFromList } from './fixtures'
import {
  addToGroup,
  backToTemplateList as backToList,
  createTemplate,
  createTripFollowingGroup as tripFollowingGroup,
  addPosition,
  visiblePage as visible,
} from './fixtures'
import { PATH } from './routes'

/**
 * FR-27.4 — a group changes, and the trip that follows it is *asked*.
 *
 * Covers E2E-M8-09 (the group edit is offered, applying it puts the row on the
 * trip and M2's changes chip is the record of it), E2E-M8-19 (the refusal:
 * the trip keeps what it has and stops being asked) and E2E-M2-36 (UX-20: the
 * chip names both counts on one line of a three-line row, and its sheet). M8-09 lived in
 * `template-editor.spec.ts` while the refresh applied itself; the surface it
 * tests is M4 and M2, so it moved here with the question.
 *
 * Local Mode, deliberately: the whole refresh — diff, ledger, log — runs
 * client-side (invariant 4), so the mode without a server is where a missing
 * client rule shows up rather than hiding behind a round trip.
 */

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
    await expect(visible(page).getByTestId('m2-changes-chip-Fototour 2026')).toHaveText(
      '⟳ 1 change open',
    )

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
    const chip = visible(page).getByTestId('m2-changes-chip-Fototour 2026')
    await expect(chip).toHaveText('⟳ 1 change taken over')
    await chip.click()
    await expect(page.getByTestId('m2-changes-applied')).toContainText('Stativ')
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
    await expect(visible(page).getByTestId('trip-row-Fototour 2026')).toBeVisible()
    await expect(visible(page).getByTestId('m2-changes-chip-Fototour 2026')).toHaveCount(0)
    await visible(page).getByTestId('trip-row-Fototour 2026').click()
    await expectTripOpen(page, 'Fototour 2026')
    await expect(visible(page).getByTestId('m4-group-proposal')).toHaveCount(0)
    await expect(visible(page).locator('ion-item').filter({ hasText: 'Stativ' })).toHaveCount(0)
  })
  /*
   * UX-20: a planned trip that took one change over and has another waiting.
   * Before, the row drew both as pills under the item count beside a 0 %
   * ring — six lines at this width; the line count is what the case holds.
   */
  test('E2E-M2-36: a planned row is name, dates and one chip — both counts on it, its sheet behind it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 915 })
    await tripFollowingGroup(page, 'Fototour 2026', 'Makro')
    await addToGroup(page, 'Makro', 'Stativ')
    await openTripFromList(page, 'Fototour 2026')
    await visible(page).getByTestId('m4-group-proposal-apply').click()
    await expect(visible(page).getByTestId('m4-group-proposal')).toHaveCount(0)
    await addToGroup(page, 'Makro', 'Blitz')

    await page.goto(`${PATH.trips}?status=planned`)
    const row = visible(page).getByTestId('trip-row-Fototour 2026')
    const chip = row.getByTestId('m2-changes-chip-Fototour 2026')
    await expect(chip).toHaveText('⟳ 2 changes · 1 open')

    // Three lines: the name, the dates with the item count, the chip — and no
    // ring, since nothing of a planned trip is packed to draw one for.
    await expect(row.locator('.progress-ring')).toHaveCount(0)
    const lines = await row.locator('ion-label').evaluate((label) => {
      const range = document.createRange()
      range.selectNodeContents(label)
      const tops = [...range.getClientRects()]
        .filter((box) => box.height > 0)
        .map((box) => Math.round(box.top))
      return tops.filter((top, i) => tops.findIndex((other) => Math.abs(other - top) < 4) === i)
        .length
    })
    expect(lines).toBe(3)

    // The chip opens the sheet without opening the trip: the open change
    // first, then the record.
    await chip.click()
    const sheet = page.getByTestId('m2-changes-sheet')
    await expect(sheet).toHaveAttribute('data-presented', 'true')
    await expect(sheet.getByTestId('m2-changes-open')).toContainText('Blitz')
    await expect(sheet.getByTestId('m2-changes-applied')).toContainText('Stativ')
    await expect(row).toBeVisible()

    // The answer is at the trip, and the sheet leads there.
    await sheet.getByTestId('m2-changes-go').click()
    await expectTripOpen(page, 'Fototour 2026')
    await expect(visible(page).getByTestId('m4-group-proposal')).toContainText('Blitz')
  })
})
