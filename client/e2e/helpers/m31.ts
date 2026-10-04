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

/** Plan a meal from its empty slot on M31 (the snack from the card's foot); ends with its row. */
export async function addMeal(page: Page, meal: MealSeed): Promise<void> {
  await mealPlan(page).getByTestId(`m31-add-${meal.day}-${meal.slot}`).click()
  const sheet = mealSheet(page)
  await expect(sheet.getByTestId('meal-title')).toBeVisible()
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
