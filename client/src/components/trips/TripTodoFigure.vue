<script setup lang="ts">
/**
 * A trip's own todos as a figure (FR-7.4): ring, „1/4 Aufgaben", „3 offen"
 * and a track, set beside the packing share on M4's header line and on M1's
 * hero. The same four parts as the share beside it, in the same order, so
 * the two stand as a pair: same ring, same lines, tracks on one level.
 *
 * Two figures side by side because they are two answers — fully packed and
 * every chore done are checked separately, and a count that mixed them would
 * let a houseplant hold a finished rucksack below 100 %. The ring is the same
 * `--jp-done` as the packing one: progress has one colour (G-11), and the
 * label is what tells the two apart.
 *
 * Renders nothing for a trip with no todo, rather than „0/0".
 */
import { computed } from 'vue'

import ProgressFigure from '@/components/global/ProgressFigure.vue'
import { tripTodoPercent, tripTodoProgress, tripTodoStatus } from '@/domain/tripTodos'
import { t } from '@/i18n'
import { useTripStore } from '@/stores/tripStore'

const props = defineProps<{
  /** The trip whose todos are counted. */
  tripId: string
  /** The ring's diameter — the packing figure beside it sets the scale. */
  ringSize: number
  /** Put on the fraction, for the cases that read it. */
  testid: string
}>()

const tripStore = useTripStore()

const progress = computed(() => tripTodoProgress(tripStore.getTripTodos(props.tripId)))
const shown = computed(() => tripTodoStatus(progress.value) !== 'none')
</script>

<template>
  <ProgressFigure
    v-if="shown"
    class="trip-todo-figure"
    :percent="tripTodoPercent(progress)"
    :headline="t('tripTodos.figure', { done: progress.done, total: progress.total })"
    :detail="progress.open > 0 ? t('tripTodos.open', { n: progress.open }) : null"
    :ring-size="ringSize"
    paired
    :headline-testid="testid"
  />
</template>
