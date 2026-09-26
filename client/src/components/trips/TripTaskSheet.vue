<script setup lang="ts">
/**
 * One task, looked at properly (FR-7.7) — the sheet behind a task's words on
 * M25 and on M4's window.
 *
 * **Ordered by how often each act is wanted (FR-7.14, owner 2026-09-25).**
 * The task's words are its title and are edited in place — a typo used to
 * cost deleting the task and typing it again, which lost its tag and day.
 * *Erledigt* is the one primary act, then the due day as chips, then the tag;
 * the phase move, the rarest act, is a secondary row under them, and the
 * removal the quiet last line. The facts that do not fit a list line — the
 * row it prepares, who wrote it, who finished it — sit between the two.
 *
 * It decides nothing. Every act is emitted, because the screen owns the one
 * snackbar that takes it back (FR-25.31).
 */
import { IonButton, IonIcon, IonTextarea } from '@ionic/vue'
import {
  arrowBackOutline,
  arrowForwardOutline,
  arrowUndoOutline,
  checkmarkOutline,
  createOutline,
  checkmarkCircleOutline,
  cubeOutline,
  trashOutline,
} from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import DueChips from '@/components/global/DueChips.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import TaskTagChooser from '@/components/trips/TaskTagChooser.vue'
import { filedTagOf, type TripTask } from '@/domain/tripTodos'
import { t } from '@/i18n'
import type { NameOf } from '@/lib/rowFacts'
import { createdStampText, resolvedStampText } from '@/lib/taskFacts'
import { TASK_PHASE_BEFORE, TASK_PHASE_DURING, type TaskPhase, type TaskTag } from '@/types/domain'

const props = withDefaults(
  defineProps<{
    task: TripTask
    /** How a member is named; returns null where nobody can be (G-8). */
    nameOf: NameOf
    /** FR-7.8: the tags a task may carry, in their own order. */
    taskTags?: readonly TaskTag[]
    /**
     * FR-7.12: the *before* phase is closed — the packing is finished — so a
     * task cannot be moved back into it, and a task still standing in it is
     * history: not ticked, not reworded, not dated.
     */
    beforeLocked?: boolean
    /** FR-7.11: today as the device reckons it, for the day chips. */
    today: string
    /** The trip's first day, for *Vor Abreise*; null where it names none. */
    tripStart?: string | null
  }>(),
  { taskTags: undefined, beforeLocked: false, tripStart: null },
)

const emit = defineEmits<{
  close: []
  move: [phase: TaskPhase]
  remove: []
  /** FR-7.14: ticked off, or reopened — the sheet's primary act. */
  toggle: []
  /** FR-7.14: the words, corrected. */
  rename: [body: string]
  /** FR-7.8: this tag, or null for none. */
  tag: [taskTagId: string | null]
  /** A word the list does not have yet — created where it is needed. */
  newTag: [name: string]
  /** FR-7.11: the day it is due, `YYYY-MM-DD`, or null to take the date off. */
  due: [dueDate: string | null]
}>()

/** FR-7.12: a task left in a closed *before* is read, not worked. */
const history = computed(() => props.beforeLocked && props.task.phase === TASK_PHASE_BEFORE)
const isOpen = computed(() => props.task.task_state === 'open')

/**
 * The words being edited. Re-read from the task whenever it changes under
 * the sheet (another device, or the undo), so the field never argues with
 * the list.
 */
const words = ref(props.task.body)
watch(
  () => props.task.body,
  (body) => (words.value = body),
)

/**
 * Written when the field is left, not per keystroke: one correction is one
 * act with one undo. Emptied, the field goes back to the words it had — a
 * task without words is not a rename, and removing is its own act below.
 */
function commitWords() {
  const next = words.value.trim()
  if (next === '' || next === props.task.body) {
    words.value = props.task.body
    return
  }
  emit('rename', next)
}

function onWordsKey(ev: KeyboardEvent) {
  // One line of words: Enter finishes the edit rather than breaking it.
  ev.preventDefault()
  ;(ev.target as HTMLElement | null)?.blur()
}

/**
 * Which chip reads as chosen. Not the raw column: a task can carry an id this
 * device has no tag for — the two partitions arrive through separate feeds —
 * and the list files such a task as untagged (`filedTagOf`). The sheet has to
 * agree, or it would show a task with nothing selected while its group says
 * it has no tag.
 */
const chosenTag = computed(() => filedTagOf(props.task, props.taskTags ?? []))
const noTagLabel = computed(() => (props.task.item ? t('tasks.fromPacking') : t('tasks.noTag')))

/** FR-7.11: the day chips' answer; the day it already has is no change. */
function onDue(day: string | null) {
  if (day !== props.task.due_date) emit('due', day)
}

/** Whether the phase move is offered: never back into a closed *before* (FR-7.12). */
const canMove = computed(() => !(props.beforeLocked && otherPhase.value === TASK_PHASE_BEFORE))

/** Where the task would go — the other phase, always. */
const otherPhase = computed<TaskPhase>(() =>
  props.task.phase === TASK_PHASE_BEFORE ? TASK_PHASE_DURING : TASK_PHASE_BEFORE,
)

/**
 * The facts, in the order they happened: the row it prepares, then who wrote
 * it, then who finished it. A fact with nothing to say is left out rather
 * than rendered empty — in Local Mode that is most of them.
 */
const facts = computed(() =>
  [
    props.task.item
      ? {
          key: 'item',
          icon: cubeOutline,
          text: t('tripTodos.forItem', { name: props.task.item.name }),
        }
      : null,
    factLine('created', createOutline, createdStampText(props.task, props.nameOf)),
    factLine('resolved', checkmarkCircleOutline, resolvedStampText(props.task, props.nameOf)),
  ].filter((fact): fact is { key: string; icon: string; text: string } => fact !== null),
)

function factLine(key: string, icon: string, text: string | null) {
  return text ? { key, icon, text } : null
}
</script>

<template>
  <div class="sheet" data-testid="task-sheet">
    <SheetHead
      :title="task.body"
      :meta="t(task.phase === TASK_PHASE_BEFORE ? 'tasks.before' : 'tasks.during')"
      title-testid="task-sheet-title"
      close-testid="task-sheet-close"
      @close="emit('close')"
    >
      <template v-if="!history" #title>
        <div class="jp-sheet-title">
          <IonTextarea
            v-model="words"
            class="words"
            :auto-grow="true"
            :rows="1"
            :aria-label="t('tasks.wordsLabel')"
            data-testid="task-sheet-title-input"
            @ionBlur="commitWords"
            @keydown.enter="onWordsKey"
          />
        </div>
      </template>
    </SheetHead>

    <div class="primary">
      <IonButton
        v-if="!history && isOpen"
        expand="block"
        class="done"
        data-testid="task-sheet-done"
        @click="emit('toggle')"
      >
        <IonIcon slot="start" :icon="checkmarkOutline" />
        {{ t('tasks.markDone') }}
      </IonButton>
      <IonButton
        v-else-if="!history"
        expand="block"
        fill="outline"
        data-testid="task-sheet-reopen"
        @click="emit('toggle')"
      >
        <IonIcon slot="start" :icon="arrowUndoOutline" />
        {{ t('tasks.reopen') }}
      </IonButton>
    </div>

    <!-- FR-7.11: a day, not a time — and only while the task is open: a
         finished task's date says when it was meant, nothing more to set. -->
    <section v-if="isOpen && !history" class="due">
      <div class="label jp-section-count">{{ t('tasks.dueField') }}</div>
      <DueChips
        :value="task.due_date"
        :today="today"
        :phase="task.phase"
        :trip-start="tripStart ?? null"
        testid="task-sheet-due"
        @update="onDue"
      />
    </section>

    <TaskTagChooser
      v-if="taskTags"
      :task-tags="taskTags"
      :chosen="chosenTag"
      :no-tag-label="noTagLabel"
      @tag="(id) => emit('tag', id)"
      @new-tag="(name) => emit('newTag', name)"
    />

    <IonButton
      v-if="canMove"
      class="move"
      expand="block"
      fill="outline"
      data-testid="task-sheet-move"
      @click="emit('move', otherPhase)"
    >
      <IonIcon
        slot="start"
        :icon="otherPhase === TASK_PHASE_DURING ? arrowForwardOutline : arrowBackOutline"
      />
      {{ t(otherPhase === TASK_PHASE_DURING ? 'tasks.moveToDuring' : 'tasks.moveToBefore') }}
    </IonButton>

    <ul v-if="facts.length > 0" class="facts" data-testid="task-sheet-facts">
      <li v-for="fact in facts" :key="fact.key" :data-testid="`task-sheet-${fact.key}`">
        <IonIcon :icon="fact.icon" aria-hidden="true" />
        <span>{{ fact.text }}</span>
      </li>
    </ul>

    <!-- A preparation is removed where it lives, which is its row (FR-7.3):
         offering it here would be a second place to delete the same thing,
         and the one that does not show what else the row still owes. -->
    <IonButton
      v-if="!task.item && !history"
      class="remove"
      expand="block"
      fill="clear"
      data-testid="task-sheet-remove"
      @click="emit('remove')"
    >
      <IonIcon slot="start" :icon="trashOutline" />
      {{ t('tripTodos.remove') }}
    </IonButton>
  </div>
</template>

<style scoped>
.sheet {
  padding: 4px 16px 18px;
}

/* The facts sit on the sunken plane: they are what is known about the task
   rather than what can be done to it, and the block says so at a glance. */
.facts {
  list-style: none;
  margin: 14px 0 0;
  padding: 10px 12px;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  display: grid;
  gap: 8px;
}

.facts li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}

.facts ion-icon {
  flex: none;
  font-size: var(--jp-icon-sm);
  color: var(--ct-overlay2);
}

.due {
  margin-top: 16px;
}

.label {
  margin-bottom: 6px;
}

.primary {
  margin-top: 4px;
}

/* The primary act is finishing the task: the done ink, the role progress has
   everywhere else (G-11). */
.done {
  --background: var(--jp-done);
  --color: var(--ct-on-accent);
}

.move {
  margin-top: 18px;
}

/* The words are the sheet's title, and editing them must not make them
   anything else: the role's type, no field chrome, one quiet underline. */
.words {
  --padding-top: 0;
  --padding-bottom: 4px;
  --padding-start: 0;
  --padding-end: 0;
  --background: transparent;
  min-height: 0;
  font: inherit;
  border-bottom: 1px dashed var(--ct-surface2);
}

/* Ionic sets the native field's own type; the title role is the host's. */
.words :deep(textarea) {
  font: inherit;
}

.remove {
  --color: var(--ct-ember);
  margin-top: 8px;
}
</style>
