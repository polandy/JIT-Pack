import type { Page } from '@playwright/test'

import { test, expect, createTripViaWizard, visiblePage, writesLanded } from '../fixtures'
import { PATH } from '../routes'
import { createExcursion, openExcursions, undoFromSnackbar } from '../helpers/m27'
import { addDayEntry, chooseDay, openDayPlan, timelineLines } from '../helpers/m29'
import {
  addIngredient,
  addMeal,
  carriedWhere,
  liftMealOnto,
  mealGrip,
  sheetGone,
  mealPlan,
  mealRow,
  mealSheet,
  mealsOfDay,
  openMeals,
  openNewMeal,
} from '../helpers/m31'
import { addIdea, ideaDetail, openIdea, openIdeas } from '../helpers/m28'
import { browserDay, switchToGerman } from '../helpers/page'
import { brokenWords, CUE_PHONES, cutLabels, rowCue } from '../helpers/rows'
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
    await expect(meal.locator('[data-testid^="m29-time-"]')).toHaveText('Dinner')
    await expect(meal.locator('[data-testid^="m29-kind-"]')).toHaveText('Meal')
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
   * E2E-M31-11: a meal is moved to another day by its grip (FR-33.15, ADR-094).
   * Lifted, every free day opens into a row of its own, so a free day is a
   * place to drop; the chip rides above the finger and says where the meal
   * would land, so the day under the finger stays in sight. Let go, the meal
   * stands on its new day, its old day folds back into the free line, and the
   * toast's undo puts it back. A picnic moved off its excursion's day leaves
   * the rucksack, and the toast says so. Without the drag, the sheet's day
   * chips move a meal too, naming the day it leaves.
   */
  test('E2E-M31-11: a meal is dragged by its grip onto a free day, and back by the undo', async ({
    page,
  }) => {
    const day = await days(page, [30, 31, 32, 33, 34])
    await createTripViaWizard(page, {
      name: 'Engadin Herbst',
      startDate: day(30),
      endDate: day(34),
      travelers: ['Andy'],
    })
    await openExcursions(page)
    await createExcursion(page, { name: 'Gletscher', days: { start: day(32), end: day(32) } })
    await openMeals(page)
    await addMeal(page, { day: day(30), slot: 'dinner', title: 'Raclette', ingredients: ['Käse'] })
    const sheet = await openNewMeal(page, day(32), 'lunch')
    await fillIonic(sheet.getByTestId('meal-title'), 'Picknick')
    await sheet.getByTestId('meal-excursion').click()
    await sheet.getByTestId('meal-save').click()
    await expect(mealRow(page, day(32), 'Picknick')).toContainText('taken on Gletscher')
    await writesLanded(page)
    // Before the lift the free day is folded into its line, not a row.
    await expect(mealPlan(page).getByTestId(`m31-gap-${day(31)}`)).toBeVisible()
    await expect(mealPlan(page).getByTestId(`m31-plan-${day(31)}`)).toHaveCount(0)

    const grip = mealGrip(page, day(30), 'Raclette')
    await sheetGone(page)
    await grip.hover()
    const g = (await grip.boundingBox())!
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    // Over its own day it stays, and its day takes nothing.
    await expect(carriedWhere(page)).toContainText('stays on')
    await page.mouse.up()
    await expect(mealPlan(page)).toHaveAttribute('data-drag', 'idle')
    await expect(mealRow(page, day(30), 'Raclette')).toBeVisible()

    const freeDay = () => mealPlan(page).getByTestId(`m31-plan-${day(33)}`)
    const held = await liftMealOnto(page, grip, freeDay)
    const label = await freeDay().getAttribute('data-drop-label')
    await expect(carriedWhere(page)).toHaveText(`→ ${label}`)
    // The ＋ steps aside while a meal is in the air: it stood over the last days' drop words.
    await expect(mealPlan(page).getByTestId('m31-fab')).toHaveCount(0)
    // The chip rides above the finger, clear of the day it aims at.
    const chip = (await page.locator('[data-drag-ghost]').boundingBox())!
    const target = (await freeDay().boundingBox())!
    expect(chip.y + chip.height).toBeLessThan(target.y + target.height / 2)
    await held.release()

    await expect(mealRow(page, day(33), 'Raclette')).toBeVisible()
    await expect(mealPlan(page).getByTestId('m31-fab')).toBeVisible()
    await expect(mealsOfDay(page, day(30))).toHaveCount(0)
    await expect(mealPlan(page).getByTestId(`m31-gap-${day(30)}`)).toBeVisible()
    await writesLanded(page)
    await undoFromSnackbar(page, `“Raclette” is now on ${label}`)
    await expect(mealRow(page, day(30), 'Raclette')).toBeVisible()
    await expect(mealsOfDay(page, day(33))).toHaveCount(0)
    await writesLanded(page)

    const picnic = await liftMealOnto(page, mealGrip(page, day(32), 'Picknick'), () =>
      mealPlan(page).getByTestId(`m31-plan-${day(31)}`),
    )
    await picnic.release()
    await expect(
      page
        .locator('ion-toast.pack-toast')
        .filter({ hasText: 'no longer in the rucksack for Gletscher' }),
    ).toHaveCount(1)
    await expect(mealRow(page, day(31), 'Picknick')).not.toContainText('taken on')
    await expect(mealRow(page, day(31), 'Picknick')).toContainText('Lunch')
    await writesLanded(page)

    // Without the drag: the sheet's day chips move it too, and say from where.
    await sheetGone(page)
    await mealRow(page, day(30), 'Raclette').click()
    const raclette = mealSheet(page)
    await raclette.getByTestId(`meal-day-${day(34)}`).click()
    await expect(raclette.getByTestId(`meal-day-${day(30)}`)).toHaveAttribute(
      'data-moved-from',
      'true',
    )
    await expect(raclette).toContainText('→')
    await raclette.getByTestId('meal-save').click()
    await expect(mealRow(page, day(34), 'Raclette')).toBeVisible()
  })

  /**
   * E2E-M31-12: a list longer than the screen scrolls under a finger held at
   * its edge (G-21), so a meal reaches a day below the fold without being let
   * go: held near the bottom, the list runs to its end and stops there by
   * itself, the trip's last day in view, and the meal is dropped on it.
   */
  test('E2E-M31-12: a meal held at the bottom edge scrolls the plan to a day below the fold', async ({
    page,
  }) => {
    const offsets = Array.from({ length: 16 }, (_, n) => 30 + n)
    const day = await days(page, offsets)
    await createTripViaWizard(page, {
      name: 'Lange Ferien',
      startDate: day(30),
      endDate: day(45),
      travelers: ['Andy'],
    })
    await openMeals(page)
    await addMeal(page, { day: day(30), slot: 'dinner', title: 'Raclette' })

    const host = mealPlan(page)
    const grip = mealGrip(page, day(30), 'Raclette')
    await sheetGone(page)
    await grip.hover()
    const g = (await grip.boundingBox())!
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    await expect(host).toHaveAttribute('data-drag', 'dragging')
    // The first day's grip may lie in the top edge zone, where the list
    // would creep up by a pixel or two: held mid-screen it stands still.
    const view = page.viewportSize()!
    await page.mouse.move(g.x + g.width / 2, view.height / 2, { steps: 4 })
    await expect(host).toHaveAttribute('data-drag-scroll', 'still')
    const last = host.getByTestId(`m31-plan-${day(45)}`)
    await expect(last).not.toBeInViewport()

    // Held just above the bottom of the plan, the list scrolls by itself.
    await page.mouse.move(g.x + g.width / 2, view.height - 4, { steps: 8 })
    await expect(host).toHaveAttribute('data-drag-scroll', 'down')
    // Held there until the list cannot go further and stops by itself: the
    // last day merely peeking in may still lie in the edge zone, half below
    // the screen, where it cannot be aimed at.
    await expect(host).toHaveAttribute('data-drag-scroll', 'still')
    await expect(last).toBeInViewport({ ratio: 1 })
    // Out of the edge the list stands still, and the day can be aimed at.
    await page.mouse.move(g.x + g.width / 2, view.height / 2, { steps: 4 })
    await expect(host).toHaveAttribute('data-drag-scroll', 'still')
    const box = (await last.boundingBox())!
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2, { steps: 4 })
    await expect(last).toHaveAttribute('data-drop-over', '')
    await page.mouse.up()
    await expect(host).toHaveAttribute('data-drag', 'idle')
    await expect(mealRow(page, day(45), 'Raclette')).toBeVisible()
  })

  /**
   * E2E-M31-13: a meal is put into another slot by how far right the finger
   * is (FR-33.15, G-21). The choice rides above the finger in the chip's row of
   * fields, each over its own column, so the one over the finger is the one
   * lit; the first keeps the slot, where a finger dragged straight down stays.
   * A time that went with the old slot is dropped and the toast says so; the
   * undo brings both back. A picnic made a dinner leaves the rucksack.
   */
  test('E2E-M31-13: a meal is put into another slot from the chip above the finger, and its time goes', async ({
    page,
  }) => {
    const day = await days(page, [30, 31, 32])
    await createTripViaWizard(page, {
      name: 'Engadin Mahlzeiten',
      startDate: day(30),
      endDate: day(32),
      travelers: ['Andy'],
    })
    await openExcursions(page)
    await createExcursion(page, { name: 'Gletscher', days: { start: day(31), end: day(31) } })
    await openMeals(page)
    const raclette = await openNewMeal(page, day(30), 'dinner')
    await fillIonic(raclette.getByTestId('meal-title'), 'Raclette')
    await fillIonic(raclette.getByTestId('meal-time'), '19:00')
    await raclette.getByTestId('meal-save').click()
    await expect(mealRow(page, day(30), 'Raclette')).toContainText('19:00')
    const picnic = await openNewMeal(page, day(31), 'lunch')
    await fillIonic(picnic.getByTestId('meal-title'), 'Picknick')
    await picnic.getByTestId('meal-excursion').click()
    await picnic.getByTestId('meal-save').click()
    await expect(mealRow(page, day(31), 'Picknick')).toContainText('taken on Gletscher')
    await writesLanded(page)

    /** Lift a meal, hold it over its own day, and slide right onto a slot's field in the chip. */
    async function intoSlot(title: string, onDay: string, slot: string) {
      const host = mealPlan(page)
      await sheetGone(page)
      const grip = mealGrip(page, onDay, title)
      await grip.hover()
      const g = (await grip.boundingBox())!
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
      await page.mouse.down()
      await expect(host).toHaveAttribute('data-drag', 'dragging')
      const chip = page.locator('[data-drag-ghost]')
      await expect(chip).toHaveAttribute('data-carry-wide', '')
      // Straight down the finger is over the field that keeps.
      await expect(chip.locator('[data-carry-choice=""]')).toHaveAttribute('data-on', '')
      const field = (await chip.locator(`[data-carry-choice="${slot}"]`).boundingBox())!
      const row = (await mealRow(page, onDay, title).boundingBox())!
      await page.mouse.move(field.x + field.width / 2, row.y + row.height / 2, { steps: 6 })
      await expect(chip.locator(`[data-carry-choice="${slot}"]`)).toHaveAttribute('data-on', '')
      return { chip, host }
    }

    const { chip, host } = await intoSlot('Raclette', day(30), 'lunch')
    await expect(chip.locator('[data-carry-where]')).toContainText('· Lunch')
    // The field over the finger is visible: the chip ends above the finger.
    const box = (await chip.boundingBox())!
    const row = (await mealRow(page, day(30), 'Raclette').boundingBox())!
    expect(box.y + box.height).toBeLessThan(row.y + row.height / 2)
    await page.mouse.up()
    await expect(host).toHaveAttribute('data-drag', 'idle')
    await expect(mealRow(page, day(30), 'Raclette')).toContainText('Lunch')
    await expect(mealRow(page, day(30), 'Raclette')).not.toContainText('19:00')
    await writesLanded(page)
    await undoFromSnackbar(page, 'no time, it was 19:00')
    await expect(mealRow(page, day(30), 'Raclette')).toContainText('Dinner')
    await expect(mealRow(page, day(30), 'Raclette')).toContainText('19:00')
    await writesLanded(page)

    await intoSlot('Picknick', day(31), 'dinner')
    await page.mouse.up()
    await expect(mealPlan(page)).toHaveAttribute('data-drag', 'idle')
    await expect(
      page
        .locator('ion-toast.pack-toast')
        .filter({ hasText: 'no longer in the rucksack for Gletscher' }),
    ).toHaveCount(1)
    await expect(mealRow(page, day(31), 'Picknick')).toContainText('Dinner')
    await expect(mealRow(page, day(31), 'Picknick')).not.toContainText('taken on')
  })

  /**
   * E2E-M31-14: a meal whose fresh ingredients are already bought, moved more
   * than a day later, has its toast ask whether they last until then
   * (FR-33.15, FR-33.13) — naming the bought fresh ones only, never what keeps.
   * A move by one day asks nothing, the undo still puts it back, and the
   * sheet's day chips ask the same.
   */
  test('E2E-M31-14: a meal moved days later asks whether its bought fresh ingredients last', async ({
    page,
  }) => {
    const day = await days(page, [30, 31, 32, 33, 34])
    await createTripViaWizard(page, {
      name: 'Engadin Frisch',
      startDate: day(30),
      endDate: day(34),
      travelers: ['Andy'],
    })
    await openMeals(page)
    await addMeal(page, {
      day: day(30),
      slot: 'dinner',
      title: 'Bruschetta',
      ingredients: ['Brot', 'Rucola', 'Olivenöl'],
    })
    await mealRow(page, day(30), 'Bruschetta').click()
    const sheet = mealSheet(page)
    // Bread is fresh by the built-in list; rocket is made fresh by hand; the oil keeps.
    await expect(sheet.getByTestId('meal-ingredient-fresh-Brot')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await sheet.getByTestId('meal-ingredient-fresh-Rucola').click()
    await expect(sheet.getByTestId('meal-ingredient-fresh-Rucola')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(sheet.getByTestId('meal-ingredient-fresh-Olivenöl')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    for (const name of ['Brot', 'Rucola', 'Olivenöl']) {
      await sheet.getByTestId(`meal-ingredient-tick-${name}`).click()
      await expect(sheet.getByTestId(`meal-ingredient-tick-${name}`)).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    }
    await sheet.getByTestId('meal-save').click()
    await expect(mealRow(page, day(30), 'Bruschetta')).toContainText('all bought')
    await writesLanded(page)

    /** The weekday the plan's own label for a day starts with — „Sat" here, „Sa." in German. */
    async function weekdayOf(target: string) {
      const label = await mealPlan(page)
        .locator(`[data-drop-label][data-glide="day:${target}"]`)
        .getAttribute('data-drop-label')
      return /^\p{L}+\.?/u.exec(label ?? '')![0]
    }
    const grip = mealGrip(page, day(30), 'Bruschetta')

    // One day later: the toast says where it went and asks nothing.
    const nextDay = await liftMealOnto(page, grip, () =>
      mealPlan(page).getByTestId(`m31-plan-${day(31)}`),
    )
    const nextLabel = await mealPlan(page)
      .getByTestId(`m31-plan-${day(31)}`)
      .getAttribute('data-drop-label')
    await nextDay.release()
    const oneDay = page
      .locator('ion-toast.pack-toast')
      .filter({ hasText: `“Bruschetta” is now on ${nextLabel}` })
    await expect(oneDay).toHaveCount(1)
    await expect(oneDay).not.toContainText('already bought')
    await expect(oneDay).toHaveJSProperty('duration', 3000)
    await writesLanded(page)
    await undoFromSnackbar(page, `“Bruschetta” is now on ${nextLabel}`)
    await expect(mealRow(page, day(30), 'Bruschetta')).toBeVisible()
    await writesLanded(page)

    // Three days later: the bought fresh ones are named, the oil is not.
    const later = await liftMealOnto(page, mealGrip(page, day(30), 'Bruschetta'), () =>
      mealPlan(page).getByTestId(`m31-plan-${day(33)}`),
    )
    const saturday = await weekdayOf(day(33))
    await later.release()
    const asked = `🌿 Brot, Rucola are already bought – will they last until ${saturday}?`
    const toast = page.locator('ion-toast.pack-toast').filter({ hasText: asked })
    await expect(toast).toHaveCount(1)
    await expect(toast).not.toContainText('Olivenöl')
    // A question takes longer to read than a confirmation: it stays longer.
    await expect(toast).toHaveJSProperty('duration', 8000)
    await expect(mealRow(page, day(33), 'Bruschetta')).toBeVisible()
    await writesLanded(page)
    // Only a question: the undo puts it back.
    await undoFromSnackbar(page, asked)
    await expect(mealRow(page, day(30), 'Bruschetta')).toBeVisible()
    await writesLanded(page)

    // The sheet's day chips ask the same.
    await sheetGone(page)
    await mealRow(page, day(30), 'Bruschetta').click()
    const again = mealSheet(page)
    await again.getByTestId(`meal-day-${day(34)}`).click()
    await again.getByTestId('meal-save').click()
    await expect(mealRow(page, day(34), 'Bruschetta')).toBeVisible()
    const saved = page.locator('ion-toast').filter({
      hasText: `🌿 Brot, Rucola are already bought – will they last until ${await weekdayOf(day(34))}?`,
    })
    await expect(saved).toHaveCount(1)
    await expect(saved).toHaveJSProperty('duration', 8000)
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

test.describe('M31 meal plan — the ＋ opens the meal sheet (FR-21.24) @local @meals', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M31-15 (FR-21.24): M31 keeps its sheet rather than M6's composer — a
   * meal carries a slot, a day and its ingredients. The ＋ says what it opens,
   * and opens it: a new meal's sheet.
   */
  test('E2E-M31-15: the ＋ is named for a new meal and opens the meal sheet', async ({ page }) => {
    const day = await days(page, [30, 31])
    await createTripViaWizard(page, {
      name: 'Engadin Tage',
      startDate: day(30),
      endDate: day(31),
      travelers: ['Andy'],
    })
    const plan = await openMeals(page)
    const fab = plan.getByRole('button', { name: 'New meal', exact: true })
    await expect(fab).toBeVisible()

    await fab.click()
    await expect(mealSheet(page).getByTestId('meal-sheet-title')).toHaveText(/^New: /)
    await expect(mealSheet(page).getByTestId('meal-title')).toBeVisible()
  })
})

/**
 * UX-08, G-13: in German on the reference device and at 360 px, no chip in
 * the meal sheet is cut. The slots read in their short names and wrap; the
 * trip's days scroll, faded on the side that has more and centred on the
 * chosen day — when the sheet opens on a saved meal and whenever another day
 * is chosen; the shortlist's long idea names wrap whole.
 */
test.describe('M31 meal sheet — every chip whole (G-13, UX-08) @local @meals', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M31-16: slot, day and shortlist chips stand whole at 360 and 412 px, the chosen day centred', async ({
    page,
  }) => {
    const offsets = Array.from({ length: 15 }, (_, n) => 30 + n)
    const day = await days(page, offsets)
    await createTripViaWizard(page, {
      name: 'Engadin Lang',
      startDate: day(30),
      endDate: day(44),
      travelers: ['Andy'],
    })
    const LONG_IDEAS = [
      'Bernina Express nach Tirano',
      'Muottas Muragl – Alp Languard',
      // Wider than the whole sheet at 360 px: it breaks between its words, inside its chip.
      'Wanderung von Pontresina über die Fuorcla Surlej nach Silvaplana',
    ]
    await openIdeas(page)
    for (const title of LONG_IDEAS) {
      await addIdea(page, { title })
      const detail = await openIdea(page, title)
      await detail.getByTestId('idea-state-shortlisted').click()
      await expect(detail.getByTestId('idea-state-shortlisted')).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await detail.getByTestId('idea-detail-close').click()
      await expect(ideaDetail(page)).toHaveCount(0)
    }
    await openMeals(page)
    await addMeal(page, { day: day(37), slot: 'snack', title: 'Nusstorte' })
    await switchToGerman(page)
    await expect(mealRow(page, day(37), 'Nusstorte')).toBeVisible()

    for (const phone of CUE_PHONES) {
      await page.setViewportSize(phone)
      const at = `at ${phone.width} px`
      // A saved meal on the trip's eighth day: the row opens centred on it.
      await mealRow(page, day(37), 'Nusstorte').click()
      const sheet = mealSheet(page)
      const slots = sheet.getByRole('group', { name: 'Mahlzeit' })
      const dayRow = sheet.getByRole('group', { name: 'Tag' })
      await expect(slots.getByRole('button')).toHaveText([
        'Morgen',
        'Mittag',
        // The zero-width space is the label's one break opportunity (G-13).
        'Znüni/\u200bZvieri',
        'Abend',
      ])
      expect(await cutLabels(slots, 'button'), `slots ${at}`).toEqual([])
      await expect
        .poll(() => rowCue(dayRow, '[aria-pressed="true"]'), { message: `day row ${at}` })
        .toEqual({ rest: 'centred', faded: 'both' })
      expect(await cutLabels(dayRow, 'button'), `days ${at}`).toEqual([])

      // Another day chosen comes to the centre; the first day holds the row at its start.
      // The neighbour stands whole beside the centred chip, so the click scrolls nothing
      // itself: only the row's own re-centring can bring it to the middle.
      await sheet.getByTestId(`meal-day-${day(38)}`).click()
      await expect
        .poll(() => rowCue(dayRow, '[aria-pressed="true"]'), { message: `day 9 ${at}` })
        .toEqual({ rest: 'centred', faded: 'both' })
      await sheet.getByTestId(`meal-day-${day(32)}`).click()
      await sheet.getByTestId(`meal-day-${day(30)}`).click()
      await expect
        .poll(() => rowCue(dayRow, '[aria-pressed="true"]'), { message: `day 1 ${at}` })
        .toEqual({ rest: 'start', faded: 'end' })

      await sheet.getByTestId('meal-kind-out').click()
      const shortlist = sheet.getByRole('group', { name: 'Von der Ideen-Shortlist' })
      for (const title of LONG_IDEAS) {
        await expect(shortlist.getByRole('button', { name: title, exact: true })).toHaveCount(1)
      }
      expect(await cutLabels(shortlist, 'button'), `shortlist ${at}`).toEqual([])
      expect(await brokenWords(shortlist.getByRole('button')), `shortlist ${at}`).toEqual([])

      await sheet.getByTestId('meal-sheet-close').click()
      await sheetGone(page)
    }
  })
})

/**
 * UX-08, G-13 — the short slot names wherever a slot is a label, in German at
 * 360 and 412 px: M31's rows hold *Morgen* whole in their label column, and
 * *Znüni/Zvieri* breaks only at its slash — on the rows, on the drag chip's
 * fields and in M1's block; never inside a word, never past its box.
 */
test.describe('M31 slot names — whole where a slot is a label (G-13, UX-08) @local @meals', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M31-17: Morgen and Znüni/Zvieri stand whole on the rows, the drag chip and the dashboard', async ({
    page,
  }) => {
    const day = await days(page, [-1, 0, 2])
    await createTripViaWizard(page, {
      name: 'Engadin heute',
      startDate: day(-1),
      endDate: day(2),
      travelers: ['Andy'],
    })
    await openMeals(page)
    await addMeal(page, { day: day(0), slot: 'breakfast', title: 'Zmorge' })
    await addMeal(page, { day: day(0), slot: 'snack', title: 'Nusstorte' })
    await switchToGerman(page)
    await expect(mealRow(page, day(0), 'Nusstorte')).toBeVisible()
    const plan = page.url()

    for (const phone of CUE_PHONES) {
      await page.setViewportSize(phone)
      const at = `at ${phone.width} px`
      const labels = mealsOfDay(page, day(0)).locator('[data-slot] .jp-eyebrow')
      await expect(labels).toHaveText(['Morgen', 'Znüni/\u200bZvieri'])
      expect(await brokenWords(labels), `rows ${at}`).toEqual([])

      // Held, the meal's chip lays the slots over the list's columns.
      const host = mealPlan(page)
      const grip = mealGrip(page, day(0), 'Nusstorte')
      await grip.hover()
      const g = (await grip.boundingBox())!
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
      await page.mouse.down()
      await expect(host).toHaveAttribute('data-drag', 'dragging')
      const fields = page.locator('[data-drag-ghost] [data-carry-choice]')
      await expect(fields.and(page.locator('[data-carry-choice="snack"]'))).toHaveText(
        'Znüni/\u200bZvieri',
      )
      expect(await brokenWords(fields), `drag chip ${at}`).toEqual([])
      // Let go where it was lifted: the meal stays.
      await page.mouse.up()
      await expect(host).toHaveAttribute('data-drag', 'idle')
      await expect(mealRow(page, day(0), 'Nusstorte')).toBeVisible()

      await page.goto(PATH.dashboard)
      const block = visiblePage(page).getByTestId('dashboard-meals-Engadin heute')
      const dashLabels = block.locator('[data-testid^="dashboard-meal-"] .jp-eyebrow')
      await expect(dashLabels).toHaveText(['Morgen', 'Znüni/\u200bZvieri'])
      expect(await brokenWords(dashLabels), `dashboard ${at}`).toEqual([])
      await page.goto(plan)
      await expect(mealRow(page, day(0), 'Nusstorte')).toBeVisible()
    }
  })

  /**
   * E2E-M31-18 (§3.33, UX-10): one word per slot. M29's time column says the
   * short noun M1 and M31 say, the line's label its kind, the sheet's title
   * the long form — and no cipher anywhere.
   */
  test('E2E-M31-18: M29 and M1 say the same short slot words, the sheet its long form, and Zw. appears nowhere', async ({
    page,
  }) => {
    const day = await days(page, [-1, 0, 2])
    await createTripViaWizard(page, {
      name: 'Engadin Wörter',
      startDate: day(-1),
      endDate: day(2),
      travelers: ['Andy'],
    })
    await openMeals(page)
    await addMeal(page, { day: day(0), slot: 'dinner', title: 'Capuns' })
    await addMeal(page, { day: day(0), slot: 'breakfast', title: 'Zmorge' })
    await addMeal(page, { day: day(0), slot: 'snack', title: 'Nusstorte' })
    await addMeal(page, { day: day(0), slot: 'lunch', title: 'Gerstensuppe' })
    await switchToGerman(page)
    const short = ['Morgen', 'Mittag', 'Znüni/\u200bZvieri', 'Abend']
    const cipher = /\bzw\./i

    await openDayPlan(page)
    await chooseDay(page, day(0))
    const lines = timelineLines(page)
    await expect(lines).toHaveCount(4)
    await expect(lines.locator('[data-testid^="m29-time-"]')).toHaveText(short)
    await expect(lines.locator('[data-testid^="m29-kind-"]')).toHaveText(Array(4).fill('Mahlzeit'))
    await expect(visiblePage(page).getByTestId('m29-timeline')).not.toContainText(cipher)

    await lines.filter({ hasText: 'Capuns' }).locator('button.open').click()
    await expect(mealSheet(page).getByTestId('meal-sheet-title')).toHaveText('Abendessen')
    await expect(mealSheet(page).locator('[data-testid^="meal-slot-"]')).toHaveText(short)
    await mealSheet(page).getByTestId('meal-sheet-close').click()
    await sheetGone(page)

    await page.goto(PATH.dashboard)
    const block = visiblePage(page).getByTestId('dashboard-meals-Engadin Wörter')
    await expect(block.locator('[data-testid^="dashboard-meal-"] .jp-eyebrow')).toHaveText(short)
    await expect(block).not.toContainText(cipher)
  })
})
