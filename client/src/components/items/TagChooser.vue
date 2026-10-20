<script lang="ts">
import { ref } from 'vue'

/**
 * Whether the shelf is open, for every chooser of the session: whoever opened
 * it to pick from all the tags on one item wants them on the next one too,
 * on M10 and in the FR-24.11 sheet alike.
 */
const shelfOpen = ref(false)
</script>

<script setup lang="ts">
/**
 * An item's tag set, chosen by search-or-create (FR-24.1).
 *
 * M10 had this inline; FR-24.11's creation sheet on M9 needs the same control,
 * and two copies would be two filter-or-create rules — the drift ADR-008's
 * „only one of each" exists to prevent. The component owns only the query;
 * what an assignment *is* (a staged id while creating, a synced row once the
 * item exists) stays with the caller, which is why every act is an event.
 *
 * Assigned tags come first and are never hidden by the query, the first of
 * them is the primary one (where M9 files the item). With an empty query the
 * offers are every unassigned tag, folded to the shelf's first lines until the
 * user opens it; a query shows every match (FR-24.1).
 */
import { IonIcon, IonSearchbar } from '@ionic/vue'
import { addOutline, bookmarkOutline, closeOutline } from 'ionicons/icons'
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'

import { TAG_SHELF_ROWS, chipsWithinRows, tagOffer } from '@/lib/itemEditorOffers'
import { findNameCollision } from '@/domain/nameCollision'
import { t } from '@/i18n'
import type { Tag } from '@/types/domain'

const props = withDefaults(
  defineProps<{
    /** The whole vocabulary. */
    tags: Tag[]
    /** The item's tags in order — the first is the primary one. */
    assigned: Tag[]
    /**
     * Tags to offer ahead of the rest (FR-24.11: the tags of the items the
     * search found by name). Order is kept; ids not in `tags` are ignored.
     */
    preferredIds?: string[]
    /**
     * Rendered inside the FR-24.11 creation sheet rather than on M10's own
     * form — only the test ids differ, spelled out as literals so `scripts/testid-gate.mjs` can
     * check a spec against either.
     */
    inSheet?: boolean
  }>(),
  { preferredIds: () => [], inSheet: false },
)

const emit = defineEmits<{
  assign: [tagId: string]
  unassign: [tagId: string]
  primary: [tagId: string]
  /** A typed name no tag carries — the caller creates it and assigns it. */
  create: [name: string]
}>()

const query = ref('')

const assignedIds = computed(() => new Set(props.assigned.map((tag) => tag.id)))

/** The vocabulary with the preferred tags moved to the front. */
const pool = computed<Tag[]>(() => {
  if (props.preferredIds.length === 0) return props.tags
  const preferred = new Set(props.preferredIds)
  const byId = new Map(props.tags.map((tag) => [tag.id, tag]))
  const first = props.preferredIds.map((id) => byId.get(id)).filter((tag): tag is Tag => !!tag)
  return [...first, ...props.tags.filter((tag) => !preferred.has(tag.id))]
})

const offer = computed(() => tagOffer(pool.value, assignedIds.value, query.value))
const preferredSet = computed(() => new Set(props.preferredIds))

const browsing = computed(() => query.value.trim() === '')

const chipRow = ref<HTMLElement | null>(null)

/** How many offers the folded shelf's lines hold; all of them until measured. */
const fitCount = ref(Number.POSITIVE_INFINITY)

/**
 * Every offer is laid out for one tick to be measured. A flag of its own
 * rather than resetting `fitCount`, which would take the toggle away and
 * rebuild it — and a toggle rebuilt between a tap's mousedown and mouseup
 * never receives the click.
 */
const measuring = ref(false)

const shownOffers = computed(() =>
  browsing.value && !shelfOpen.value && !measuring.value
    ? offer.value.matches.slice(0, fitCount.value)
    : offer.value.matches,
)

/** Only a shelf that runs past its lines has anything to open or fold. */
const shelfOverflows = computed(() => browsing.value && fitCount.value < offer.value.matches.length)

/**
 * Lays every offer out, then reads where the lines break. Both happen before
 * the browser paints, so the unfolded row is never seen.
 */
async function measureShelf() {
  if (!browsing.value) return
  measuring.value = true
  await nextTick()
  const chips = chipRow.value?.querySelectorAll<HTMLElement>('.chip.offer') ?? []
  fitCount.value = chipsWithinRows(
    [...chips].map((chip) => chip.offsetTop),
    TAG_SHELF_ROWS,
  )
  measuring.value = false
}

// One getter per source: a getter returning a fresh array counts as changed on
// every re-run, and any re-render of the form would re-measure.
watch([browsing, () => offer.value.matches.map((tag) => tag.id).join()], measureShelf, {
  flush: 'post',
})

// Where the lines break moves with the width — a sheet sliding up, a rotated
// phone — and with the web font replacing its fallback.
let resize: ResizeObserver | null = null
let measuredWidth = 0
onMounted(() => {
  void measureShelf()
  void document.fonts?.ready.then(measureShelf)
  if (typeof ResizeObserver === 'undefined' || !chipRow.value) return
  resize = new ResizeObserver(([entry]) => {
    const width = entry?.contentRect.width ?? 0
    if (width === measuredWidth) return
    measuredWidth = width
    void measureShelf()
  })
  resize.observe(chipRow.value)
})
onBeforeUnmount(() => resize?.disconnect())

function assign(tagId: string) {
  emit('assign', tagId)
  query.value = ''
}

/** Filter-or-create: an unmatched name becomes a tag and is assigned. */
function commitQuery() {
  const name = query.value.trim()
  if (!name) return
  const existing = findNameCollision(name, props.tags)
  if (existing) emit('assign', existing.id)
  else emit('create', name)
  query.value = ''
}
</script>

<template>
  <div class="tag-chooser">
    <IonSearchbar
      :value="query"
      :data-testid="`${inSheet ? 'create-item' : 'm10'}-tag-search`"
      :placeholder="t('items.editor.tagSearchPlaceholder')"
      :debounce="0"
      @ionInput="(e: CustomEvent) => (query = (e.detail.value as string) ?? '')"
      @keyup.enter="commitQuery"
    />

    <div ref="chipRow" class="chips">
      <!-- Assigned first and always visible: the filter must never hide
           what the item already carries. Two targets, because the chip had
           one and it was the destructive one (FR-24.9): the name files the
           item under this tag, the ✕ takes it off. -->
      <span
        v-for="(tag, index) in assigned"
        :key="tag.id"
        class="chip assigned"
        :class="{ primary: index === 0 }"
      >
        <button
          type="button"
          class="chip-name"
          :disabled="index === 0"
          :aria-label="t('items.editor.makePrimary', { tag: tag.name })"
          :data-testid="`${inSheet ? 'create-item' : 'm10'}-tag-primary-${tag.name}`"
          @click="emit('primary', tag.id)"
        >
          <IonIcon v-if="index === 0" :icon="bookmarkOutline" class="chip-flag" />
          {{ tag.name }}
        </button>
        <button
          type="button"
          class="chip-drop"
          :aria-label="t('items.editor.unassign', { tag: tag.name })"
          :data-testid="`${inSheet ? 'create-item' : 'm10'}-tag-assigned-${tag.name}`"
          @click="emit('unassign', tag.id)"
        >
          <IonIcon :icon="closeOutline" />
        </button>
      </span>

      <button
        v-for="tag in shownOffers"
        :key="tag.id"
        type="button"
        class="chip offer"
        :class="{ preferred: preferredSet.has(tag.id) }"
        :data-testid="`${inSheet ? 'create-item' : 'm10'}-tag-offer-${tag.name}`"
        @click="assign(tag.id)"
      >
        {{ tag.name }}
      </button>

      <button
        v-if="offer.canCreate"
        type="button"
        class="chip create"
        :data-testid="`${inSheet ? 'create-item' : 'm10'}-tag-create`"
        @click="commitQuery"
      >
        <IonIcon :icon="addOutline" />
        {{ t('items.editor.tagCreate', { name: query.trim() }) }}
      </button>
    </div>

    <button
      v-if="shelfOverflows"
      type="button"
      class="chip shelf-toggle"
      :aria-expanded="shelfOpen"
      :data-testid="`${inSheet ? 'create-item' : 'm10'}-tag-shelf-toggle`"
      @click="shelfOpen = !shelfOpen"
    >
      {{
        shelfOpen
          ? t('items.editor.tagShelfFold')
          : t('items.editor.tagShelfOpen', { n: offer.matches.length })
      }}
    </button>

    <p class="tag-summary" :data-testid="`${inSheet ? 'create-item' : 'm10'}-tag-summary`">
      <template v-if="assigned.length > 0">
        {{
          t('items.editor.tagFiledUnder', {
            tags: assigned.map((tag) => tag.name).join(', '),
            primary: assigned[0]!.name,
          })
        }}
      </template>
      <template v-else>{{ t('items.editor.tagNone') }}</template>
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
}

.chip.assigned {
  padding: 0;
  gap: 0;
}

.chip.assigned .chip-name,
.chip.assigned .chip-drop {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 5px 4px 5px 10px;
}

.chip.assigned .chip-drop {
  padding: 5px 9px 5px 4px;
}

/* The one that decides where the item is filed says so, and stops offering
   an act it has already performed. */
.chip.assigned .chip-name:disabled {
  cursor: default;
}

.chip-flag {
  font-size: var(--jp-icon-xs);
}

/* FR-24.11: a tag the similar items carry. Marked in the done hue rather than
   the action one, because it is a hint about the data, not a second kind of
   control. */
.chip.preferred {
  border-color: color-mix(in srgb, var(--jp-done) 60%, transparent);
  color: var(--ct-text);
}

.chip.create {
  border-style: dashed;
  color: var(--jp-brand);
}

/* Opens or folds the shelf, not a tag: quieter than the offers above it. */
.chip.shelf-toggle {
  border-style: dashed;
  background: transparent;
  color: var(--jp-brand);
  cursor: pointer;
  margin-bottom: 4px;
}

.tag-summary {
  font-size: var(--jp-text-xs);
  color: var(--ion-color-medium);
  margin: 4px 0 12px;
}
</style>
