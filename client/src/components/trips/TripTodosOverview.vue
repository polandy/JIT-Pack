<script setup lang="ts">
/**
 * M1's *Aufgaben* card (FR-7.4): the open trip todos of every active trip,
 * reported and not operated — the dashboard takes no actions (owner,
 * 2026-09-18). Each trip's block leads into the trip, where M4's *Aufgaben
 * für die Reise* section is where they are ticked, added and removed.
 *
 * A trip with no todo at all is left out: with nothing to add here, an
 * empty group would only push the hero down.
 */
import { computed } from 'vue'

import SectionHead from '@/components/global/SectionHead.vue'
import { tripTodoProgress, tripTodoStatus } from '@/domain/tripTodos'
import { t } from '@/i18n'
import { tripPath } from '@/router/paths'
import { useTripStore } from '@/stores/tripStore'
import type { Trip } from '@/types/domain'

const props = defineProps<{
  /** The active trips, in the order the screen shows them. */
  trips: readonly Trip[]
}>()

const tripStore = useTripStore()

const groups = computed(() =>
  props.trips
    .map((trip) => {
      const todos = tripStore.getTripTodos(trip.id)
      const progress = tripTodoProgress(todos)
      return {
        trip,
        open: todos.filter((todo) => todo.task_state === 'open'),
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
      <RouterLink
        v-for="group in groups"
        :key="group.trip.id"
        class="todo-group"
        :to="tripPath(group.trip.id)"
        :data-testid="`trip-todos-${group.trip.name}`"
      >
        <span class="group-head">
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
        </span>
        <ul v-if="group.open.length > 0" class="open-list">
          <li
            v-for="todo in group.open"
            :key="todo.id"
            :data-testid="`dashboard-trip-todo-${todo.body}`"
          >
            {{ todo.body }}
          </li>
        </ul>
      </RouterLink>
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
  text-decoration: none;
}

.todo-group + .todo-group {
  border-top: 1px solid var(--jp-surface-border);
}

.group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
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

.open-list li + li {
  margin-top: 2px;
}
</style>
