<script setup lang="ts">
/**
 * The trip's tasks (FR-7.6), editable: the list M4's *Aufgaben für die Reise*
 * section unfolds to. Open ones are ticked off in place, resolved ones fold
 * away but stay reachable to untick, and the composer adds one.
 *
 * Two kinds of task share the list. The trip's own (FR-7.4) carry a seat and
 * a ✕; a row's preparation (FR-7.3) carries the chip of the row it belongs to
 * instead — it names nobody (FR-7.5: the row already does) and it is removed
 * where it lives, which is the row. The chip is what says which is which.
 *
 * The trip is where these are written (owner, 2026-09-18): M1 only reports
 * them, because the dashboard takes no actions.
 *
 * Every act is *emitted*: both kinds are written through different actions
 * and both undone through the screen's one snackbar (FR-25.31), so the writer
 * is the screen and this list reports the tap. The composer is the exception —
 * it can only write the trip's own kind, so it writes it.
 */
import { IonButton, IonCheckbox, IonIcon, IonInput, IonItem, IonLabel } from '@ionic/vue'
import { chevronForwardOutline, closeOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import AssigneeSeat from '@/components/trips/AssigneeSeat.vue'
import TaskItemChip from '@/components/trips/TaskItemChip.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { useOrchestrator } from '@/composables/useOrchestrator'
import type { TripTask } from '@/domain/tripTodos'
import { t } from '@/i18n'
import { tripItemPath } from '@/router/paths'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'

const props = defineProps<{
  /** The trip whose tasks these are. */
  tripId: string
  /** Its tasks, in FR-7.6's order — the screen counts the same list. */
  tasks: readonly TripTask[]
  /**
   * FR-7.5: whether there is anybody to hand a task to. Absent in Local and
   * Single-User Mode, which have no second account (G-8) — the seat is then
   * not rendered at all, rather than offered with nobody behind it.
   */
  assignable?: boolean
  /** A member's display name, for the avatar's initials. */
  nameOf?: (userId: string) => string | null
}>()

/** Every act here is reported to the screen, which owns the one snackbar that takes it back (FR-25.31). */
const emit = defineEmits<{
  /** A task was written — its id, for the undo that takes it out again. */
  added: [id: string, body: string]
  /** A task's checkbox was operated; the screen writes it and arms the undo. */
  toggle: [task: TripTask]
  /** Asked to go — the screen hides it and deletes it once the undo lapses. */
  remove: [task: TripTask]
  /** FR-7.5: the seat was tapped — the screen asks whose job it is. */
  assign: [task: TripTask]
}>()

const orchestrator = useOrchestrator()

const open = computed(() => props.tasks.filter((task) => task.task_state === 'open'))
const resolved = computed(() => props.tasks.filter((task) => task.task_state === 'resolved'))

const draft = ref('')
const showResolved = ref(false)

function add() {
  const body = draft.value.trim()
  if (!body) return
  const id = orchestrator.addTripTodo(props.tripId, CLIENT_ACTOR_PLACEHOLDER, body)
  draft.value = ''
  emit('added', id, body)
}

/** The avatar a task's seat shows, or null for the empty seat. */
function assigneeOf(task: TripTask) {
  const id = task.assignee_user_id
  return id ? { variant: 'assignee' as const, id, name: props.nameOf?.(id) ?? null } : null
}
</script>

<template>
  <div class="trip-todo-list" data-testid="trip-todo-list">
    <IonItem
      v-for="task in open"
      :key="task.id"
      lines="none"
      class="todo-row"
      :data-testid="`trip-todo-${task.body}`"
    >
      <IonCheckbox slot="start" :checked="false" @ionChange="emit('toggle', task)" />
      <IonLabel>{{ task.body }}</IonLabel>
      <span slot="end" class="todo-end">
        <!-- FR-7.6: the chip stands where the trip's own task carries its
             seat — one line, one place that says what the task belongs to. -->
        <TaskItemChip v-if="task.item" :item="task.item" :to="tripItemPath(tripId, task.item.id)" />
        <template v-else>
          <AssigneeSeat
            v-if="assignable"
            :avatar="assigneeOf(task)"
            :data-testid="`trip-todo-assign-${task.body}`"
            @assign="emit('assign', task)"
          />
          <UserAvatar
            v-else-if="task.assignee_user_id"
            variant="assignee"
            :name="nameOf?.(task.assignee_user_id)"
            :seed="task.assignee_user_id"
            :data-testid="`trip-todo-assignee-${task.body}`"
          />
          <button
            type="button"
            class="rm"
            :aria-label="t('tripTodos.remove')"
            :data-testid="`trip-todo-remove-${task.body}`"
            @click="emit('remove', task)"
          >
            <IonIcon :icon="closeOutline" />
          </button>
        </template>
      </span>
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
          v-for="task in resolved"
          :key="task.id"
          lines="none"
          class="todo-row resolved"
          :data-testid="`trip-todo-${task.body}`"
        >
          <IonCheckbox slot="start" :checked="true" @ionChange="emit('toggle', task)" />
          <IonLabel>{{ task.body }}</IonLabel>
          <span slot="end" class="todo-end">
            <TaskItemChip
              v-if="task.item"
              :item="task.item"
              :to="tripItemPath(tripId, task.item.id)"
            />
            <template v-else>
              <!-- Done is done: who had it is still worth reading, but handing
                   over a finished task decides nothing. -->
              <UserAvatar
                v-if="task.assignee_user_id"
                variant="assignee"
                :name="nameOf?.(task.assignee_user_id)"
                :seed="task.assignee_user_id"
                :data-testid="`trip-todo-assignee-${task.body}`"
              />
              <button
                type="button"
                class="rm"
                :aria-label="t('tripTodos.remove')"
                :data-testid="`trip-todo-remove-${task.body}`"
                @click="emit('remove', task)"
              >
                <IonIcon :icon="closeOutline" />
              </button>
            </template>
          </span>
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

.todo-end {
  display: flex;
  align-items: center;
  gap: 6px;
  /* The chip is the one thing here that carries text, so it is the one thing
     that can outgrow the row; everything else keeps its box. */
  min-width: 0;
  max-width: 55%;
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
