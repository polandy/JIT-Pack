<script setup lang="ts">
/**
 * M1's *Aufgaben* card (FR-7.4): the trip's own todos — house chores, not
 * packing — for every active trip, each with its own "all done" check.
 *
 * Every active trip gets a group even when it has no todo yet, because the
 * group's composer is where its first one is typed; a section that appeared
 * only once a todo existed would have no way to receive the first.
 */
import { IonButton, IonCheckbox, IonIcon, IonInput, IonItem, IonLabel } from '@ionic/vue'
import { chevronForwardOutline, closeOutline } from 'ionicons/icons'
import { computed, reactive } from 'vue'

import SectionHead from '@/components/global/SectionHead.vue'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { tripTodoProgress } from '@/domain/tripTodos'
import { t } from '@/i18n'
import { useTripStore } from '@/stores/tripStore'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import type { Trip, TripTodo } from '@/types/domain'

const props = defineProps<{
  /** The active trips, in the order the screen shows them. */
  trips: readonly Trip[]
}>()

const tripStore = useTripStore()
const orchestrator = useOrchestrator()

/** What is typed in each trip's composer, by trip id. */
const drafts = reactive<Record<string, string>>({})
/** Which trips show their resolved todos — per trip, closed by default. */
const showResolved = reactive<Record<string, boolean>>({})

const groups = computed(() =>
  props.trips.map((trip) => {
    const todos = tripStore.getTripTodos(trip.id)
    return {
      trip,
      open: todos.filter((todo) => todo.task_state === 'open'),
      resolved: todos.filter((todo) => todo.task_state === 'resolved'),
      progress: tripTodoProgress(todos),
    }
  }),
)

const openTotal = computed(() => groups.value.reduce((sum, g) => sum + g.progress.open, 0))

function statusLine(progress: { open: number; done: number; total: number }): string | null {
  if (progress.total === 0) return null
  return progress.open === 0
    ? t('dashboard.tripTodosAllDone')
    : t('dashboard.tripTodosProgress', { done: progress.done, total: progress.total })
}

function add(tripId: string) {
  const body = (drafts[tripId] ?? '').trim()
  if (!body) return
  orchestrator.addTripTodo(tripId, CLIENT_ACTOR_PLACEHOLDER, body)
  drafts[tripId] = ''
}

function toggle(todo: TripTodo) {
  if (todo.task_state === 'open') orchestrator.resolveTripTodo(todo)
  else orchestrator.reopenTripTodo(todo)
}
</script>

<template>
  <template v-if="trips.length > 0">
    <SectionHead
      :title="t('dashboard.tripTodos')"
      :count="openTotal"
      data-testid="dashboard-trip-todos-head"
    />
    <div class="jp-card todos-card" data-testid="dashboard-trip-todos">
      <section
        v-for="group in groups"
        :key="group.trip.id"
        class="todo-group"
        :data-testid="`trip-todos-${group.trip.name}`"
      >
        <div class="group-head">
          <h3 class="trip-name">{{ group.trip.name }}</h3>
          <span
            v-if="statusLine(group.progress)"
            class="status"
            :class="{ done: group.progress.open === 0 }"
            :data-testid="`trip-todos-status-${group.trip.name}`"
          >
            {{ statusLine(group.progress) }}
          </span>
        </div>

        <IonItem
          v-for="todo in group.open"
          :key="todo.id"
          lines="none"
          class="todo-row"
          :data-testid="`trip-todo-${todo.body}`"
        >
          <IonCheckbox slot="start" :checked="false" @ionChange="toggle(todo)" />
          <IonLabel>{{ todo.body }}</IonLabel>
          <button
            slot="end"
            type="button"
            class="rm"
            :aria-label="t('dashboard.tripTodoRemove')"
            :data-testid="`trip-todo-remove-${todo.body}`"
            @click="orchestrator.deleteTripTodo(todo)"
          >
            <IonIcon :icon="closeOutline" />
          </button>
        </IonItem>

        <!-- Resolved ones fold away but stay reachable: unticking is the only
             undo a mis-tap has, short of typing the task again. -->
        <template v-if="group.resolved.length > 0">
          <button
            type="button"
            class="resolved-toggle"
            :class="{ open: showResolved[group.trip.id] }"
            :aria-expanded="showResolved[group.trip.id] ? 'true' : 'false'"
            :data-testid="`trip-todos-resolved-${group.trip.name}`"
            @click="showResolved[group.trip.id] = !showResolved[group.trip.id]"
          >
            <IonIcon :icon="chevronForwardOutline" class="caret" />
            {{ t('dashboard.tripTodosResolved', { n: group.resolved.length }) }}
          </button>
          <template v-if="showResolved[group.trip.id]">
            <IonItem
              v-for="todo in group.resolved"
              :key="todo.id"
              lines="none"
              class="todo-row resolved"
              :data-testid="`trip-todo-${todo.body}`"
            >
              <IonCheckbox slot="start" :checked="true" @ionChange="toggle(todo)" />
              <IonLabel>{{ todo.body }}</IonLabel>
              <button
                slot="end"
                type="button"
                class="rm"
                :aria-label="t('dashboard.tripTodoRemove')"
                :data-testid="`trip-todo-remove-${todo.body}`"
                @click="orchestrator.deleteTripTodo(todo)"
              >
                <IonIcon :icon="closeOutline" />
              </button>
            </IonItem>
          </template>
        </template>

        <div class="composer">
          <IonInput
            v-model="drafts[group.trip.id]"
            :placeholder="t('dashboard.tripTodoAdd')"
            :data-testid="`trip-todo-input-${group.trip.name}`"
            @keydown.enter="add(group.trip.id)"
          />
          <IonButton
            size="small"
            :disabled="!(drafts[group.trip.id] ?? '').trim()"
            :data-testid="`trip-todo-add-${group.trip.name}`"
            @click="add(group.trip.id)"
          >
            {{ t('common.add') }}
          </IonButton>
        </div>
      </section>
    </div>
  </template>
</template>

<style scoped>
.todos-card {
  display: block;
  margin-bottom: 12px;
  padding: 10px 6px 12px;
}

.todo-group + .todo-group {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--jp-surface-border);
}

.group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px 4px;
}

.trip-name {
  margin: 0;
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

.todo-row {
  --min-height: 36px;
}

.todo-row.resolved ion-label {
  color: var(--ct-subtext0);
  text-decoration: line-through;
}

.rm {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-sm);
  cursor: pointer;
}

.resolved-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: none;
  background: none;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.resolved-toggle .caret {
  transition: transform 0.15s;
}

.resolved-toggle.open .caret {
  transform: rotate(90deg);
}

.composer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 10px 0;
}

.composer ion-input {
  --background: var(--ct-surface0);
  --padding-start: 12px;
  --padding-end: 12px;
  border-radius: var(--jp-r-md);
}
</style>
