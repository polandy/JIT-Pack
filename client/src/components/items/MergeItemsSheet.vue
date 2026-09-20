<script setup lang="ts">
/**
 * Which of the picked items stays (FR-24.15).
 *
 * A sheet rather than FR-24.14's action sheet, and that is the difference
 * between merging tags and merging items: a tag is a name, so a list of names
 * with their counts is the whole question. An item is a name, a set of tags, a
 * weight, a photo and a past — and picking the wrong survivor is the one way
 * this act loses something the user cares about. So every candidate says what
 * it brings, and the row the user is most likely to want is offered first.
 *
 * **It decides nothing.** The page runs the merge, because the confirm, the
 * photo copy and the outcome sentence all belong where the orchestrator is.
 */
import { IonIcon } from '@ionic/vue'
import { imageOutline, pricetagOutline } from 'ionicons/icons'
import { computed } from 'vue'

import SheetModal from '@/components/global/SheetModal.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import { formatWeight } from '@/lib/format'
import { t } from '@/i18n'
import type { MasterItem } from '@/types/domain'

/** One candidate, with everything the choice turns on already resolved. */
export interface MergeCandidate {
  item: MasterItem
  /** The item's tags, by name — what the survivor keeps as its filing. */
  tags: string[]
  /** How many trip rows and Vorlage positions name it (FR-24.3's count). */
  uses: number
}

const props = defineProps<{
  isOpen: boolean
  candidates: MergeCandidate[]
}>()

const emit = defineEmits<{
  dismiss: []
  /** Merge every other candidate into this one. */
  pick: [itemId: string]
}>()

/**
 * Most-used first, then the one with the most tags: the row a duplicate was
 * split off from is almost always the one the rest of the data already hangs
 * on, and it is the choice that moves the fewest rows.
 */
const ordered = computed(() =>
  [...props.candidates].sort(
    (a, b) =>
      b.uses - a.uses || b.tags.length - a.tags.length || a.item.name.localeCompare(b.item.name),
  ),
)

function facts(candidate: MergeCandidate): string[] {
  const out: string[] = []
  if (candidate.item.weight_grams !== null) out.push(formatWeight(candidate.item.weight_grams))
  // Zero is its own sentence: the catalogue's plural rule is one/other
  // (NFR-4.12), so „0" would render as the „other" form — „used 0×" — and a
  // row that was never packed is exactly the one this list has to say so of.
  out.push(
    candidate.uses === 0 ? t('items.mergeUnused') : t('items.mergeUses', { n: candidate.uses }),
  )
  return out
}
</script>

<template>
  <SheetModal :is-open="isOpen" testid="m9-merge-sheet" @dismiss="emit('dismiss')">
    <section class="sheet-body">
      <SheetHead
        :title="t('items.mergeTitle')"
        :meta="t('items.mergeMeta', { n: candidates.length })"
        title-testid="m9-merge-title"
        close-testid="m9-merge-close"
        @close="emit('dismiss')"
      />

      <p class="hint">{{ t('items.mergeHint') }}</p>

      <ul class="candidates">
        <li v-for="candidate in ordered" :key="candidate.item.id">
          <button
            type="button"
            :data-testid="`m9-merge-keep-${candidate.item.name}`"
            @click="emit('pick', candidate.item.id)"
          >
            <ItemMark
              :mark="candidate.item.icon ?? null"
              surface="inventory"
              :photo-item="candidate.item"
              :initial="candidate.item.name.slice(0, 1).toUpperCase()"
              :size="34"
            />
            <span class="what">
              <span class="name">{{ candidate.item.name }}</span>
              <span class="facts">
                <span v-for="fact in facts(candidate)" :key="fact">{{ fact }}</span>
              </span>
              <span v-if="candidate.tags.length > 0" class="tags">
                <IonIcon :icon="pricetagOutline" />
                {{ candidate.tags.join(' · ') }}
              </span>
            </span>
            <IonIcon v-if="candidate.item.image_hash" :icon="imageOutline" class="photo" />
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

.candidates {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 52vh;
  overflow-y: auto;
}

.candidates button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: none;
  border: none;
  border-bottom: 1px solid var(--ct-surface0);
  padding: 10px 2px;
  color: var(--ct-text);
  text-align: left;
}

.what {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name {
  font-weight: var(--jp-weight-semibold);
}

.facts,
.tags {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.tags ion-icon {
  font-size: var(--jp-icon-xs);
}

.photo {
  flex: none;
  font-size: var(--jp-icon-sm);
  color: var(--ct-overlay2);
}
</style>
