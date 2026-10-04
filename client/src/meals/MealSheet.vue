<script setup lang="ts">
/**
 * The one meal sheet (M31), mounted once by the composition root: whichever
 * screen asks — M31, a meal's line on the day plan (FR-33.5), a picnic on an
 * excursion's list (FR-33.6), the dashboard's block (FR-33.7) — the sheet
 * opens over it. The body is keyed by the request, so each opening starts
 * from the meal as it is stored.
 */
import { computed, ref, watch } from 'vue'

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
/**
 * Whether the sheet stands laid out on screen — a state rather than the
 * `present` event, so a body mounted after it still knows (CODING_PRINCIPLES §3).
 */
const presented = ref(false)
watch(request, (current) => {
  if (current === null) presented.value = false
})
</script>

<template>
  <SheetModal
    :is-open="request !== null"
    testid="meal"
    @present="presented = true"
    @dismiss="sheet.close()"
  >
    <MealSheetBody
      v-if="request"
      :key="key"
      :request="request"
      :presented="presented"
      @close="sheet.close()"
    />
  </SheetModal>
</template>
