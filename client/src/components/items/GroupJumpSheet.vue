<script setup lang="ts">
/**
 * Jump to a group of the inventory (FR-24.8).
 *
 * The control the swipe axis was actually used as. Measured on the family
 * instance, **3 of 184 items carry a second tag**, so filtering by tag almost
 * never separated anything the grouping had not separated already — what the
 * axis bought was getting to *Wandern* without fifteen screens of swiping.
 * That is navigation, and this is the navigation control: the list stays
 * whole, nothing is taken away from it, and the sheet closes onto the group
 * you asked for.
 *
 * It **scrolls** rather than anchoring the group at the top: the rows above
 * stay where they were, so a jump can be undone
 * by scrolling back rather than by another jump.
 */
import { computed } from 'vue'

import SheetModal from '@/components/global/SheetModal.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import { t } from '@/i18n'

const props = defineProps<{
  isOpen: boolean
  /** The rendered groups in list order: heading and how many rows it holds. */
  groups: { key: string; label: string; count: number }[]
  /** The group the list is currently showing, so the sheet can mark it. */
  current: string | null
}>()

const emit = defineEmits<{ dismiss: []; jump: [key: string] }>()

const total = computed(() => props.groups.reduce((sum, group) => sum + group.count, 0))
</script>

<template>
  <SheetModal :is-open="isOpen" testid="m9-jump-sheet" @dismiss="emit('dismiss')">
    <section class="sheet-body">
      <SheetHead
        :title="t('items.jumpTitle')"
        :meta="t('items.jumpHint', { groups: groups.length, items: total })"
        title-testid="m9-jump-title"
        close-testid="m9-jump-close"
        @close="emit('dismiss')"
      />

      <ul class="groups">
        <li v-for="group in groups" :key="group.key">
          <button
            type="button"
            :class="{ current: group.key === current }"
            :data-testid="`m9-jump-${group.label}`"
            @click="emit('jump', group.key)"
          >
            <span class="name">{{ group.label }}</span>
            <span class="count jp-num">{{ group.count }}</span>
          </button>
        </li>
      </ul>
    </section>
  </SheetModal>
</template>

<style scoped>
/* The sheet's own inset, like every other sheet body (§3.25). */
.sheet-body {
  padding: 4px 18px 22px;
}

.groups {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 56vh;
  overflow-y: auto;
}

.groups button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: none;
  border: none;
  border-bottom: 1px solid var(--ct-surface0);
  padding: 10px 2px;
  color: var(--ct-text);
  font-size: var(--jp-text-md);
  text-align: left;
  cursor: pointer;
}

.groups button.current {
  color: var(--jp-action);
  font-weight: var(--jp-weight-semibold);
}

.name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.count {
  margin-left: auto;
  color: var(--ct-overlay1);
  font-size: var(--jp-text-sm);
}
</style>
