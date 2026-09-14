<script setup lang="ts">
/**
 * M9's tag filter (FR-24.8) — the door behind the three chips.
 *
 * It replaces the scrollable `ion-segment` axis, which showed **4 of 24**
 * chips on a phone, clipped the fourth mid-word, remembered no scroll
 * position and could hold only one tag at a time. Everything that control
 * could not do lives here: every tag with the number of items it holds, a
 * search over them, several tags at once under *irgendeiner* / *alle*, and
 * the leftover bucket the axis had no chip for.
 *
 * **The bucket is exclusive**, and that is a decision rather than an
 * oversight: `filterByTags` reads „ohne Tag" faithfully as a member of the
 * selection, so under *alle* it contradicts every real tag beside it and
 * yields an empty screen. Honest, and useless — so the control does not offer
 * the way in. Picking the bucket clears the tags and picking a tag clears the
 * bucket.
 *
 * The selection is applied **live**, not on closing: the footer's count is
 * what the list behind the sheet already shows, so the button confirms rather
 * than commits. A sheet that only applies on dismissal makes every
 * combination a blind guess.
 */
import { IonIcon } from '@ionic/vue'
import { checkmarkOutline, searchOutline } from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import SheetModal from '@/components/global/SheetModal.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import { UNTAGGED_KEY, type TagFilterMode } from '@/domain/tags'
import { searchMatches } from '@/domain/search'
import { t } from '@/i18n'
import type { Tag } from '@/types/domain'

const props = defineProps<{
  isOpen: boolean
  tags: Tag[]
  /** How many of the shown items each tag holds, by tag id. */
  counts: Map<string, number>
  /** How many items carry no tag at all — the bucket's own count. */
  untaggedCount: number
  /** Tag ids, plus {@link UNTAGGED_KEY} for the bucket. */
  selection: string[]
  mode: TagFilterMode
  /** What the list behind the sheet is showing right now. */
  shown: number
}>()

const emit = defineEmits<{
  dismiss: []
  'update:selection': [value: string[]]
  'update:mode': [value: TagFilterMode]
}>()

const query = ref('')

// A query outlives nothing: the next opening is a new question, and a filter
// list that reopens pre-narrowed hides tags the user never excluded.
watch(
  () => props.isOpen,
  (open) => {
    if (!open) query.value = ''
  },
)

const matches = computed(() =>
  props.tags.filter(
    (tag) => (props.counts.get(tag.id) ?? 0) > 0 && searchMatches(tag.name, query.value),
  ),
)

/** The bucket is offered only when something is in it, like its heading. */
const showUntagged = computed(
  () => props.untaggedCount > 0 && searchMatches(t('items.untagged'), query.value),
)

const selected = computed(() => new Set(props.selection))

function toggleTag(id: string) {
  const next = new Set(props.selection)
  next.delete(UNTAGGED_KEY) // see the note on exclusivity above
  if (next.has(id)) next.delete(id)
  else next.add(id)
  emit('update:selection', [...next])
}

function toggleUntagged() {
  emit('update:selection', selected.value.has(UNTAGGED_KEY) ? [] : [UNTAGGED_KEY])
}

/** The mode is a question about *several* tags; with one it decides nothing. */
const modeUseful = computed(() => props.selection.filter((id) => id !== UNTAGGED_KEY).length > 1)
</script>

<template>
  <SheetModal :is-open="isOpen" testid="m9-filter-sheet" @dismiss="emit('dismiss')">
    <section class="sheet-body">
      <SheetHead
        :title="t('items.filterTitle')"
        :meta="t('items.filterHint', { n: tags.length })"
        title-testid="m9-filter-title"
        close-testid="m9-filter-close"
        @close="emit('dismiss')"
      />

      <div class="search">
        <IonIcon :icon="searchOutline" />
        <input
          v-model="query"
          :placeholder="t('items.filterSearch')"
          data-testid="m9-filter-search"
          autocomplete="off"
        />
      </div>

      <!-- FR-24.8: the question the single-select axis could not ask. -->
      <div v-if="modeUseful" class="mode" data-testid="m9-filter-mode">
        <button
          type="button"
          :class="{ on: mode === 'any' }"
          data-testid="m9-filter-mode-any"
          @click="emit('update:mode', 'any')"
        >
          {{ t('items.filterModeAny') }}
        </button>
        <button
          type="button"
          :class="{ on: mode === 'all' }"
          data-testid="m9-filter-mode-all"
          @click="emit('update:mode', 'all')"
        >
          {{ t('items.filterModeAll') }}
        </button>
      </div>

      <ul class="tags">
        <li v-for="tag in matches" :key="tag.id">
          <button
            type="button"
            :aria-pressed="selected.has(tag.id)"
            :data-testid="`m9-filter-tag-${tag.name}`"
            @click="toggleTag(tag.id)"
          >
            <span class="box" :class="{ on: selected.has(tag.id) }">
              <IonIcon v-if="selected.has(tag.id)" :icon="checkmarkOutline" />
            </span>
            <span class="name">{{ tag.name }}</span>
            <span class="count jp-num">{{ counts.get(tag.id) ?? 0 }}</span>
          </button>
        </li>

        <li v-if="showUntagged" class="bucket">
          <button
            type="button"
            :aria-pressed="selected.has(UNTAGGED_KEY)"
            data-testid="m9-filter-untagged"
            @click="toggleUntagged"
          >
            <span class="box" :class="{ on: selected.has(UNTAGGED_KEY) }">
              <IonIcon v-if="selected.has(UNTAGGED_KEY)" :icon="checkmarkOutline" />
            </span>
            <span class="name">{{ t('items.untagged') }}</span>
            <span class="count jp-num">{{ untaggedCount }}</span>
          </button>
        </li>

        <li
          v-if="matches.length === 0 && !showUntagged"
          class="none"
          data-testid="m9-filter-no-tag"
        >
          {{ t('items.filterNoTag') }}
        </li>
      </ul>

      <div class="foot">
        <button type="button" class="apply" data-testid="m9-filter-apply" @click="emit('dismiss')">
          {{ t('items.filterApply', { n: shown }) }}
        </button>
        <button
          v-if="selection.length > 0"
          type="button"
          class="reset"
          data-testid="m9-filter-reset"
          @click="emit('update:selection', [])"
        >
          {{ t('items.clearFilter') }}
        </button>
      </div>
    </section>
  </SheetModal>
</template>

<style scoped>
/* The sheet's own inset, like every other sheet body (§3.25). Without it the
   counts sit flush against the screen edge and the widest one is clipped. */
.sheet-body {
  padding: 4px 18px 22px;
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

.mode {
  display: flex;
  gap: 4px;
  background: var(--jp-surface-sunken);
  border-radius: var(--jp-r-sm);
  padding: 3px;
  margin-bottom: 10px;
}

.mode button {
  flex: 1;
  border: none;
  background: none;
  border-radius: var(--jp-r-xs);
  padding: 6px 0;
  color: var(--ct-overlay2);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.mode button.on {
  background: var(--ct-surface0);
  color: var(--ct-text);
  font-weight: var(--jp-weight-semibold);
}

.tags {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 46vh;
  overflow-y: auto;
}

.tags button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: none;
  border: none;
  border-bottom: 1px solid var(--ct-surface0);
  padding: 9px 2px;
  color: var(--ct-text);
  font-size: var(--jp-text-md);
  text-align: left;
  cursor: pointer;
}

.box {
  width: 20px;
  height: 20px;
  flex: none;
  display: grid;
  place-items: center;
  border: 1.5px solid var(--ct-surface2);
  border-radius: var(--jp-r-xs);
  color: transparent;
}

.box.on {
  background: var(--jp-action);
  border-color: var(--jp-action);
  color: var(--ct-crust);
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

.bucket .name {
  color: var(--ct-subtext0);
}

.none {
  padding: 14px 2px;
  color: var(--ct-overlay2);
  font-size: var(--jp-text-sm);
}

.foot {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 14px;
}

.apply {
  background: var(--jp-action);
  color: var(--ct-crust);
  border: none;
  border-radius: var(--jp-r-pill);
  padding: 9px 18px;
  font-size: var(--jp-text-base);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.reset {
  background: none;
  border: none;
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}
</style>
