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
import { computed, onMounted, ref, watch } from 'vue'

import ItemMark from '@/components/items/ItemMark.vue'
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
import {
  groupAccepts,
  tagForGroup,
  taskGroups,
  tasksInPhase,
  tasksOfAssignee,
  type TaskGroup,
  type TripTask,
} from '@/domain/tripTodos'
import { useDragToGroup, type DropPlace } from '@/composables/useDragToGroup'
import { useMasterStore } from '@/stores/masterStore'
import { t } from '@/i18n'
import { pickAssignee as pickAssigneeFrom } from '@/lib/pickAssignee'
import { useTripStore } from '@/stores/tripStore'
import { TASK_PHASE_BEFORE, TASK_PHASE_DURING, type TaskPhase } from '@/types/domain'

/** The size a group's heading wears its tag's mark at (G-15's scale). */
const MARK_SIZE = 15

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

/**
 * FR-7.8: the headings, per phase. The phase stays the outer split (the
 * owner's variant A) — „what is still open before we leave" remains one look
 * — and the tag groups the inner one.
 *
 * The key a drop carries is the phase and the group together, because the two
 * phases hold the same tags and a task dragged across both changes both in
 * one motion, which is what the owner asked for.
 */
const masterStore = useMasterStore()
const groupsBefore = computed(() => taskGroups(before.value, masterStore.taskTagList))
const groupsDuring = computed(() => taskGroups(during.value, masterStore.taskTagList))

/** `before/apotheke` — the phase and the group, which is what a drop decides. */
const dropKey = (phase: TaskPhase, group: TaskGroup) => `${phase}/${group.key}`

/** A group's heading: its tag's name, or what the untagged group is called. */
function groupName(group: TaskGroup): string {
  if (group.tag) return group.tag.name
  return t(group.origin === 'prep' ? 'tasks.fromPacking' : 'tasks.noTag')
}

/**
 * FR-7.8's drag. The gesture is `useDragToGroup`, which knows nothing about
 * tasks; what this screen adds is which groups may hold what, and what a drop
 * means.
 */
const contentEl = ref<{ $el: HTMLElement } | null>(null)
const dragHost = computed(() => contentEl.value?.$el ?? null)
const drag = useDragToGroup<TripTask>({
  accepts: (task, place) => {
    const group = groupAt(place)
    return group !== null && groupAccepts(group, task)
  },
  onDrop: (task, place) => {
    const group = groupAt(place)
    if (group) acts.retag(task, phaseOf(place), tagForGroup(group.key))
  },
})
watch(dragHost, (el) => drag.bindHost(el), { immediate: true })

const phaseOf = (place: DropPlace) => place.target.split('/')[0] as TaskPhase
function groupAt(place: DropPlace): TaskGroup | null {
  const [phase, key] = place.target.split('/')
  const groups = phase === TASK_PHASE_BEFORE ? groupsBefore.value : groupsDuring.value
  return groups.find((group) => group.key === key) ?? null
}

/** A row was pressed: the gesture decides whether that becomes a lift. */
function onLift(ev: PointerEvent, task: TripTask, row: HTMLElement, immediate: boolean) {
  drag.down(ev, task, row, immediate)
}

/** The picker's list, plus the „no tag" entry named after where the task is from. */
const taskTags = computed(() => masterStore.taskTagList)

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

function onSheetTag(taskTagId: string | null) {
  const task = opened.value
  openedId.value = null
  if (task) acts.retag(task, task.phase, taskTagId)
}

function onSheetNewTag(name: string) {
  const task = opened.value
  openedId.value = null
  if (!task) return
  // Created where it is needed, like an item's tag in M10: a word that is not
  // in the list yet is not an error, it is the next tag.
  const id = orchestrator.createTaskTag(name, masterStore.taskTagList.length)
  acts.retag(task, task.phase, id)
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
    <IonContent
      ref="contentEl"
      class="tasks-content"
      data-testid="m25-page"
      @pointermove="drag.move"
      @pointerup="drag.up"
      @pointercancel="drag.cancel"
    >
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
          <p v-if="groupsBefore.length === 0" class="empty">{{ t('tasks.emptyBefore') }}</p>
          <div
            v-for="group in groupsBefore"
            :key="group.key"
            class="group"
            :data-drop-target="dropKey(TASK_PHASE_BEFORE, group)"
            :data-testid="`m25-group-${group.key}`"
          >
            <h3 class="group-head jp-section-count">
              <ItemMark
                v-if="group.tag?.icon"
                :mark="group.tag.icon"
                surface="plain"
                :size="MARK_SIZE"
              />
              <span class="grow">{{ groupName(group) }}</span>
              <span class="drop-hint">{{ t('tasks.dropHere') }}</span>
            </h3>
            <TripTodoList
              :trip-id="tripId"
              :tasks="group.tasks"
              :assignable="assignable"
              :name-of="nameOf"
              :lift="onLift"
              @toggle="acts.toggle"
              @remove="acts.remove"
              @assign="acts.assign"
              @open="openTask"
            />
          </div>
          <TripTodoList
            :trip-id="tripId"
            :tasks="[]"
            :composer-phase="TASK_PHASE_BEFORE"
            :composer-label="t('tasks.addBefore')"
            @added="acts.added"
          />
        </section>

        <section class="phase" data-testid="m25-during">
          <SectionHead :title="t('tasks.during')" :count="openCount(during)" />
          <p v-if="groupsDuring.length === 0" class="empty">{{ t('tasks.emptyDuring') }}</p>
          <div
            v-for="group in groupsDuring"
            :key="group.key"
            class="group"
            :data-drop-target="dropKey(TASK_PHASE_DURING, group)"
            :data-testid="`m25-group-${group.key}`"
          >
            <h3 class="group-head jp-section-count">
              <ItemMark
                v-if="group.tag?.icon"
                :mark="group.tag.icon"
                surface="plain"
                :size="MARK_SIZE"
              />
              <span class="grow">{{ groupName(group) }}</span>
              <span class="drop-hint">{{ t('tasks.dropHere') }}</span>
            </h3>
            <TripTodoList
              :trip-id="tripId"
              :tasks="group.tasks"
              :assignable="assignable"
              :name-of="nameOf"
              :lift="onLift"
              @toggle="acts.toggle"
              @remove="acts.remove"
              @assign="acts.assign"
              @open="openTask"
            />
          </div>
          <TripTodoList
            :trip-id="tripId"
            :tasks="[]"
            :composer-phase="TASK_PHASE_DURING"
            :composer-label="t('tasks.addDuring')"
            @added="acts.added"
          />
        </section>
      </template>

      <SheetModal :is-open="opened !== null" testid="m25-task-modal" @dismiss="openedId = null">
        <TripTaskSheet
          v-if="opened"
          :task="opened"
          :name-of="nameOf"
          :task-tags="taskTags"
          @close="openedId = null"
          @move="onSheetMove"
          @remove="onSheetRemove"
          @tag="onSheetTag"
          @new-tag="onSheetNewTag"
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

.empty {
  margin: 4px 18px 8px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

/* A group is a drop target, so it says where it ends — a border that is only
   there while something is over it would make the list move on hover. */
.group {
  margin: 2px 12px;
  padding: 2px 0;
  border: 1px solid transparent;
  border-radius: var(--jp-r-md);
}

.group[data-drop-over] {
  border-color: var(--jp-action);
  background: var(--jp-surface-sunken);
}

.group[data-drop-over] .drop-hint {
  display: inline;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0 0;
  padding: 0 6px;
}

.group-head .grow {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.drop-hint {
  display: none;
  flex: none;
  color: var(--jp-action);
}
</style>
