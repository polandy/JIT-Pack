<script setup lang="ts">
/**
 * One tag, chosen by search-or-create — M6's entry and batch sheets, M25's
 * task, composer and batch sheets (one component, so the dialog is the
 * same). A search field, the chosen tag as a chip
 * with its ✕, the matching tags as chips, a dashed *„… neu anlegen"* chip for
 * a word no tag carries, and a summary line the caller words. The matching
 * rule is the shared one (`lib/itemEditorOffers.ts`), the one M10's
 * multi-tag chooser uses too.
 *
 * What a tag *is* stays the caller's: a shopping tag is a word, a task tag a
 * row with an id. Both arrive here as `{ id, name }`, and a new word is
 * reported as a name for the caller to make into one.
 */
import { IonIcon, IonSearchbar } from '@ionic/vue'
import { addOutline, closeOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import { t } from '@/i18n'
import { tagOffer } from '@/lib/itemEditorOffers'

/** A tag as the chooser sees it. */
export interface PickableTag {
  id: string
  name: string
}

const props = withDefaults(
  defineProps<{
    tags: readonly PickableTag[]
    /** The tag chosen now: its id, null for none, undefined for no one choice (a batch). */
    chosen?: string | null
    /** The trailing line; null for none (a batch applies the instant a chip is chosen). */
    summary?: string | null
    /** A batch's way to take its tags off: a chip under this name. Absent: none. */
    noTagLabel?: string
  }>(),
  { chosen: undefined, summary: null, noTagLabel: undefined },
)

const emit = defineEmits<{
  /** This tag's id, or null for none. */
  choose: [id: string | null]
  /** A word no tag carries yet. */
  create: [name: string]
}>()

const query = ref('')

const assigned = computed(() => props.tags.find((tag) => tag.id === props.chosen) ?? null)

const offer = computed(() =>
  tagOffer([...props.tags], new Set(assigned.value ? [assigned.value.id] : []), query.value),
)

/** Filter-or-create: a name that exists is chosen, one that does not is made. */
function commitQuery() {
  const name = query.value.trim()
  if (!name) return
  const existing = props.tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase())
  if (existing) emit('choose', existing.id)
  else emit('create', name)
  query.value = ''
}
</script>

<template>
  <div class="tag-picker" data-testid="tag-pick">
    <IonSearchbar
      :value="query"
      data-testid="tag-pick-search"
      :placeholder="t('tagPick.search')"
      :debounce="0"
      @ionInput="(e: CustomEvent) => (query = (e.detail.value as string) ?? '')"
      @keyup.enter="commitQuery"
    />

    <div class="chips">
      <!-- The chosen tag first and always visible, with the one act it offers. -->
      <span v-if="assigned" class="chip assigned">
        <span class="chip-name">{{ assigned.name }}</span>
        <button
          type="button"
          class="chip-drop"
          :aria-label="t('tagPick.unassign', { tag: assigned.name })"
          :data-testid="`tag-pick-assigned-${assigned.name}`"
          @click="emit('choose', null)"
        >
          <IonIcon :icon="closeOutline" />
        </button>
      </span>

      <button
        v-for="tag in offer.matches"
        :key="tag.id"
        type="button"
        class="chip"
        :data-testid="`tag-pick-offer-${tag.name}`"
        @click="emit('choose', tag.id)"
      >
        {{ tag.name }}
      </button>

      <button
        v-if="noTagLabel && !query.trim()"
        type="button"
        class="chip"
        data-testid="tag-pick-none"
        @click="emit('choose', null)"
      >
        {{ noTagLabel }}
      </button>

      <button
        v-if="offer.canCreate"
        type="button"
        class="chip create"
        data-testid="tag-pick-create"
        @click="commitQuery"
      >
        <IonIcon :icon="addOutline" />
        {{ t('tagPick.create', { name: query.trim() }) }}
      </button>
    </div>

    <p v-if="summary" class="tag-summary" data-testid="tag-pick-summary">{{ summary }}</p>
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 11px;
  border: 1px solid var(--ion-color-step-150);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-card);
  color: var(--ion-color-medium);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.chip.assigned {
  padding: 0;
  gap: 0;
  cursor: default;
}

.chip.assigned .chip-name {
  padding: 5px 4px 5px 10px;
  color: var(--ct-text);
}

.chip.assigned .chip-drop {
  display: inline-flex;
  align-items: center;
  padding: 5px 9px 5px 4px;
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
}

.chip.create {
  border-style: dashed;
  color: var(--jp-brand);
}

.tag-summary {
  margin: 4px 0 12px;
  color: var(--ion-color-medium);
  font-size: var(--jp-text-xs);
}
</style>
