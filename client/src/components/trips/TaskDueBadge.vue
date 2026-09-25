<script setup lang="ts">
/**
 * FR-7.11: when a task is due, on its line — the same small pill wherever a
 * task is listed (M25, M4's window), so „überfällig" reads the same on both.
 *
 * Overdue is the one loud state (the owner asked for red); today and soon
 * wear the action colour, a date further out stays quiet.
 */
import { computed } from 'vue'

import type { DueFacts } from '@/domain/taskDue'
import { dueLabel } from '@/lib/taskDueText'

const props = defineProps<{
  task: DueFacts
  /** Today as the device reckons it (`orchestrator.today()`). */
  today: string
  testid?: string
}>()

const label = computed(() => dueLabel(props.task, props.today))
</script>

<template>
  <span v-if="label" class="due-badge" :data-due="label.state" :data-testid="testid">{{
    label.text
  }}</span>
</template>

<style scoped>
.due-badge {
  flex: none;
  padding: 1px 8px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-medium);
  white-space: nowrap;
}

.due-badge[data-due='today'],
.due-badge[data-due='soon'] {
  background: color-mix(in srgb, var(--jp-action) 14%, transparent);
  color: var(--jp-action);
}

.due-badge[data-due='overdue'] {
  background: color-mix(in srgb, var(--ct-ember) 16%, transparent);
  color: var(--ct-ember);
}
</style>
