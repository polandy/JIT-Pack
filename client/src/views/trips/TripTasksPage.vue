<script setup lang="ts">
/**
 * M25 — a trip's tasks (FR-7.7), the third view a trip is worked in.
 *
 * **One list in the data, two windows on it.** Every task of the trip is one
 * `comments` row with `is_task = 1`, whether it hangs off a packing row
 * (FR-7.3) or off the trip itself (FR-7.4). This screen shows all of them,
 * split by the phase they are due in; M4 keeps a window of the ones you do as
 * part of packing. Nothing is filed twice, and moving a task between the
 * phases therefore takes it off the packing list or puts it back — which is
 * what moving it means.
 *
 * Two sections rather than a segment (owner's choice of the 2026-09-20 round,
 * variant A): the two phases of a trip are one thing read top to bottom, not
 * two lists you switch between the way the shopping list's *Vor der Abreise*
 * and *Vor Ort* are — those are two places you stand, and you are only ever
 * in one of them. **And the shopping list stays its own feature** (owner:
 * *„die einkaufsliste soll separat von den tasks sein"*): nothing here reads
 * or writes it.
 *
 * The one chip filters to what is yours. It exists only where somebody can be
 * named at all — Local and Single-User Mode have no second account (G-8), and
 * a filter for „mine" on a list where everything is everybody's would hide
 * things for no reason.
 */
import { IonChip, IonContent, IonIcon, IonLabel, IonPage } from '@ionic/vue'
import { personOutline } from 'ionicons/icons'
import { computed, onMounted, ref } from 'vue'

import SectionHead from '@/components/global/SectionHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import TripTaskSheet from '@/components/trips/TripTaskSheet.vue'
import TripTodoList from '@/components/trips/TripTodoList.vue'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { usePackAnnouncer } from '@/composables/usePackAnnouncer'
import { useTaskActs } from '@/composables/useTaskActs'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { useTripScreen } from '@/composables/useTripScreen'
import { useTripTasks } from '@/composables/useTripTasks'
import { tasksInPhase, tasksOfAssignee, type TripTask } from '@/domain/tripTodos'
import { t } from '@/i18n'
import { pickAssignee as pickAssigneeFrom } from '@/lib/pickAssignee'
import { useTripStore } from '@/stores/tripStore'
import { TASK_PHASE_BEFORE, TASK_PHASE_DURING, type TaskPhase } from '@/types/domain'

const props = defineProps<{ tripId: string }>()

const orchestrator = useOrchestrator()
const tripStore = useTripStore()
const { tasksOf } = useTripTasks()

// ADR-033: the tasks travel the trip partition, like the packing rows. „No
// tasks" is a sentence somebody acts on, and a partition still in flight is
// not it.
const { trip, loaded, ensure } = useTripScreen(props.tripId, orchestrator)
const {
  participants,
  myUserId,
  nameOf,
  load: loadIdentity,
} = useTripIdentity(props.tripId, orchestrator)

// No anchor: M25 carries no FAB, so the snackbar sits where a snackbar sits.
const { rowUndo, announceAct, announceTaskDone } = usePackAnnouncer(null)

/** Hidden while their removal can still be taken back (FR-25.31). */
const removing = ref(new Set<string>())

/** Only the people this trip actually carries may be handed a task (FR-7.5). */
const assignees = computed(() => {
  const members = new Set(tripStore.getMembers(props.tripId).map((m) => m.user_id))
  return participants.value.filter((person) => members.has(person.user_id))
})
const assignable = computed(() => assignees.value.length > 1)

const acts = useTaskActs(() => props.tripId, {
  rowUndo,
  announceAct,
  announceTaskDone,
  pickAssignee,
  nameOf,
  removing,
})

/** Every task of the trip, minus the ones on their way out (FR-25.31). */
const tasks = computed(() => tasksOf(props.tripId).filter((task) => !removing.value.has(task.id)))

/** The chip: off by default, because the whole list is the screen's subject. */
const mineOnly = ref(false)
const shown = computed(() =>
  mineOnly.value ? tasksOfAssignee(tasks.value, myUserId.value) : tasks.value,
)

const before = computed(() => tasksInPhase(shown.value, TASK_PHASE_BEFORE))
const during = computed(() => tasksInPhase(shown.value, TASK_PHASE_DURING))

/*
 * No screen-wide empty state, deliberately. A section with nothing in it says
 * so in its own line, and keeps its composer — an empty „Vor der Reise" under
 * a full „Während der Reise" is information, and a trip with no tasks at all
 * is the case where the two fields are the whole point of the screen.
 */

/**
 * What a section's head counts: what is still owed there, not how much it
 * holds. A finished section says nothing rather than „0", the way M4's own
 * head falls silent when a trip has no tasks (`tripTodoStatus`).
 */
function openCount(section: readonly TripTask[]): string | null {
  const open = section.filter((task) => task.task_state === 'open').length
  return open > 0 ? t('tripTodos.open', { n: open }) : null
}

onMounted(async () => {
  await ensure()
  await loadIdentity()
})

setHeaderTitle(
  () => t('tasks.title'),
  () => trip.value?.name,
)

/** FR-7.5's picker — the sheet M4 asks a row's question with (`lib/pickAssignee`). */
function pickAssignee(header: string, current: string | null) {
  return pickAssigneeFrom(header, current, assignees.value)
}

/**
 * FR-7.7: the task's own sheet — the facts that do not fit a line, and the
 * move between the phases.
 *
 * The open task is held rather than passed through the modal, so the sheet
 * re-renders from the live list while it is up: ticking a task off on another
 * device must not leave a sheet claiming it is open.
 */
const openedId = ref<string | null>(null)
const opened = computed(() => tasks.value.find((task) => task.id === openedId.value) ?? null)

function openTask(task: TripTask) {
  openedId.value = task.id
}

function onSheetMove(phase: TaskPhase) {
  const task = opened.value
  openedId.value = null
  if (task) acts.move(task, phase)
}

function onSheetRemove() {
  const task = opened.value
  openedId.value = null
  if (task) acts.remove(task)
}
</script>

<template>
  <IonPage>
    <IonContent class="tasks-content" data-testid="m25-page">
      <IonChip
        v-if="assignable"
        :outline="!mineOnly"
        class="mine"
        data-testid="m25-mine"
        :aria-pressed="mineOnly ? 'true' : 'false'"
        @click="mineOnly = !mineOnly"
      >
        <IonIcon :icon="personOutline" />
        <IonLabel>{{ t('tasks.mine') }}</IonLabel>
      </IonChip>

      <template v-if="loaded">
        <section class="phase" data-testid="m25-before">
          <SectionHead :title="t('tasks.before')" :count="openCount(before)" />
          <TripTodoList
            :trip-id="tripId"
            :tasks="before"
            :assignable="assignable"
            :name-of="nameOf"
            :composer-phase="TASK_PHASE_BEFORE"
            :composer-label="t('tasks.addBefore')"
            :empty-text="t('tasks.emptyBefore')"
            @added="acts.added"
            @toggle="acts.toggle"
            @remove="acts.remove"
            @assign="acts.assign"
            @open="openTask"
          />
        </section>

        <section class="phase" data-testid="m25-during">
          <SectionHead :title="t('tasks.during')" :count="openCount(during)" />
          <TripTodoList
            :trip-id="tripId"
            :tasks="during"
            :assignable="assignable"
            :name-of="nameOf"
            :composer-phase="TASK_PHASE_DURING"
            :composer-label="t('tasks.addDuring')"
            :empty-text="t('tasks.emptyDuring')"
            @added="acts.added"
            @toggle="acts.toggle"
            @remove="acts.remove"
            @assign="acts.assign"
            @open="openTask"
          />
        </section>
      </template>

      <SheetModal :is-open="opened !== null" testid="m25-task-modal" @dismiss="openedId = null">
        <TripTaskSheet
          v-if="opened"
          :task="opened"
          :name-of="nameOf"
          @close="openedId = null"
          @move="onSheetMove"
          @remove="onSheetRemove"
        />
      </SheetModal>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.tasks-content {
  --padding-bottom: 24px;
}

.mine {
  margin: 4px 14px 2px;
}

.phase + .phase {
  margin-top: 18px;
}

.phase :deep(.section-head) {
  margin: 18px 16px 4px;
}
</style>
