<script setup lang="ts">
/**
 * A trip's tasks as a figure (FR-7.4, FR-7.6): ring, „1/4 Aufgaben", „3 offen"
 * and a track, set beside the packing share on M4's header line and on M1's
 * hero. The same four parts as the share beside it, in the same order, so
 * the two stand as a pair: same ring, same lines, tracks on one level.
 *
 * It counts **every** task of the trip (FR-7.6) — its own and the
 * preparations its rows owe — because the list under it holds both and a
 * figure that disagreed with the list it heads would be read as a defect.
 *
 * Two figures side by side because they are two answers — fully packed and
 * everything done are checked separately, and a count that mixed them would
 * let a houseplant hold a finished rucksack below 100 %. The ring is the same
 * `--jp-done` as the packing one: progress has one colour (G-11), and the
 * label is what tells the two apart.
 *
 * Renders nothing for a trip with no task, rather than „0/0".
 */
import { computed } from 'vue'

import ProgressFigure from '@/components/global/ProgressFigure.vue'
import { useTripTasks } from '@/composables/useTripTasks'
import {
  tripTodoPercent,
  tripTodoProgress,
  tripTodoStatus,
  type TripTask,
} from '@/domain/tripTodos'
import { t } from '@/i18n'

const props = withDefaults(
  defineProps<{
    /** The trip whose todos are counted. */
    tripId: string
    /**
     * The ring's diameter — the packing figure beside it sets the scale.
     * Absent where there is no figure beside it (FR-5.10): the
     * tasks are then the card's one figure and take the lone size.
     */
    ringSize?: number
    /** Put on the fraction, for the cases that read it. */
    testid: string
    /**
     * FR-7.7: the tasks this figure stands for, where that is not all of the
     * trip's. M4's figure leads to a section that shows a *window* of the one
     * list — the preparations still due before the trip — and a figure that
     * counted more than the section it opens would be reporting on a screen
     * the reader is not looking at. M1 passes nothing and counts everything,
     * because its card lists everything. FR-7.14: the figure then says so —
     * *Beim Packen 0/2* — so three screens stop counting „Aufgaben" three
     * ways under one word.
     */
    tasks?: readonly TripTask[]
  }>(),
  { ringSize: undefined, tasks: undefined },
)

const { tasksOf } = useTripTasks()

const progress = computed(() => tripTodoProgress(props.tasks ?? tasksOf(props.tripId)))
const shown = computed(() => tripTodoStatus(progress.value) !== 'none')
</script>

<template>
  <ProgressFigure
    v-if="shown"
    class="trip-todo-figure"
    :percent="tripTodoPercent(progress)"
    :headline="
      t(tasks ? 'tripTodos.figurePacking' : 'tripTodos.figure', {
        done: progress.done,
        total: progress.total,
      })
    "
    :detail="progress.open > 0 ? t('tripTodos.open', { n: progress.open }) : null"
    :ring-size="ringSize"
    :paired="ringSize !== undefined"
    :headline-testid="testid"
  />
</template>
