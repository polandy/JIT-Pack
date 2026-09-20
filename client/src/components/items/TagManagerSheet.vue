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
  checkboxOutline,
  checkmarkOutline,
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
  /** FR-24.14: merge these tags into one of them, in axis order. */
  mergeMany: [tags: Tag[]]
  /** Indices into `tags`, so the page can hand them straight to the plan. */
  move: [from: number, to: number]
}>()

const query = ref('')

/**
 * FR-24.14: picking several tags to merge in one act.
 *
 * Its own mode rather than a second control on every row, the reason M9's
 * own selection (FR-24.9) is one: a row that carries a checkbox *and* four
 * acts asks four questions at once, and the rename control is the one a
 * thumb finds by accident.
 */
const selecting = ref(false)
const picked = ref<Set<string>>(new Set())

// A query outlives nothing, for TagFilterSheet's reason: the next opening is
// a new question. Neither does a selection.
watch(
  () => props.isOpen,
  (open) => {
    if (!open) {
      query.value = ''
      endPicking()
    }
  },
)

function endPicking(): void {
  selecting.value = false
  picked.value = new Set()
}

function togglePicked(tagId: string): void {
  const next = new Set(picked.value)
  if (!next.delete(tagId)) next.add(tagId)
  picked.value = next
}

/**
 * The picked tags in **axis order**, not in the order they were tapped: the
 * merge prompt lists them again, and a list that reorders itself between two
 * screens reads as a different list.
 *
 * A tag stays picked while the search narrows it away — two names for one
 * idea are rarely one query, so „Sommerurlaub" is picked, „Sommersachen" is
 * typed, and both have to survive to the prompt.
 */
const pickedTags = computed(() => props.tags.filter((tag) => picked.value.has(tag.id)))

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

      <!-- FR-24.14: the way into picking several, and the bar that acts on
           them. The bar replaces the entrance rather than sitting beside it,
           so the head carries one control either way. -->
      <div v-if="tags.length > 1" class="selection">
        <button
          v-if="!selecting"
          type="button"
          class="select"
          data-testid="m9-tags-select"
          @click="selecting = true"
        >
          <IonIcon :icon="checkboxOutline" />
          {{ t('items.tagsSelect') }}
        </button>

        <template v-else>
          <span class="selcount" data-testid="m9-tags-selected">
            {{ t('items.tagsSelected', { n: pickedTags.length }) }}
          </span>
          <button
            type="button"
            class="merge"
            :disabled="pickedTags.length < 2"
            data-testid="m9-tags-merge-many"
            @click="emit('mergeMany', pickedTags)"
          >
            {{ t('items.tagsMergeMany') }}
          </button>
          <button
            type="button"
            class="cancel"
            data-testid="m9-tags-select-cancel"
            @click="endPicking()"
          >
            {{ t('common.cancel') }}
          </button>
        </template>
      </div>

      <ul class="tags">
        <li
          v-for="{ tag, index } in rows"
          :key="tag.id"
          :data-testid="`m9-tag-row-${tag.name}`"
          :data-picked="selecting && picked.has(tag.id) ? 'true' : undefined"
        >
          <!-- FR-24.14: while picking, the whole row is the checkbox — the
               acts are gone, so there is nothing else a tap could mean. -->
          <button
            v-if="selecting"
            type="button"
            class="pick"
            :class="{ on: picked.has(tag.id) }"
            :aria-pressed="picked.has(tag.id)"
            :aria-label="t('items.tagPick', { tag: tag.name })"
            :data-testid="`m9-tag-pick-${tag.name}`"
            @click="togglePicked(tag.id)"
          >
            <IonIcon v-if="picked.has(tag.id)" :icon="checkmarkOutline" />
          </button>
          <!--
            The order controls are gone while a search is narrowing the list:
            the arrows move a tag on the *axis*, and offering them beside two
            rows that are eleven apart on it is an ordering nobody can predict.
          -->
          <span v-if="!searching && !selecting" class="order">
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
            v-if="!selecting"
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
            v-if="!selecting"
            type="button"
            class="name"
            :data-testid="`m9-tag-rename-${tag.name}`"
            @click="emit('rename', tag)"
          >
            {{ tag.name }}
          </button>
          <button
            v-else
            type="button"
            class="name"
            :data-testid="`m9-tag-name-${tag.name}`"
            @click="togglePicked(tag.id)"
          >
            <ItemMark v-if="tag.icon" :mark="tag.icon" surface="plain" :size="22" />
            {{ tag.name }}
          </button>

          <span class="count jp-num">{{ counts.get(tag.id) ?? 0 }}</span>

          <span v-if="!selecting" class="acts">
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

/* FR-24.14: the entrance to picking several, and the bar that acts on the
   picked ones — one line either way, so the list below does not move as the
   mode goes on. */
.selection {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  margin-top: 10px;
}

.selection button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-sm);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
}

.selection ion-icon {
  font-size: var(--jp-icon-sm);
}

.selcount {
  flex: 1;
  font-weight: var(--jp-weight-semibold);
}

.selection .merge {
  background: var(--jp-action);
  border-color: var(--jp-action);
  color: var(--ct-crust);
}

/* Dimmed rather than gone: one tag picked is a selection on its way to two,
   and a button that disappears between the two taps reads as a refusal. */
.selection .merge:disabled {
  opacity: 0.45;
}

/* A picked row reads as picked beyond its checkbox: at a glance the question
   is „which of these three", and three ticks in a column of twenty rows are
   easy to miscount. */
.tags li[data-picked] {
  background: color-mix(in srgb, var(--jp-action) 12%, transparent);
}

.pick {
  width: 22px;
  height: 22px;
  flex: none;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1.5px solid var(--ct-surface2);
  border-radius: var(--jp-r-xs);
  background: none;
  color: transparent;
}

.pick.on {
  background: var(--jp-action);
  border-color: var(--jp-action);
  color: var(--ct-crust);
}

.pick ion-icon {
  font-size: var(--jp-icon-xs);
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
