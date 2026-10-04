/**
 * Which meal's sheet is open, wherever it was opened from — M31, a meal's
 * line on the day plan (FR-33.5), a picnic on an excursion's list (FR-33.6)
 * or the dashboard's block (FR-33.7). One sheet, mounted once by the
 * composition root (`MealSheetHost`), so every way in opens the same one
 * over the screen it was tapped on.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { MealSlot } from '@/types/domain'

/** What the sheet is asked to show: a meal, or a new one on a day and slot. */
export type MealSheetRequest =
  | { tripId: string; mealId: string }
  | { tripId: string; mealId: null; day: string; slot: MealSlot; dish?: string }

export const useMealSheet = defineStore('mealSheet', () => {
  const request = ref<MealSheetRequest | null>(null)

  function openMeal(tripId: string, mealId: string): void {
    request.value = { tripId, mealId }
  }

  /** A new meal on a day and slot — with an earlier dish already taken, by its title (FR-33.4). */
  function openNew(tripId: string, day: string, slot: MealSlot, dish?: string): void {
    request.value = { tripId, mealId: null, day, slot, ...(dish ? { dish } : {}) }
  }

  function close(): void {
    request.value = null
  }

  return { request, openMeal, openNew, close }
})
