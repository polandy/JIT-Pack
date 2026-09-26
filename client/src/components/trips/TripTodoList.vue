<script setup lang="ts">
/**
 * The trip's tasks (FR-7.6/FR-7.7), editable: the rows M25 draws in its
 * *Fällig* block, its tag groups and its folds, and the window M4 keeps of
 * what is to be done while packing. Open ones are ticked off in place,
 * resolved ones fold away but stay reachable to untick.
 *
 * Two kinds of task share the list. A row's preparation (FR-7.3) carries the
 * chip of the row it belongs to; the trip's own (FR-7.4) does not. **Since
 * FR-7.7 both kinds carry a seat** (the owner's request of 2026-09-20: *a
 * task can be assigned to somebody like a pack item*).
 *
 * **Two shapes (FR-7.14, owner 2026-09-25).** M25's `list` rows are two
 * lines — the words, and under them what is known about the task: its due
 * pill, the row it prepares, its tag where the row stands outside its group,
 * and the person. A fact never squeezes the words, and **no ✕ stands beside
 * the tick**: a task is removed from its sheet or from a selection, never one
 * finger-width from the control that finishes it. M4's `window` keeps its
 * compact one-line rows, which only ever hold preparations.
 *
 * The trip is where these are written (owner, 2026-09-18): M1 only reports
 * them, because the dashboard takes no actions. Every act is *emitted*: both
 * kinds are written through different actions and both undone through the
 * screen's one snackbar (FR-25.31), so the writer is the screen and this list
 * reports the tap. Writing a new task is M25's composer's (`TaskComposer`).
 */
import { IonLabel } from '@ionic/vue'
import { computed, ref } from 'vue'

import AssigneeSeat from '@/components/trips/AssigneeSeat.vue'
import DueBadge from '@/components/global/DueBadge.vue'
import TaskItemChip from '@/components/trips/TaskItemChip.vue'
import DragGrip from '@/components/global/DragGrip.vue'
import FoldToggle from '@/components/global/FoldToggle.vue'
import ListRow from '@/components/global/ListRow.vue'
import SelectBox from '@/components/global/SelectBox.vue'
import InlineHint from '@/components/global/InlineHint.vue'
import RemoveButton from '@/components/global/RemoveButton.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import type { RowSelection } from '@/composables/useRowSelection'
import { openDueDay } from '@/domain/taskDue'
import type { TripTask } from '@/domain/tripTodos'
import { t } from '@/i18n'
import { tripItemPath } from '@/router/paths'

const props = defineProps<{
  /** The trip whose tasks these are. */
  tripId: string
  /** Its tasks, in the order the screen reads them. */
  tasks: readonly TripTask[]
  /**
   * FR-7.5: whether there is anybody to hand a task to. Absent in Local and
   * Single-User Mode, which have no second account (G-8) — the seat is then
   * not rendered at all, rather than offered with nobody behind it.
   */
  assignable?: boolean
  /** A member's display name, for the avatar's initials. */
  nameOf?: (userId: string | null) => string | null
  /** What to say when the list is empty. Absent renders nothing. */
  emptyText?: string
  /**
   * FR-7.8: how a row is picked up by its grip, where this list is inside
   * something that can be dragged between. A function rather than an event,
   * because the gesture has to start *during* the pointerdown — an emit would
   * arrive after the browser has already decided the press is a scroll.
   *
   * Absent means the rows are not draggable and no grip is drawn.
   */
  lift?: (ev: PointerEvent, task: TripTask, row: HTMLElement) => void
  /**
   * M25's selection (`useRowSelection`, 2026-09-24): a hold on an open row
   * selects it, the way it does on M6. Absent — M4's window — a hold does
   * nothing.
   */
  selection?: RowSelection
  /**
   * `list`: M25's two-line rows (FR-7.14). `window` (default): M4's compact
   * window of a handful of lines.
   */
  variant?: 'list' | 'window'
  /**
   * FR-7.11: today as the device reckons it, for the due pill. Absent draws
   * no pill.
   */
  today?: string
  /**
   * FR-7.12: the list is history — the *before* phase once the packing is
   * finished. Nothing is ticked, reopened, handed over or removed here; the
   * words still open the task's sheet.
   */
  readonly?: boolean
  /**
   * FR-7.14: the tag a row names on its second line, where the row is read
   * outside its tag's group — M25's *Fällig* block and its folds. Absent (or
   * null for a task) names none: inside a group the heading already does.
   */
  tagOf?: (task: TripTask) => string | null
  /**
   * The finished tasks are shown without their own fold — the list already
   * stands inside one: a section folded to its line at the screen's end
   * (`RestLine`), whose words count them.
   */
  unfolded?: boolean
}>()

/** Every act here is reported to the screen, which owns the one snackbar that takes it back (FR-25.31). */
const emit = defineEmits<{
  /** A task's checkbox was operated; the screen writes it and arms the undo. */
  toggle: [task: TripTask]
  /** Asked to go — M4's window only; M25 removes from the sheet (FR-7.14). */
  remove: [task: TripTask]
  /** FR-7.5: the seat was tapped — the screen asks whose job it is. */
  assign: [task: TripTask]
  /** FR-7.7: the words were tapped — the screen opens the task's own sheet. */
  open: [task: TripTask]
}>()

const open = computed(() => props.tasks.filter((task) => task.task_state === 'open'))
const resolved = computed(() => props.tasks.filter((task) => task.task_state === 'resolved'))

const showResolved = ref(false)
const isList = computed(() => props.variant === 'list')

/** The avatar a task's seat shows, or null for the empty seat. */
function assigneeOf(task: TripTask) {
  const id = task.assignee_user_id
  return id ? { variant: 'assignee' as const, id, name: props.nameOf?.(id) ?? null } : null
}

/**
 * FR-7.8: the grip lifts at once — it exists only to be dragged. The row
 * element is handed over with it, because the gesture clones it.
 */
function onLift(ev: PointerEvent, task: TripTask) {
  if (!props.lift) return
  const row = (ev.currentTarget as HTMLElement).closest('.todo-row') as HTMLElement | null
  if (row) props.lift(ev, task, row)
}

const selecting = computed(() => props.selection?.selecting.value ?? false)

/** The hold's desktop twin — only where this list selects at all; elsewhere the browser's menu stays. */
function onContextMenu(ev: MouseEvent, task: TripTask) {
  if (!props.selection) return
  ev.preventDefault()
  props.selection.contextMenu(task.id)
}

/** Selecting → a tap on the words toggles the row; otherwise it opens the task's sheet. */
function onOpen(task: TripTask) {
  if (props.selection?.click(task.id, true)) return
  emit('open', task)
}

/** Whether an open list row's seat is the control, rather than a plain avatar. */
function seatOffered(): boolean {
  return !!props.assignable && !props.readonly && !selecting.value
}

/** Whether a list row has anything to say under its words. */
function hasFacts(task: TripTask): boolean {
  return (
    (!!props.today && openDueDay(task) !== null) ||
    task.item !== null ||
    !!props.tagOf?.(task) ||
    !!task.assignee_user_id ||
    (task.task_state === 'open' && seatOffered())
  )
}
</script>

<template>
  <div class="trip-todo-list" :class="variant ?? 'window'" data-testid="trip-todo-list">
    <InlineHint v-if="emptyText && tasks.length === 0" data-testid="trip-todo-empty">
      {{ emptyText }}
    </InlineHint>

    <!-- The shared row (M6's too, owner 2026-09-26): the leading slot, the
         words, the facts under them, the tick at the row's own edge. -->
    <ListRow
      v-for="task in open"
      :key="task.id"
      :lines="isList ? undefined : 'none'"
      class="todo-row"
      :checked="selecting ? null : false"
      :tick-disabled="readonly"
      :selected="selecting && !!selection?.selected.value.has(task.id)"
      :facts-testid="`trip-todo-facts-${task.body}`"
      :data-testid="`trip-todo-${task.body}`"
      @tick="emit('toggle', task)"
    >
      <!-- M6's leading edge (2026-09-24): the selection box while selecting,
           the grip otherwise. -->
      <template #start>
        <SelectBox
          v-if="selecting"
          slot="start"
          :on="selection?.selected.value.has(task.id)"
          :data-testid="`trip-todo-check-${task.body}`"
        />
        <DragGrip
          v-else-if="lift"
          slot="start"
          :label="t('tripTodos.drag', { body: task.body })"
          :data-testid="`trip-todo-grip-${task.body}`"
          @pointerdown.stop="onLift($event, task)"
        />
      </template>
      <!-- FR-7.7: the words are the way into the task's own sheet. A hold
           on them selects, M6's gesture (and its right-click twin). -->
      <IonLabel
        @pointerdown="selection?.press(task.id, $event)"
        @pointermove="selection?.move($event)"
        @pointerup="selection?.release()"
        @pointercancel="selection?.release()"
        @contextmenu="onContextMenu($event, task)"
      >
        <button
          type="button"
          class="body row-name"
          :data-testid="`trip-todo-open-${task.body}`"
          @click="onOpen(task)"
        >
          {{ task.body }}
        </button>
      </IonLabel>
      <!-- FR-7.14: the second line — what is known about the task. The pill
           stays while selecting: when a task is due is part of choosing it. -->
      <template v-if="isList && hasFacts(task)" #facts>
        <DueBadge
          v-if="today"
          :day="openDueDay(task)"
          :today="today"
          :testid="`trip-todo-due-${task.body}`"
        />
        <TaskItemChip v-if="task.item" :item="task.item" :to="tripItemPath(tripId, task.item.id)" />
        <span v-if="tagOf?.(task)" class="tag" :data-testid="`trip-todo-tag-${task.body}`">{{
          tagOf(task)
        }}</span>
        <AssigneeSeat
          v-if="seatOffered()"
          :avatar="assigneeOf(task)"
          :data-testid="`trip-todo-assign-${task.body}`"
          @assign="emit('assign', task)"
        />
        <span
          v-else-if="task.assignee_user_id"
          class="person"
          :data-testid="`trip-todo-assignee-${task.body}`"
        >
          <UserAvatar
            variant="assignee"
            :name="nameOf?.(task.assignee_user_id)"
            :seed="task.assignee_user_id"
          />
        </span>
      </template>
      <!-- M4's window keeps its one-line cluster at the row's edge. -->
      <template v-if="!isList && !selecting" #end>
        <span slot="end" class="todo-end">
          <DueBadge
            v-if="today"
            :day="openDueDay(task)"
            :today="today"
            :testid="`trip-todo-due-${task.body}`"
          />
          <TaskItemChip
            v-if="task.item"
            :item="task.item"
            :to="tripItemPath(tripId, task.item.id)"
          />
          <AssigneeSeat
            v-if="assignable && !readonly"
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
          <RemoveButton
            v-if="!task.item && !readonly"
            :label="t('tripTodos.remove')"
            :data-testid="`trip-todo-remove-${task.body}`"
            @click="emit('remove', task)"
          />
        </span>
      </template>
    </ListRow>

    <!-- Resolved ones fold away but stay reachable: unticking is the only
         undo a mis-tap has, short of typing the task again. -->
    <template v-if="resolved.length > 0">
      <FoldToggle
        v-if="!unfolded"
        :label="t('tripTodos.resolved', { n: resolved.length })"
        :open="showResolved"
        testid="trip-todos-resolved"
        @toggle="showResolved = !showResolved"
      />
      <template v-if="showResolved || unfolded">
        <ListRow
          v-for="task in resolved"
          :key="task.id"
          :lines="isList ? undefined : 'none'"
          class="todo-row resolved"
          done
          :checked="true"
          :tick-disabled="readonly"
          :facts-testid="`trip-todo-facts-${task.body}`"
          :data-testid="`trip-todo-${task.body}`"
          @tick="emit('toggle', task)"
        >
          <IonLabel>
            <button
              type="button"
              class="body row-name"
              :data-testid="`trip-todo-open-${task.body}`"
              @click="emit('open', task)"
            >
              {{ task.body }}
            </button>
          </IonLabel>
          <template v-if="isList && hasFacts(task)" #facts>
            <TaskItemChip
              v-if="task.item"
              :item="task.item"
              :to="tripItemPath(tripId, task.item.id)"
            />
            <span v-if="tagOf?.(task)" class="tag" :data-testid="`trip-todo-tag-${task.body}`">{{
              tagOf(task)
            }}</span>
            <!-- Done is done: who had it is still worth reading, but handing
                 over a finished task decides nothing. -->
            <span
              v-if="task.assignee_user_id"
              class="person"
              :data-testid="`trip-todo-assignee-${task.body}`"
            >
              <UserAvatar
                variant="assignee"
                :name="nameOf?.(task.assignee_user_id)"
                :seed="task.assignee_user_id"
              />
            </span>
          </template>
          <template v-if="!isList" #end>
            <span slot="end" class="todo-end">
              <TaskItemChip
                v-if="task.item"
                :item="task.item"
                :to="tripItemPath(tripId, task.item.id)"
              />
              <UserAvatar
                v-if="task.assignee_user_id"
                variant="assignee"
                :name="nameOf?.(task.assignee_user_id)"
                :seed="task.assignee_user_id"
                :data-testid="`trip-todo-assignee-${task.body}`"
              />
              <RemoveButton
                v-if="!task.item && !readonly"
                :label="t('tripTodos.remove')"
                :data-testid="`trip-todo-remove-${task.body}`"
                @click="emit('remove', task)"
              />
            </span>
          </template>
        </ListRow>
      </template>
    </template>
  </div>
</template>

<style scoped>
.trip-todo-list.window {
  padding: 0 4px 12px;
}

/* M4's window is a handful of compact lines; M25's list rows keep Ionic's own
   height, the one M6's rows have. */
.window .todo-row {
  --min-height: 36px;
}

.window :deep(.text) {
  padding-block: 0;
}

/* In M25's list a task's words are a row's name, set in the role
   `typography.css` gives `ion-label h3` — M6's entries wear it. A button
   cannot hold a heading, so the role's two values are asked for here. */
.list .body {
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
  white-space: normal;
}

/* The words are a control, and must not read as one: the line is the task,
   and a button's chrome here would compete with the tick for the eye. */
.body {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.person {
  display: inline-flex;
}

.todo-end {
  display: flex;
  align-items: center;
  gap: 6px;
  /* The chip is the one thing here that carries text, so it is the one thing
     that can outgrow the row; everything else keeps its box. */
  min-width: 0;
  max-width: 62%;
}

/* M4's window keeps its fold at the window's inset, not a list's. */
.window .fold-toggle {
  margin-top: 0;
  padding-inline: 14px;
}
</style>
