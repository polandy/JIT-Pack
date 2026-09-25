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
 * **Reworked 2026-09-25 (FR-7.14, the owner's UX round).** What is due now
 * leads, in one *Fällig* block across both phases and every tag; the one
 * composer sits on top with its phase, tag and day chips, and the FAB takes
 * the reader to it; rows are two lines with no ✕ beside the tick; each phase
 * folds its finished tasks once; and a finished packing's *before* moves to
 * the end, folded to one line.
 *
 * The one chip filters to what is yours. It exists only where somebody can be
 * named at all — Local and Single-User Mode have no second account (G-8), and
 * a filter for „mine" on a list where everything is everybody's would hide
 * things for no reason.
 *
 * FR-7.9's notes were a second segment here until FR-7.13 made them threads
 * and gave them a view of their own (M26): a note is not work, and a place
 * people write in earns its own pill (ADR-051 amendment 3).
 */
import {
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonLabel,
  IonList,
  IonPage,
} from '@ionic/vue'
import {
  addOutline,
  arrowBackOutline,
  arrowForwardOutline,
  calendarOutline,
  checkmarkOutline,
  chevronForwardOutline,
  personOutline,
  pricetagsOutline,
  trashOutline,
} from 'ionicons/icons'
import { computed, onMounted, ref, watch } from 'vue'

import BulkBar from '@/components/global/BulkBar.vue'
import InlineHint from '@/components/global/InlineHint.vue'
import ListGroup from '@/components/global/ListGroup.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import TaskComposer from '@/components/trips/TaskComposer.vue'
import TaskDueChips from '@/components/trips/TaskDueChips.vue'
import TaskPhaseSection from '@/components/trips/TaskPhaseSection.vue'
import TaskTagChooser from '@/components/trips/TaskTagChooser.vue'
import TripTaskSheet from '@/components/trips/TripTaskSheet.vue'
import TripTodoList from '@/components/trips/TripTodoList.vue'
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import { setHeaderSelection } from '@/composables/useHeaderSelection'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { usePackAnnouncer } from '@/composables/usePackAnnouncer'
import { SELECTION_ICON, useRowSelection } from '@/composables/useRowSelection'
import { useTaskActs } from '@/composables/useTaskActs'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { useTripScreen } from '@/composables/useTripScreen'
import { useTripTasks } from '@/composables/useTripTasks'
import { taskBoard } from '@/domain/taskBoard'
import { quickDueDays } from '@/domain/taskQuickDays'
import { hasDeparted } from '@/domain/tripDay'
import {
  filedTagOf,
  groupAccepts,
  tagForGroup,
  taskGroups,
  tasksOfAssignee,
  tasksToMove,
  type TaskGroup,
  type TripTask,
} from '@/domain/tripTodos'
import { useDragToGroup, type DropPlace } from '@/composables/useDragToGroup'
import { useMasterStore } from '@/stores/masterStore'
import { t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { pickAssignee as pickAssigneeFrom } from '@/lib/pickAssignee'
import { isPackingClosed } from '@/lib/tripPhase'
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

// FR-7.14: M25 carries the FAB now, so its snackbar clears it as M6's does.
const { rowUndo, announceAct, announceTaskDone } = usePackAnnouncer(FAB_ANCHOR.m25)

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

/**
 * FR-7.12: once the packing is finished, *before the trip* is over — it
 * stays as history and takes nothing new. FR-7.14 moves that history to the
 * end of the screen, folded to one line: during the trip, everything the
 * reader can act on is the road's.
 */
const beforeLocked = computed(() => isPackingClosed(trip.value))
const beforeHistoryOpen = ref(false)

const masterStore = useMasterStore()
const taskTags = computed(() => masterStore.taskTagList)
/** FR-7.11: today as the device reckons it — what „due" is measured against. */
const today = computed(() => orchestrator.today())
const tripStart = computed(() => trip.value?.start_date ?? null)
/** FR-7.14: from the first day on, the composer writes for the road only. */
const forTheRoad = computed(
  () => beforeLocked.value || (!!trip.value && hasDeparted(trip.value, today.value)),
)

/**
 * FR-7.14: the board — what is pressing on top, across both phases and every
 * tag, and each phase's open and finished tasks below. Every task stands in
 * exactly one place.
 */
const board = computed(() =>
  taskBoard(shown.value, today.value, { beforeLocked: beforeLocked.value }),
)
const groupsBefore = computed(() =>
  taskGroups(board.value.before.open, taskTags.value, today.value),
)
const groupsDuring = computed(() =>
  taskGroups(board.value.during.open, taskTags.value, today.value),
)
const dueIn = (phase: TaskPhase) => board.value.due.filter((task) => task.phase === phase).length

/**
 * A row read outside its tag group — in the *Fällig* block or a fold — names
 * its tag on its second line. An untagged one names nothing: a preparation's
 * chip already says where it came from, and „Ohne Tag" under every other row
 * would be a word for an absence.
 */
function tagNameOf(task: TripTask): string | null {
  const id = filedTagOf(task, taskTags.value)
  return id ? (taskTags.value.find((tag) => tag.id === id)?.name ?? null) : null
}

/** How many finished tasks the closed *before* holds — its folded line. */
const beforeHistoryLine = computed(() => {
  const done = board.value.before.resolved.length
  return done > 0 ? t('tasks.beforeHistory', { n: done }) : t('tasks.beforeHistoryEmpty')
})

/**
 * `before/apotheke` — the phase and the group, which is what a drop decides.
 * Built and read in one place, because a separator a reader has to match by
 * eye is a separator that will one day be matched wrong.
 */
const DROP_KEY_SEPARATOR = '/'
const dropKey = (phase: TaskPhase) => (group: TaskGroup) =>
  `${phase}${DROP_KEY_SEPARATOR}${group.key}`
const readDropKey = (place: DropPlace) => {
  const [phase, key] = place.target.split(DROP_KEY_SEPARATOR)
  return { phase: phase as TaskPhase, key }
}

/**
 * FR-7.8's drag. The gesture is `useDragToGroup`, which knows nothing about
 * tasks; what this screen adds is which groups may hold what, and what a drop
 * means. A pressing task is lifted out of the *Fällig* block into a group
 * the same way — the block itself is not a place to drop, since what makes a
 * task pressing is its day, not where it was put.
 */
const contentEl = ref<{ $el: HTMLElement } | null>(null)
const dragHost = computed(() => contentEl.value?.$el ?? null)
const drag = useDragToGroup<TripTask>({
  accepts: (task, place) => {
    if (beforeLocked.value && readDropKey(place).phase === TASK_PHASE_BEFORE) return false
    const group = groupAt(place)
    return group !== null && groupAccepts(group, task)
  },
  onDrop: (task, place) => {
    const group = groupAt(place)
    if (group) acts.retag(task, readDropKey(place).phase, tagForGroup(group.key))
  },
})
watch(dragHost, (el) => drag.bindHost(el), { immediate: true })

function groupAt(place: DropPlace): TaskGroup | null {
  const { phase, key } = readDropKey(place)
  const groups = phase === TASK_PHASE_BEFORE ? groupsBefore.value : groupsDuring.value
  return groups.find((group) => group.key === key) ?? null
}

/** A grip was pressed: it lifts at once — the hold on a row selects instead (M6's gesture). */
function onLift(ev: PointerEvent, task: TripTask, row: HTMLElement) {
  if (selection.selecting.value) return
  drag.down(ev, task, row, true)
}

/**
 * Several tasks at once (2026-09-24) — M6's selection, so a hold means the
 * same on both lists: a hold on a task's words, a right-click, or the app
 * bar's icon. It reaches every open task shown, in both phases and across
 * both kinds; a resolved one is folded away and not in it.
 */
const selection = useRowSelection()
const selectable = computed(() =>
  shown.value.filter(
    (task) =>
      task.task_state === 'open' && !(beforeLocked.value && task.phase === TASK_PHASE_BEFORE),
  ),
)
const selectedTasks = computed(() =>
  selectable.value.filter((task) => selection.selected.value.has(task.id)),
)

setHeaderActions(() => {
  const select: HeaderAction = {
    id: 'm25-select',
    icon: SELECTION_ICON,
    label: t('tasks.select'),
    active: selection.selecting.value,
    onClick: () => (selection.selecting.value ? selection.end() : selection.start()),
  }
  const offer = selectable.value.length > 0
  return offer || selection.selecting.value ? [select] : []
})

setHeaderSelection(() =>
  selection.selecting.value
    ? {
        count: selectedTasks.value.length,
        total: selectable.value.length,
        testid: 'm25',
        onExit: () => selection.end(),
        onAll: () => selection.toggleAll(selectable.value.map((task) => task.id)),
      }
    : null,
)

const bulkTagOpen = ref(false)
const bulkDueOpen = ref(false)

/**
 * FR-7.14: the phase buttons the bar offers — each only where it would move
 * something, and never back into a closed *before*. A selection already all
 * in one phase is offered the other one alone.
 */
const bulkPhases = computed(() =>
  ([TASK_PHASE_BEFORE, TASK_PHASE_DURING] as TaskPhase[]).filter(
    (phase) =>
      !(beforeLocked.value && phase === TASK_PHASE_BEFORE) &&
      tasksToMove(selectedTasks.value, phase).length > 0,
  ),
)

/** *Löschen* reaches the trip's own tasks only; a preparation is removed on its row. */
const bulkRemovable = computed(
  () => selectedTasks.value.length > 0 && selectedTasks.value.every((task) => task.item === null),
)

/** The *Fällig* sheet's chips: *Vor Abreise* only where every task is for before the trip. */
const bulkQuick = computed(() => {
  const phases = new Set(selectedTasks.value.map((task) => task.phase))
  const phase = phases.size === 1 ? [...phases][0]! : null
  return quickDueDays(today.value, { phase, tripStart: tripStart.value })
})

/** The batch's acts: written, undone as one, and the mode ends with it (M6's rule). */
function afterBatch(written: number) {
  selection.end()
  if (written === 0) void announceAct(t('tasks.bulkNothingToDo'))
}

function bulkTag(taskTagId: string | null) {
  bulkTagOpen.value = false
  afterBatch(acts.retagMany(selectedTasks.value, taskTagId))
}

function bulkNewTag(name: string) {
  const id = orchestrator.createTaskTag(name, masterStore.taskTagList.length)
  bulkTag(id)
}

function bulkMove(phase: TaskPhase) {
  afterBatch(acts.moveMany(selectedTasks.value, phase))
}

function bulkDone() {
  afterBatch(acts.resolveMany(selectedTasks.value))
}

function bulkDue(day: string | null) {
  bulkDueOpen.value = false
  afterBatch(acts.dueMany(selectedTasks.value, day))
}

function bulkRemove() {
  afterBatch(acts.removeMany(selectedTasks.value))
}

/*
 * No screen-wide empty state, deliberately. A section with nothing in it says
 * so in its own line — an empty „Vor der Reise" under a full „Während der
 * Reise" is information — and the composer on top is the whole point of the
 * screen for a trip with no tasks yet.
 */

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

/** FR-7.14: the FAB — M6's, which takes the reader to the field. */
const composer = ref<{ focus: () => Promise<void> } | null>(null)
async function goToComposer() {
  await (contentEl.value?.$el as HTMLIonContentElement | undefined)?.scrollToTop(0)
  await composer.value?.focus()
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

/** FR-7.11: the sheet stays up — the date is one fact of several on it. */
function onSheetDue(dueDate: string | null) {
  if (opened.value) acts.setDue(opened.value, dueDate)
}

/** FR-7.14: finished from the sheet — it closes, as the tick's row leaves the list. */
function onSheetToggle() {
  const task = opened.value
  openedId.value = null
  if (task) acts.toggle(task)
}

/** FR-7.14: the words, corrected — the sheet stays up with them. */
function onSheetRename(body: string) {
  if (opened.value) acts.rename(opened.value, body)
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
      :class="{ 'with-bulkbar': selection.selecting.value && selectedTasks.length > 0 }"
      data-testid="m25-page"
      @pointermove="drag.move"
      @pointerup="drag.up"
      @pointercancel="drag.cancel"
    >
      <!-- G-20: the selection's bar is the app bar's, so the filter chip
           stays where it is — and stays a filter, since narrowing to one's
           own tasks is a way to choose them. -->
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
        <!-- FR-7.14: one composer, on top, in M6's shape. G-20: in place while
             selecting, at rest — typing a new task mid-batch is a different act. -->
        <div
          class="composer-slot"
          :class="{ resting: selection.selecting.value }"
          :inert="selection.selecting.value || undefined"
        >
          <TaskComposer
            ref="composer"
            :trip-id="tripId"
            :task-tags="taskTags"
            :today="today"
            :trip-start="tripStart"
            :for-the-road="forTheRoad"
            @added="acts.added"
          />
        </div>

        <!-- FR-7.14: what is due now, across both phases and every tag. -->
        <IonList v-if="board.due.length > 0" class="groups due" data-testid="m25-due">
          <ListGroup :title="t('tasks.dueGroup')" :count="board.due.length">
            <TripTodoList
              :trip-id="tripId"
              :tasks="board.due"
              :assignable="assignable"
              :name-of="nameOf"
              :lift="onLift"
              :selection="selection"
              :today="today"
              :tag-of="tagNameOf"
              variant="list"
              @toggle="acts.toggle"
              @assign="acts.assign"
              @open="openTask"
            />
          </ListGroup>
        </IonList>

        <TaskPhaseSection
          v-if="!beforeLocked"
          :trip-id="tripId"
          :phase="TASK_PHASE_BEFORE"
          :shelf="board.before"
          :groups="groupsBefore"
          :due-elsewhere="dueIn(TASK_PHASE_BEFORE)"
          :drop-key="dropKey(TASK_PHASE_BEFORE)"
          :assignable="assignable"
          :name-of="nameOf"
          :lift="onLift"
          :selection="selection"
          :today="today"
          :tag-of="tagNameOf"
          @toggle="acts.toggle"
          @assign="acts.assign"
          @open="openTask"
        />
        <TaskPhaseSection
          :trip-id="tripId"
          :phase="TASK_PHASE_DURING"
          :shelf="board.during"
          :groups="groupsDuring"
          :due-elsewhere="dueIn(TASK_PHASE_DURING)"
          :drop-key="dropKey(TASK_PHASE_DURING)"
          :assignable="assignable"
          :name-of="nameOf"
          :lift="onLift"
          :selection="selection"
          :today="today"
          :tag-of="tagNameOf"
          @toggle="acts.toggle"
          @assign="acts.assign"
          @open="openTask"
        />

        <!-- FR-7.12 + FR-7.14: a finished packing's *before* is history, and
             history comes after the work — one folded line at the end. -->
        <section v-if="beforeLocked" class="before-closed" data-testid="m25-before">
          <button
            type="button"
            class="history-toggle jp-card"
            :aria-expanded="beforeHistoryOpen ? 'true' : 'false'"
            data-testid="m25-before-fold"
            @click="beforeHistoryOpen = !beforeHistoryOpen"
          >
            <span>{{ beforeHistoryLine }}</span>
            <IonIcon
              :icon="chevronForwardOutline"
              class="caret"
              :class="{ open: beforeHistoryOpen }"
              aria-hidden="true"
            />
          </button>
          <template v-if="beforeHistoryOpen">
            <InlineHint class="hint-wide" data-testid="m25-before-locked">{{
              t('tasks.beforeLocked')
            }}</InlineHint>
            <TaskPhaseSection
              headless
              readonly
              testid="m25-before-history"
              :trip-id="tripId"
              :phase="TASK_PHASE_BEFORE"
              :shelf="board.before"
              :groups="groupsBefore"
              :due-elsewhere="0"
              :drop-key="dropKey(TASK_PHASE_BEFORE)"
              :name-of="nameOf"
              :today="today"
              :tag-of="tagNameOf"
              @open="openTask"
            />
          </template>
        </section>
      </template>

      <!-- What the selection can be acted on with (FR-7.14): the acts people
           batch — finish, date, file, send to the other phase, remove. -->
      <BulkBar
        v-if="selection.selecting.value && selectedTasks.length > 0"
        data-testid="m25-bulkbar"
      >
        <button type="button" class="bulk-done" data-testid="m25-bulk-done" @click="bulkDone">
          <IonIcon :icon="checkmarkOutline" />
          {{ t('tasks.bulkDone') }}
        </button>
        <button type="button" data-testid="m25-bulk-due" @click="bulkDueOpen = true">
          <IonIcon :icon="calendarOutline" />
          {{ t('tasks.dueField') }}
        </button>
        <button type="button" data-testid="m25-bulk-tag" @click="bulkTagOpen = true">
          <IonIcon :icon="pricetagsOutline" />
          {{ t('tasks.bulkTagShort') }}
        </button>
        <button
          v-for="phase in bulkPhases"
          :key="phase"
          type="button"
          :data-testid="phase === TASK_PHASE_BEFORE ? 'm25-bulk-before' : 'm25-bulk-during'"
          @click="bulkMove(phase)"
        >
          <IonIcon :icon="phase === TASK_PHASE_BEFORE ? arrowBackOutline : arrowForwardOutline" />
          {{ t(phase === TASK_PHASE_BEFORE ? 'tasks.bulkToBefore' : 'tasks.bulkToDuring') }}
        </button>
        <button
          v-if="bulkRemovable"
          type="button"
          data-testid="m25-bulk-remove"
          @click="bulkRemove"
        >
          <IonIcon :icon="trashOutline" />
          {{ t('tasks.bulkRemove') }}
        </button>
      </BulkBar>

      <!-- The task sheet's own tag choice, titled for the batch. Guarded by
           its own flag like M6's bulk sheet, so a stubbed modal in a spec
           cannot leave a second chooser mounted. -->
      <SheetModal :is-open="bulkTagOpen" testid="m25-bulk-sheet" @dismiss="bulkTagOpen = false">
        <section v-if="bulkTagOpen" class="bulk-sheet">
          <SheetHead
            :title="t('tasks.bulkTagTitle', { n: selectedTasks.length })"
            title-testid="m25-bulk-title"
            close-testid="m25-bulk-close"
            @close="bulkTagOpen = false"
          />
          <TaskTagChooser
            :task-tags="taskTags"
            :no-tag-label="t('tasks.noTag')"
            @tag="bulkTag"
            @new-tag="bulkNewTag"
          />
        </section>
      </SheetModal>

      <!-- FR-7.14: one day for the batch — the same chips as a single task's. -->
      <SheetModal :is-open="bulkDueOpen" testid="m25-bulk-due-sheet" @dismiss="bulkDueOpen = false">
        <section v-if="bulkDueOpen" class="bulk-sheet">
          <SheetHead
            :title="t('tasks.bulkDueTitle', { n: selectedTasks.length })"
            title-testid="m25-bulk-due-title"
            close-testid="m25-bulk-due-close"
            @close="bulkDueOpen = false"
          />
          <TaskDueChips
            :value="null"
            :today="today"
            :quick="bulkQuick"
            testid="m25-bulk-when"
            @update="bulkDue"
          />
        </section>
      </SheetModal>

      <SheetModal :is-open="opened !== null" testid="m25-task-modal" @dismiss="openedId = null">
        <TripTaskSheet
          v-if="opened"
          :task="opened"
          :name-of="nameOf"
          :task-tags="taskTags"
          :before-locked="beforeLocked"
          :today="today"
          :trip-start="tripStart"
          @close="openedId = null"
          @due="onSheetDue"
          @move="onSheetMove"
          @remove="onSheetRemove"
          @toggle="onSheetToggle"
          @rename="onSheetRename"
          @tag="onSheetTag"
          @new-tag="onSheetNewTag"
        />
      </SheetModal>

      <!-- FR-7.14: the add button every sibling list carries (M4, M6, M26). -->
      <IonFab
        v-if="!selection.selecting.value"
        :id="FAB_ANCHOR.m25"
        slot="fixed"
        vertical="bottom"
        horizontal="end"
      >
        <IonFabButton data-testid="m25-fab" :aria-label="t('common.add')" @click="goToComposer">
          <IonIcon :icon="addOutline" aria-hidden="true" />
        </IonFabButton>
      </IonFab>
    </IonContent>
  </IonPage>
</template>

<style scoped>
/* Clear of the FAB, as M6's list is. */
.tasks-content {
  --padding-bottom: 96px;
}

.mine {
  margin: 4px 14px 2px;
}

.groups {
  padding: 0;
  background: transparent;
}

.due {
  margin-top: 8px;
}

/* The pressing block is tinted in the overdue ink, faintly: it is the one
   place on the screen that asks to be read first. */
.due :deep(ion-item) {
  --background: color-mix(in srgb, var(--ct-ember) 6%, var(--jp-surface-card));
}

.hint-wide {
  margin: 4px 18px 8px;
}

.before-closed {
  margin-top: 18px;
}

.history-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: calc(100% - 24px);
  margin: 0 12px 8px;
  padding: 12px 16px;
  border: none;
  color: var(--ct-subtext1);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.history-toggle .caret {
  transition: transform 0.15s;
}

.history-toggle .caret.open {
  transform: rotate(90deg);
}

.bulk-sheet {
  padding: 4px 18px 22px;
}

.bulk-done {
  color: var(--jp-done);
}

/* Clear of the bulk bar, like M6's list is of its FAB. */
.tasks-content.with-bulkbar {
  --padding-bottom: 96px;
}

/* G-20: at rest while a selection is on — in place, so nothing moves. */
.composer-slot.resting {
  opacity: 0.45;
}
</style>
