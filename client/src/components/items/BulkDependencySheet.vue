<script setup lang="ts">
/**
 * The item a bulk link is made to (FR-24.9 over FR-20.1) — M9's selection
 * mode asks this sheet which one, in whichever of the two directions it was
 * opened for.
 *
 * Two directions, one component, because the difference is a sentence and
 * not a mechanism: *„die Auswahl hängt ab von …"* and *„… kommt mit der
 * Auswahl mit"* write the same edge from its two ends, which is exactly how
 * M10 renders them for a single item. Only the wording and the direction
 * passed on with the pick differ.
 *
 * **The list is a search result, not a shelf** (`DEPENDENCY_OFFER_CAP`): the
 * inventory is the pool here, and rendering two hundred rows in a sheet is a
 * scroll nobody reads. What the cap holds back is named, so a hit missing
 * from the list is never mistaken for an item that does not exist.
 *
 * **The switch is the mode the edges are written with** (FR-20.4): required
 * companions join a list on their own, suggested ones wait to be tapped.
 * Deciding it here rather than per row afterwards is the whole saving — a
 * batch of forty would otherwise be forty visits to M10.
 */
import { IonIcon } from '@ionic/vue'
import { searchOutline } from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import SheetModal from '@/components/global/SheetModal.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import { DEPENDENCY_LINK_MAIN, type DependencyLinkDirection } from '@/domain/dependencies'
import { DEPENDENCY_OFFER_CAP } from '@/lib/itemEditorOffers'
import { searchMatches } from '@/domain/search'
import { t } from '@/i18n'
import type { DependencyMode, MasterItem } from '@/types/domain'

const props = defineProps<{
  isOpen: boolean
  /** Which way round the edges are written. */
  direction: DependencyLinkDirection
  /** The pool to pick from — the active inventory. */
  items: MasterItem[]
  /** How many items the action would touch. */
  selected: number
}>()

const emit = defineEmits<{
  dismiss: []
  pick: [value: { itemId: string; mode: DependencyMode }]
}>()

const query = ref('')
const suggested = ref(false)

// Both reset on closing: the next opening is a new question, and a sheet that
// reopens pre-narrowed hides items the user never excluded.
watch(
  () => props.isOpen,
  (open) => {
    if (open) return
    query.value = ''
    suggested.value = false
  },
)

/**
 * By name, because the cap below cuts the list: the inventory arrives in the
 * order the rows were written, so an unsorted shelf of ten would be ten
 * arbitrary items and the same query could show a different ten tomorrow.
 */
const hits = computed(() =>
  props.items
    .filter((item) => searchMatches(item.name, query.value))
    .sort((a, b) => a.name.localeCompare(b.name)),
)
const matches = computed(() => hits.value.slice(0, DEPENDENCY_OFFER_CAP))
const hiddenCount = computed(() => hits.value.length - matches.value.length)

const isMain = computed(() => props.direction === DEPENDENCY_LINK_MAIN)

const title = computed(() =>
  t(isMain.value ? 'items.bulkDependsOnTitle' : 'items.bulkCompanionTitle'),
)

const hint = computed(() => t(isMain.value ? 'items.bulkDependsOnHint' : 'items.bulkCompanionHint'))
</script>

<template>
  <SheetModal :is-open="isOpen" testid="m9-bulk-dep-sheet" @dismiss="emit('dismiss')">
    <section class="sheet-body">
      <SheetHead
        :title="title"
        :meta="t('items.bulkSelected', { n: selected })"
        title-testid="m9-bulk-dep-title"
        close-testid="m9-bulk-dep-close"
        @close="emit('dismiss')"
      />

      <p class="hint">{{ hint }}</p>

      <div class="search">
        <IonIcon :icon="searchOutline" />
        <input
          v-model="query"
          :placeholder="t('items.editor.dependencySearchPlaceholder')"
          data-testid="m9-bulk-dep-search"
          autocomplete="off"
        />
      </div>

      <!-- FR-20.4: joins the list, or waits to be tapped. -->
      <label class="mode-switch">
        <input v-model="suggested" type="checkbox" data-testid="m9-bulk-dep-suggested" />
        <span>
          <strong>{{ t('items.bulkDependencySuggested') }}</strong>
          <em>{{ t('items.bulkDependencySuggestedHint') }}</em>
        </span>
      </label>

      <ul class="items">
        <li v-for="item in matches" :key="item.id">
          <button
            type="button"
            :data-testid="`m9-bulk-dep-pick-${item.name}`"
            @click="emit('pick', { itemId: item.id, mode: suggested ? 'suggested' : 'required' })"
          >
            <ItemMark :mark="item.icon ?? null" surface="plain" :size="20" />
            <span class="name">{{ item.name }}</span>
          </button>
        </li>

        <li v-if="matches.length === 0" class="none" data-testid="m9-bulk-dep-none">
          {{ t('items.editor.dependencyNoMatch') }}
        </li>

        <li v-else-if="hiddenCount > 0" class="none" data-testid="m9-bulk-dep-more">
          {{ t('items.bulkDependencyMore', { n: hiddenCount }) }}
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

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--jp-surface-sunken);
  border: 1px solid var(--ct-surface0);
  border-radius: var(--jp-r-sm);
  padding: 8px 11px;
  margin: 4px 0 10px;
  color: var(--ct-overlay2);
}

.search input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  color: var(--ct-text);
  font-size: var(--jp-text-md);
}

.mode-switch {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--jp-surface-sunken);
  border-radius: var(--jp-r-md);
  padding: 10px 12px;
  margin-bottom: 12px;
  cursor: pointer;
}

.mode-switch span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mode-switch strong {
  font-size: var(--jp-text-base);
  font-weight: var(--jp-weight-semibold);
  color: var(--ct-text);
}

.mode-switch em {
  font-size: var(--jp-text-sm);
  font-style: normal;
  color: var(--ct-overlay2);
}

.items {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 46vh;
  overflow-y: auto;
}

.items button {
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

.name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.none {
  padding: 14px 2px;
  color: var(--ct-overlay2);
  font-size: var(--jp-text-sm);
}
</style>
