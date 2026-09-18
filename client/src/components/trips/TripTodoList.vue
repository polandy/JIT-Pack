<script setup lang="ts">
/**
 * One trip's own todos (FR-7.4), editable: the list M4's *Aufgaben für die
 * Reise* section unfolds to. Open ones are ticked off in place, resolved ones
 * fold away but stay reachable to untick, and the composer adds one.
 *
 * The trip is where these are written (owner, 2026-09-18): M1 only reports
 * them, because the dashboard takes no actions.
 */
import { IonButton, IonCheckbox, IonIcon, IonInput, IonItem, IonLabel } from '@ionic/vue'
import { chevronForwardOutline, closeOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import { useOrchestrator } from '@/composables/useOrchestrator'
import { t } from '@/i18n'
import { useTripStore } from '@/stores/tripStore'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import type { TripTodo } from '@/types/domain'

const props = defineProps<{
  /** The trip whose todos these are. */
  tripId: string
}>()

const tripStore = useTripStore()
const orchestrator = useOrchestrator()

const todos = computed(() => tripStore.getTripTodos(props.tripId))
const open = computed(() => todos.value.filter((todo) => todo.task_state === 'open'))
const resolved = computed(() => todos.value.filter((todo) => todo.task_state === 'resolved'))

const draft = ref('')
const showResolved = ref(false)

function add() {
  const body = draft.value.trim()
  if (!body) return
  orchestrator.addTripTodo(props.tripId, CLIENT_ACTOR_PLACEHOLDER, body)
  draft.value = ''
}

function toggle(todo: TripTodo) {
  if (todo.task_state === 'open') orchestrator.resolveTripTodo(todo)
  else orchestrator.reopenTripTodo(todo)
}
</script>

<template>
  <div class="trip-todo-list" data-testid="trip-todo-list">
    <IonItem
      v-for="todo in open"
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
        :aria-label="t('tripTodos.remove')"
        :data-testid="`trip-todo-remove-${todo.body}`"
        @click="orchestrator.deleteTripTodo(todo)"
      >
        <IonIcon :icon="closeOutline" />
      </button>
    </IonItem>

    <!-- Resolved ones fold away but stay reachable: unticking is the only
         undo a mis-tap has, short of typing the task again. -->
    <template v-if="resolved.length > 0">
      <button
        type="button"
        class="resolved-toggle"
        :class="{ open: showResolved }"
        :aria-expanded="showResolved ? 'true' : 'false'"
        data-testid="trip-todos-resolved"
        @click="showResolved = !showResolved"
      >
        <IonIcon :icon="chevronForwardOutline" class="caret" />
        {{ t('tripTodos.resolved', { n: resolved.length }) }}
      </button>
      <template v-if="showResolved">
        <IonItem
          v-for="todo in resolved"
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
            :aria-label="t('tripTodos.remove')"
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
        v-model="draft"
        :placeholder="t('tripTodos.add')"
        data-testid="trip-todo-input"
        @keydown.enter="add"
      />
      <IonButton size="small" :disabled="!draft.trim()" data-testid="trip-todo-add" @click="add">
        {{ t('common.add') }}
      </IonButton>
    </div>
  </div>
</template>

<style scoped>
.trip-todo-list {
  padding: 0 4px 12px;
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
  padding: 6px 14px;
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
  margin: 6px 14px 0;
}

.composer ion-input {
  --background: var(--ct-surface0);
  --padding-start: 12px;
  --padding-end: 12px;
  border-radius: var(--jp-r-md);
}
</style>
