<script setup lang="ts">
/**
 * One task, looked at properly (FR-7.7) — the sheet behind a task's words on
 * M25 and on M4's window.
 *
 * The list line carries one stamp because a list is read by skimming it. The
 * facts a task has beyond that — who wrote it *and* who finished it, the row
 * it prepares, which phase it is in — are here, where there is room for them
 * without every line in the list paying for it.
 *
 * It decides nothing. The phase move and the removal are emitted, because the
 * screen owns the one snackbar that takes either back (FR-25.31).
 */
import { IonButton, IonIcon, IonInput } from '@ionic/vue'
import {
  arrowBackOutline,
  arrowForwardOutline,
  createOutline,
  checkmarkCircleOutline,
  cubeOutline,
  trashOutline,
} from 'ionicons/icons'
import { computed, ref } from 'vue'

import ItemMark from '@/components/items/ItemMark.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import { filedTagOf, type TripTask } from '@/domain/tripTodos'
import { t } from '@/i18n'
import type { NameOf } from '@/lib/rowFacts'
import { createdStampText, resolvedStampText } from '@/lib/taskFacts'
import { TASK_PHASE_BEFORE, TASK_PHASE_DURING, type TaskPhase, type TaskTag } from '@/types/domain'

/** The size a tag chip wears its mark at (G-15's scale). */
const MARK_SIZE = 15

const props = defineProps<{
  task: TripTask
  /** How a member is named; returns null where nobody can be (G-8). */
  nameOf: NameOf
  /** FR-7.8: the tags a task may carry, in their own order. */
  taskTags?: readonly TaskTag[]
}>()

const emit = defineEmits<{
  close: []
  move: [phase: TaskPhase]
  remove: []
  /** FR-7.8: this tag, or null for none. */
  tag: [taskTagId: string | null]
  /** A word the list does not have yet — created where it is needed. */
  newTag: [name: string]
}>()

/**
 * FR-7.8: „exactly one" as the owner asked it — at most one, never two. The
 * list is therefore a choice and not a set of toggles, and *no tag* is one of
 * the choices rather than the absence of a choice. It is named after where
 * the task came from, because that is what its group is called.
 */
const draftTag = ref('')

/**
 * Which chip reads as chosen. Not the raw column: a task can carry an id this
 * device has no tag for — the two partitions arrive through separate feeds —
 * and the list files such a task as untagged (`filedTagOf`). The sheet has to
 * agree, or it would show a task with nothing selected while its group says
 * it has no tag.
 */
const chosenTag = computed(() => filedTagOf(props.task, props.taskTags ?? []))
const noTagLabel = computed(() => (props.task.item ? t('tasks.fromPacking') : t('tasks.noTag')))

function addTag() {
  const name = draftTag.value.trim()
  if (!name) return
  draftTag.value = ''
  emit('newTag', name)
}

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
    />

    <ul v-if="facts.length > 0" class="facts" data-testid="task-sheet-facts">
      <li v-for="fact in facts" :key="fact.key" :data-testid="`task-sheet-${fact.key}`">
        <IonIcon :icon="fact.icon" aria-hidden="true" />
        <span>{{ fact.text }}</span>
      </li>
    </ul>

    <div v-if="taskTags" class="tags" data-testid="task-sheet-tags">
      <div class="tags-label jp-section-count">{{ t('tasks.tagLabel') }}</div>
      <button
        v-for="tag in taskTags"
        :key="tag.id"
        type="button"
        class="tag"
        :class="{ on: chosenTag === tag.id }"
        :data-testid="`task-sheet-tag-${tag.name}`"
        @click="emit('tag', tag.id)"
      >
        <ItemMark v-if="tag.icon" :mark="tag.icon" surface="plain" :size="MARK_SIZE" />{{
          tag.name
        }}
      </button>
      <button
        type="button"
        class="tag"
        :class="{ on: chosenTag === null }"
        data-testid="task-sheet-tag-none"
        @click="emit('tag', null)"
      >
        {{ noTagLabel }}
      </button>
      <div class="tag-new">
        <IonInput
          v-model="draftTag"
          :placeholder="t('tasks.newTag')"
          data-testid="task-sheet-tag-input"
          @keydown.enter="addTag"
        />
        <IonButton
          size="small"
          :disabled="!draftTag.trim()"
          data-testid="task-sheet-tag-add"
          @click="addTag"
        >
          {{ t('common.add') }}
        </IonButton>
      </div>
    </div>

    <div class="actions">
      <IonButton expand="block" data-testid="task-sheet-move" @click="emit('move', otherPhase)">
        <IonIcon
          slot="start"
          :icon="otherPhase === TASK_PHASE_DURING ? arrowForwardOutline : arrowBackOutline"
        />
        {{ t(otherPhase === TASK_PHASE_DURING ? 'tasks.moveToDuring' : 'tasks.moveToBefore') }}
      </IonButton>
      <!-- A preparation is removed where it lives, which is its row (FR-7.3):
           offering it here would be a second place to delete the same thing,
           and the one that does not show what else the row still owes. -->
      <IonButton
        v-if="!task.item"
        expand="block"
        fill="clear"
        data-testid="task-sheet-remove"
        @click="emit('remove')"
      >
        <IonIcon slot="start" :icon="trashOutline" />
        {{ t('tripTodos.remove') }}
      </IonButton>
    </div>
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

/* The tags read as one block of choices, which is what „exactly one" is. */
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 16px 0 0;
}

.tags-label {
  flex: 0 0 100%;
  margin-bottom: 2px;
}

.tag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 11px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.tag.on {
  border-color: var(--jp-action);
  color: var(--ct-text);
}

.tag-new {
  flex: 0 0 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.tag-new ion-input {
  --background: var(--ct-surface0);
  --padding-start: 12px;
  --padding-end: 12px;
  border-radius: var(--jp-r-md);
}

.actions {
  margin-top: 18px;
  display: grid;
  gap: 2px;
}
</style>
