<script setup lang="ts">
/**
 * FR-7.6: what a task hangs off. The chip names the packing row a
 * preparation belongs to — its mark and its name — and leads back to it.
 *
 * One component for both surfaces that list tasks (M4's section, M1's card),
 * because "this task belongs to a thing" has to be one shape wherever it is
 * read; a task of the trip itself carries no chip, and that absence is the
 * whole distinction between the two kinds.
 *
 * A link rather than a button on either surface: M1 takes no actions (owner,
 * 2026-09-18), and on M4 the row's sheet is a route of its own (FR-25.14), so
 * the same element does the same thing on both.
 */
import ItemMark from '@/components/items/ItemMark.vue'
import { t } from '@/i18n'
import type { TripTaskItem } from '@/domain/tripTodos'

const props = defineProps<{
  /** The row this task prepares. */
  item: TripTaskItem
  /** Where the chip leads — the row's own sheet. */
  to: string
}>()

/** The glyph box beside a task line, one step under a row's mark (G-13). */
const MARK_SIZE = 15
</script>

<template>
  <RouterLink
    class="task-chip"
    :to="to"
    :aria-label="t('tripTodos.forItem', { name: props.item.name })"
    :data-testid="`task-item-${props.item.name}`"
    @click.stop
  >
    <ItemMark :mark="props.item.icon" surface="plain" :size="MARK_SIZE" />
    <span class="chip-name">{{ props.item.name }}</span>
  </RouterLink>
</template>

<style scoped>
/*
 * The sunken plane inside a card (G-14): the chip is set *into* the task line
 * rather than raised off it, which is what keeps a line of them from reading
 * as a row of buttons.
 */
.task-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  min-width: 0;
  padding: 2px 9px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-medium);
  text-decoration: none;
}

.chip-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
