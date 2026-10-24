<script setup lang="ts">
/**
 * An idea's links as the sheet edits them (FR-29.22): an address and a name
 * each, any number of them, in an order the grip changes. The name is
 * optional; while it is blank the page's title shows in its place, with
 * *Übernehmen* to keep it, else the link's site. The first link is the one
 * FR-29.16 reads a title and a picture from, and says so once there are more.
 *
 * The drafts are the caller's — `v-model` — and so are the page reads:
 * `titles` and `reading` come from the sheet, which reads each page once.
 */
import { IonButton, IonIcon, IonInput, IonSpinner } from '@ionic/vue'
import { addOutline, closeOutline } from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import DragGrip from '@/components/global/DragGrip.vue'
import { useDragToGroup } from '@/composables/shared/useDragToGroup'
import { reorderTarget } from '@/domain/shared/handOrder'
import { t } from '@/i18n'
import { newId } from '@/lib/ids'
import { linkSite, parseLink } from './domain/ideas'
import { LINK_NEW, type LinkDraft } from './domain/links'

const props = defineProps<{
  modelValue: readonly LinkDraft[]
  /** A read page's title by its link, null where the page had none. */
  titles: ReadonlyMap<string, string | null>
  /** The links whose page is being read. */
  reading: ReadonlySet<string>
}>()

const emit = defineEmits<{ 'update:modelValue': [drafts: LinkDraft[]] }>()

const rows = computed(() =>
  props.modelValue.map((draft) => {
    const parsed = parseLink(draft.url)
    const url = parsed.ok ? parsed.link : null
    const title = url === null ? null : (props.titles.get(url) ?? null)
    return { draft, parsed, url, title }
  }),
)

function replace(index: number, change: Partial<LinkDraft>): void {
  emit(
    'update:modelValue',
    props.modelValue.map((d, i) => (i === index ? { ...d, ...change } : d)),
  )
}

/** The last link removed leaves an empty one, as the sheet always had. */
function remove(index: number): void {
  const left = props.modelValue.filter((_, i) => i !== index)
  emit('update:modelValue', left.length > 0 ? left : [emptyDraft()])
}

function add(): void {
  emit('update:modelValue', [...props.modelValue, emptyDraft()])
}

function emptyDraft(): LinkDraft {
  return { kind: LINK_NEW, id: newId(), url: '', label: null }
}

/** What stands in a blank name: the page's title, else the site. */
function labelPlaceholder(url: string | null, title: string | null): string {
  if (title) return title
  return url === null ? t('ideas.linkLabelPlaceholder') : linkSite(url)
}

// --- the order, by the grip M9's tags are dragged with (FR-24.10) ---

const list = ref<HTMLElement | null>(null)
/** The link in the air and the gap under the pointer: what draws the insert line. */
const lifted = ref<number | null>(null)
const gap = ref<number | null>(null)
const drag = useDragToGroup<number>({
  carry: {
    title: (index) => {
      const row = rows.value[index]
      return row?.url ? (row.draft.label ?? linkSite(row.url)) : ''
    },
    target: (from, place) => {
      const to = reorderTarget(from, place.index)
      return to === null ? null : t('ideas.linkDropAt', { n: to + 1 })
    },
    stays: () => t('list.dropStays'),
  },
  onHover: (place) => (gap.value = place?.index ?? null),
  onDrop: (from, place) => {
    const to = reorderTarget(from, place.index)
    if (to === null) return
    const drafts = [...props.modelValue]
    const [moved] = drafts.splice(from, 1)
    if (moved) drafts.splice(to, 0, moved)
    emit('update:modelValue', drafts)
  },
})
watch(list, (el) => drag.bindHost(el), { immediate: true })

function onLift(event: PointerEvent, index: number): void {
  const row = (event.currentTarget as HTMLElement | null)?.closest('li')
  if (!row) return
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
</script>

<template>
  <div
    class="links-editor"
    @pointermove="drag.move"
    @pointerup="(e: PointerEvent) => (drag.up(e), onDragEnd())"
    @pointercancel="(drag.cancel(), onDragEnd())"
  >
    <ul ref="list" class="links" data-drop-target="links">
      <li
        v-for="({ draft, parsed, url, title }, index) in rows"
        :key="draft.id"
        class="link-row"
        data-testid="idea-edit-link-row"
        :data-drop-index="index"
        :class="{
          'gap-before': showsGap(index),
          'gap-after': showsGap(index + 1) && index === rows.length - 1,
        }"
      >
        <DragGrip
          v-if="rows.length > 1"
          :label="t('ideas.linkDrag')"
          data-testid="idea-edit-link-grip"
          @pointerdown.stop="onLift($event, index)"
        />
        <div class="fields">
          <div class="address">
            <IonInput
              :model-value="draft.url"
              type="url"
              inputmode="url"
              :placeholder="t('ideas.linkPlaceholder')"
              :aria-label="t('ideas.linkPlaceholder')"
              data-testid="idea-edit-link"
              @ion-input="replace(index, { url: String($event.detail.value ?? '') })"
            />
            <span
              v-if="index === 0 && rows.length > 1"
              class="first"
              data-testid="idea-edit-link-first"
            >
              {{ t('ideas.linkFirst') }}
            </span>
            <IonButton
              v-if="rows.length > 1 || draft.url !== ''"
              fill="clear"
              size="small"
              class="remove"
              :aria-label="t('ideas.linkRemove')"
              data-testid="idea-edit-link-remove"
              @click="remove(index)"
            >
              <IonIcon slot="icon-only" :icon="closeOutline" aria-hidden="true" />
            </IonButton>
          </div>
          <IonInput
            v-if="url !== null"
            class="label"
            :model-value="draft.label ?? ''"
            :placeholder="labelPlaceholder(url, title)"
            :aria-label="t('ideas.linkLabel')"
            data-testid="idea-edit-link-label"
            @ion-input="replace(index, { label: String($event.detail.value ?? '') })"
          >
            <IonButton
              v-if="title && !draft.label?.trim()"
              slot="end"
              fill="clear"
              size="small"
              data-testid="idea-edit-link-label-accept"
              @click="replace(index, { label: title })"
            >
              {{ t('ideas.suggestionAccept') }}
            </IonButton>
          </IonInput>
          <p v-if="!parsed.ok" class="invalid" data-testid="idea-edit-link-invalid">
            {{ t('ideas.linkInvalid') }}
          </p>
          <p
            v-else-if="url !== null && reading.has(url)"
            class="reading"
            data-testid="idea-edit-preview-loading"
          >
            <IonSpinner name="dots" aria-hidden="true" />
            {{ t('ideas.previewLoading') }}
          </p>
        </div>
      </li>
    </ul>
    <button type="button" class="add" data-testid="idea-edit-link-add" @click="add">
      <IonIcon :icon="addOutline" aria-hidden="true" />
      {{ t('ideas.linkAdd') }}
    </button>
  </div>
</template>

<style scoped>
.links {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 0 0;
  padding: 0;
}

/* On the row itself rather than under `.links`: the drag's ghost is a clone
   of it on `document.body`, outside the list, and has to keep its shape. */
.link-row {
  list-style: none;
  position: relative;
  display: flex;
  align-items: flex-start;
  background: var(--jp-surface-sunken);
  border-radius: var(--jp-r-md);
}

.link-row[data-drag-ghost] {
  background: var(--jp-surface-card);
}

.fields {
  flex: 1;
  min-width: 0;
  padding-inline: 12px 4px;
}

.link-row:has(.drag-grip) .fields {
  padding-inline-start: 0;
}

.address {
  display: flex;
  align-items: center;
  gap: 4px;
}

.address ion-input {
  flex: 1;
  min-width: 0;
  color: var(--jp-action);
}

.label {
  border-top: 1px solid var(--ct-surface0);
  font-weight: var(--jp-weight-semibold);
}

.first {
  flex: none;
  padding: 0 6px;
  border: 1px solid var(--jp-done);
  border-radius: var(--jp-r-pill);
  color: var(--jp-done);
  font-size: var(--jp-text-xs);
  white-space: nowrap;
}

.remove {
  flex: none;
  margin: 0;
  color: var(--ct-subtext0);
}

.invalid {
  margin: 0 0 8px;
  color: var(--ion-color-danger);
  font-size: var(--jp-text-xs);
}

.reading {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.reading ion-spinner {
  width: 18px;
  height: 14px;
}

/* Where the dragged link would land: a line in the action colour on the gap,
   laid over the row's edge so no row moves under the finger (ADR-060). */
.links li.gap-before::before,
.links li.gap-after::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--jp-action);
}

.links li.gap-before::before {
  top: -5px;
}

.links li.gap-after::after {
  bottom: -5px;
}

.add {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px dashed var(--ct-overlay0);
  border-radius: var(--jp-r-md);
  background: transparent;
  color: var(--jp-action);
  font: inherit;
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.add ion-icon {
  font-size: var(--jp-icon-sm);
}
</style>
