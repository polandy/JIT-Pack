import type { Page } from '@playwright/test'

import { test, expect, createTripViaWizard, visiblePage, writesLanded } from '../fixtures'
import { addIngredient, addMeal, mealRow, mealSheet, openMeals, openNewMeal } from '../helpers/m31'
import { browserDay } from '../helpers/page'
import { fillIonic } from '../helpers/ionic'
import { openTripView } from '../helpers/trips'

/**
 * M31 — the ingredients the meal plan remembers and the shopping list sums
 * (UI-Test-Spec M31, FR-33.12–33.14). Local Mode: every rule runs in the
 * browser, over the meals of every trip on it.
 */

/** Days counted from the browser's today, `YYYY-MM-DD`, read by their offset. */
async function days(page: Page, offsets: number[]): Promise<(offset: number) => string> {
  const out = new Map<number, string>()
  for (const n of offsets) out.set(n, await browserDay(page, n))
  return (offset) => {
    const day = out.get(offset)
    if (day === undefined) throw new Error(`day ${offset} was not read`)
    return day
  }
}

/** M6, on the page the outlet shows. */
function m6(page: Page) {
  return visiblePage(page).getByTestId('m6-page')
}

/** M6's open lines of one name, under the meal plan's heading. */
function lines(page: Page, name: string) {
  return m6(page)
    .getByTestId('m6-row')
    .filter({ has: page.locator('h3', { hasText: new RegExp(`^\\s*${name}\\b`) }) })
}

test.describe('M31 — remembered and summed ingredients @local @meals', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M31-09: the ingredient field offers what earlier meals used, from the
   * first letter, with the amount used last — an amount typed in front wins —
   * and each ingredient says whether it is fresh; set once, a name keeps it
   * (FR-33.12, FR-33.13).
   */
  test('E2E-M31-09: an earlier trip’s ingredients are offered as one types, fresh or durable', async ({
    page,
  }) => {
    const day = await days(page, [30, 40, 41])
    await createTripViaWizard(page, {
      name: 'Tessin',
      startDate: day(30),
      endDate: day(30),
      travelers: ['Andy'],
    })
    await openMeals(page)
    await addMeal(page, {
      day: day(30),
      slot: 'dinner',
      title: 'Risotto',
      ingredients: ['250 g Butter', '2 dl Rahm', '400 g Reis'],
    })

    await createTripViaWizard(page, {
      name: 'Engadin',
      startDate: day(40),
      endDate: day(41),
      travelers: ['Andy'],
    })
    await openMeals(page)
    const sheet = await openNewMeal(page, day(40), 'dinner')
    await fillIonic(sheet.getByTestId('meal-title'), 'Rösti')
    const field = sheet.getByTestId('meal-ingredient-add')
    // Nothing is offered before a letter is typed.
    await expect(sheet.getByTestId('meal-ingredient-suggestions')).toHaveCount(0)

    await fillIonic(field, 'r')
    const offered = sheet.getByTestId('meal-ingredient-suggestions')
    await expect(offered.locator('[data-testid^="meal-ingredient-suggestion-"]')).toHaveCount(2)
    await expect(sheet.getByTestId('meal-ingredient-suggestion-Rahm')).toContainText('2 dl')
    await expect(sheet.getByTestId('meal-ingredient-suggestion-Rahm')).toContainText(
      'used 1× · last on Tessin',
    )

    // An amount typed in front is the one taken.
    await fillIonic(field, '300 g Bu')
    await expect(offered.locator('[data-testid^="meal-ingredient-suggestion-"]')).toHaveCount(1)
    await expect(sheet.getByTestId('meal-ingredient-suggestion-Butter')).toContainText('300 g')
    await sheet.getByTestId('meal-ingredient-suggestion-Butter').click()
    await expect(field.locator('input')).toHaveValue('')
    await expect(sheet.getByTestId('meal-ingredient-Butter')).toContainText('300 g')
    await expect(sheet.getByTestId('meal-ingredient-suggestions')).toHaveCount(0)

    // The built-in list takes cream for fresh food and butter for food that keeps.
    await addIngredient(page, '1 dl Rahm')
    await expect(sheet.getByTestId('meal-ingredient-fresh-Rahm')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(sheet.getByTestId('meal-ingredient-fresh-Rahm')).toHaveText('🌿 fresh')
    await expect(sheet.getByTestId('meal-ingredient-fresh-Butter')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(sheet.getByTestId('meal-ingredient-fresh-Butter')).toHaveText('keeps')
    // Set by hand, it is written with the meal — and the name keeps it.
    await sheet.getByTestId('meal-ingredient-fresh-Butter').click()
    await expect(sheet.getByTestId('meal-ingredient-fresh-Butter')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await sheet.getByTestId('meal-save').click()
    await expect(mealSheet(page)).toHaveCount(0)
    await writesLanded(page)

    const next = await openNewMeal(page, day(41), 'dinner')
    await fillIonic(next.getByTestId('meal-title'), 'Zmorge')
    await fillIonic(next.getByTestId('meal-ingredient-add'), 'bu')
    // Used twice now; the newest amount and the freshness set last come along.
    await expect(next.getByTestId('meal-ingredient-suggestion-Butter')).toContainText(
      'used 2× · last on Engadin',
    )
    await expect(next.getByTestId('meal-ingredient-suggestion-Butter')).toContainText('300 g')
    await next.getByTestId('meal-ingredient-suggestion-Butter').click()
    await expect(next.getByTestId('meal-ingredient-fresh-Butter')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  /**
   * E2E-M31-10: one name's ingredients are one line of M6 — durable food over
   * the whole trip, fresh food only across one day — with the amounts added
   * up, the parts opened by a tap, and every part bought by one tick
   * (FR-33.14).
   */
  test('E2E-M31-10: the same ingredient of several meals is one line, fresh food only across a day', async ({
    page,
  }) => {
    const day = await days(page, [30, 31, 34])
    await createTripViaWizard(page, {
      name: 'Engadin Herbst',
      startDate: day(30),
      endDate: day(34),
      travelers: ['Andy'],
    })
    await openMeals(page)
    await addMeal(page, {
      day: day(30),
      slot: 'dinner',
      title: 'Rösti',
      ingredients: ['200 g Butter', '2 dl Rahm'],
    })
    await addMeal(page, {
      day: day(31),
      slot: 'breakfast',
      title: 'Zmorge',
      ingredients: ['300 g Butter', '1 dl Rahm'],
    })
    await addMeal(page, {
      day: day(34),
      slot: 'dinner',
      title: 'Älplermagronen',
      ingredients: ['1 kg Butter', '2 dl Rahm'],
    })

    await openTripView(page, 'shopping')
    const butter = lines(page, 'Butter')
    await expect(butter).toHaveCount(1)
    await expect(butter.getByTestId('m6-row-total-Butter')).toHaveText('· 1.5 kg')
    await expect(butter.getByTestId('m6-row-uses-Butter')).toHaveText('3×')
    await expect(butter.getByTestId('m6-row-fresh-Butter')).toHaveCount(0)
    await expect(butter.getByTestId('m6-row-detail-Butter')).toContainText('300 g')

    // Friday's cream is four days on: a line of its own, due on its day.
    const cream = lines(page, 'Rahm')
    await expect(cream).toHaveCount(2)
    await expect(cream.first().getByTestId('m6-row-total-Rahm')).toHaveText('· 3 dl')
    await expect(cream.first().getByTestId('m6-row-fresh-Rahm')).toBeVisible()
    await expect(cream.nth(1).getByTestId('m6-row-total-Rahm')).toHaveCount(0)
    await expect(cream.nth(1).getByTestId('m6-row-detail-Rahm')).toContainText('Älplermagronen')

    // A tap opens the parts, each with its meal and its amount.
    await expect(butter.getByTestId('m6-row-parts-Butter')).toHaveCount(0)
    await butter.getByTestId('m6-row-label').click()
    await expect(butter.getByTestId('m6-row-label')).toHaveAttribute('aria-expanded', 'true')
    const parts = butter.getByTestId('m6-row-part')
    await expect(parts).toHaveCount(3)
    await expect(parts.nth(1)).toContainText('Zmorge')
    await expect(parts.nth(1)).toContainText('300 g')
    await expect(parts.nth(2)).toContainText('1 kg')

    // One tick buys every part: each of the three meals has its butter.
    await butter.locator('ion-checkbox').click()
    await expect(lines(page, 'Butter')).toHaveCount(0)
    await writesLanded(page)
    await openTripView(page, 'meals')
    await expect(mealRow(page, day(30), 'Rösti')).toContainText('1 of 2 ingredients bought')
    await expect(mealRow(page, day(31), 'Zmorge')).toContainText('1 of 2 ingredients bought')
    await expect(mealRow(page, day(34), 'Älplermagronen')).toContainText(
      '1 of 2 ingredients bought',
    )

    // Cream bought in its meal leaves the summed line with the rest.
    await mealRow(page, day(31), 'Zmorge').click()
    await mealSheet(page).getByTestId('meal-ingredient-tick-Rahm').click()
    await expect(mealSheet(page).getByTestId('meal-ingredient-tick-Rahm')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await mealSheet(page).getByTestId('meal-sheet-close').click()
    await expect(mealSheet(page)).toHaveCount(0)
    await writesLanded(page)
    await openTripView(page, 'shopping')
    await expect(lines(page, 'Rahm')).toHaveCount(2)
    await expect(lines(page, 'Rahm').first().getByTestId('m6-row-total-Rahm')).toHaveCount(0)
    await expect(lines(page, 'Rahm').first().getByTestId('m6-row-detail-Rahm')).toContainText(
      'Rösti',
    )
  })
})
