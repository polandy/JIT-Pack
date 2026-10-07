<script setup lang="ts">
/**
 * The one meal sheet (M31), mounted once by the composition root: whichever
 * screen asks — M31, a meal's line on the day plan (FR-33.5), a picnic on an
 * excursion's list (FR-33.6), the dashboard's block (FR-33.7) — the sheet
 * opens over it. The body is keyed by the request, so each opening starts
 * from the meal as it is stored.
 */
import { computed } from 'vue'

import SheetModal from '@/components/global/SheetModal.vue'
import MealSheetBody from './MealSheetBody.vue'
import { useMealSheet } from './sheet'

const sheet = useMealSheet()
const request = computed(() => sheet.request)
const key = computed(() => {
  const r = request.value
  if (!r) return ''
  return r.mealId ?? `new:${r.day}:${r.slot}`
})
</script>

<template>
  <SheetModal :is-open="request !== null" testid="meal" @dismiss="sheet.close()">
    <MealSheetBody v-if="request" :key="key" :request="request" @close="sheet.close()" />
  </SheetModal>
</template>
