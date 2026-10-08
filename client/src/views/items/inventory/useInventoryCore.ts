/**
 * What every part of M9 reads and writes through: the query, the sort and the
 * tag filter, the rows they leave, the row selection (FR-24.9) and who the
 * instance's accounts are (FR-1.9).
 *
 * Made once by `ItemInventoryPage` and handed to each of its composables and
 * components, so none of them reaches into another — they meet here.
 */
import { computed, onMounted, ref } from 'vue'

import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { useItemSearchCandidates } from '@/composables/useItemSearchCandidates'
import { useRowSelection } from '@/composables/shared/useRowSelection'
import { inventoryProperties } from '@/composables/useInventoryProperties'
import { useIdentity } from '@/composables/shared/useTripIdentity'
import {
  UNTAGGED_KEY,
  filterByTags,
  tagCounts,
  tagNamesByItem,
  type TagFilterMode,
} from '@/domain/tags'
import { hitsByReason, isSearchQuery, searchItems, type MatchReason } from '@/domain/itemSearch'
import { t } from '@/i18n'
import { useMasterStore } from '@/stores/masterStore'
import type { MasterItem } from '@/types/domain'

/** How the unsearched list is ordered (FR-24.6). */
export const SORT_MODES = ['grouped', 'alphabetical'] as const
export type SortMode = (typeof SORT_MODES)[number]

/**
 * The heading key the alphabetical run renders under. Not a tag name, like
 * `UNTAGGED_KEY` is not one — both are bucket keys the label function knows,
 * and a tag that happened to be called „alphabetical" would render this
 * heading's word instead of its own. Accepted, as it already is for the
 * untagged bucket: the cost is one wrong heading, and the alternative is a
 * sentinel nobody can read in a debugger.
 */
export const ALPHABETICAL_KEY = 'alphabetical'

/** M9's shared state, and the lists every part of it reads. */
export type InventoryCore = ReturnType<typeof useInventoryCore>

/** Builds {@link InventoryCore}; call once, in the page's setup. */
export function useInventoryCore() {
  const masterStore = useMasterStore()
  const orchestrator = useOrchestrator()

  const search = ref('')
  const sort = ref<SortMode>('grouped')

  const props = inventoryProperties()

  /** Tag ids, plus `UNTAGGED_KEY` for the leftover bucket (FR-24.8). */
  const selection = ref<string[]>([])
  const filterMode = ref<TagFilterMode>('any')
  const filterOpen = ref(false)
  const tagsOpen = ref(false)

  const searching = computed(() => isSearchQuery(search.value))

  /**
   * Built before `useInventoryHeader` on purpose: the getter it registers
   * reads this, and `setHeaderActions` evaluates it while the page is still
   * setting up — a value declared after that call is in its temporal dead zone
   * at that moment, and the whole screen fails to render rather than
   * misbehaving visibly.
   */
  const isEmpty = computed(() => masterStore.activeItemList.length === 0)

  /**
   * ADR-033: whether the inventory is on the device at all. `isEmpty` reads a
   * store that starts empty in Server Mode, so without this the first paint of
   * a cold start offers the spreadsheet importer to somebody who already owns
   * two hundred items. `noResults` needs no guard — it sits behind `!isEmpty`,
   * which means at least one item is already here.
   */
  const itemsKnown = computed(() => orchestrator.masterDataLoaded())

  /**
   * The same rule for the *chrome*: removing the search row and shrinking the
   * bar are themselves the
   * statement „there is nothing here", made off the bare `isEmpty` the notice
   * below refuses to decide on. So the screen keeps the tools it is going to
   * have until the rows say otherwise — which also spares it the jump of a
   * search field arriving from nowhere when they land.
   */
  const knownEmpty = computed(() => isEmpty.value && itemsKnown.value)

  /**
   * FR-24.9: the selection, by item id — the gesture M6 and M25 share (a hold
   * or a right-click on a row, or the app bar's icon; ADR-075). Empty *and*
   * `selecting` is a real state — the mode is armed and nothing is picked yet.
   * Named `rows` because `selection` is already the tag filter's.
   */
  const rows = useRowSelection()
  const { selecting, selected } = rows
  const endSelecting = rows.end

  /**
   * FR-1.9 over FR-24.9: who the instance's accounts are. Fetched once per
   * session by the store (ADR-047), so a screen the user returns to all day
   * asks once; in Local and Single-User Mode it answers nobody, which is what
   * hides the action (G-8).
   */
  const { directory, load: loadDirectory } = useIdentity(orchestrator)

  onMounted(() => void loadDirectory())

  /**
   * G-8: offered only where there is somebody to choose between — the same rule
   * M10's own field uses, and for the same reason: a directory of one is only
   * the viewer, whose „default" is no decision.
   */
  const canAssign = computed(() => directory.value.length > 1)

  function userName(userId: string): string {
    return directory.value.find((user) => user.user_id === userId)?.display_name ?? userId
  }

  /** Every tag name of every item, in one pass — the primary is what groups a row. */
  const tagNames = computed(() => tagNamesByItem(masterStore.itemTagList, masterStore.tagList))

  /** The inventory as the search reads it (FR-24.7) — the composer's too. */
  const candidates = useItemSearchCandidates()

  /** How many items each tag holds — the number every chip and row carries. */
  const counts = computed(() => tagCounts(masterStore.activeItemList, masterStore.itemTagList))

  const untaggedCount = computed(() => {
    const tagged = new Set(masterStore.itemTagList.map((a) => a.item_id))
    return masterStore.activeItemList.filter((item) => !tagged.has(item.id)).length
  })

  /** The items the tag selection leaves, before anything is typed. */
  const onTagFilter = computed<MasterItem[]>(() =>
    filterByTags(
      masterStore.activeItemList,
      masterStore.itemTagList,
      selection.value,
      filterMode.value,
    ),
  )

  /** A chosen tag's name — the bucket included, since it is choosable too. */
  function selectionLabel(id: string): string {
    if (id === UNTAGGED_KEY) return t('items.untagged')
    return masterStore.tagList.find((tag) => tag.id === id)?.name ?? id
  }

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
    selection.value.length === 0 || !searching.value
      ? []
      : searchItems(candidates.value, search.value),
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

  /** The rows the list is showing, in the order it shows them (FR-24.9). */
  const shownItems = computed<MasterItem[]>(() =>
    (searching.value ? resultGroups.value : groups.value).flatMap(([, items]) => items),
  )

  const selectedItems = computed<MasterItem[]>(() =>
    shownItems.value.filter((item) => selected.value.has(item.id)),
  )

  const shownCount = computed(() =>
    searching.value
      ? hits.value.length
      : groups.value.reduce((sum, [, items]) => sum + items.length, 0),
  )

  const noResults = computed(() => !isEmpty.value && shownCount.value === 0)

  /**
   * What the no-match state has to name. One chosen tag is named; several are
   * not spelled out — „Kein Treffer in ‚Hygiene · Medis · Sport'" is a sentence
   * nobody reads, and the chips above the empty state already say which.
   */
  const filterName = computed(() =>
    selection.value.length === 1 ? selectionLabel(selection.value[0]!) : null,
  )
  const filtering = computed(() => selection.value.length > 0)

  /** The heading a group renders — neither bucket key is a tag name. */
  function groupLabel(key: string): string {
    if (key === UNTAGGED_KEY) return t('items.untagged')
    if (key === ALPHABETICAL_KEY) return t('items.sortAlphabetical')
    return key
  }

  return {
    search,
    sort,
    props,
    selection,
    filterMode,
    filterOpen,
    tagsOpen,
    searching,
    isEmpty,
    itemsKnown,
    knownEmpty,
    rows,
    selecting,
    selected,
    endSelecting,
    directory,
    canAssign,
    userName,
    tagNames,
    counts,
    untaggedCount,
    selectionLabel,
    hits,
    hitsOutsideFilter,
    resultGroups,
    viaOf,
    groups,
    shownItems,
    selectedItems,
    shownCount,
    noResults,
    filterName,
    filtering,
    groupLabel,
  }
}
