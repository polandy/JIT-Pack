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
 *
 * **FR-7.9's notes are a second segment**, not a third section: decision 1 of
 * `dev-docs/trip-notes-concept.md` (owner, 2026-09-21) chose it over a fourth
 * pill (ADR-051 amendment 1's three-word row) and over a card competing with
 * the list being worked. Unlike the phase split above, tasks and notes really
 * are two places you stand — a note is not read the way a task is worked —
 * which is why this one *is* an `IonSegment`, the shape the header comment
 * just rejected for the phases.
 */
import {
  IonChip,
  IonContent,
  IonIcon,
  IonLabel,
  IonList,
  IonPage,
  IonSegment,
  IonSegmentButton,
} from '@ionic/vue'
import {
  arrowBackOutline,
  arrowForwardOutline,
  checkboxOutline,
  personOutline,
  pricetagsOutline,
} from 'ionicons/icons'
import { computed, onMounted, ref, watch } from 'vue'

import ItemMark from '@/components/items/ItemMark.vue'
import BulkBar from '@/components/global/BulkBar.vue'
import InlineHint from '@/components/global/InlineHint.vue'
import ListGroup from '@/components/global/ListGroup.vue'
import SectionHead from '@/components/global/SectionHead.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import TaskTagChooser from '@/components/trips/TaskTagChooser.vue'
import TripNoteList from '@/components/trips/TripNoteList.vue'
import TripNoteSheet from '@/components/trips/TripNoteSheet.vue'
import TripTaskSheet from '@/components/trips/TripTaskSheet.vue'
import TripTodoList from '@/components/trips/TripTodoList.vue'
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import { setHeaderSelection } from '@/composables/useHeaderSelection'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { usePackAnnouncer } from '@/composables/usePackAnnouncer'
import { useRowSelection } from '@/composables/useRowSelection'
import { useTaskActs } from '@/composables/useTaskActs'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { useTripScreen } from '@/composables/useTripScreen'
import { useTripTasks } from '@/composables/useTripTasks'
import {
  groupAccepts,
  tagForGroup,
  TASK_ORIGIN_PREP,
  taskGroups,
  tasksInPhase,
  tasksOfAssignee,
  type TaskGroup,
  type TripTask,
} from '@/domain/tripTodos'
import { isNoteNewForMe, noteAckState } from '@/domain/tripNotes'
import { useDragToGroup, type DropPlace } from '@/composables/useDragToGroup'
import { useMasterStore } from '@/stores/masterStore'
import { t } from '@/i18n'
import { pickAssignee as pickAssigneeFrom } from '@/lib/pickAssignee'
import { isPackingClosed } from '@/lib/tripPhase'
import { useTripStore } from '@/stores/tripStore'
import {
  TASK_PHASE_BEFORE,
  TASK_PHASE_DURING,
  type ItemComment,
  type TaskPhase,
} from '@/types/domain'

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

/**
 * FR-7.12: once the packing is finished, *before the trip* is over — its
 * section stays as history and takes nothing new: no composer, no drop, no
 * tick, no batch sent into it. Reopening the packing lifts it (FR-5.10).
 */
const beforeLocked = computed(() => isPackingClosed(trip.value))
const during = computed(() => tasksInPhase(shown.value, TASK_PHASE_DURING))

// --- FR-7.9: the notes segment ---

const NOTES_SEGMENT = 'notes'
const TASKS_SEGMENT = 'tasks'
const segment = ref<typeof TASKS_SEGMENT | typeof NOTES_SEGMENT>(TASKS_SEGMENT)

/** Every note of the trip (FR-7.1's shape, `is_task = 0`) — decision 6: the trip only. */
const notes = computed(() => tripStore.getTripComments(props.tripId))
const noteAcks = computed(() => tripStore.getNoteAcks(props.tripId))

/** The segment's own count (decision 1): new notes, not the whole list. */
const newNotesCount = computed(
  () => notes.value.filter((note) => isNoteNewForMe(note, noteAcks.value, myUserId.value)).length,
)
const notesTabLabel = computed(() =>
  newNotesCount.value > 0
    ? t('tasks.segmentNotesCount', { n: newNotesCount.value })
    : t('tasks.segmentNotes'),
)

const openedNoteId = ref<string | null>(null)
const openedNote = computed(
  () => notes.value.find((note) => note.id === openedNoteId.value) ?? null,
)
const openedNoteAckedBy = computed(() =>
  openedNote.value
    ? noteAckState(openedNote.value.id, noteAcks.value, myUserId.value).ackedBy
    : new Set<string>(),
)

function openNote(note: ItemComment) {
  openedNoteId.value = note.id
}

function onNoteSheetRemove() {
  const note = openedNote.value
  openedNoteId.value = null
  if (note) orchestrator.deleteComment(props.tripId, note.id)
}

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
/** FR-7.11: today as the device reckons it — what „due" is measured against. */
const today = computed(() => orchestrator.today())
const groupsBefore = computed(() => taskGroups(before.value, masterStore.taskTagList, today.value))
const groupsDuring = computed(() => taskGroups(during.value, masterStore.taskTagList, today.value))

/**
 * `before/apotheke` — the phase and the group, which is what a drop decides.
 * Built and read in one place, because a separator a reader has to match by
 * eye is a separator that will one day be matched wrong.
 */
const DROP_KEY_SEPARATOR = '/'
const dropKey = (phase: TaskPhase, group: TaskGroup) => `${phase}${DROP_KEY_SEPARATOR}${group.key}`
const readDropKey = (place: DropPlace) => {
  const [phase, key] = place.target.split(DROP_KEY_SEPARATOR)
  return { phase: phase as TaskPhase, key }
}

/** A group's heading: its tag's name, or what the untagged group is called. */
function groupName(group: TaskGroup): string {
  if (group.tag) return group.tag.name
  return t(group.origin === TASK_ORIGIN_PREP ? 'tasks.fromPacking' : 'tasks.noTag')
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

// A selection belongs to the task list it was made in; the notes are another place.
watch(segment, () => selection.end())

setHeaderActions(() => {
  const select: HeaderAction = {
    id: 'm25-select',
    icon: checkboxOutline,
    label: t('tasks.select'),
    active: selection.selecting.value,
    onClick: () => (selection.selecting.value ? selection.end() : selection.start()),
  }
  const offer = segment.value === TASKS_SEGMENT && selectable.value.length > 0
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

/** FR-7.11: the sheet stays up — the date is one fact of several on it. */
function onSheetDue(dueDate: string | null) {
  if (opened.value) acts.setDue(opened.value, dueDate)
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
      <!-- FR-7.9 decision 1: notes are a second segment, not a fourth pill. -->
      <IonSegment
        :value="segment"
        data-testid="m25-segment"
        @ionChange="(e: CustomEvent) => (segment = e.detail.value)"
      >
        <IonSegmentButton :value="TASKS_SEGMENT" data-testid="m25-segment-tasks">
          <IonLabel>{{ t('tasks.segmentTasks') }}</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton :value="NOTES_SEGMENT" data-testid="m25-segment-notes">
          <IonLabel>{{ notesTabLabel }}</IonLabel>
        </IonSegmentButton>
      </IonSegment>

      <!-- G-20: the selection's bar is the app bar's, so the filter chip
           stays where it is — and stays a filter, since narrowing to one's
           own tasks is a way to choose them. -->
      <IonChip
        v-if="segment === TASKS_SEGMENT && assignable"
        :outline="!mineOnly"
        class="mine"
        data-testid="m25-mine"
        :aria-pressed="mineOnly ? 'true' : 'false'"
        @click="mineOnly = !mineOnly"
      >
        <IonIcon :icon="personOutline" />
        <IonLabel>{{ t('tasks.mine') }}</IonLabel>
      </IonChip>

      <template v-if="segment === TASKS_SEGMENT && loaded">
        <section class="phase" data-testid="m25-before">
          <SectionHead :title="t('tasks.before')" :count="openCount(before)" />
          <InlineHint v-if="beforeLocked" class="hint-wide" data-testid="m25-before-locked">{{
            t('tasks.beforeLocked')
          }}</InlineHint>
          <InlineHint v-else-if="groupsBefore.length === 0" class="hint-wide">{{
            t('tasks.emptyBefore')
          }}</InlineHint>
          <IonList v-if="groupsBefore.length > 0" class="groups">
            <ListGroup
              v-for="group in groupsBefore"
              :key="group.key"
              :title="groupName(group)"
              :drop-target="dropKey(TASK_PHASE_BEFORE, group)"
              :droppable="!beforeLocked"
              :data-testid="`m25-group-${group.key}`"
            >
              <template v-if="group.tag?.icon" #mark>
                <ItemMark :mark="group.tag.icon" surface="plain" :size="MARK_SIZE" />
              </template>
              <TripTodoList
                :trip-id="tripId"
                :tasks="group.tasks"
                :assignable="assignable"
                :name-of="nameOf"
                :lift="beforeLocked ? undefined : onLift"
                :selection="beforeLocked ? undefined : selection"
                :readonly="beforeLocked"
                :today="today"
                variant="list"
                @toggle="acts.toggle"
                @remove="acts.remove"
                @assign="acts.assign"
                @open="openTask"
              />
            </ListGroup>
          </IonList>
          <!-- G-20: in place while selecting, at rest — M6's rule: typing a
               new task mid-batch is a different act. -->
          <div
            v-if="!beforeLocked"
            class="phase-composer"
            :class="{ resting: selection.selecting.value }"
            :inert="selection.selecting.value || undefined"
            data-testid="m25-composer-before"
          >
            <TripTodoList
              :trip-id="tripId"
              :tasks="[]"
              :composer-phase="TASK_PHASE_BEFORE"
              :composer-label="t('tasks.addBefore')"
              @added="acts.added"
            />
          </div>
        </section>

        <section class="phase" data-testid="m25-during">
          <SectionHead :title="t('tasks.during')" :count="openCount(during)" />
          <InlineHint v-if="groupsDuring.length === 0" class="hint-wide">{{
            t('tasks.emptyDuring')
          }}</InlineHint>
          <IonList v-if="groupsDuring.length > 0" class="groups">
            <ListGroup
              v-for="group in groupsDuring"
              :key="group.key"
              :title="groupName(group)"
              :drop-target="dropKey(TASK_PHASE_DURING, group)"
              :data-testid="`m25-group-${group.key}`"
            >
              <template v-if="group.tag?.icon" #mark>
                <ItemMark :mark="group.tag.icon" surface="plain" :size="MARK_SIZE" />
              </template>
              <TripTodoList
                :trip-id="tripId"
                :tasks="group.tasks"
                :assignable="assignable"
                :name-of="nameOf"
                :lift="onLift"
                :selection="selection"
                :today="today"
                variant="list"
                @toggle="acts.toggle"
                @remove="acts.remove"
                @assign="acts.assign"
                @open="openTask"
              />
            </ListGroup>
          </IonList>
          <!-- G-20: in place while selecting, at rest — M6's rule: typing a
               new task mid-batch is a different act. -->
          <div
            class="phase-composer"
            :class="{ resting: selection.selecting.value }"
            :inert="selection.selecting.value || undefined"
            data-testid="m25-composer-during"
          >
            <TripTodoList
              :trip-id="tripId"
              :tasks="[]"
              :composer-phase="TASK_PHASE_DURING"
              :composer-label="t('tasks.addDuring')"
              @added="acts.added"
            />
          </div>
        </section>
      </template>

      <section v-if="segment === NOTES_SEGMENT && loaded" data-testid="m25-notes">
        <TripNoteList
          :trip-id="tripId"
          :notes="notes"
          :acks="noteAcks"
          :my-user-id="myUserId"
          :name-of="nameOf"
          @open="openNote"
        />
      </section>

      <!-- What the selection can be acted on with: a tag, or a phase. -->
      <BulkBar
        v-if="selection.selecting.value && selectedTasks.length > 0"
        data-testid="m25-bulkbar"
      >
        <button type="button" data-testid="m25-bulk-tag" @click="bulkTagOpen = true">
          <IonIcon :icon="pricetagsOutline" />
          {{ t('tasks.bulkTag') }}
        </button>
        <button
          v-if="!beforeLocked"
          type="button"
          data-testid="m25-bulk-before"
          @click="bulkMove(TASK_PHASE_BEFORE)"
        >
          <IonIcon :icon="arrowBackOutline" />
          {{ t('tasks.bulkToBefore') }}
        </button>
        <button type="button" data-testid="m25-bulk-during" @click="bulkMove(TASK_PHASE_DURING)">
          <IonIcon :icon="arrowForwardOutline" />
          {{ t('tasks.bulkToDuring') }}
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

      <SheetModal :is-open="opened !== null" testid="m25-task-modal" @dismiss="openedId = null">
        <TripTaskSheet
          v-if="opened"
          :task="opened"
          :name-of="nameOf"
          :task-tags="taskTags"
          :before-locked="beforeLocked"
          @close="openedId = null"
          @due="onSheetDue"
          @move="onSheetMove"
          @remove="onSheetRemove"
          @tag="onSheetTag"
          @new-tag="onSheetNewTag"
        />
      </SheetModal>

      <SheetModal
        :is-open="openedNote !== null"
        testid="m25-note-modal"
        @dismiss="openedNoteId = null"
      >
        <TripNoteSheet
          v-if="openedNote"
          :note="openedNote"
          :acked-by="openedNoteAckedBy"
          :name-of="nameOf"
          @close="openedNoteId = null"
          @remove="onNoteSheetRemove"
        />
      </SheetModal>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.tasks-content {
  --padding-bottom: 24px;
}

/* Ionic sizes the segment `width: 100%`, so a side margin pushes it past its
   column by the margin's width and the scroller cuts its right end off
   (owner, 2026-09-24, on an iPad). `auto` lets a block fill what the margins
   leave. */
ion-segment {
  margin: 4px 14px 2px;
  width: auto;
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

/* The two sections' hint sits at the group's own inset, wider than
   InlineHint's default — layout is the caller's, same as RemoveButton's
   `.rm-gap`. */
.hint-wide {
  margin: 4px 18px 8px;
}

/* The groups sit in one list per phase, full width like M6's (2026-09-24). */
.groups {
  padding: 0;
  background: transparent;
}

.bulk-sheet {
  padding: 4px 18px 22px;
}

/* Clear of the bulk bar, like M6's list is of its FAB. */
.tasks-content.with-bulkbar {
  --padding-bottom: 96px;
}

/* G-20: at rest while a selection is on — in place, so nothing moves. */
.phase-composer.resting {
  opacity: 0.45;
}
</style>
