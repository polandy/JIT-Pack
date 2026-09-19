<script setup lang="ts">
/**
 * M9's tag manager (FR-24.10) — the screen where a tag itself is fixed.
 *
 * Until now a tag could be created (M10, ADR-014) and given away (FR-24.9)
 * and nothing else: `createTag` and `moveTag` were the only two tag
 * mutations in the product, so a name typed wrong stayed wrong, a tag typed
 * twice stayed twice, and the axis order was whatever order the tags
 * happened to be created in. Against this instance's own data — 23 tags, 49
 * items under „Diverses" — that is the gap between tagging and *filing*.
 *
 * **The sheet decides nothing.** It emits an intent per row and the page
 * runs it, because each of the acts needs a prompt, a picker or a
 * confirmation, and an overlay opened from inside an overlay is the scroll
 * clamp FR-24.8 already paid for once. Testing follows the same seam: this
 * component is driven directly in its own spec, and the page is asserted
 * against the contract — Ionic renders overlay content in jsdom never.
 */
import { IonIcon } from '@ionic/vue'
import {
  addOutline,
  arrowDownOutline,
  arrowUpOutline,
  gitMergeOutline,
  searchOutline,
  trashOutline,
} from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import SheetModal from '@/components/global/SheetModal.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import { searchMatches } from '@/domain/search'
import { t } from '@/i18n'
import type { Tag } from '@/types/domain'

const props = defineProps<{
  isOpen: boolean
  /** The axis, in its order — `masterStore.tagList`. */
  tags: Tag[]
  /**
   * How many *assignments* each tag has, by tag id — deliberately not the
   * count the filter chips show. That one counts the items on screen; this
   * one has to agree with the number a refused delete reports, and a
   * retired item still carries its tags.
   */
  counts: Map<string, number>
}>()

const emit = defineEmits<{
  dismiss: []
  rename: [tag: Tag]
  merge: [tag: Tag]
  remove: [tag: Tag]
  /** FR-24.13: open the mark picker for this tag. */
  mark: [tag: Tag]
  /** Indices into `tags`, so the page can hand them straight to the plan. */
  move: [from: number, to: number]
}>()

const query = ref('')

// A query outlives nothing, for TagFilterSheet's reason: the next opening is
// a new question.
watch(
  () => props.isOpen,
  (open) => {
    if (!open) query.value = ''
  },
)

const searching = computed(() => query.value.trim() !== '')

/** The rows, each carrying its index on the *axis* rather than in the list. */
const rows = computed(() =>
  props.tags
    .map((tag, index) => ({ tag, index }))
    .filter(({ tag }) => searchMatches(tag.name, query.value)),
)
</script>

<template>
  <SheetModal :is-open="isOpen" testid="m9-tags-sheet" @dismiss="emit('dismiss')">
    <section class="sheet-body">
      <SheetHead
        :title="t('items.tagsTitle')"
        :meta="t('items.tagsHint', { n: tags.length })"
        title-testid="m9-tags-title"
        close-testid="m9-tags-close"
        @close="emit('dismiss')"
      />

      <div v-if="tags.length > 0" class="search">
        <IonIcon :icon="searchOutline" />
        <input
          v-model="query"
          :placeholder="t('items.tagsSearch')"
          data-testid="m9-tags-search"
          autocomplete="off"
        />
      </div>

      <ul class="tags">
        <li v-for="{ tag, index } in rows" :key="tag.id" :data-testid="`m9-tag-row-${tag.name}`">
          <!--
            The order controls are gone while a search is narrowing the list:
            the arrows move a tag on the *axis*, and offering them beside two
            rows that are eleven apart on it is an ordering nobody can predict.
          -->
          <span v-if="!searching" class="order">
            <button
              type="button"
              :disabled="index === 0"
              :aria-label="t('items.tagUp', { tag: tag.name })"
              :data-testid="`m9-tag-up-${tag.name}`"
              @click="emit('move', index, index - 1)"
            >
              <IonIcon :icon="arrowUpOutline" />
            </button>
            <button
              type="button"
              :disabled="index === tags.length - 1"
              :aria-label="t('items.tagDown', { tag: tag.name })"
              :data-testid="`m9-tag-down-${tag.name}`"
              @click="emit('move', index, index + 1)"
            >
              <IonIcon :icon="arrowDownOutline" />
            </button>
          </span>

          <!-- FR-24.13: the mark is set where the tag is fixed. The control shows
               the mark it would change, or an empty dashed slot that says a
               mark can go here. -->
          <button
            type="button"
            class="mark"
            :data-empty="tag.icon ? undefined : 'true'"
            :aria-label="t('items.tagMarkSet', { tag: tag.name })"
            :data-testid="`m9-tag-mark-${tag.name}`"
            @click="emit('mark', tag)"
          >
            <ItemMark v-if="tag.icon" :mark="tag.icon" surface="plain" :size="22" />
            <IonIcon v-else :icon="addOutline" />
          </button>

          <button
            type="button"
            class="name"
            :data-testid="`m9-tag-rename-${tag.name}`"
            @click="emit('rename', tag)"
          >
            {{ tag.name }}
          </button>

          <span class="count jp-num">{{ counts.get(tag.id) ?? 0 }}</span>

          <span class="acts">
            <button
              type="button"
              :aria-label="t('items.tagMerge', { tag: tag.name })"
              :data-testid="`m9-tag-merge-${tag.name}`"
              @click="emit('merge', tag)"
            >
              <IonIcon :icon="gitMergeOutline" />
            </button>
            <button
              type="button"
              class="danger"
              :aria-label="t('items.tagDelete', { tag: tag.name })"
              :data-testid="`m9-tag-delete-${tag.name}`"
              @click="emit('remove', tag)"
            >
              <IonIcon :icon="trashOutline" />
            </button>
          </span>
        </li>

        <li v-if="tags.length === 0" class="none" data-testid="m9-tags-empty">
          {{ t('items.tagsEmpty') }}
        </li>
        <li v-else-if="rows.length === 0" class="none" data-testid="m9-tags-no-match">
          {{ t('items.tagsNoMatch') }}
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

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: var(--jp-surface-sunken);
  border-radius: var(--jp-r-sm);
  border: 1px solid var(--ct-surface0);
}

.search ion-icon {
  font-size: var(--jp-icon-sm);
  color: var(--ct-overlay2);
}

.search input {
  flex: 1;
  border: 0;
  background: transparent;
  padding: 10px 0;
  color: var(--ct-text);
}

.search input:focus {
  outline: none;
}

.tags {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}

/* 54 px so the two stacked order controls are 27 px each. They were 14 at
   a glyph size that looked right in the stylesheet and was not reachable
   with a thumb on the rendered screen. */
.tags li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 54px;
  border-bottom: 1px solid var(--ct-surface0);
}

.order {
  display: flex;
  flex-direction: column;
}

.order button {
  display: flex;
  align-items: center;
  background: none;
  border: 0;
  padding: 4px 6px;
  color: var(--ct-overlay2);
}

/* An arrow that would do nothing is dimmed rather than hidden: the two
   controls keep their places, so the column does not reflow as a tag
   reaches either end of the axis. */
.order button:disabled {
  opacity: 0.25;
}

.order ion-icon {
  font-size: var(--jp-icon-sm);
}

.mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--ct-surface0);
  border-radius: var(--jp-r-sm);
  background: var(--jp-surface-sunken);
  color: var(--ct-overlay2);
}

.mark[data-empty] {
  border-style: dashed;
  background: none;
}

.mark ion-icon {
  font-size: var(--jp-icon-sm);
}

.name {
  flex: 1;
  text-align: start;
  background: none;
  border: 0;
  padding: 16px 0;
  color: var(--ct-text);
}

.count {
  color: var(--ct-overlay2);
}

.acts {
  display: flex;
  gap: 2px;
}

.acts button {
  background: none;
  border: 0;
  padding: 15px 7px;
  color: var(--ct-overlay2);
}

.acts button.danger {
  color: var(--ion-color-danger);
}

.acts ion-icon {
  font-size: var(--jp-icon-sm);
}

.none {
  color: var(--ct-overlay2);
  padding: 14px 0;
  border-bottom: 0;
}
</style>
