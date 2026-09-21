<script setup lang="ts">
/**
 * An entry's one tag, chosen by search-or-create (FR-30.9).
 *
 * The same mask M10 and M9's creation sheet give an item's tags
 * (`components/items/TagChooser.vue`, FR-24.1): a search field, the tag
 * already chosen as a chip with its ✕, the matching tags as chips, and — for
 * a name nothing carries — a dashed *anlegen* chip. It is its own component
 * rather than a use of that one because the two differ in what a tag *is*: an
 * item's tags are rows with ids, ordered, the first primary; a shopping tag
 * is a word on the entry and there is exactly one. The matching rule is the
 * shared one (`lib/itemEditorOffers.ts`), so the two cannot drift apart on
 * what counts as „already exists".
 *
 * The caller decides what choosing means — the composer's next entry or an
 * entry that exists — so every act is an event.
 */
import { IonIcon, IonSearchbar } from '@ionic/vue'
import { addOutline, closeOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import { t } from '@/i18n'
import { tagOffer } from '@/lib/itemEditorOffers'

import { normalizeTag } from './actions'

const props = defineProps<{
  /** The tags in use on the trip. */
  tags: string[]
  /** The tag chosen now; null for none. */
  assigned: string | null
}>()

const emit = defineEmits<{
  /** A tag to file under — an existing one, or a new name — or null for none. */
  choose: [tag: string | null]
}>()

const query = ref('')

/** The vocabulary: what is in use, plus the chosen tag even before any entry carries it. */
const pool = computed(() => {
  const names =
    props.assigned && !props.tags.includes(props.assigned)
      ? [...props.tags, props.assigned]
      : props.tags
  return names.map((name) => ({ id: name, name }))
})

const offer = computed(() =>
  tagOffer(pool.value, new Set(props.assigned ? [props.assigned] : []), query.value),
)

/** Filter-or-create: a name that exists is chosen, one that does not is made. */
function commitQuery() {
  const name = normalizeTag(query.value)
  if (name === null) return
  const existing = pool.value.find((tag) => tag.name.toLowerCase() === name.toLowerCase())
  emit('choose', existing ? existing.name : name)
  query.value = ''
}
</script>

<template>
  <div class="tag-chooser">
    <IonSearchbar
      :value="query"
      data-testid="m6-tag-search"
      :placeholder="t('shopping.tagSearchPlaceholder')"
      :debounce="0"
      @ionInput="(e: CustomEvent) => (query = (e.detail.value as string) ?? '')"
      @keyup.enter="commitQuery"
    />

    <div class="chips">
      <!-- The chosen tag first and always visible, with the one act it offers. -->
      <span v-if="assigned" class="chip assigned">
        <span class="chip-name">{{ assigned }}</span>
        <button
          type="button"
          class="chip-drop"
          :aria-label="t('shopping.tagUnassign', { tag: assigned })"
          :data-testid="`m6-tag-assigned-${assigned}`"
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
        :data-testid="`m6-tag-offer-${tag.name}`"
        @click="emit('choose', tag.name)"
      >
        {{ tag.name }}
      </button>

      <button
        v-if="offer.canCreate"
        type="button"
        class="chip create"
        data-testid="m6-tag-create"
        @click="commitQuery"
      >
        <IonIcon :icon="addOutline" />
        {{ t('shopping.tagCreate', { name: query.trim() }) }}
      </button>
    </div>

    <p class="tag-summary" data-testid="m6-tag-summary">
      {{ assigned ? t('shopping.tagFiledUnder', { tag: assigned }) : t('shopping.tagNone') }}
    </p>
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
