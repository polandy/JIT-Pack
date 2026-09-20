<script setup lang="ts">
/**
 * Who a batch of items is usually somebody's job for (FR-1.9 over FR-24.9) —
 * M9's selection mode asks this sheet which account to name.
 *
 * **It has no search.** The directory is the instance's accounts, which is a
 * handful where the tag vocabulary is dozens; a field that filters four rows
 * is a control that costs more than it saves. If an instance ever grows a
 * directory that scrolls, this is where the field goes.
 *
 * **„Niemand" is a choice, not an empty state.** It sits at the top as the
 * way to take an assignment *away* from a batch again — the action is
 * otherwise one-way, and an item wrongly handed to somebody would have to be
 * opened one at a time to undo.
 */
import { computed } from 'vue'

import SheetModal from '@/components/global/SheetModal.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import { t } from '@/i18n'
import type { DirectoryUser } from '@/api/types'

const props = defineProps<{
  isOpen: boolean
  /** Every account the instance carries (G-8: the caller offers none in Local Mode). */
  directory: DirectoryUser[]
  /** How many of the *selected* items already name each account, by user id. */
  counts: Map<string, number>
  /** How many items the action would touch. */
  selected: number
  /** How many of them currently name nobody — the same count for „Niemand". */
  unassigned: number
}>()

const emit = defineEmits<{
  dismiss: []
  /** `null` is „Niemand": the batch's assignment is taken away. */
  pick: [value: { userId: string | null }]
}>()

const sorted = computed(() =>
  [...props.directory].sort((a, b) => a.display_name.localeCompare(b.display_name)),
)
</script>

<template>
  <SheetModal :is-open="isOpen" testid="m9-bulk-assignee-sheet" @dismiss="emit('dismiss')">
    <section class="sheet-body">
      <SheetHead
        :title="t('items.bulkAssigneeTitle')"
        :meta="t('items.bulkSelected', { n: selected })"
        title-testid="m9-bulk-assignee-title"
        close-testid="m9-bulk-assignee-close"
        @close="emit('dismiss')"
      />

      <p class="hint">{{ t('items.bulkAssigneeHint') }}</p>

      <ul class="people">
        <li>
          <button
            type="button"
            data-testid="m9-bulk-assignee-nobody"
            @click="emit('pick', { userId: null })"
          >
            <span class="name">{{ t('items.editor.assigneeNone') }}</span>
            <span v-if="unassigned" class="count jp-num">
              {{ t('items.bulkAlreadyOn', { n: unassigned }) }}
            </span>
          </button>
        </li>

        <li v-for="user in sorted" :key="user.user_id">
          <button
            type="button"
            :data-testid="`m9-bulk-assignee-${user.display_name}`"
            @click="emit('pick', { userId: user.user_id })"
          >
            <span class="name">{{ user.display_name }}</span>
            <span v-if="counts.get(user.user_id)" class="count jp-num">
              {{ t('items.bulkAlreadyOn', { n: counts.get(user.user_id) ?? 0 }) }}
            </span>
          </button>
        </li>
      </ul>
    </section>
  </SheetModal>
</template>

<style scoped>
.sheet-body {
  padding: 4px 18px 22px;
}

.hint {
  margin: 2px 0 10px;
  color: var(--ct-overlay2);
  font-size: var(--jp-text-sm);
}

.people {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 46vh;
  overflow-y: auto;
}

.people button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: none;
  border: none;
  border-bottom: 1px solid var(--ct-surface0);
  padding: 12px 2px;
  color: var(--ct-text);
  font-size: var(--jp-text-md);
  text-align: left;
  cursor: pointer;
}

.name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.count {
  margin-left: auto;
  color: var(--ct-overlay1);
  font-size: var(--jp-text-sm);
  white-space: nowrap;
}
</style>
