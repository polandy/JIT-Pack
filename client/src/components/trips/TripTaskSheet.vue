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
import { IonButton, IonIcon } from '@ionic/vue'
import {
  arrowBackOutline,
  arrowForwardOutline,
  createOutline,
  checkmarkCircleOutline,
  cubeOutline,
  trashOutline,
} from 'ionicons/icons'
import { computed } from 'vue'

import SheetHead from '@/components/global/SheetHead.vue'
import type { TripTask } from '@/domain/tripTodos'
import { t } from '@/i18n'
import type { NameOf } from '@/lib/rowFacts'
import { createdStampText, resolvedStampText } from '@/lib/taskFacts'
import { TASK_PHASE_BEFORE, TASK_PHASE_DURING, type TaskPhase } from '@/types/domain'

const props = defineProps<{
  task: TripTask
  /** How a member is named; returns null where nobody can be (G-8). */
  nameOf: NameOf
}>()

const emit = defineEmits<{ close: []; move: [phase: TaskPhase]; remove: [] }>()

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

.actions {
  margin-top: 18px;
  display: grid;
  gap: 2px;
}
</style>
