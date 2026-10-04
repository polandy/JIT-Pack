import { test, expect, createTripViaWizard, writesLanded } from '../../fixtures'
import { addMeal, mealRow, mealSheet, openMeals } from '../../helpers/m31'
import { openDayPlan, chooseDay, timelineLines } from '../../helpers/m29'
import { browserDay } from '../../helpers/page'
import { uniq } from '../../serverMode'

import { ACCOUNT_NAMES, loginAs, shareWith } from '../../server/fixtures'

/**
 * FR-33.8: who cooks is a member of the trip, offered once the trip has more
 * than one; and a bought ingredient names its buyer, the server's stamp
 * (FR-33.3, FR-30.4).
 */
test.describe('Who cooks (FR-33.8) @server @meals', () => {
  test.slow()

  /**
   * E2E-M31-08: on a trip with two members the sheet offers *Who cooks*; the
   * cook chosen stands on M31 and on the day plan, and a bought ingredient
   * names its buyer.
   */
  test('E2E-M31-08: a member cooks, and a purchase names its buyer', async ({ browser }) => {
    const ctxBob = await browser.newContext()
    await loginAs(ctxBob, 'bob')
    const ctx = await browser.newContext()
    const alice = await loginAs(ctx, 'alice')
    const first = await browserDay(alice, 30)
    const second = await browserDay(alice, 31)
    const tripPath = await createTripViaWizard(alice, {
      name: `Engadin ${uniq()}`,
      startDate: first,
      endDate: second,
    })
    await shareWith(alice, tripPath, ACCOUNT_NAMES.bob)
    await alice.goto(tripPath)
    await openMeals(alice)
    await addMeal(alice, { day: first, slot: 'dinner', title: 'Raclette', ingredients: ['Käse'] })

    await mealRow(alice, first, 'Raclette').click()
    const sheet = mealSheet(alice)
    const bob = sheet.locator('[data-testid^="meal-cook-"]').filter({ hasText: ACCOUNT_NAMES.bob })
    await expect(bob).toBeVisible()
    await bob.click()
    await sheet.getByTestId('meal-ingredient-tick-Käse').click()
    await sheet.getByTestId('meal-save').click()
    await expect(mealSheet(alice)).toHaveCount(0)
    await writesLanded(alice)
    await expect(mealRow(alice, first, 'Raclette')).toContainText(`${ACCOUNT_NAMES.bob} cooks`)

    await openDayPlan(alice)
    await chooseDay(alice, first)
    await expect(timelineLines(alice).filter({ hasText: 'Raclette' })).toContainText(
      `${ACCOUNT_NAMES.bob} cooks`,
    )

    await alice.reload()
    await openMeals(alice)
    await mealRow(alice, first, 'Raclette').click()
    await expect(mealSheet(alice).getByTestId('meal-ingredient-Käse')).toContainText(
      `bought by ${ACCOUNT_NAMES.alice}`,
    )
    await ctx.close()
    await ctxBob.close()
  })
})
