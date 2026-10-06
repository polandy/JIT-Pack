<script setup lang="ts">
/**
 * The head of M9's „Ansicht & Filter" sheet (FR-24.4, FR-24.6, UX-05): the
 * order the list runs in, and what each row shows beside its name.
 *
 * Both are about the list's *shape*, which is why they sit above the tag
 * filter rather than as glyphs in the app bar — an eye and a ↕ have no
 * literal reading, and a tab root carries nothing before the ⋮ but search
 * (G-12, ADR-050 amendment 1). The properties are chips here rather than a
 * sheet of their own: three or four switches do not earn a second overlay.
 *
 * Every tap is in force at once, like the tags below it.
 */
import ChoiceChip from '@/components/global/ChoiceChip.vue'
import { offeredProperties, type inventoryProperties } from '@/composables/useInventoryProperties'
import { t } from '@/i18n'

import { SORT_MODES, type SortMode } from './useInventoryCore'

defineProps<{
  sort: SortMode
  /** G-8: the assignee is offered only where there is somebody to name. */
  canAssign: boolean
  properties: ReturnType<typeof inventoryProperties>
}>()

const emit = defineEmits<{ 'update:sort': [value: SortMode] }>()

function sortLabel(mode: SortMode): string {
  return mode === 'grouped' ? t('items.sortGrouped') : t('items.sortAlphabetical')
}
</script>

<template>
  <section class="view" data-testid="m9-view">
    <h3 class="jp-eyebrow">{{ t('items.sort') }}</h3>
    <div class="segment" role="group" :aria-label="t('items.sort')">
      <button
        v-for="mode in SORT_MODES"
        :key="mode"
        type="button"
        :class="{ on: sort === mode }"
        :aria-pressed="sort === mode"
        :data-testid="`m9-sort-${mode}`"
        @click="emit('update:sort', mode)"
      >
        {{ sortLabel(mode) }}
      </button>
    </div>

    <h3 class="jp-eyebrow">{{ t('items.viewShow') }}</h3>
    <div class="chips">
      <ChoiceChip
        v-for="key in offeredProperties(canAssign)"
        :key="key"
        :pressed="properties.isShown(key)"
        :data-testid="`m9-property-${key}`"
        @click="properties.toggle(key)"
      >
        {{ t(`items.property.${key}`) }}
      </ChoiceChip>
    </div>
  </section>
</template>

<style scoped>
.view {
  margin: 2px 0 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--ct-surface0);
}

.jp-eyebrow {
  margin: 0 0 6px;
}

.segment {
  display: flex;
  gap: 4px;
  background: var(--jp-surface-sunken);
  border-radius: var(--jp-r-sm);
  padding: 3px;
  margin-bottom: 10px;
}

.segment button {
  flex: 1;
  border: none;
  background: none;
  border-radius: var(--jp-r-xs);
  padding: 7px 0;
  color: var(--ct-overlay2);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.segment button.on {
  background: var(--ct-surface0);
  color: var(--ct-text);
  font-weight: var(--jp-weight-semibold);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
