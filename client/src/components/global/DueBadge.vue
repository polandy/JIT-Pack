<script setup lang="ts">
/**
 * FR-7.11 / FR-30.10: when something is due, on its line — the same small
 * pill wherever a task or a purchase is listed (M25, M4's window, M6, M1), so
 * „überfällig" reads the same everywhere.
 *
 * Overdue is the one loud state, in red; today and soon
 * wear the action colour, a date further out stays quiet.
 *
 * A task's reminder time follows the day („Heute 14:00", FR-7.18) — except
 * once overdue, where the hour has nothing left to announce.
 */
import { computed } from 'vue'

import { DUE_OVERDUE } from '@/domain/shared/dueDay'
import { dueLabel } from '@/lib/taskDueText'

const props = defineProps<{
  /** The day it is due, or null for none — and null for a thing already done. */
  day: string | null
  /** Today as the device reckons it (`orchestrator.today()`). */
  today: string
  /** The time its reminder arrives on that day (a task's, FR-7.18), or none. */
  time?: string | null
  testid?: string
}>()

const label = computed(() => dueLabel(props.day, props.today))
const text = computed(() =>
  label.value && props.time && label.value.state !== DUE_OVERDUE
    ? `${label.value.text} ${props.time}`
    : label.value?.text,
)
</script>

<template>
  <span v-if="label" class="due-badge" :data-due="label.state" :data-testid="testid">{{
    text
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
