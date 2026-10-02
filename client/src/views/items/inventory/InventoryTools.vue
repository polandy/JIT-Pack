<script setup lang="ts">
/**
 * M9's tool bar (FR-24.6): the search, the three biggest tags and the door to
 * the rest (FR-24.8). Sticky, so it stays while the list moves; the page
 * measures its height for the headings that stick beneath it.
 */
import { IonIcon } from '@ionic/vue'
import { closeOutline, funnelOutline } from 'ionicons/icons'
import { computed } from 'vue'

import SearchRow from '@/components/global/SearchRow.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import { UNTAGGED_KEY, topTagsByCount } from '@/domain/tags'
import { t } from '@/i18n'
import { useMasterStore } from '@/stores/masterStore'

import type { InventoryCore } from './useInventoryCore'

const { core } = defineProps<{ core: InventoryCore }>()

defineEmits<{ submit: [] }>()

const masterStore = useMasterStore()
const { search, selection, counts, filtering, filterOpen, selectionLabel } = core

/**
 * How many tags the tool bar offers without opening the sheet (FR-24.8).
 * Three is what fits one row beside the sort chip at 390 px with the longest
 * tag name this instance carries; a fourth wraps the row.
 */
const TOP_TAG_COUNT = 3

/** The three the tool bar offers without opening anything (FR-24.8). */
const topTags = computed(() => topTagsByCount(masterStore.tagList, counts.value, TOP_TAG_COUNT))

/**
 * The chosen tags that are *not* among the three chips, as their own
 * removable chips: a filter the bar cannot show is a filter the user cannot
 * see, which is the failure the scrollable axis had by construction.
 */
const extraSelected = computed(() => {
  const top = new Set(topTags.value.map((tag) => tag.id))
  return selection.value
    .filter((id) => !top.has(id))
    .map((id) => ({ id, label: selectionLabel(id) }))
})

function toggleTag(id: string) {
  const next = new Set(selection.value)
  // The bucket is exclusive — see TagFilterSheet for why.
  next.delete(UNTAGGED_KEY)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selection.value = [...next]
}

function dropSelected(id: string) {
  selection.value = selection.value.filter((entry) => entry !== id)
}
</script>

<template>
  <div class="tools" data-testid="m9-tools">
    <SearchRow
      v-model="search"
      persistent
      testid="items-search-input"
      :placeholder="t('items.searchPlaceholder')"
      @close="search = ''"
      @submit="$emit('submit')"
    />

    <!-- FR-24.8: the three biggest tags, then the door to the rest. The
         swipe axis this replaces showed four of twenty-four chips and
         clipped the fourth mid-word. -->
    <div class="toolrow">
      <button
        v-for="tag in topTags"
        :key="tag.id"
        type="button"
        class="chip"
        :class="{ active: selection.includes(tag.id) }"
        :aria-pressed="selection.includes(tag.id)"
        :data-testid="`m9-tag-chip-${tag.name}`"
        :title="tag.name"
        @click="toggleTag(tag.id)"
      >
        <ItemMark :mark="tag.icon ?? null" surface="plain" :size="16" />
        <span class="chip-label">{{ tag.name }}</span>
        <span class="chip-count jp-num">{{ counts.get(tag.id) ?? 0 }}</span>
      </button>

      <button
        v-if="masterStore.tagList.length > 0"
        type="button"
        class="chip"
        :class="{ active: filtering }"
        data-testid="m9-filter-open"
        @click="filterOpen = true"
      >
        <IonIcon :icon="funnelOutline" />
        {{ t('items.filterAll', { n: masterStore.tagList.length }) }}
        <span v-if="selection.length > 0" class="chip-count jp-num">{{ selection.length }}</span>
      </button>

      <!-- A chosen tag that is not one of the three still travels with the
           bar: a filter the bar cannot show is one the user cannot see. -->
      <button
        v-for="entry in extraSelected"
        :key="entry.id"
        type="button"
        class="chip active"
        :aria-label="t('items.clearTag', { tag: entry.label })"
        :data-testid="`m9-clear-tag-${entry.label}`"
        @click="dropSelected(entry.id)"
      >
        {{ entry.label }}
        <IonIcon :icon="closeOutline" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* FR-24.6: the bar the list scrolls under. `ion-content` scrolls its own
   inner element, so a sticky child sticks to that — no fixed positioning
   and no scroll listener. */
.tools {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--jp-surface-page);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ct-surface0);
}

.toolrow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 12px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border: 1px solid var(--ct-surface0);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-card);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.chip.active {
  border-color: var(--jp-action);
  color: var(--jp-action);
}

/* A tag name is free text, and this instance's longest is „Elektronisches
   Zubehör": left alone, three chips plus the two controls wrap to three rows,
   and the bar is sticky — that height is spent on every screen of the list.
   The count stays outside the clamp, because a chip without its number is a
   chip that stopped saying what it leads to. */
.chip-label {
  min-width: 0;
  max-width: 10rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-count {
  color: var(--ct-overlay1);
  font-size: var(--jp-text-xs);
}

.chip.active .chip-count {
  color: var(--jp-action);
}

.chip ion-icon {
  font-size: var(--jp-icon-xs);
}
</style>
