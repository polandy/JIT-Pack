<script setup lang="ts">
/**
 * The trip's tasks (FR-7.6/FR-7.7), editable: the list M25 renders twice —
 * once per phase — and the window M4 keeps of what is to be done while
 * packing. Open ones are ticked off in place, resolved ones fold away but
 * stay reachable to untick.
 *
 * Two kinds of task share the list. The trip's own (FR-7.4) carry a ✕; a
 * row's preparation (FR-7.3) carries the chip of the row it belongs to
 * instead and is removed where it lives, which is the row. The chip is what
 * says which is which.
 *
 * **Since FR-7.7 both kinds carry a seat** (the owner's request of
 * 2026-09-20: *a task can be assigned to somebody like a pack item*). Q3 B's
 * own line — who wrote it while it is open, who finished it once it is done —
 * lived on the row itself until 2026-09-23; the overview reads the words and
 * the seat now, and the provenance moved to the task's own sheet
 * (`TripTaskSheet.vue`), the only place it was still worth a line each.
 *
 * The trip is where these are written (owner, 2026-09-18): M1 only reports
 * them, because the dashboard takes no actions.
 *
 * Every act is *emitted*: both kinds are written through different actions
 * and both undone through the screen's one snackbar (FR-25.31), so the writer
 * is the screen and this list reports the tap. The composer is the exception —
 * it can only write the trip's own kind, so it writes it, in the phase the
 * screen handed it.
 */
import { IonButton, IonCheckbox, IonIcon, IonInput, IonItem, IonLabel } from '@ionic/vue'
import { chevronForwardOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import AssigneeSeat from '@/components/trips/AssigneeSeat.vue'
import DueBadge from '@/components/global/DueBadge.vue'
import TaskItemChip from '@/components/trips/TaskItemChip.vue'
import DragGrip from '@/components/global/DragGrip.vue'
import SelectBox from '@/components/global/SelectBox.vue'
import InlineHint from '@/components/global/InlineHint.vue'
import RemoveButton from '@/components/global/RemoveButton.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { useOrchestrator } from '@/composables/useOrchestrator'
import type { RowSelection } from '@/composables/useRowSelection'
import { openDueDay } from '@/domain/taskDue'
import type { TripTask } from '@/domain/tripTodos'
import { t } from '@/i18n'
import { tripItemPath } from '@/router/paths'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import type { TaskPhase } from '@/types/domain'

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
  nameOf?: (userId: string | null) => string | null
  /**
   * FR-7.7: the phase a task typed into the composer is written in, or null
   * for a list without one. M4's window has none — everything it shows hangs
   * off a packing row, and a trip task typed there would vanish as it was
   * written.
   */
  composerPhase?: TaskPhase | null
  /** What the composer's empty field says; the screen knows which list it is. */
  composerLabel?: string
  /** What to say when the list is empty. Absent renders nothing. */
  emptyText?: string
  /**
   * FR-7.8: how a row is picked up by its grip, where this list is inside
   * something that can be dragged between. A function rather than an event,
   * because the gesture has to start *during* the pointerdown — an emit would
   * arrive after the browser has already decided the press is a scroll.
   *
   * Absent means the rows are not draggable and no grip is drawn, which is
   * how M4's window renders them: its window is a handful of lines with
   * nothing to sort them into.
   */
  lift?: (ev: PointerEvent, task: TripTask, row: HTMLElement) => void
  /**
   * M25's selection (`useRowSelection`, 2026-09-24): a hold on an open row
   * selects it, the way it does on M6. Absent — M4's window — a hold does
   * nothing.
   */
  selection?: RowSelection
  /**
   * `list`: the rows sit in M25's grouped list and look like M6's rows.
   * `window` (default): M4's compact window of a handful of lines.
   */
  variant?: 'list' | 'window'
  /**
   * FR-7.11: today as the device reckons it, for the due badge. Absent
   * draws no badge — the composer-only instance lists no tasks.
   */
  today?: string
  /**
   * FR-7.12: the list is history — the *before* phase once the packing is
   * finished. Nothing is ticked, reopened, handed over or removed here; the
   * words still open the task's sheet, which is the way out of the phase.
   */
  readonly?: boolean
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
  /** FR-7.7: the words were tapped — the screen opens the task's own sheet. */
  open: [task: TripTask]
}>()

const orchestrator = useOrchestrator()

const open = computed(() => props.tasks.filter((task) => task.task_state === 'open'))
const resolved = computed(() => props.tasks.filter((task) => task.task_state === 'resolved'))

const draft = ref('')
const showResolved = ref(false)

function add() {
  const body = draft.value.trim()
  if (!body || !props.composerPhase) return
  const id = orchestrator.addTripTodo(
    props.tripId,
    CLIENT_ACTOR_PLACEHOLDER,
    body,
    props.composerPhase,
  )
  draft.value = ''
  emit('added', id, body)
}

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
</script>

<template>
  <div class="trip-todo-list" :class="variant ?? 'window'" data-testid="trip-todo-list">
    <InlineHint v-if="emptyText && tasks.length === 0" data-testid="trip-todo-empty">
      {{ emptyText }}
    </InlineHint>

    <IonItem
      v-for="task in open"
      :key="task.id"
      :lines="variant === 'list' ? undefined : 'none'"
      class="todo-row"
      :data-selected="selecting && selection?.selected.value.has(task.id) ? 'true' : undefined"
      :data-testid="`trip-todo-${task.body}`"
    >
      <!-- M6's leading edge (2026-09-24): the selection box while selecting,
           the grip otherwise. The grip exists only to be dragged, so it lifts
           without a hold; it is drawn only where this list sits in something
           that can be dragged between. -->
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
      <!-- FR-7.7: the words are the way into the task's own sheet, where the
           facts that do not fit a line live — and where it is moved between
           the phases. A button rather than the label itself, so the target is
           the words and not the whole row: the tick is the row's own edge. -->
      <!-- A hold on the words selects, M6's gesture (and its right-click
           twin); the tick and the ✕ are left to their own taps. -->
      <IonLabel
        @pointerdown="selection?.press(task.id, $event)"
        @pointermove="selection?.move($event)"
        @pointerup="selection?.release()"
        @pointercancel="selection?.release()"
        @contextmenu="onContextMenu($event, task)"
      >
        <button
          type="button"
          class="body"
          :data-testid="`trip-todo-open-${task.body}`"
          @click="onOpen(task)"
        >
          {{ task.body }}
        </button>
      </IonLabel>
      <!-- While selecting, the row's own controls step aside, as M6's do: a
           tap there would act on one task in the middle of choosing several. -->
      <span v-if="!selecting" slot="end" class="todo-end">
        <!-- FR-7.11: when it is due, first — it is what decides whether the
             line is read now. -->
        <DueBadge
          v-if="today"
          :day="openDueDay(task)"
          :today="today"
          :testid="`trip-todo-due-${task.body}`"
        />
        <!-- FR-7.6: the chip stands where the trip's own task carries its
             ✕ — one line, one place that says what the task belongs to. -->
        <TaskItemChip v-if="task.item" :item="task.item" :to="tripItemPath(tripId, task.item.id)" />
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
      <!-- The tick is last, so its outer edge is the row's — the same rule a
           packing row's control follows (UI-Spec M4), and the reason both land
           under the same thumb. It is a sibling of the cluster rather than
           part of it: the cluster's width budget is the chip's, and a tick
           inside it would be paid for out of the row's name. -->
      <IonCheckbox
        v-if="!selecting"
        slot="end"
        class="tick"
        :checked="false"
        :disabled="readonly"
        @ionChange="emit('toggle', task)"
      />
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
          :lines="variant === 'list' ? undefined : 'none'"
          class="todo-row resolved"
          :data-testid="`trip-todo-${task.body}`"
        >
          <IonLabel>
            <button
              type="button"
              class="body"
              :data-testid="`trip-todo-open-${task.body}`"
              @click="emit('open', task)"
            >
              {{ task.body }}
            </button>
          </IonLabel>
          <span slot="end" class="todo-end">
            <TaskItemChip
              v-if="task.item"
              :item="task.item"
              :to="tripItemPath(tripId, task.item.id)"
            />
            <!-- Done is done: who had it is still worth reading, but handing
                 over a finished task decides nothing. -->
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
          <IonCheckbox
            slot="end"
            class="tick"
            :checked="true"
            :disabled="readonly"
            @ionChange="emit('toggle', task)"
          />
        </IonItem>
      </template>
    </template>

    <div v-if="composerPhase" class="composer">
      <IonInput
        v-model="draft"
        :placeholder="composerLabel ?? t('tripTodos.add')"
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
.trip-todo-list.window {
  padding: 0 4px 12px;
}

/* M4's window is a handful of compact lines; M25's list rows keep Ionic's own
   height, the one M6's rows have. */
.window .todo-row {
  --min-height: 36px;
}

.todo-row[data-selected='true'] {
  --background: color-mix(in srgb, var(--jp-action) 10%, transparent);
}

/* In M25's list a task's words are a row's name, set in the role
   `typography.css` gives `ion-label h3` — M6's entries wear it. A button
   cannot hold a heading, so the role's two values are asked for here. */
.list .body {
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
}

.list .resolved-toggle {
  padding-inline: 16px;
}

.todo-row.resolved ion-label {
  color: var(--ct-subtext0);
}

.todo-row.resolved .body {
  text-decoration: line-through;
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

.todo-end {
  display: flex;
  align-items: center;
  gap: 6px;
  /* The chip is the one thing here that carries text, so it is the one thing
     that can outgrow the row; everything else keeps its box. Since FR-7.7 a
     preparation carries a seat beside its chip, so the cluster is given the
     width that seat costs and the chip shrinks first. */
  min-width: 0;
  max-width: 62%;
}

.tick {
  /* A destructive ✕ stands next to the tick: the extra step keeps a mis-tap
     from deleting what it meant to finish. */
  margin-inline-start: 4px;
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
