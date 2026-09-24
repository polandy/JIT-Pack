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
  checkboxOutline,
  gitMergeOutline,
  searchOutline,
  trashOutline,
} from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import BulkBar from '@/components/global/BulkBar.vue'
import DragGrip from '@/components/global/DragGrip.vue'
import SelectBox from '@/components/global/SelectBox.vue'
import SelectionBar from '@/components/global/SelectionBar.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import { useDragToGroup } from '@/composables/useDragToGroup'
import { useRowSelection } from '@/composables/useRowSelection'
import { searchMatches } from '@/domain/search'
import { reorderTarget } from '@/domain/tags'
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
 * FR-24.14: picking several tags to merge in one act — the list selection
 * M6, M25 and M9 share (ADR-075): a hold or right-click on a row, or the
 * head's checkbox icon. While picking, a row's acts are gone: a row that
 * carries a checkbox *and* four acts asks four questions at once.
 */
const selection = useRowSelection()
const { selecting, selected: picked } = selection

// A query outlives nothing, for TagFilterSheet's reason: the next opening is
// a new question. Neither does a selection.
watch(
  () => props.isOpen,
  (open) => {
    if (!open) {
      query.value = ''
      selection.end()
    }
  },
)

function toggleSelecting(): void {
  if (selecting.value) selection.end()
  else selection.start()
}

/**
 * Captured before the row's own buttons see it: a tap spent on the selection
 * — the ghost click of the hold that started it, or a pick — must not also
 * rename or move the tag it landed on.
 */
function onRowClick(event: MouseEvent, tag: Tag): void {
  if (!selection.click(tag.id, true)) return
  event.stopPropagation()
  event.preventDefault()
}

const pickedTags = computed(() => props.tags.filter((tag) => picked.value.has(tag.id)))

const searching = computed(() => query.value.trim() !== '')

/** The rows, each carrying its index on the *axis* rather than in the list. */
const rows = computed(() =>
  props.tags
    .map((tag, index) => ({ tag, index }))
    .filter(({ tag }) => searchMatches(tag.name, query.value)),
)

/**
 * FR-24.10's order, by the grip M6 and M25 drag with (ADR-075) — it lifts at
 * once, while a hold on the rest of the row selects. The list is one drop
 * target whose rows number the axis, so the gesture reports the gap the
 * pointer is in and `reorderTarget` turns it into an index.
 */
const sheetBody = ref<HTMLElement | null>(null)
/** The row in the air and the gap under the pointer: what draws the insert line. */
const lifted = ref<number | null>(null)
const gap = ref<number | null>(null)
const drag = useDragToGroup<number>({
  onHover: (place) => (gap.value = place?.index ?? null),
  onDrop: (from, place) => {
    const to = reorderTarget(from, place.index)
    if (to !== null) emit('move', from, to)
  },
})
watch(sheetBody, (el) => drag.bindHost(el), { immediate: true })

function onLift(event: PointerEvent, index: number): void {
  const row = (event.currentTarget as HTMLElement | null)?.closest('li')
  if (!row || searching.value || selecting.value) return
  lifted.value = index
  drag.down(event, index, row, true)
}

function onDragEnd(): void {
  lifted.value = null
  gap.value = null
}

/** The insert line is drawn only where a drop would move something. */
function showsGap(at: number): boolean {
  return lifted.value !== null && gap.value === at && reorderTarget(lifted.value, at) !== null
}

/** „Alle" takes the rows the search leaves on screen, like M9's own. */
function toggleAll(): void {
  selection.toggleAll(rows.value.map(({ tag }) => tag.id))
}
</script>

<template>
  <SheetModal :is-open="isOpen" testid="m9-tags-sheet" @dismiss="emit('dismiss')">
    <section
      ref="sheetBody"
      class="sheet-body"
      data-testid="m9-tags-body"
      @pointermove="drag.move"
      @pointerup="(e: PointerEvent) => (drag.up(e), onDragEnd())"
      @pointercancel="(drag.cancel(), onDragEnd())"
    >
      <SheetHead
        :title="t('items.tagsTitle')"
        :meta="t('items.tagsHint', { n: tags.length })"
        title-testid="m9-tags-title"
        close-testid="m9-tags-close"
        @close="emit('dismiss')"
      >
        <!-- The same way in M9's app bar offers: a checkbox icon, which
             leaves the mode again while it is on. -->
        <template v-if="tags.length > 1" #trail>
          <button
            type="button"
            class="select"
            :class="{ on: selecting }"
            :aria-label="t('items.tagsSelect')"
            :aria-pressed="selecting"
            data-testid="m9-tags-select"
            @click="toggleSelecting()"
          >
            <IonIcon :icon="checkboxOutline" />
          </button>
        </template>
      </SheetHead>

      <div v-if="tags.length > 0" class="search">
        <IonIcon :icon="searchOutline" />
        <input
          v-model="query"
          :placeholder="t('items.tagsSearch')"
          data-testid="m9-tags-search"
          autocomplete="off"
        />
      </div>

      <SelectionBar
        v-if="selecting"
        class="selbar"
        :count="pickedTags.length"
        :total="rows.length"
        testid="m9-tags"
        @exit="selection.end()"
        @all="toggleAll()"
      />

      <!-- The axis is a drop target only while it is whole: a search narrows
           it to rows eleven apart, and a gap between them is no place. -->
      <ul class="tags" :data-drop-target="searching ? undefined : 'tags'">
        <li
          v-for="{ tag, index } in rows"
          :key="tag.id"
          class="tag-row"
          :data-testid="`m9-tag-row-${tag.name}`"
          :data-picked="selecting && picked.has(tag.id) ? 'true' : undefined"
          :data-drop-index="searching ? undefined : index"
          :class="{
            'gap-before': showsGap(index),
            'gap-after': showsGap(index + 1) && index === tags.length - 1,
          }"
          @click.capture="onRowClick($event, tag)"
          @pointerdown="selection.press(tag.id, $event)"
          @pointermove="selection.move($event)"
          @pointerup="selection.release()"
          @pointercancel="selection.release()"
          @contextmenu.prevent="selection.contextMenu(tag.id)"
        >
          <SelectBox
            v-if="selecting"
            :on="picked.has(tag.id)"
            :data-testid="`m9-tag-pick-${tag.name}`"
          />
          <!-- The grip is dashed while a search narrows the list: it moves a
               tag on the *axis*, and two rows eleven apart on it are no order
               anyone can predict. -->
          <DragGrip
            v-else
            :off="searching"
            :label="t('items.tagDrag', { tag: tag.name })"
            :data-testid="`m9-tag-grip-${tag.name}`"
            @pointerdown.stop="onLift($event, index)"
          />

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
            :aria-pressed="picked.has(tag.id)"
            :data-testid="`m9-tag-name-${tag.name}`"
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

      <BulkBar
        v-if="selecting && picked.size > 0"
        class="sheet-bulkbar"
        data-testid="m9-tags-bulkbar"
      >
        <button
          type="button"
          :disabled="pickedTags.length < 2"
          data-testid="m9-tags-merge-many"
          @click="emit('mergeMany', pickedTags)"
        >
          <IonIcon :icon="gitMergeOutline" />
          {{ t('items.tagsMergeMany') }}
        </button>
      </BulkBar>
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

/* The head's way into picking several; lit while the mode is on. */
.select {
  display: grid;
  place-items: center;
  width: var(--jp-control-round);
  height: var(--jp-control-round);
  flex: none;
  padding: 0;
  border: 1px solid var(--jp-surface-border);
  border-radius: 50%;
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-sm);
  cursor: pointer;
}

.select.on {
  color: var(--jp-action);
  border-color: var(--jp-action);
}

/* The bar stands in the sheet's own inset, not edge to edge like a page's. */
.selbar {
  margin-top: 10px;
  border-radius: var(--jp-r-sm);
}

/* A sheet has no `fixed` slot to float the bar in: it rides the foot of the
   sheet's own scroll box instead. */
.sheet-body .sheet-bulkbar {
  position: sticky;
  left: auto;
  right: auto;
  bottom: 0;
  margin-top: 12px;
}

/* Dimmed rather than gone: one tag picked is a selection on its way to two,
   and a button that disappears between the two taps reads as a refusal. */
.sheet-body .sheet-bulkbar button:disabled {
  opacity: 0.45;
}

/* A picked row reads as picked beyond its checkbox: at a glance the question
   is „which of these three", and three ticks in a column of twenty rows are
   easy to miscount. */
.tags li[data-picked] {
  background: color-mix(in srgb, var(--jp-action) 12%, transparent);
}

.tags {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}

/* 54 px: a row a thumb can hit, and the grip's 44 px target with room. */
/* On the row itself rather than under `.tags`: the drag's ghost is a clone
   of it on `document.body`, outside the list, and has to keep its shape. */
.tag-row {
  list-style: none;
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 54px;
  border-bottom: 1px solid var(--ct-surface0);
}

.tag-row[data-drag-ghost] {
  background: var(--jp-surface-card);
  padding-inline: 8px;
}

/* Where the dragged tag would land: a line in the action colour on the gap,
   laid over the row's edge so no row moves under the finger (ADR-060). */
.tags li.gap-before::before,
.tags li.gap-after::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--jp-action);
}

.tags li.gap-before::before {
  top: -1px;
}

.tags li.gap-after::after {
  bottom: -1px;
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
