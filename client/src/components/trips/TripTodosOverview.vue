<script setup lang="ts">
/**
 * M1's *Aufgaben* card (FR-7.4, FR-7.6): the open tasks of every active trip
 * — the trip's own and the preparations its rows owe — reported and not
 * operated, because the dashboard takes no actions (owner, 2026-09-18).
 *
 * One card rather than two (FR-7.6, ADR-068): the *Vorzubereiten* card that
 * listed preparations by item is this card's item-bound half now. What tells
 * the two kinds apart is the chip, which names the row and is the way into
 * it; the head of each block leads into the trip, where tasks are ticked.
 *
 * A trip with no task at all is left out: with nothing to add here, an empty
 * group would only push the hero down.
 *
 * An assigned task names its person after the body (FR-7.5) — read here, as
 * everything on this card is; the seat that changes it is M4's.
 */
import { computed } from 'vue'

import SectionHead from '@/components/global/SectionHead.vue'
import TaskItemChip from '@/components/trips/TaskItemChip.vue'
import { useTripTasks } from '@/composables/useTripTasks'
import { tripTodoProgress, tripTodoStatus } from '@/domain/tripTodos'
import { t } from '@/i18n'
import { nameFrom } from '@/lib/rowFacts'
import { tripItemPath, tripPath } from '@/router/paths'
import { useIdentityStore } from '@/stores/identityStore'
import type { Trip } from '@/types/domain'

const props = defineProps<{
  /** The active trips, in the order the screen shows them. */
  trips: readonly Trip[]
}>()

const identityStore = useIdentityStore()
const { tasksOf } = useTripTasks()

const groups = computed(() =>
  props.trips
    .map((trip) => {
      const tasks = tasksOf(trip.id)
      const progress = tripTodoProgress(tasks)
      return {
        trip,
        open: tasks.filter((task) => task.task_state === 'open'),
        progress,
        status: tripTodoStatus(progress),
      }
    })
    .filter((group) => group.status !== 'none'),
)

const openTotal = computed(() => groups.value.reduce((sum, g) => sum + g.progress.open, 0))
</script>

<template>
  <template v-if="groups.length > 0">
    <SectionHead
      :title="t('dashboard.tripTodos')"
      :count="openTotal"
      data-testid="dashboard-trip-todos-head"
    />
    <div class="jp-card todos-card" data-testid="dashboard-trip-todos">
      <div
        v-for="group in groups"
        :key="group.trip.id"
        class="todo-group"
        :data-testid="`trip-todos-${group.trip.name}`"
      >
        <!-- The block's head is the way into the trip; a task's chip is the
             way into its row. Two links, never one inside the other. -->
        <RouterLink
          class="group-head"
          :to="tripPath(group.trip.id)"
          :data-testid="`trip-todos-open-${group.trip.name}`"
        >
          <span class="trip-name">{{ group.trip.name }}</span>
          <span
            class="status"
            :class="{ done: group.status === 'allDone' }"
            :data-testid="`trip-todos-status-${group.trip.name}`"
          >
            {{
              group.status === 'allDone'
                ? t('tripTodos.allDone')
                : t('tripTodos.progress', {
                    done: group.progress.done,
                    total: group.progress.total,
                  })
            }}
          </span>
        </RouterLink>
        <ul v-if="group.open.length > 0" class="open-list">
          <li
            v-for="task in group.open"
            :key="task.id"
            :data-testid="`dashboard-trip-todo-${task.body}`"
          >
            <span class="body">{{ task.body }}</span>
            <TaskItemChip
              v-if="task.item"
              :item="task.item"
              :to="tripItemPath(group.trip.id, task.item.id)"
            />
            <span
              v-else-if="nameFrom(identityStore.directory, task.assignee_user_id)"
              class="who"
              :data-testid="`dashboard-trip-todo-assignee-${task.body}`"
            >
              · {{ nameFrom(identityStore.directory, task.assignee_user_id) }}
            </span>
          </li>
        </ul>
      </div>
    </div>
  </template>
</template>

<style scoped>
.todos-card {
  display: block;
  margin-bottom: 12px;
  padding: 6px 0;
}

.todo-group {
  display: block;
  padding: 10px 16px;
  color: inherit;
}

.todo-group + .todo-group {
  border-top: 1px solid var(--jp-surface-border);
}

.group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  color: inherit;
  text-decoration: none;
}

.trip-name {
  font-size: var(--jp-text-base);
  font-weight: var(--jp-weight-semibold);
}

.status {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.status.done {
  color: var(--jp-done);
  font-weight: var(--jp-weight-semibold);
}

.open-list {
  margin: 6px 0 0;
  padding-inline-start: 20px;
  color: var(--ct-subtext1);
}

.who {
  color: var(--ct-subtext0);
}

/* The chip sits on the task's own line and wraps under it on a narrow one,
   rather than pushing the body text out of the card. */
.open-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.open-list li + li {
  margin-top: 4px;
}

.body {
  min-width: 0;
}
</style>
