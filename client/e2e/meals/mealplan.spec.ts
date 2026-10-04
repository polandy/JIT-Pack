import type { Page } from '@playwright/test'

import { test, expect, createTripViaWizard, visiblePage, writesLanded } from '../fixtures'
import { PATH } from '../routes'
import { createExcursion, openExcursions } from '../helpers/m27'
import { addDayEntry, chooseDay, openDayPlan, timelineLines } from '../helpers/m29'
import {
  addIngredient,
  addMeal,
  mealPlan,
  mealRow,
  mealSheet,
  mealsOfDay,
  openMeals,
  openNewMeal,
} from '../helpers/m31'
import { browserDay } from '../helpers/page'
import { fillIonic } from '../helpers/ionic'
import { openTripView } from '../helpers/trips'

/**
 * M31 — a trip's meal plan (UI-Test-Spec M31, §3.33). The meals module's
 * screen, and its lines on the shopping list, the day plan, an excursion's
 * list and the dashboard.
 *
 * Local Mode throughout: every rule runs in the browser. A trip a month ahead
 * shows every day unfolded; a trip around today exercises what depends on it
 * — the *Fällig* block, the past meal, the dashboard.
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

test.describe('M31 meal plan @local @meals', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M31-01: the meal plan needs both of the trip's dates (FR-33.1). With
   * them its pill stands after the day plan's; an empty plan is a start, not
   * a wall of empty slots, and once a meal is planned only its day stands as a
   * day — the free days after it are one line that opens into them, each one
   * planned from there, and the sheet marks the day that already has a meal.
   */
  test('E2E-M31-01: the pill only with both dates; only planned days stand, free ones are one line', async ({
    page,
  }) => {
    const day = await days(page, [30, 31, 32, 44])
    await createTripViaWizard(page, { name: 'Ohne Anfang', endDate: day(32), travelers: ['Andy'] })
    await expect(page.getByTestId('trip-view-dayplan')).toHaveCount(0)
    await expect(page.getByTestId('trip-view-meals')).toHaveCount(0)

    await createTripViaWizard(page, {
      name: 'Engadin Tage',
      startDate: day(30),
      endDate: day(44),
      travelers: ['Andy'],
    })
    const plan = await openMeals(page)
    await expect(page.getByTestId('header-title')).toHaveText('Meals')
    const start = plan.getByTestId('m31-empty')
    await expect(start).toContainText('Nothing planned yet')
    await expect(plan.locator('[data-testid^="m31-day-"]')).toHaveCount(0)
    await expect(plan.getByTestId('m31-shop')).toHaveCount(0)

    // The start plans the first day's dinner.
    await start.getByTestId('m31-empty-plan').click()
    const sheet = mealSheet(page)
    await expect(sheet.getByTestId('meal-sheet-title')).toHaveText('New: Dinner')
    await expect(sheet.getByTestId(`meal-day-${day(30)}`)).toHaveAttribute('aria-pressed', 'true')
    await fillIonic(sheet.getByTestId('meal-title'), 'Pizza')
    await sheet.getByTestId('meal-save').click()
    await expect(mealSheet(page)).toHaveCount(0)

    await expect(plan.locator('[data-testid^="m31-day-"]')).toHaveCount(1)
    await expect(mealsOfDay(page, day(30))).toContainText('Arrival')
    await expect(mealRow(page, day(30), 'Pizza')).toBeVisible()
    const gap = plan.getByTestId(`m31-gap-${day(31)}`)
    await expect(gap).toContainText('nothing planned')
    // The free days after it, all fourteen, are one line.
    await expect(gap).toHaveAttribute('data-days', new RegExp(`^${day(31)} .* ${day(44)}$`))
    await expect(plan.locator('[data-testid^="m31-gap-"]')).toHaveCount(1)
    await gap.click()
    await expect(plan.getByTestId(`m31-plan-${day(31)}`)).toBeVisible()
    await plan.getByTestId(`m31-plan-${day(44)}`).click()
    // A free day opens on its dinner, the sheet's day chips scrolled to it.
    await expect(sheet.getByTestId('meal-sheet-title')).toHaveText('New: Dinner')
    await expect(sheet.getByTestId(`meal-day-${day(44)}`)).toHaveAttribute('aria-pressed', 'true')
    await expect(sheet.getByTestId(`meal-day-${day(44)}`)).toBeInViewport()
    await expect(sheet.getByTestId(`meal-day-${day(30)}`)).toHaveAttribute('data-planned', 'true')
    await expect(sheet.getByTestId(`meal-day-${day(31)}`)).not.toHaveAttribute(
      'data-planned',
      'true',
    )
    await sheet.getByTestId('meal-sheet-close').click()
    await expect(mealSheet(page)).toHaveCount(0)
  })

  /**
   * E2E-M31-02: a meal is planned from its empty slot with its ingredients —
   * the amount split off, Enter keeping the field for the next — changed, and
   * deleted behind a confirmation naming what leaves the shopping list; a
   * meal eaten out is named with its place (FR-33.1, FR-33.2, FR-33.9).
   */
  test('E2E-M31-02: a meal is planned with its ingredients, changed and deleted', async ({
    page,
  }) => {
    const day = await days(page, [30, 31, 32])
    await createTripViaWizard(page, {
      name: 'Engadin Tage',
      startDate: day(30),
      endDate: day(32),
      travelers: ['Andy'],
    })
    await openMeals(page)
    const sheet = await openNewMeal(page, day(31), 'dinner')
    await expect(sheet.getByTestId('meal-sheet-title')).toHaveText('New: Dinner')
    await fillIonic(sheet.getByTestId('meal-title'), 'Älplermagronen')
    await addIngredient(page, '500 g Hörnli')
    await expect(sheet.getByTestId('meal-ingredient-add').locator('input')).toBeFocused()
    await addIngredient(page, '2 dl Rahm')
    await addIngredient(page, 'Zwiebeln')
    const hoernli = sheet.getByTestId('meal-ingredient-Hörnli')
    await expect(hoernli).toContainText('500 g')
    await sheet.getByTestId('meal-save').click()
    await expect(mealSheet(page)).toHaveCount(0)

    const row = mealRow(page, day(31), 'Älplermagronen')
    await expect(row).toHaveAttribute('data-slot', 'dinner')
    await expect(row).toContainText('0 of 3 ingredients bought')
    await expect(mealPlan(page).getByTestId('m31-shop')).toContainText('3 ingredients still to buy')

    await row.click()
    await expect(mealSheet(page).getByTestId('meal-sheet-title')).toHaveText('Dinner')
    await mealSheet(page).getByTestId('meal-time').locator('input').fill('19:00')
    await mealSheet(page).getByTestId('meal-save').click()
    await expect(mealSheet(page)).toHaveCount(0)
    await expect(row).toContainText('· 19:00')

    await row.click()
    await mealSheet(page).getByTestId('meal-remove').click()
    const confirm = page.getByTestId('meal-remove-confirm')
    await expect(confirm).toContainText('3 open ingredients leave the shopping list.')
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect(row).toHaveCount(0)
    await expect(mealPlan(page).getByTestId('m31-empty')).toBeVisible()
    await expect(mealPlan(page).getByTestId('m31-shop')).toHaveCount(0)

    await addMeal(page, { day: day(31), slot: 'lunch', title: 'Pizza', out: 'Pizzeria Mulin' })
    await expect(mealRow(page, day(31), 'Pizza')).toContainText('eaten out · Pizzeria Mulin')
    await writesLanded(page)
  })

  /**
   * E2E-M31-03: the ingredients are lines of M6 under *Meal plan* (FR-33.3):
   * today's meal leads the *Due* block, tomorrow's stays under the heading;
   * buying on M6 ticks it in the meal, ticking in the meal takes it off M6,
   * and a meal already eaten leaves nothing open on the list.
   */
  test('E2E-M31-03: the ingredients are the shopping list’s lines, one write both ways', async ({
    page,
  }) => {
    const day = await days(page, [-1, 0, 1, 3])
    await createTripViaWizard(page, {
      name: 'Engadin jetzt',
      startDate: day(-1),
      endDate: day(3),
      travelers: ['Andy'],
    })
    await openMeals(page)
    await addMeal(page, {
      day: day(0),
      slot: 'dinner',
      title: 'Raclette',
      ingredients: ['1 kg Kartoffeln', 'Essiggurken'],
    })
    await addMeal(page, { day: day(1), slot: 'dinner', title: 'Fondue', ingredients: ['Brot'] })
    // Yesterday's meal is planned too, and goes behind the fold of what was eaten.
    const past = await openNewMeal(page, day(-1), 'dinner')
    await fillIonic(past.getByTestId('meal-title'), 'Bolognese')
    await addIngredient(page, 'Hörnli')
    await past.getByTestId('meal-save').click()
    await expect(mealSheet(page)).toHaveCount(0)
    await expect(mealPlan(page).getByTestId('m31-shop')).toContainText('3 ingredients still to buy')
    await expect(mealPlan(page).getByTestId('m31-shop')).toContainText('2 of them for today')
    // The meal already eaten folds into one line above the days.
    await expect(mealPlan(page).getByTestId('m31-past')).toContainText('1 meal already eaten')
    await expect(mealsOfDay(page, day(-1))).toHaveCount(0)

    await openTripView(page, 'shopping')
    const due = m6(page).getByTestId('m6-due')
    await expect(due.getByTestId('m6-row').locator('h3')).toHaveText(['Kartoffeln', 'Essiggurken'])
    await expect(due.getByTestId('m6-row-facts-Kartoffeln')).toContainText('Meal plan')
    await expect(due.getByTestId('m6-row-detail-Kartoffeln')).toContainText('1 kg')
    const heading = m6(page).getByTestId('m6-group-source-Meal plan')
    await expect(heading).toBeVisible()
    await expect(m6(page).getByTestId('m6-row-detail-Brot')).toContainText('Fondue')
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Hörnli' })).toHaveCount(0)

    await due
      .getByTestId('m6-row')
      .filter({ hasText: 'Kartoffeln' })
      .locator('ion-checkbox')
      .click()
    await expect(due.getByTestId('m6-row').filter({ hasText: 'Kartoffeln' })).toHaveCount(0)
    await writesLanded(page)

    await openTripView(page, 'meals')
    const raclette = mealRow(page, day(0), 'Raclette')
    await expect(raclette).toContainText('1 of 2 ingredients bought')
    await raclette.click()
    const sheet = mealSheet(page)
    await expect(sheet.getByTestId('meal-ingredient-tick-Kartoffeln')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await sheet.getByTestId('meal-ingredient-tick-Essiggurken').click()
    await expect(sheet.getByTestId('meal-ingredient-tick-Essiggurken')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await sheet.getByTestId('meal-sheet-close').click()
    await expect(mealSheet(page)).toHaveCount(0)
    await expect(raclette).toContainText('all bought')

    await openTripView(page, 'shopping')
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Brot' })).toBeVisible()
    await expect(m6(page).getByTestId('m6-row').filter({ hasText: 'Essiggurken' })).toHaveCount(0)
  })

  /**
   * E2E-M31-04: a dish cooked on another trip is offered on a new meal by
   * what is typed, and taking it brings its ingredients along, none bought,
   * marked with the trip they came from (FR-33.4).
   */
  test('E2E-M31-04: an earlier trip’s dish is offered and brings its ingredients', async ({
    page,
  }) => {
    const day = await days(page, [30, 31, 40, 41])
    await createTripViaWizard(page, {
      name: 'Tessin',
      startDate: day(30),
      endDate: day(31),
      travelers: ['Andy'],
    })
    await openMeals(page)
    await addMeal(page, {
      day: day(30),
      slot: 'dinner',
      title: 'Rösti mit Spiegelei',
      ingredients: ['1 kg Kartoffeln', '6 Eier'],
    })
    await addMeal(page, {
      day: day(31),
      slot: 'dinner',
      title: 'Risotto',
      ingredients: ['400 g Reis'],
    })

    await createTripViaWizard(page, {
      name: 'Engadin',
      startDate: day(40),
      endDate: day(41),
      travelers: ['Andy'],
    })
    await openMeals(page)
    // The empty plan offers them as a start; a tap opens tonight's dinner with the dish taken.
    const offers = mealPlan(page).locator('[data-testid^="m31-empty-dish-"]')
    await expect(offers).toHaveText(['Risotto', 'Rösti mit Spiegelei'])
    await offers.filter({ hasText: 'Risotto' }).click()
    await expect(mealSheet(page).getByTestId('meal-earlier-from')).toHaveText('from “Tessin”')
    await expect(mealSheet(page).getByTestId('meal-ingredient-Reis')).toContainText('400 g')
    await mealSheet(page).getByTestId('meal-sheet-close').click()
    await expect(mealSheet(page)).toHaveCount(0)

    const sheet = await openNewMeal(page, day(40), 'dinner')
    await expect(sheet.getByTestId('meal-earlier')).toContainText('Cooked before')
    await expect(
      sheet.locator('[data-testid^="meal-earlier-"]').filter({ hasText: 'Risotto' }),
    ).toBeVisible()
    await fillIonic(sheet.getByTestId('meal-title'), 'rö')
    await expect(sheet.getByTestId('meal-earlier')).toContainText('From earlier trips')
    const offer = sheet.getByTestId('meal-earlier-0')
    await expect(offer).toContainText('Rösti mit Spiegelei')
    await expect(offer).toContainText('2 ingredients · Tessin')
    await expect(
      sheet.locator('[data-testid^="meal-earlier-"]').filter({ hasText: 'Risotto' }),
    ).toHaveCount(0)
    await offer.click()
    await expect(sheet.getByTestId('meal-earlier')).toHaveCount(0)
    await expect(sheet.getByTestId('meal-earlier-from')).toHaveText('from “Tessin”')
    await expect(sheet.getByTestId('meal-ingredient-Eier')).toContainText('6')
    await expect(sheet.getByTestId('meal-ingredient-tick-Kartoffeln')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await sheet.getByTestId('meal-save').click()
    await expect(mealRow(page, day(40), 'Rösti mit Spiegelei')).toContainText(
      '0 of 2 ingredients bought',
    )
  })

  /**
   * E2E-M31-05: a meal is a line of the day plan (FR-33.5) — untimed, it
   * stands at its slot's place among the timed lines with its slot's word in
   * the time column — and a tap opens its sheet over the plan.
   */
  test('E2E-M31-05: a meal stands on the day plan at its slot’s place and opens there', async ({
    page,
  }) => {
    const day = await days(page, [30, 31, 32])
    await createTripViaWizard(page, {
      name: 'Engadin Tage',
      startDate: day(30),
      endDate: day(32),
      travelers: ['Andy'],
    })
    await openMeals(page)
    await addMeal(page, { day: day(31), slot: 'dinner', title: 'Raclette', ingredients: ['Käse'] })
    await openDayPlan(page)
    await chooseDay(page, day(31))
    await addDayEntry(page, { title: 'Sauna', time: '20:00' })
    await addDayEntry(page, { title: 'Wanderung', time: '10:00' })
    await expect(timelineLines(page)).toHaveCount(3)
    await expect(timelineLines(page).nth(0)).toContainText('Wanderung')
    const meal = timelineLines(page).nth(1)
    await expect(meal).toHaveAttribute('data-kind', 'meal')
    await expect(meal).toContainText('dinner')
    await expect(meal).toContainText('Raclette')
    await expect(meal).toContainText('0 of 1 ingredients bought')
    await expect(timelineLines(page).nth(2)).toContainText('Sauna')

    await meal.locator('button.open').click()
    await expect(mealSheet(page).getByTestId('meal-sheet-title')).toHaveText('Dinner')
    await mealSheet(page).getByTestId('meal-sheet-close').click()
    await expect(mealSheet(page)).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m29-page')).toBeVisible()
  })

  /**
   * E2E-M31-06: a lunch on an excursion's day may be taken on it (FR-33.6):
   * it then stands as one line of the excursion's list, packed there and
   * counted in its share, and the day plan's excursion line names it; moved
   * to dinner, it leaves the excursion.
   */
  test('E2E-M31-06: a picnic goes into the excursion’s rucksack and leaves it again', async ({
    page,
  }) => {
    const day = await days(page, [30, 31, 32])
    await createTripViaWizard(page, {
      name: 'Engadin Tage',
      startDate: day(30),
      endDate: day(32),
      travelers: ['Andy'],
    })
    await openExcursions(page)
    await createExcursion(page, { name: 'Gletscher', days: { start: day(31), end: day(31) } })

    await openMeals(page)
    const sheet = await openNewMeal(page, day(31), 'lunch')
    await fillIonic(sheet.getByTestId('meal-title'), 'Picknick')
    const along = sheet.getByTestId('meal-excursion')
    await expect(along).toContainText('Take on the excursion “Gletscher”')
    await along.click()
    await expect(along).toHaveAttribute('aria-checked', 'true')
    await sheet.getByTestId('meal-save').click()
    await expect(mealRow(page, day(31), 'Picknick')).toContainText('taken on Gletscher')
    await writesLanded(page)

    await openExcursions(page)
    await visiblePage(page).getByTestId('m27-excursion-Gletscher').click()
    const excursion = visiblePage(page)
    const picnic = excursion
      .getByTestId(`m27-extra`)
      .locator('[data-testid^="m27-extra-meal:"]')
      .first()
    await expect(picnic).toContainText('Picknick')
    await expect(excursion.getByTestId('m27-figure')).toHaveText('0/1 packed')
    await picnic.locator('ion-checkbox').click()
    await expect(excursion.getByTestId('m27-figure')).toHaveText('1/1 packed')
    await writesLanded(page)
    // The list of excursions counts it too.
    await page.getByTestId('header-back').click()
    await expect(visiblePage(page).getByTestId('m27-count-Gletscher')).toHaveText('1/1')

    await openDayPlan(page)
    await chooseDay(page, day(31))
    await expect(timelineLines(page).filter({ hasText: 'Gletscher' })).toContainText('🍽 Picknick')

    await openMeals(page)
    await mealRow(page, day(31), 'Picknick').click()
    await mealSheet(page).getByTestId('meal-slot-dinner').click()
    await expect(mealSheet(page).getByTestId('meal-excursion')).toHaveCount(0)
    await mealSheet(page).getByTestId('meal-save').click()
    await expect(mealSheet(page)).toHaveCount(0)
    await writesLanded(page)
    await openExcursions(page)
    await visiblePage(page).getByTestId('m27-excursion-Gletscher').click()
    await expect(visiblePage(page).getByTestId('m27-extra')).toHaveCount(0)
  })

  /**
   * E2E-M31-07: during the trip M1 carries *Eating today* (FR-33.7): today's
   * meals with what is still to buy; a tap opens the meal's sheet over the
   * dashboard, the head leads onto M31.
   */
  test('E2E-M31-07: the dashboard names today’s meals and opens them', async ({ page }) => {
    const day = await days(page, [-1, 0, 2])
    await createTripViaWizard(page, {
      name: 'Engadin jetzt',
      startDate: day(-1),
      endDate: day(2),
      travelers: ['Andy'],
    })
    await openMeals(page)
    await addMeal(page, {
      day: day(0),
      slot: 'dinner',
      title: 'Raclette',
      ingredients: ['Käse', 'Kartoffeln'],
    })
    await addMeal(page, { day: day(0), slot: 'lunch', title: 'Pizza', out: 'Pizzeria Mulin' })

    await page.goto(PATH.dashboard)
    const block = visiblePage(page).getByTestId('dashboard-meals-Engadin jetzt')
    await expect(block).toContainText('Eating today')
    const rows = block.locator('[data-testid^="dashboard-meal-"]')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('Pizza')
    await expect(rows.nth(1)).toContainText('2 ingredients open')
    // The Heute card stands beside it and leaves the meals to this block.
    await expect(visiblePage(page).getByTestId('dashboard-today-Engadin jetzt')).toBeVisible()
    await expect(
      visiblePage(page).getByTestId('dashboard-today-Engadin jetzt').locator('[data-kind="meal"]'),
    ).toHaveCount(0)

    await rows.nth(1).click()
    await expect(mealSheet(page).getByTestId('meal-sheet-title')).toHaveText('Dinner')
    await mealSheet(page).getByTestId('meal-sheet-close').click()
    await expect(mealSheet(page)).toHaveCount(0)
    await block.getByTestId('dashboard-meals-Engadin jetzt-head').click()
    await expect(mealPlan(page)).toBeVisible()
  })
})
