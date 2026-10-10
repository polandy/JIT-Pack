<script setup lang="ts">
/**
 * FR-7.4/7.7: M4's window onto the trip's tasks — chores that prepare a row,
 * still due before the trip. Written in the trip; M1 only reports them. The
 * tasks and their acts are `usePackingTasks`'; the fold is the page's, so it
 * outlasts the section while the closing pass hides it.
 */
import { IonIcon } from '@ionic/vue'
import { checkmarkDoneOutline, chevronDownOutline, chevronForwardOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import TripTodoList from '@/views/trips/tasks/TripTodoList.vue'
import { tripTodosUnfolded, type TripTask, type TripTodoStatus } from '@/domain/tripTodos'
import { t } from '@/i18n'
import { tripSubPath } from '@/router/paths'

const props = defineProps<{
  tripId: string
  tasks: readonly TripTask[]
  state: TripTodoStatus
  /** The head's own check, or null while there is no task. */
  line: string | null
  /** FR-7.5: whether there is anybody to hand a task to. */
  assignable: boolean
  nameOf: (userId: string | null) => string | null
  today: string
}>()

defineEmits<{
  assign: [task: TripTask]
  toggle: [task: TripTask]
  remove: [task: TripTask]
  open: [task: TripTask]
}>()

/**
 * The user's own fold of *Aufgaben für die Reise* this visit; null while
 * untouched, and then the tasks decide (`tripTodosUnfolded`).
 */
const fold = defineModel<boolean | null>('fold', { required: true })

/** Open while anything is owed, one line once nothing is. */
const unfolded = computed(() => tripTodosUnfolded(props.state, fold.value))

const root = ref<HTMLElement | null>(null)

/** Brings the section into view — the header figure leads here. */
function scrollIntoView() {
  root.value?.scrollIntoView({ block: 'nearest' })
}

defineExpose({ scrollIntoView })
</script>

<template>
  <div
    ref="root"
    class="tasks-section jp-card"
    :class="{ done: state === 'allDone' }"
    data-testid="m4-trip-todos"
  >
    <button
      class="tasks-header"
      data-testid="m4-trip-todos-toggle"
      :aria-expanded="unfolded ? 'true' : 'false'"
      @click="fold = !unfolded"
    >
      <IonIcon :icon="checkmarkDoneOutline" />
      <span>
        {{ t('tasks.whilePacking') }}
        <template v-if="line">
          · <span data-testid="m4-trip-todos-status">{{ line }}</span>
        </template>
      </span>
      <IonIcon :icon="chevronDownOutline" class="caret" :class="{ open: unfolded }" />
    </button>
    <!-- FR-7.7: no composer. Everything this window shows hangs off a
         packing row, and a trip task typed here would be written into a
         list that cannot show it. It is written on M25, which the line
         below leads to. -->
    <TripTodoList
      v-if="unfolded"
      :trip-id="tripId"
      :tasks="tasks"
      :assignable="assignable"
      :name-of="nameOf"
      :today="today"
      :empty-text="t('tripTodos.allDone')"
      @assign="(task: TripTask) => $emit('assign', task)"
      @toggle="(task: TripTask) => $emit('toggle', task)"
      @remove="(task: TripTask) => $emit('remove', task)"
      @open="(task: TripTask) => $emit('open', task)"
    />
    <!-- Always rendered, folded or not: this section is a window
         (FR-7.7), and a reader who finds it empty is exactly the one who
         has to be told where the rest of the tasks are. Hiding the way
         out inside the fold would answer only the readers who did not
         need it. -->
    <RouterLink
      class="tasks-all"
      :to="tripSubPath(tripId, 'tasks')"
      data-testid="m4-trip-todos-all"
    >
      {{ t('tasks.openAll') }}
      <IonIcon :icon="chevronForwardOutline" />
    </RouterLink>
  </div>
</template>

<style scoped>
/* Above the list the section is a card of its own, not the strip that
   closed the page — and it turns to the done role once nothing is owed. */
.tasks-section {
  margin: 8px 12px 4px;
  overflow: hidden;
}

.tasks-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  background: none;
  border: none;
  color: var(--ct-straw);
  font-size: var(--jp-text-base);
  cursor: pointer;
}

.tasks-section.done .tasks-header {
  color: var(--jp-done);
}

.caret {
  transition: transform 0.18s ease;
}

.tasks-header .caret.open {
  transform: rotate(180deg);
}

/* FR-7.7: the way out of the window and into all of them. It reads as a
   footer of the section rather than an action on it — the tasks are not
   leaving, the reader is. */
.tasks-all {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding: 2px 16px 10px;
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
  text-decoration: none;
}

.tasks-all ion-icon {
  font-size: var(--jp-icon-xs);
}
</style>
