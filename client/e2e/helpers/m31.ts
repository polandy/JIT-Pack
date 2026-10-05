import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { fillIonic } from './ionic'
import { visiblePage, writesLanded } from './page'
import { openTripView } from './trips'

/**
 * M31 — the trip's meal plan (§3.33), the meals module's screen, and its one
 * sheet, which the app shell mounts over whatever screen opened it.
 */

/** The meal plan, on the page the outlet shows. */
export function mealPlan(page: Page): Locator {
  return visiblePage(page).getByTestId('m31-page')
}

/** Reach the plan through the switcher; ends with its ＋ on screen. */
export async function openMeals(page: Page): Promise<Locator> {
  await openTripView(page, 'meals')
  const plan = mealPlan(page)
  await expect(plan.getByTestId('m31-fab')).toBeVisible()
  return plan
}

/** The meal sheet, wherever it was opened from. */
export function mealSheet(page: Page): Locator {
  return page.getByTestId('meal-sheet')
}

/** One day of the plan: its head and its card of slots. */
export function mealsOfDay(page: Page, day: string): Locator {
  return mealPlan(page).getByTestId(`m31-day-${day}`)
}

/** A meal's row on M31, by its dish. */
export function mealRow(page: Page, day: string, title: string): Locator {
  return mealsOfDay(page, day).locator('[data-testid^="m31-meal-"]').filter({ hasText: title })
}

/** Add an ingredient in the open sheet, by Enter in its field. */
export async function addIngredient(page: Page, text: string): Promise<void> {
  const field = mealSheet(page).getByTestId('meal-ingredient-add')
  await fillIonic(field, text)
  await field.locator('input').press('Enter')
  await expect(field.locator('input')).toHaveValue('')
}

export interface MealSeed {
  day: string
  slot: 'breakfast' | 'lunch' | 'snack' | 'dinner'
  title: string
  ingredients?: string[]
  /** Eaten out, at this place. */
  out?: string
}

/**
 * Open a new meal's sheet through M31's ＋ and choose its day and slot there —
 * the one way in that every state of the plan has (a free day is a line, not a
 * slot); ends with the sheet on that day and slot.
 */
export async function openNewMeal(
  page: Page,
  day: string,
  slot: MealSeed['slot'],
): Promise<Locator> {
  await mealPlan(page).getByTestId('m31-fab').click()
  const sheet = mealSheet(page)
  await expect(sheet.getByTestId('meal-title')).toBeVisible()
  await sheet.getByTestId(`meal-day-${day}`).click()
  await sheet.getByTestId(`meal-slot-${slot}`).click()
  await expect(sheet.getByTestId(`meal-day-${day}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByTestId(`meal-slot-${slot}`)).toHaveAttribute('aria-pressed', 'true')
  return sheet
}

/** Plan a meal through M31's ＋; ends with its row. */
export async function addMeal(page: Page, meal: MealSeed): Promise<void> {
  const sheet = await openNewMeal(page, meal.day, meal.slot)
  await fillIonic(sheet.getByTestId('meal-title'), meal.title)
  if (meal.out) {
    await sheet.getByTestId('meal-kind-out').click()
    await fillIonic(sheet.getByTestId('meal-place'), meal.out)
  }
  for (const ingredient of meal.ingredients ?? []) await addIngredient(page, ingredient)
  await sheet.getByTestId('meal-save').click()
  await expect(mealSheet(page)).toHaveCount(0)
  await expect(mealRow(page, meal.day, meal.title)).toBeVisible()
  await writesLanded(page)
}

/**
 * Every sheet gone — one still fading out takes the pointer meant for the
 * plan underneath (E2E-M25-08 found the same).
 */
export async function sheetGone(page: Page): Promise<void> {
  await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
}

/** A meal's grip on M31, by its day and dish (FR-33.15). */
export function mealGrip(page: Page, day: string, title: string): Locator {
  return mealRow(page, day, title).locator('[data-testid^="m31-grip-"]')
}

/** The chip a drag carries above the finger (ADR-094), and its line saying where it lands. */
export function carriedWhere(page: Page): Locator {
  return page.locator('[data-drag-ghost] [data-carry-where]')
}

/**
 * Lift a meal by its grip and hold it over `target`, the pointer still down;
 * ends with the target framed. `release` lets go and waits for the write.
 */
export async function liftMealOnto(
  page: Page,
  grip: Locator,
  target: () => Locator,
): Promise<{ release: () => Promise<void> }> {
  const host = mealPlan(page)
  await expect(host).toHaveAttribute('data-drag', 'idle')
  await sheetGone(page)
  await grip.hover()
  const g = (await grip.boundingBox())!
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await expect(host).toHaveAttribute('data-drag', 'dragging')
  // The free days open on the lift, so the target is read only now.
  const place = target()
  await expect(place).toBeVisible()
  const t = (await place.boundingBox())!
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 8 })
  await expect(place).toHaveAttribute('data-drop-over', '')
  return {
    release: async () => {
      await page.mouse.up()
      await expect(host).toHaveAttribute('data-drag', 'idle')
    },
  }
}
