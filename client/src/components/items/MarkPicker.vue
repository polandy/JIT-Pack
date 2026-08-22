<script setup lang="ts">
/**
 * The mark picker (Addendum §3.28, FR-28.2/28.3) — one component, opened by
 * M10 for an item and by M8 for a group or Ferien-Vorlage. Deliberately *not*
 * reimplemented per screen: the four remaining sheet copies noted after
 * FR-27.12 are the standing warning, and the suggestion band is exactly the
 * kind of surface that would drift between two copies.
 *
 * Three things the layout is arguing:
 *
 *   - The suggestion band sits first and is an **offer**. „Stirnlampe" reaches
 *     a torch — close enough to scan by, wrong as a statement — so a mark the
 *     user did not tap is never written.
 *   - Finding nothing is **said**, both for the suggestion and for the search.
 *     An empty grid reads as a gap to be filled, and a column everyone fills
 *     with 📦 has stopped meaning anything.
 *   - Removal is its own worded action, never the empty tile in the grid
 *     (FR-22.5 settled the same for the photo).
 */
import { computed, ref, watch } from 'vue'
import { IonIcon } from '@ionic/vue'
import { closeOutline, trashOutline } from 'ionicons/icons'

import SheetModal from '@/components/global/SheetModal.vue'
import { t } from '@/i18n'
import { MARK_FACETS, searchMarks, suggestMarks, type MarkFacet } from '@/domain/itemMarks'

const props = defineProps<{
  isOpen: boolean
  /** The name the suggestion is derived from — an item's or a template's. */
  name: string
  /** The mark set today, which is what makes removal offerable. */
  current: string | null
}>()

const emit = defineEmits<{ pick: [mark: string | null]; close: [] }>()

const query = ref('')
const facet = ref<MarkFacet | null>(null)

// Re-opening starts a fresh search: the previous query belonged to a different
// item, and a stale filter is a grid that looks broken.
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      query.value = ''
      facet.value = null
    }
  },
)

const suggestions = computed(() => suggestMarks(props.name))
const results = computed(() => searchMarks(query.value, facet.value))

function facetLabel(f: MarkFacet): string {
  return t(`marks.facet.${f}`)
}

function choose(mark: string | null) {
  emit('pick', mark)
  emit('close')
}
</script>

<template>
  <SheetModal :is-open="isOpen" @dismiss="emit('close')">
    <section class="picker" data-testid="mark-picker">
      <header class="head">
        <h1 class="jp-sheet-title">{{ t('marks.title') }}</h1>
        <button class="x" :aria-label="t('common.close')" @click="emit('close')">
          <IonIcon :icon="closeOutline" />
        </button>
      </header>

      <!-- FR-28.3: the offer, and the honest empty answer beside it. -->
      <div class="band">
        <p class="band-label">{{ t('marks.suggested', { name }) }}</p>
        <div v-if="suggestions.length" class="tiles">
          <button
            v-for="entry in suggestions"
            :key="entry.emoji"
            class="tile"
            data-testid="mark-suggestion"
            :aria-label="entry.keywords[0]"
            @click="choose(entry.emoji)"
          >
            <span class="jp-mark" aria-hidden="true">{{ entry.emoji }}</span>
          </button>
        </div>
        <p v-else class="quiet" data-testid="mark-no-suggestion">{{ t('marks.noSuggestion') }}</p>
      </div>

      <input
        v-model="query"
        class="search jp-body"
        type="search"
        data-testid="mark-search"
        :placeholder="t('marks.searchPlaceholder')"
        :aria-label="t('marks.searchPlaceholder')"
      />

      <div class="facets">
        <button
          class="facet"
          :class="{ on: facet === null }"
          data-testid="mark-facet-all"
          @click="facet = null"
        >
          {{ t('marks.facetAll') }}
        </button>
        <button
          v-for="f in MARK_FACETS"
          :key="f"
          class="facet"
          :class="{ on: facet === f }"
          :data-testid="`mark-facet-${f}`"
          @click="facet = f"
        >
          {{ facetLabel(f) }}
        </button>
      </div>

      <div v-if="results.length" class="grid">
        <button
          v-for="entry in results"
          :key="entry.emoji"
          class="tile"
          :class="{ on: entry.emoji === current }"
          data-testid="mark-tile"
          :aria-label="entry.keywords[0]"
          @click="choose(entry.emoji)"
        >
          <span class="jp-mark" aria-hidden="true">{{ entry.emoji }}</span>
        </button>
      </div>
      <p v-else class="quiet" data-testid="mark-no-result">{{ t('marks.noResult') }}</p>

      <button v-if="current" class="remove" data-testid="mark-remove" @click="choose(null)">
        <IonIcon :icon="trashOutline" aria-hidden="true" />
        {{ t('marks.remove') }}
      </button>
    </section>
  </SheetModal>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 18px 26px;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.head h1 {
  flex: 1;
  min-width: 0;
}

.x {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-md);
  cursor: pointer;
}

.band {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.band-label {
  margin: 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.quiet {
  margin: 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.tiles {
  display: flex;
  gap: 8px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 8px;
  max-height: 42vh;
  overflow-y: auto;
}

.tile {
  display: grid;
  place-items: center;
  height: 48px;
  border: none;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  cursor: pointer;
  --jp-mark-size: var(--jp-icon-lg);
}

.tile.on {
  background: var(--jp-action);
}

.search {
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
}

.facets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.facet {
  padding: 5px 11px;
  border: none;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.facet.on {
  background: var(--jp-action);
  color: var(--ct-base);
}

.remove {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 11px;
  border: none;
  border-radius: var(--jp-r-md);
  background: none;
  color: var(--ion-color-danger);
  font-size: var(--jp-text-base);
  cursor: pointer;
}
</style>
