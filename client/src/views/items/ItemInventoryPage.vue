<script setup lang="ts">
/**
 * M9 — Item Inventory (§3.24, FR-24.2/24.4/24.6/24.7)
 *
 * The master item database, and deliberately a **lookup surface rather
 * than a spreadsheet**: every row is the primary-tag avatar and the name,
 * nothing else. The earlier layout put all tags, the weight and the price
 * on every row and read as overload (owner, 2026-08-08).
 *
 * **The tools do not leave (FR-24.6).** Search, the sort and the active tag
 * sit in a bar that stays while the list scrolls, and the group headings
 * stick underneath it. Measured against the family instance the list is
 * 10 391 px against a 671 px viewport — fifteen screens, after two of which
 * the old screen had no heading, no axis and no field left on it.
 *
 * **Search is the screen's main route, so it is not behind the magnifier**
 * (the one G-12 exception, FR-24.6): on a 184-row database looking something
 * up is what the screen is *for*, and every lookup paid a tap to reveal the
 * field. The matching rule is `domain/itemSearch` (FR-24.7) — it folds both
 * spellings of an umlaut and reaches tags and marks, and it says *why* a row
 * matched so the results can be grouped by it.
 *
 * What the list shows beyond the name is a *device-local* preference
 * behind the eye icon (FR-24.4) — the weight-focused packer and the
 * price-focused shopper get the same mechanism instead of one compromise.
 *
 * Grouping is by **primary tag** (FR-24.2), so an item on three axes still
 * occupies one row; the chip axis filters by *any* of an item's tags, which
 * is the reach the single category could not give.
 */
import {
  IonPage,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonFab,
  IonFabButton,
  IonModal,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonToggle,
  IonButton,
  actionSheetController,
} from '@ionic/vue'
import {
  addOutline,
  chevronForwardOutline,
  closeOutline,
  cloudUploadOutline,
  cubeOutline,
  eyeOutline,
  swapVerticalOutline,
} from 'ionicons/icons'
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useMasterStore } from '@/stores/masterStore'
import { useOrchestrator } from '@/composables/useOrchestrator'
import EmptyState from '@/components/global/EmptyState.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import SearchRow from '@/components/global/SearchRow.vue'
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import {
  inventoryProperties,
  INVENTORY_PROPERTIES,
  type InventoryProperty,
} from '@/composables/useInventoryProperties'
import { UNTAGGED_KEY, tagNamesByItem } from '@/domain/tags'
import { MARK_INDEX } from '@/domain/itemMarks'
import {
  hitsByReason,
  isSearchQuery,
  searchItems,
  type ItemSearchCandidate,
  type MatchReason,
} from '@/domain/itemSearch'
import { formatValue, formatWeight } from '@/lib/format'
import { t } from '@/i18n'
import type { MasterItem } from '@/types/domain'
import { PATH, itemPath } from '@/router/paths'

/** How the unsearched list is ordered (FR-24.6). */
const SORT_MODES = ['grouped', 'alphabetical'] as const
type SortMode = (typeof SORT_MODES)[number]

const masterStore = useMasterStore()
const orchestrator = useOrchestrator()
const router = useRouter()

const search = ref('')
const sort = ref<SortMode>('grouped')

const props = inventoryProperties()
const propsOpen = ref(false)

/** `null` = the "Alle" chip: no tag filter. */
const tagFilter = ref<string | null>(null)

const searching = computed(() => isSearchQuery(search.value))

setHeaderActions(() => {
  const eye: HeaderAction = {
    id: 'm9-properties',
    icon: eyeOutline,
    label: t('items.properties'),
    active: props.shownCount.value > 0,
    badge: props.shownCount.value,
    onClick: () => (propsOpen.value = true),
  }
  return [eye]
})

/** The mark's search keywords, by emoji — resolved once, not per keystroke. */
const MARK_KEYWORDS = new Map(MARK_INDEX.map((entry) => [entry.emoji, entry.keywords]))

/**
 * The inventory as the search reads it (FR-24.7). The tag names come from one
 * pass over the assignments rather than a lookup per row: asking each item for
 * its tags is items × assignments, and this is rebuilt whenever either feed
 * moves (NFR-4.3).
 */
const tagNames = computed(() => tagNamesByItem(masterStore.itemTagList, masterStore.tagList))

const candidates = computed<ItemSearchCandidate[]>(() =>
  masterStore.activeItemList.map((item) => ({
    id: item.id,
    name: item.name,
    tagNames: tagNames.value.get(item.id) ?? [],
    markKeywords: item.icon ? (MARK_KEYWORDS.get(item.icon) ?? []) : [],
  })),
)

/** The items the tag chip leaves, before anything is typed. */
const onTagFilter = computed<MasterItem[]>(() => {
  if (tagFilter.value === null) return masterStore.activeItemList
  // Collected once from the assignment list; asking each item for its tags
  // would scan that list per row (NFR-4.3).
  const onTag = new Set(
    masterStore.itemTagList.filter((a) => a.tag_id === tagFilter.value).map((a) => a.item_id),
  )
  return masterStore.activeItemList.filter((item) => onTag.has(item.id))
})

const byId = computed(() => new Map(masterStore.activeItemList.map((item) => [item.id, item])))

/** The hits inside the active tag filter — what the list renders while searching. */
const hits = computed(() => {
  if (!searching.value) return []
  const scope = new Set(onTagFilter.value.map((item) => item.id))
  return searchItems(
    candidates.value.filter((c) => scope.has(c.id)),
    search.value,
  )
})

/**
 * The same query with the tag filter lifted. It is what the no-match state
 * counts: „nothing here, N elsewhere" is the sentence that makes the dead end
 * explain itself, and it is only worth showing when the filter is what caused
 * it (FR-24.7).
 */
const hitsOutsideFilter = computed(() =>
  tagFilter.value === null || !searching.value ? [] : searchItems(candidates.value, search.value),
)

/** The result rows, grouped by why they matched (FR-24.7). */
const resultGroups = computed<[MatchReason, MasterItem[]][]>(() =>
  hitsByReason(hits.value).map(([reason, group]) => [
    reason,
    group.map((hit) => byId.value.get(hit.id)).filter((item): item is MasterItem => !!item),
  ]),
)

/** What a hit matched through, by item id — the row's second line. */
const viaOf = computed(() => new Map(hits.value.map((hit) => [hit.id, hit.via])))

/** The unsearched list: grouped by primary tag, or one alphabetical run. */
const groups = computed<[string, MasterItem[]][]>(() => {
  if (sort.value === 'alphabetical') {
    const all = [...onTagFilter.value].sort((a, b) => a.name.localeCompare(b.name))
    return all.length > 0 ? [[ALPHABETICAL_KEY, all]] : []
  }
  return [...masterStore.itemsByPrimaryTag(onTagFilter.value)]
})

/** The heading key the alphabetical run renders under — never a tag name. */
const ALPHABETICAL_KEY = 'alphabetical'

const shownCount = computed(() =>
  searching.value
    ? hits.value.length
    : groups.value.reduce((sum, [, items]) => sum + items.length, 0),
)

const isEmpty = computed(() => masterStore.activeItemList.length === 0)
const noResults = computed(() => !isEmpty.value && shownCount.value === 0)

/** The filter the no-match state has to name, when one is active. */
const activeTag = computed(() =>
  tagFilter.value === null
    ? null
    : (masterStore.tagList.find((tag) => tag.id === tagFilter.value) ?? null),
)

setHeaderTitle(
  () => t('items.title'),
  () => {
    if (isEmpty.value) return null
    const total = masterStore.activeItemList.length
    // FR-24.6: the collection states its size, and says so differently once
    // something is narrowing it — „12 von 184" is the number a filter owes.
    return searching.value || tagFilter.value !== null
      ? t('items.metaFiltered', { shown: shownCount.value, total })
      : t('items.metaAll', { items: total, tags: masterStore.tagList.length })
  },
)

/**
 * ADR-033: whether the inventory is on the device at all. `isEmpty` reads a
 * store that starts empty in Server Mode, so without this the first paint of
 * a cold start offers the spreadsheet importer to somebody who already owns
 * two hundred items. `noResults` needs no guard — it sits behind `!isEmpty`,
 * which means at least one item is already here.
 */
const itemsKnown = computed(() => orchestrator.masterDataLoaded())

/** The heading a group renders — neither bucket key is a tag name. */
function groupLabel(key: string): string {
  if (key === UNTAGGED_KEY) return t('items.untagged')
  if (key === ALPHABETICAL_KEY) return t('items.sortAlphabetical')
  return key
}

/**
 * The avatar glyph: the primary tag's initial, or a neutral one.
 *
 * Read from the item rather than from the heading it sits under, because
 * since FR-24.6/24.7 the heading is not always a tag: under „Treffer im Tag"
 * the key is the *reason*, and taking its initial painted a column of „T"s
 * on rows filed under six different tags. The map is the same one the search
 * reads, so this costs no second pass (NFR-4.3).
 */
function avatarGlyph(item: MasterItem): string {
  const primary = tagNames.value.get(item.id)?.[0]
  return primary ? [...primary][0]!.toUpperCase() : '·'
}

function reasonLabel(reason: MatchReason): string {
  return t(`items.match.${reason}`)
}

function extrasFor(item: MasterItem): string[] {
  const extras: string[] = []
  if (props.isShown('weight') && item.weight_grams !== null) {
    extras.push(formatWeight(item.weight_grams))
  }
  if (props.isShown('price') && item.value_cents !== null) {
    extras.push(formatValue(item.value_cents))
  }
  return extras
}

function propertyLabel(key: InventoryProperty): string {
  return t(`items.property.${key}`)
}

function sortLabel(mode: SortMode): string {
  return mode === 'grouped' ? t('items.sortGrouped') : t('items.sortAlphabetical')
}

/**
 * The sort, as an action sheet rather than a second segment: the tag axis is
 * already one, and two stacked segments is the restlessness G-12 removed from
 * M4. Both options are named as words, with the current one marked.
 */
async function chooseSort() {
  const sheet = await actionSheetController.create({
    header: t('items.sort'),
    buttons: [
      ...SORT_MODES.map((mode) => ({
        text: sort.value === mode ? `✓ ${sortLabel(mode)}` : sortLabel(mode),
        data: mode,
      })),
      { text: t('common.cancel'), role: 'cancel' },
    ],
  })
  await sheet.present()
  const { data, role } = await sheet.onDidDismiss()
  if (role === 'cancel' || typeof data !== 'string') return
  sort.value = data as SortMode
}

function newItem() {
  // FR-24.5: creation is the editor in its minimal mode, not a prompt —
  // a name typed into an alert cannot carry tags or a weight.
  router.push(PATH.newItem)
}

function handleRefresh(event: CustomEvent) {
  ;(event.target as HTMLIonRefresherElement).complete()
}

/**
 * How far the group headings have to stay clear of the tool bar (FR-24.6).
 *
 * Both are sticky, and a heading that sticks at `top: 0` slides *under* the
 * bar instead of beneath it. The height is measured rather than guessed
 * because the bar grows a row when a tag chip is active and wraps on a narrow
 * screen — a constant here would be right on one device and wrong on the next.
 */
const toolsEl = useTemplateRef<HTMLElement>('tools')
const toolsHeight = ref(0)
let observer: ResizeObserver | null = null

watch(toolsEl, (el) => {
  observer?.disconnect()
  observer = null
  if (!el) {
    toolsHeight.value = 0
    return
  }
  toolsHeight.value = el.offsetHeight
  // Guarded rather than assumed: jsdom has no ResizeObserver, and a unit test
  // that mounts this page must not fail on a measurement it cannot take. The
  // offset above is still read, so the fallback is a stale height rather than
  // none — and `top: 0` is where an unmeasured heading sticks, which is the
  // pre-FR-24.6 behaviour rather than a broken one.
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(() => (toolsHeight.value = el.offsetHeight))
  observer.observe(el)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <IonPage>
    <IonContent>
      <IonRefresher slot="fixed" @ionRefresh="handleRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <!-- FR-24.6: the tools stay while the list moves. -->
      <div
        v-if="!isEmpty"
        ref="tools"
        class="tools"
        :style="{ '--m9-tools-height': `${toolsHeight}px` }"
        data-testid="m9-tools"
      >
        <SearchRow
          v-model="search"
          persistent
          testid="items-search-input"
          :placeholder="t('items.searchPlaceholder')"
          @close="search = ''"
        />

        <div class="toolrow">
          <button type="button" class="chip" data-testid="m9-sort" @click="chooseSort">
            <IonIcon :icon="swapVerticalOutline" />
            {{ sortLabel(sort) }}
          </button>

          <!-- The active tag travels with the bar, so the filter that is
               narrowing the list can always be read and dropped (FR-24.6). -->
          <button
            v-if="activeTag"
            type="button"
            class="chip active"
            :aria-label="t('items.clearTag', { tag: activeTag.name })"
            data-testid="m9-clear-tag"
            @click="tagFilter = null"
          >
            {{ activeTag.name }}
            <IonIcon :icon="closeOutline" />
          </button>
        </div>
      </div>

      <!-- Tag axis (FR-24.2) — an item surfaces under every tag it carries. -->
      <IonSegment
        v-if="masterStore.tagList.length > 0 && !isEmpty"
        :value="tagFilter ?? 'all'"
        scrollable
        data-testid="m9-tag-axis"
        @ionChange="
          (e: CustomEvent) => (tagFilter = e.detail.value === 'all' ? null : e.detail.value)
        "
      >
        <IonSegmentButton value="all">
          <IonLabel>{{ t('items.tagFilterAll') }}</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton
          v-for="tag in masterStore.tagList"
          :key="tag.id"
          :value="tag.id"
          :data-testid="`m9-tag-chip-${tag.name}`"
        >
          <IonLabel>{{ tag.name }}</IonLabel>
        </IonSegmentButton>
      </IonSegment>

      <!-- ADR-033: an inventory that has not arrived is not an empty one. -->
      <EmptyState
        v-if="isEmpty && !itemsKnown"
        :title="t('items.listUnknown')"
        testid="m9-list-loading"
      />

      <!-- G-7 empty state — M15 is the way in from here. -->
      <EmptyState
        v-else-if="isEmpty"
        :icon="cubeOutline"
        :title="t('items.empty')"
        :hint="t('items.emptyHint')"
        testid="m9-empty"
      >
        <IonButton
          fill="outline"
          size="small"
          :router-link="PATH.importSpreadsheet"
          data-testid="m9-import"
        >
          <IonIcon slot="start" :icon="cloudUploadOutline" />
          {{ t('items.importSpreadsheet') }}
        </IonButton>
      </EmptyState>

      <!-- FR-24.7: a dead end says what caused it and how many rows lie
           outside it, rather than being a bare "nothing found". -->
      <EmptyState
        v-else-if="noResults"
        :title="activeTag ? t('items.noMatchInTag', { tag: activeTag.name }) : t('items.noMatch')"
        :hint="
          hitsOutsideFilter.length > 0
            ? t('items.noMatchElsewhere', { n: hitsOutsideFilter.length })
            : undefined
        "
        testid="m9-no-match"
      >
        <IonButton
          v-if="activeTag"
          fill="outline"
          size="small"
          data-testid="m9-search-everywhere"
          @click="tagFilter = null"
        >
          {{ hitsOutsideFilter.length > 0 ? t('items.searchAll') : t('items.clearFilter') }}
        </IonButton>
      </EmptyState>

      <template v-else>
        <section
          v-for="[key, groupItems] in searching ? resultGroups : groups"
          :key="key"
          class="tag-group"
        >
          <h2
            class="group-head jp-eyebrow"
            :style="{ '--m9-tools-height': `${toolsHeight}px` }"
            data-testid="m9-group-head"
          >
            {{ searching ? reasonLabel(key as MatchReason) : groupLabel(key) }}
            <span class="group-count">{{ groupItems.length }}</span>
          </h2>

          <IonList class="jp-card group-card" lines="full">
            <IonItem
              v-for="item in groupItems"
              :key="item.id"
              button
              :detail="false"
              :router-link="itemPath(item.id)"
              data-testid="m9-row"
            >
              <!-- FR-28.4: photo → mark → the tag initial. The inventory is
                   where an item is identified, so this ladder never ends in
                   nothing and the column stays aligned. -->
              <ItemMark
                slot="start"
                :mark="item.icon ?? null"
                surface="inventory"
                :photo-item="item"
                :initial="avatarGlyph(item)"
                :size="34"
                class="row-mark"
              />

              <IonLabel>
                <h2>{{ item.name }}</h2>
                <!-- FR-24.7: a row that matched through something other than
                     its name says what, or it reads as a bug. -->
                <p v-if="searching && viaOf.get(item.id)" class="row-via" data-testid="m9-row-via">
                  {{ t('items.matchVia', { via: viaOf.get(item.id)! }) }}
                </p>
                <!-- FR-24.4: only when the device asked for them. -->
                <div v-if="props.isShown('tags')" class="row-tags">
                  <span
                    v-for="tag in masterStore.getItemTags(item.id)"
                    :key="tag.id"
                    class="row-tag"
                  >
                    {{ tag.name }}
                  </span>
                </div>
              </IonLabel>

              <div v-if="extrasFor(item).length > 0" slot="end" class="row-extras">
                <span v-for="extra in extrasFor(item)" :key="extra">{{ extra }}</span>
              </div>
              <IonIcon slot="end" :icon="chevronForwardOutline" class="row-chevron" />
            </IonItem>
          </IonList>
        </section>
      </template>

      <IonFab vertical="bottom" horizontal="end" slot="fixed">
        <IonFabButton :aria-label="t('items.new')" data-testid="m9-fab" @click="newItem">
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>

      <!-- FR-24.4 "Angezeigte Eigenschaften" — device-local, no save button. -->
      <IonModal
        :is-open="propsOpen"
        :initial-breakpoint="0.5"
        :breakpoints="[0, 0.5]"
        data-testid="m9-properties-sheet"
        @didDismiss="propsOpen = false"
      >
        <div class="sheet-body ion-padding">
          <h2 class="jp-sheet-title">{{ t('items.properties') }}</h2>
          <p class="sheet-hint">{{ t('items.propertiesHint') }}</p>

          <IonList>
            <IonItem v-for="key in INVENTORY_PROPERTIES" :key="key" lines="full">
              <IonLabel>{{ propertyLabel(key) }}</IonLabel>
              <IonToggle
                slot="end"
                :checked="props.isShown(key)"
                :data-testid="`m9-property-${key}`"
                @ionChange="props.toggle(key)"
              />
            </IonItem>
          </IonList>
        </div>
      </IonModal>
    </IonContent>
  </IonPage>
</template>

<style scoped>
/* FR-24.6: the bar the list scrolls under. `ion-content` scrolls its own
   inner element, so a sticky child sticks to that — no fixed positioning
   and no scroll listener. */
.tools {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--jp-surface-page);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ct-surface0);
}

.toolrow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 12px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border: 1px solid var(--ct-surface0);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-card);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.chip.active {
  border-color: var(--jp-action);
  color: var(--jp-action);
}

.chip ion-icon {
  font-size: var(--jp-icon-xs);
}

/* Clearance below the axis (UX-4): at 0px the active chip's underline sat
   flush against the first group heading, which read as the heading sliding
   under the bar. Inset to match M7's segment. */
ion-segment {
  margin: 0 12px 12px;
}

.tag-group {
  margin: 0 0 18px;
}

.group-card {
  /* Inset like M7's section card, so the radius reads as a card edge
     instead of bleeding into the page (G-14). */
  margin: 0 8px 8px;
}

.group-head {
  /* Sticky *under* the tool bar, whose height is measured rather than
     guessed — see the note on `toolsHeight` (FR-24.6). */
  position: sticky;
  top: var(--m9-tools-height, 0px);
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  padding: 6px 20px;
  background: var(--jp-surface-page);
  color: var(--ion-color-medium);
}

.group-count {
  color: var(--ion-color-medium);
}

/* The tile itself now lives in ItemMark with the ladder that decides when
   it shows (FR-28.4); only the row's own spacing stays here. */
.row-mark {
  margin-inline-end: 12px;
}

.row-via {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-xs);
}

.row-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 4px;
}

.row-tag {
  padding: 2px 7px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ion-color-medium);
  font-size: var(--jp-text-xs);
}

.row-extras {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  color: var(--ion-color-medium);
  font-size: var(--jp-text-sm);
  white-space: nowrap;
}

.row-chevron {
  color: var(--ion-color-medium);
  font-size: var(--jp-icon-sm);
  margin-inline-start: 6px;
}

.sheet-hint {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-sm);
  margin: 0 0 12px;
}
</style>
