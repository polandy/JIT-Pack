<script setup lang="ts">
/**
 * M9 — Item Inventory (§3.24, FR-24.2/24.4/24.6/24.7/24.11)
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
  IonToggle,
  IonButton,
  actionSheetController,
} from '@ionic/vue'
import {
  addOutline,
  checkboxOutline,
  sparklesOutline,
  chevronForwardOutline,
  closeOutline,
  cloudUploadOutline,
  cubeOutline,
  ellipsisHorizontalOutline,
  eyeOutline,
  funnelOutline,
  personOutline,
  pricetagsOutline,
  removeCircleOutline,
  swapVerticalOutline,
  trashOutline,
} from 'ionicons/icons'
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
  type ComponentPublicInstance,
} from 'vue'
import { useRouter } from 'vue-router'
import { useMasterStore } from '@/stores/masterStore'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useItemSearchCandidates } from '@/composables/useItemSearchCandidates'
import { useInventoryHygiene } from '@/composables/useInventoryHygiene'
import { useRowSelection } from '@/composables/useRowSelection'
import BulkBar from '@/components/global/BulkBar.vue'
import EmptyState from '@/components/global/EmptyState.vue'
import ListGroup from '@/components/global/ListGroup.vue'
import SelectBox from '@/components/global/SelectBox.vue'
import SelectionBar from '@/components/global/SelectionBar.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import SearchRow from '@/components/global/SearchRow.vue'
import TagFilterSheet from '@/components/items/TagFilterSheet.vue'
import BulkTagSheet, { type BulkTagMode } from '@/components/items/BulkTagSheet.vue'
import BulkAssigneeSheet from '@/components/items/BulkAssigneeSheet.vue'
import MergeItemsSheet, { type MergeCandidate } from '@/components/items/MergeItemsSheet.vue'
import BulkDependencySheet from '@/components/items/BulkDependencySheet.vue'
import GroupJumpSheet from '@/components/items/GroupJumpSheet.vue'
import TagManagerSheet from '@/components/items/TagManagerSheet.vue'
import MarkPicker from '@/components/items/MarkPicker.vue'
import CreateItemSheet from '@/components/items/CreateItemSheet.vue'
import SearchOfferButton from '@/components/items/SearchOfferButton.vue'
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import {
  inventoryProperties,
  offeredProperties,
  type InventoryProperty,
} from '@/composables/useInventoryProperties'
import {
  UNTAGGED_KEY,
  filterByTags,
  tagCounts,
  tagNamesByItem,
  tagDeletion,
  tagsOfItems,
  topTagsByCount,
  TAG_DELETE_REFUSED,
  type TagFilterMode,
} from '@/domain/tags'
import {
  DEPENDENCY_LINK_COMPANION,
  DEPENDENCY_LINK_MAIN,
  type DependencyLinkDirection,
} from '@/domain/dependencies'
import { DELETION_RETIRE } from '@/domain/masterDeletion'
import {
  hitsByReason,
  isSearchQuery,
  searchItems,
  searchOffer,
  OFFER_CREATE,
  type MatchReason,
} from '@/domain/itemSearch'
import { confirmAction, confirmDestructive, promptText } from '@/lib/confirm'
import { bulkRetireSentence } from '@/lib/deletionLabels'
import { presentToast } from '@/lib/toast'
import { promptTagMerge, promptTagMergeMany } from '@/lib/tagMergePrompt'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { formatValue, formatWeight } from '@/lib/format'
import { t } from '@/i18n'
import { useIdentity } from '@/composables/useTripIdentity'
import type { DependencyMode, MasterItem, Tag } from '@/types/domain'
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

/**
 * How many tags the tool bar offers without opening the sheet (FR-24.8).
 * Three is what fits one row beside the sort chip at 390 px with the longest
 * tag name this instance carries; a fourth wraps the row.
 */
const TOP_TAG_COUNT = 3

/** Tag ids, plus `UNTAGGED_KEY` for the leftover bucket (FR-24.8). */
const selection = ref<string[]>([])
const filterMode = ref<TagFilterMode>('any')
const filterOpen = ref(false)
const jumpOpen = ref(false)
const tagsOpen = ref(false)

const searching = computed(() => isSearchQuery(search.value))

/**
 * Declared above `setHeaderActions` on purpose: the getter it registers reads
 * this, and `setHeaderActions` evaluates it while the page is still setting
 * up — a `const` further down is in its temporal dead zone at that moment,
 * and the whole screen fails to render rather than misbehaving visibly.
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
 * The same rule for the *chrome*, which is where it was still missing until
 * 2026-09-16: removing the search row and shrinking the bar are themselves the
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
const bulkSheet = ref<BulkTagMode | null>(null)
const assigneeSheet = ref(false)
/** FR-24.15: which of the picked rows stays. */
const mergeSheet = ref(false)
const dependencySheet = ref<DependencyLinkDirection | null>(null)

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

/** FR-24.12: how many findings M24 would list — the foot note's number. */
const { report: hygiene } = useInventoryHygiene()

setHeaderActions(() => {
  const eye: HeaderAction = {
    id: 'm9-properties',
    icon: eyeOutline,
    label: t('items.properties'),
    active: props.shownCount.value > 0,
    badge: props.shownCount.value,
    onClick: () => (propsOpen.value = true),
  }
  /*
   * The sort is a glyph in the cluster and not a fourth chip in the bar
   * (G-12). Measured at 390 px with this instance's vocabulary, a sort chip
   * beside the three tags and the sheet's opener wraps the bar to three rows
   * — and the bar is sticky, so that height is spent on every screen of a
   * fifteen-screen list. Which order is active is legible from the list
   * itself (tag headings, or one alphabetical run) and marked in the sheet.
   */
  const sortAction: HeaderAction = {
    id: 'm9-sort',
    icon: swapVerticalOutline,
    label: t('items.sort'),
    active: sort.value !== 'grouped',
    onClick: chooseSort,
  }
  /*
   * FR-24.9. Third and last glyph the bar renders before the ⋮ (ADR-050),
   * and it earns the place: it is the entrance to the only way out of a
   * 49-item „Diverses" that does not cost 49 round trips through M10.
   *
   * Absent while the inventory is empty — an action over a selection that
   * cannot exist is the same offer the sheets refuse to make, and it is what
   * kept `tab-items`' visual baseline from changing for a screen whose
   * content did not.
   */
  /*
   * FR-24.10. Deliberately *fourth*: ADR-050 renders three glyphs and turns
   * the rest into words in the ⋮, and managing tags is the rarest of the
   * four — a thing done when a name is wrong, not on every visit. Being a
   * word is also what lets it say „Tags verwalten" rather than leaving a
   * glyph to be guessed at.
   */
  const manageTags: HeaderAction = {
    id: 'm9-manage-tags',
    icon: pricetagsOutline,
    label: t('items.manageTags'),
    onClick: () => (tagsOpen.value = true),
  }
  /*
   * FR-24.12. A word behind the ⋮ like the tag manager, and for the same
   * reason: a cleanup pass is occasional. Offered whatever the count — „all
   * tidy" is an answer the screen gives, and the rule settings live there.
   */
  const cleanup: HeaderAction = {
    id: 'm9-cleanup',
    icon: sparklesOutline,
    label: t('items.cleanup'),
    overflow: true,
    onClick: () => void router.push(PATH.inventoryCleanup),
  }
  // An inventory with no tags has nothing to manage, exactly as it has
  // nothing to select — once it is known to hold none (ADR-033).
  if (knownEmpty.value) return [eye, sortAction]

  const select: HeaderAction = {
    id: 'm9-select',
    icon: checkboxOutline,
    label: t('items.select'),
    active: selecting.value,
    onClick: () => (selecting.value ? endSelecting() : rows.start()),
  }
  return masterStore.tagList.length > 0
    ? [eye, sortAction, select, manageTags, cleanup]
    : [eye, sortAction, select, cleanup]
})

const endSelecting = rows.end

/** The rows the list is showing, in the order it shows them (FR-24.9). */
const shownItems = computed<MasterItem[]>(() =>
  (searching.value ? resultGroups.value : groups.value).flatMap(([, items]) => items),
)

const selectedItems = computed<MasterItem[]>(() =>
  shownItems.value.filter((item) => selected.value.has(item.id)),
)

/**
 * „Alle N" takes what is *on screen*, filter and search included — which is
 * what makes the mode worth having: narrow to „Diverses", take all 49, act
 * once. Pressing it again clears, so the same control undoes itself.
 */
function toggleAll() {
  rows.toggleAll(shownItems.value.map((item) => item.id))
}

/**
 * A tap on a row: while selecting it picks the row, otherwise it opens the
 * item (FR-24.9). A navigation in code rather than a `routerLink`, so the
 * release after a hold — spent by `rows.click` — never opens the editor.
 */
function onRowClick(item: MasterItem) {
  if (rows.click(item.id, true)) return
  void router.push(itemPath(item.id))
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

/** The three the tool bar offers without opening anything (FR-24.8). */
const topTags = computed(() => topTagsByCount(masterStore.tagList, counts.value, TOP_TAG_COUNT))

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

/**
 * The chosen tags that are *not* among the three chips, as their own
 * removable chips: a filter the bar cannot show is a filter the user cannot
 * see, which is the failure the scrollable axis had by construction.
 */
const extraSelected = computed(() => {
  const top = new Set(topTags.value.map((tag) => tag.id))
  return selection.value
    .filter((id) => !top.has(id))
    .map((id) => ({ id, label: selectionLabel(id) }))
})

function toggleTag(id: string) {
  const next = new Set(selection.value)
  // The bucket is exclusive — see TagFilterSheet for why.
  next.delete(UNTAGGED_KEY)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selection.value = [...next]
}

function dropSelected(id: string) {
  selection.value = selection.value.filter((entry) => entry !== id)
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

/**
 * The heading key the alphabetical run renders under. Not a tag name, like
 * `UNTAGGED_KEY` is not one — both are bucket keys the label function knows,
 * and a tag that happened to be called „alphabetical" would render this
 * heading's word instead of its own. Accepted, as it already is for the
 * untagged bucket: the cost is one wrong heading, and the alternative is a
 * sentinel nobody can read in a debugger.
 */
const ALPHABETICAL_KEY = 'alphabetical'

/** The unsearched list: grouped by primary tag, or one alphabetical run. */
const groups = computed<[string, MasterItem[]][]>(() => {
  if (sort.value === 'alphabetical') {
    const all = [...onTagFilter.value].sort((a, b) => a.name.localeCompare(b.name))
    return all.length > 0 ? [[ALPHABETICAL_KEY, all]] : []
  }
  return [...masterStore.itemsByPrimaryTag(onTagFilter.value)]
})

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

setHeaderTitle(
  () => t('items.title'),
  () => {
    if (isEmpty.value) return null
    const total = masterStore.activeItemList.length
    // FR-24.6: the collection states its size, and says so differently once
    // something is narrowing it — „12 von 184" is the number a filter owes.
    return searching.value || filtering.value
      ? t('items.metaFiltered', { shown: shownCount.value, total })
      : t('items.metaAll', { items: total, tags: masterStore.tagList.length })
  },
)

/** Tags by name — a group's key is its tag's name, and its heading carries the mark. */
const tagByName = computed(() => new Map(masterStore.tagList.map((tag) => [tag.name, tag])))

/** The mark a heading shows: its tag's (FR-24.13), none for a bucket or a search reason. */
function groupMark(key: string): string | null {
  return searching.value ? null : (tagByName.value.get(key)?.icon ?? null)
}

/**
 * The primary tag's mark, which an item without its own borrows on this
 * screen (FR-24.13) — the rung between the item's mark and the initial.
 */
function primaryTagMark(item: MasterItem): string | null {
  return masterStore.getItemTags(item.id)[0]?.icon ?? null
}

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

/**
 * Who the row is usually somebody's job for (FR-1.9), or null — shown only
 * while the device asked for it. An item that names nobody shows **nothing**:
 * „Niemand" is the editor's empty state, and repeating it down a list is the
 * overload FR-24.4 took the columns away for.
 */
function assigneeOf(item: MasterItem): string | null {
  if (!props.isShown('assignee') || !canAssign.value) return null
  return item.default_assignee_id ? userName(item.default_assignee_id) : null
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
// --- FR-24.10: managing the tags themselves --------------------------------

/**
 * How many assignments each tag has — the manager's count.
 *
 * Read through `tagDeletion` rather than counted again here, because this
 * number and the one a refused delete reports have to be the same number:
 * a manager saying „0" beside a tag whose delete is then refused is the
 * screen contradicting itself. It also means retired items count, which is
 * right — they still carry their tags, and a cascade would still strip them.
 */
const tagUsage = computed(
  () =>
    new Map(
      masterStore.tagList.map((tag) => [
        tag.id,
        tagDeletion(tag.id, masterStore.itemTagList).references,
      ]),
    ),
)

/** FR-24.10: rename, refusing a name another tag already holds. */
async function renameTag(tag: Tag) {
  await promptText({
    header: t('items.tagRenameTitle'),
    value: tag.name,
    confirmLabel: t('items.tagRenameConfirm'),
    testid: 'm9-tag-rename-prompt',
    onConfirm: async (name) => {
      if (name === '' || name === tag.name) return
      const result = orchestrator.renameTag(tag.id, name)
      if (!result.ok) {
        await presentToast({ message: t('items.tagNameTaken', { name: result.collision }) })
        // `false` keeps the alert open *with the typed text*, so a near-miss
        // is corrected rather than retyped.
        return false
      }
      await presentToast({ message: t('items.tagRenamed', { name }) })
    },
  })
}

/** FR-24.10: merge this tag into another and delete it — the shared flow. */
async function mergeTag(tag: Tag) {
  await promptTagMerge(tag, {
    tags: masterStore.tagList,
    usage: tagUsage.value.get(tag.id) ?? 0,
    merge: orchestrator.mergeTags,
  })
}

/**
 * FR-24.14: merge a whole selection of tags into one of them.
 *
 * The orchestrator's `mergeTagsMany` and not a loop over `mergeTags`: the
 * plan has to be made once over the set, or an item carrying two of the
 * picked tags is re-pointed twice onto the survivor.
 */
async function mergeTagsSelected(tags: Tag[]) {
  // The manager stays open and the mode stays on: tidying an axis is rarely
  // one merge, and the merged tags leave the selection by themselves — they
  // are gone from `tagList`, which is what the picked set is read against.
  await promptTagMergeMany(tags, {
    usage: tagUsage.value,
    merge: orchestrator.mergeTagsMany,
  })
}

/**
 * FR-24.10 / ADR-063: a tag items still carry is not deleted — and the
 * refusal is not a dead end. It states the count and offers the merge,
 * because „geht nicht" without a way forward is what sends a person back to
 * retagging 49 items by hand.
 */
async function removeTag(tag: Tag) {
  const { kind, references } = tagDeletion(tag.id, masterStore.itemTagList)
  if (kind === TAG_DELETE_REFUSED) {
    const merge = await confirmAction({
      header: t('items.tagInUseTitle', { tag: tag.name }),
      message: t('items.tagInUseBody', { n: references }),
      confirmLabel: t('items.tagInUseConfirm'),
      testid: 'm9-tag-in-use',
    })
    if (merge) await mergeTag(tag)
    return
  }

  const ok = await confirmDestructive({
    header: t('items.tagDeleteTitle', { tag: tag.name }),
    message: t('items.tagDeleteBody'),
    confirmLabel: t('items.tagDeleteConfirm'),
    testid: 'm9-tag-delete-confirm',
  })
  if (!ok) return

  const result = orchestrator.deleteTag(tag.id)
  if (result.ok) await presentToast({ message: t('items.tagDeleted', { tag: tag.name }) })
}

/**
 * FR-24.13: the tag whose mark is being chosen. The picker is the item
 * mark's own (FR-28.2), opened over the manager — a sheet over a sheet, like
 * the rename prompt, so the manager is still where the user left it.
 */
const markingTag = ref<Tag | null>(null)

function onTagMarkPicked(mark: string | null) {
  if (markingTag.value) orchestrator.setTagMark(markingTag.value.id, mark)
}

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

/**
 * The tags a bulk action may act with (FR-24.9): giving offers the whole
 * vocabulary, taking offers only what the selection carries — an action that
 * can change nothing is not offered.
 */
const bulkTags = computed(() =>
  bulkSheet.value === 'take'
    ? tagsOfItems(selectedItems.value, masterStore.itemTagList, masterStore.tagList)
    : masterStore.tagList,
)

/** How many of the *selected* items already carry each tag. */
const bulkCounts = computed(() => tagCounts(selectedItems.value, masterStore.itemTagList))

/**
 * The last batch's undo, live for as long as its snackbar (FR-24.9). One
 * batch at a time. A retire is deliberately not in here — see
 * `retireSelected`.
 *
 * A closure rather than a record, because the actions no longer undo the same
 * *shape*: a tag batch puts assignments back where they were, an assignee
 * batch writes each item's own previous value, a link removes rows that were
 * not there before. Each action's own group knows how to reverse it, so what
 * the screen holds is the call, not the data (`useRowUndo` is the same shape).
 */
let bulkUndo: (() => void) | null = null

function undoBulk() {
  const undo = bulkUndo
  bulkUndo = null
  undo?.()
}

async function announceBulk(message: string) {
  await presentToast({
    message,
    buttons: [{ text: t('items.bulkUndo'), handler: () => undoBulk() }],
  })
}

/**
 * Give the chosen tag to the selection, optionally filing them under it.
 * `fresh` says the tag was created for this batch, so the undo removes it too.
 */
async function giveTag(tagId: string, primary: boolean, fresh = false) {
  const { touched, undo } = orchestrator.giveTagToItems(selectedItems.value, tagId, primary, fresh)
  bulkSheet.value = null
  if (touched === 0) {
    await presentToast({ message: t('items.bulkNothingToDo') })
    return
  }
  bulkUndo = () => orchestrator.undoBulkTag(undo)
  endSelecting()
  await announceBulk(
    t(fresh ? 'items.bulkGaveNew' : 'items.bulkGave', { n: touched, tag: tagName(tagId) }),
  )
}

/** FR-24.9: the typed name no tag held — create it, then give it like any other. */
async function createAndGive({ name, primary }: { name: string; primary: boolean }) {
  await giveTag(orchestrator.createTag(name), primary, true)
}

/** Take the chosen tag away from every selected item that carries it. */
async function takeTag(tagId: string) {
  const { touched, undo } = orchestrator.takeTagFromItems(selectedItems.value, tagId)
  bulkSheet.value = null
  if (touched === 0) {
    await presentToast({ message: t('items.bulkNothingToDo') })
    return
  }
  bulkUndo = () => orchestrator.undoBulkTag(undo)
  endSelecting()
  await announceBulk(t('items.bulkTook', { n: touched, tag: tagName(tagId) }))
}

function tagName(tagId: string): string {
  return masterStore.tagList.find((tag) => tag.id === tagId)?.name ?? tagId
}

// --- FR-24.9 widened: what else a selection can be acted on with ---------

/** What the ⋯ sheet offers besides the two tag actions. */
const MORE_ASSIGNEE = 'assignee'
/** FR-24.15: merge the picked rows into one of them. */
const MORE_MERGE = 'merge'
type MoreAction = typeof MORE_ASSIGNEE | typeof MORE_MERGE | DependencyLinkDirection

/**
 * The three later actions live behind one glyph rather than beside the two
 * tag ones (FR-24.9): at 390 px the bar carries four controls before the
 * labels clip, and the two tag actions are the ones the mode was measured on.
 * A sheet also has room for the words each of these needs — „Hängt ab von"
 * alone does not say which end of the edge the selection is on.
 */
async function openMore() {
  const sheet = await actionSheetController.create({
    header: t('items.bulkMoreTitle'),
    buttons: [
      // G-8: absent where there is nobody to assign to, not offered and refused.
      ...(canAssign.value ? [{ text: t('items.bulkAssignee'), data: MORE_ASSIGNEE }] : []),
      { text: t('items.bulkDependsOn'), data: DEPENDENCY_LINK_MAIN },
      { text: t('items.bulkCompanion'), data: DEPENDENCY_LINK_COMPANION },
      // FR-24.15: two rows are the fewest that can be the same thing.
      ...(selected.value.size > 1 ? [{ text: t('items.bulkMerge'), data: MORE_MERGE }] : []),
      { text: t('common.cancel'), role: 'cancel' },
    ],
  })
  await sheet.present()
  const { data, role } = await sheet.onDidDismiss()
  if (role === 'cancel' || typeof data !== 'string') return
  const action = data as MoreAction
  if (action === MORE_ASSIGNEE) assigneeSheet.value = true
  else if (action === MORE_MERGE) mergeSheet.value = true
  else dependencySheet.value = action
}

/** How many of the selection already name each account, and how many nobody. */
const assigneeCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const item of selectedItems.value) {
    const id = item.default_assignee_id ?? null
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
})

const unassignedCount = computed(
  () => selectedItems.value.filter((item) => !item.default_assignee_id).length,
)

/** Name who the selection is usually assigned to, or nobody (FR-1.9). */
async function assignSelected({ userId }: { userId: string | null }) {
  const { touched, undo } = orchestrator.assignDefaultAssignee(selectedItems.value, userId)
  assigneeSheet.value = false
  if (touched === 0) {
    await presentToast({ message: t('items.bulkNothingToDo') })
    return
  }
  bulkUndo = () => orchestrator.undoBulkAssignee(undo)
  endSelecting()
  await announceBulk(
    userId
      ? t('items.bulkAssigned', { n: touched, name: userName(userId) })
      : t('items.bulkUnassigned', { n: touched }),
  )
}

/**
 * The picked rows as FR-24.15's sheet reads them: the tags they carry and how
 * much of the product resolves against each — the two facts the choice of
 * survivor actually turns on.
 */
const mergeCandidates = computed<MergeCandidate[]>(() =>
  selectedItems.value.map((item) => ({
    item,
    tags: masterStore.getItemTags(item.id).map((tag) => tag.name),
    uses: orchestrator.masterItemDeletionOutlook(item.id).references,
  })),
)

/**
 * FR-24.15: merge the selection into the row the sheet names.
 *
 * The confirm is what the act owes — it has no undo, and the losing rows are
 * retired or removed by FR-24.3 at the end of it. Afterwards the screen says
 * what was *taken over*, because the survivor quietly gaining a weight, a
 * photo or a mark is the part a user cannot see from the list.
 */
async function mergeSelected(survivorId: string) {
  const losers = selectedItems.value.filter((item) => item.id !== survivorId)
  const survivor = masterStore.getItem(survivorId)
  mergeSheet.value = false
  if (!survivor || losers.length === 0) return

  const ok = await confirmDestructive({
    header: t('items.mergeTitle'),
    message: t('items.mergeConfirmBody', { n: losers.length, name: survivor.name }),
    confirmLabel: t('items.mergeConfirm'),
    testid: 'm9-merge-confirm',
  })
  if (!ok) return

  const photoFrom = survivor.image_hash ? null : losers.find((item) => item.image_hash)
  const outcome = orchestrator.mergeMasterItems(
    survivorId,
    losers.map((item) => item.id),
  )
  // The bytes are the one part of a merge that is not a mutation (ADR-002),
  // so they move after the rows and only where the survivor had no photo.
  if (photoFrom) await orchestrator.copyItemImage(photoFrom, survivor)

  endSelecting()
  await announceBulk(
    [
      t('items.merged', { n: outcome.merged, name: survivor.name }),
      outcome.filled.length > 0 || photoFrom
        ? t('items.mergedTook', {
            what: [
              ...outcome.filled.map((field) => t(`items.field.${field}`)),
              ...(photoFrom ? [t('items.field.photo')] : []),
            ].join(', '),
          })
        : '',
      outcome.positions > 0 ? t('items.mergedPositions', { n: outcome.positions }) : '',
      outcome.edgesDropped > 0 ? t('items.mergedEdges', { n: outcome.edgesDropped }) : '',
    ]
      .filter(Boolean)
      .join(' '),
  )
}

function userName(userId: string): string {
  return directory.value.find((user) => user.user_id === userId)?.display_name ?? userId
}

/**
 * Link the selection to one item (FR-20.1 over FR-24.9), in the direction the
 * sheet was opened for.
 *
 * **The result names what was skipped rather than hiding it.** A batch is
 * planned per item (`planDependencyBatch`), so a selection holding the picked
 * item itself, or one already linked, or one the edge would send in a circle,
 * writes the rest and reports the remainder — an all-or-nothing refusal would
 * leave the user to find the offender among fifty rows.
 */
async function linkSelected({ itemId, mode }: { itemId: string; mode: DependencyMode }) {
  const direction = dependencySheet.value
  if (!direction) return
  const { plan, undo } = orchestrator.linkItemsToDependency(
    selectedItems.value,
    itemId,
    direction,
    mode,
  )
  dependencySheet.value = null

  const written = plan.edges.length
  if (written === 0) {
    await presentToast({ message: t('items.bulkLinkedNothing') })
    return
  }
  bulkUndo = () => orchestrator.undoBulkDependency(undo)
  endSelecting()

  const linked = t('items.bulkLinked', { n: written, name: itemName(itemId) })
  const skipped = plan.skipped.length
  // Two sentences, joined here rather than in the catalogue: the skipped
  // half has its own plural, and one entry cannot carry two of them.
  await announceBulk(
    skipped > 0 ? `${linked}. ${t('items.bulkLinkedSkipped', { n: skipped })}` : linked,
  )
}

function itemName(itemId: string): string {
  return masterStore.getItem(itemId)?.name ?? itemId
}

/**
 * Retire the selection (FR-24.9 over FR-24.3).
 *
 * The confirm states **both** numbers, because a delete is two different acts
 * and a batch spanning them may not report one of them: a row something
 * references is hidden and kept, one nothing has ever used is removed for
 * good. There is deliberately **no undo** — the removed half cannot come back
 * (nothing was tombstoned to restore), so the honest safety is the sentence
 * before the act, which is also what M10's own delete card does. The hidden
 * half is recoverable where it always was, on M23.
 */
async function retireSelected() {
  const items = selectedItems.value
  if (items.length === 0) return
  const outlooks = items.map((item) => orchestrator.masterItemDeletionOutlook(item.id))
  const hidden = outlooks.filter((o) => o.kind === DELETION_RETIRE).length
  const removed = items.length - hidden

  const ok = await confirmDestructive({
    header: t('items.bulkRetireTitle', { n: items.length }),
    message: bulkRetireSentence(hidden, removed),
    confirmLabel: t('items.bulkRetireConfirm'),
    testid: 'm9-bulk-retire-confirm',
  })
  if (!ok) return

  for (const item of items) orchestrator.deleteMasterItem(item.id)
  bulkUndo = null
  endSelecting()
  await presentToast({ message: t('items.bulkRetired', { n: items.length }) })
}

// --- FR-24.11: what the search did not find, it offers to create ---------

/**
 * The offer above the results. Not while the partition is still arriving
 * (ADR-033 — „no such item" is a claim about a list the device may not hold
 * yet) and not in the selection mode, where rows do not navigate and a
 * creation would drop the selection the user is building.
 */
const offer = computed(() =>
  searching.value && itemsKnown.value && !selecting.value
    ? searchOffer(search.value, masterStore.activeItemList, masterStore.retiredItemList)
    : null,
)

const createOpen = ref(false)

/**
 * The item this screen just created or restored, marked in the results until
 * the query changes: the row is the confirmation, and the list may hold a
 * dozen partial hits it has to be told apart from.
 */
const freshId = ref<string | null>(null)
watch(search, () => (freshId.value = null))

/**
 * The tags the list is filtered by are the new item's from the start: without
 * them it would vanish from the filtered list the moment it exists, which
 * reads as a failed write. The untagged bucket is not a tag, so it assigns
 * nothing — and an untagged item is exactly what lands in it.
 */
const createTagIds = computed(() => selection.value.filter((id) => id !== UNTAGGED_KEY))

/**
 * The tags of the items the query found *by name*, in hit order: „Zelt" finds
 * the pegs and the groundsheet, so the tent is most likely „Camping" too.
 */
const preferredTagIds = computed(() => {
  const ids: string[] = []
  for (const hit of hits.value) {
    if (hit.reason !== 'name') continue
    for (const tag of masterStore.getItemTags(hit.id)) if (!ids.includes(tag.id)) ids.push(tag.id)
  }
  return ids
})

async function takeOffer() {
  const current = offer.value
  if (!current) return
  if (current.kind === OFFER_CREATE) {
    createOpen.value = true
    return
  }
  if (!orchestrator.restoreMasterItem(current.id)) return
  freshId.value = current.id
  await presentToast({
    message: t('retired.restored', { name: current.name }),
    positionAnchor: FAB_ANCHOR.m9,
  })
}

/** Enter opens the sheet and never writes: a typo must not become an item. */
function onSearchSubmit() {
  if (offer.value?.kind === OFFER_CREATE) createOpen.value = true
}

async function onCreated({ id, name, open }: { id: string; name: string; open: boolean }) {
  createOpen.value = false
  freshId.value = id
  if (open) {
    await router.push(itemPath(id))
    return
  }
  // Above the ＋, not over it: the tab bar is what the helper would clear, and
  // the FAB sits higher — measured on the rendered screen at 390 px.
  await presentToast({
    message: t('items.created', { name }),
    positionAnchor: FAB_ANCHOR.m9,
    buttons: [{ text: t('items.createdOpen'), handler: () => void router.push(itemPath(id)) }],
  })
}

function newItem() {
  // FR-24.5: creation is the editor in its minimal mode, not a prompt —
  // a name typed into an alert cannot carry tags or a weight.
  router.push(PATH.newItem)
}

/** How many items FR-24.3 has hidden from this list (ADR-032). */
const retiredCount = computed(() => masterStore.retiredItemList.length)

/** The groups as the jump sheet lists them (FR-24.8). */
const jumpGroups = computed(() =>
  groups.value.map(([key, items]) => ({ key, label: groupLabel(key), count: items.length })),
)

/** Whether jumping is a question at all: one group is already on screen. */
const canJump = computed(
  () => !searching.value && sort.value === 'grouped' && jumpGroups.value.length > 1,
)

/**
 * The section elements, by group key, so a jump has something to scroll to.
 * A Map filled by the template rather than a query on `document`: the page is
 * mounted twice during an Ionic transition, and a selector would find the
 * outgoing copy as readily as this one.
 */
const sections = new Map<string, HTMLElement>()

function registerSection(key: string, ref: unknown) {
  // A component ref: the group's element is behind `$el`.
  const el = (ref as ComponentPublicInstance | null)?.$el
  if (el instanceof HTMLElement) sections.set(key, el)
  else sections.delete(key)
}

/** The group whose rows the list is showing — what the sheet marks. */
const currentGroup = ref<string | null>(null)

/**
 * The jump waits for the sheet to be *gone*, not merely closed.
 *
 * While an Ionic overlay is presented the scroll host is locked
 * (`backdrop-no-scroll`), so a `scrollTo` issued in the same breath as the
 * dismissal is clamped: measured on the family instance, a jump to the last
 * group moved the list 120 px instead of 9 000. Keeping the key until the
 * sheet reports it has dismissed makes the scroll a consequence of a settled
 * state rather than a race against an animation.
 */
const pendingJump = ref<string | null>(null)

function requestJump(key: string) {
  pendingJump.value = key
  jumpOpen.value = false
}

function onJumpDismissed() {
  jumpOpen.value = false
  const key = pendingJump.value
  pendingJump.value = null
  if (key !== null) void jumpTo(key)
}

async function openJump() {
  // The sheet opens either way: which group is on screen decorates it, and a
  // measurement that failed must not cost the control.
  currentGroup.value = await topmostGroup()
  jumpOpen.value = true
}

/** The first group whose heading has not yet scrolled past the tool bar. */
async function topmostGroup(): Promise<string | null> {
  const scroller = await scrollElement()
  if (!scroller) return null
  const box = scroller.getBoundingClientRect()
  const edge = box.top + toolsHeight.value
  let last: string | null = null
  for (const [key] of groups.value) {
    const el = sections.get(key)
    if (!el) continue
    if (el.getBoundingClientRect().top <= edge + 1) last = key
    else break
  }
  return last ?? groups.value[0]?.[0] ?? null
}

/**
 * Scroll the group into view (FR-24.8). It **scrolls and does not anchor**
 * (owner decision, 2026-09-13): the rows above stay where they are, so a jump
 * is undone by scrolling back rather than by a second jump.
 *
 * The offset is computed from the two boxes rather than from `offsetTop`,
 * which is relative to whichever ancestor happens to be positioned — inside
 * `ion-content` that is not the scroller.
 */
async function jumpTo(key: string) {
  const scroller = await scrollElement()
  const section = sections.get(key)
  if (!scroller || !section) return
  const top =
    scroller.scrollTop +
    section.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top -
    toolsHeight.value
  scroller.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
}

const contentEl = useTemplateRef<ComponentPublicInstance>('content')

/**
 * `ion-content`'s own scroller — the element an offset is real in.
 *
 * Two hops rather than one: a template ref on an Ionic component resolves to
 * the *component instance*, so the custom element (and with it
 * `getScrollElement`) is behind `$el`. Reading it directly is the mistake
 * that silently wedged the jump sheet: the await threw, and the sheet that
 * was to open after it never did.
 */
async function scrollElement(): Promise<HTMLElement | null> {
  const el = contentEl.value?.$el as HTMLIonContentElement | undefined
  return el?.getScrollElement ? await el.getScrollElement() : null
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
    <IonContent ref="content">
      <!-- FR-24.9: while the mode is on, the bar says what it will act on —
           above the tools rather than replacing them, so search and the tag
           chips stay reachable to narrow what „Alle N" takes. -->
      <SelectionBar
        v-if="selecting"
        class="selbar"
        :count="selected.size"
        :total="shownItems.length"
        testid="m9"
        @exit="endSelecting"
        @all="toggleAll"
      />

      <!-- FR-24.6: the tools stay while the list moves. -->
      <div
        v-if="!knownEmpty"
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
          @submit="onSearchSubmit"
        />

        <!-- FR-24.8: the three biggest tags, then the door to the rest. The
             swipe axis this replaces showed four of twenty-four chips and
             clipped the fourth mid-word. -->
        <div class="toolrow">
          <button
            v-for="tag in topTags"
            :key="tag.id"
            type="button"
            class="chip"
            :class="{ active: selection.includes(tag.id) }"
            :aria-pressed="selection.includes(tag.id)"
            :data-testid="`m9-tag-chip-${tag.name}`"
            :title="tag.name"
            @click="toggleTag(tag.id)"
          >
            <ItemMark :mark="tag.icon ?? null" surface="plain" :size="16" />
            <span class="chip-label">{{ tag.name }}</span>
            <span class="chip-count jp-num">{{ counts.get(tag.id) ?? 0 }}</span>
          </button>

          <button
            v-if="masterStore.tagList.length > 0"
            type="button"
            class="chip"
            :class="{ active: filtering }"
            data-testid="m9-filter-open"
            @click="filterOpen = true"
          >
            <IonIcon :icon="funnelOutline" />
            {{ t('items.filterAll', { n: masterStore.tagList.length }) }}
            <span v-if="selection.length > 0" class="chip-count jp-num">{{
              selection.length
            }}</span>
          </button>

          <!-- A chosen tag that is not one of the three still travels with the
               bar: a filter the bar cannot show is one the user cannot see. -->
          <button
            v-for="entry in extraSelected"
            :key="entry.id"
            type="button"
            class="chip active"
            :aria-label="t('items.clearTag', { tag: entry.label })"
            :data-testid="`m9-clear-tag-${entry.label}`"
            @click="dropSelected(entry.id)"
          >
            {{ entry.label }}
            <IonIcon :icon="closeOutline" />
          </button>
        </div>
      </div>

      <!-- FR-24.11: the name the search did not find, offered at the top —
           with the keyboard up, the end of a list of partial hits is out of
           reach. The same place whether or not anything matched. -->
      <SearchOfferButton v-if="offer" :offer="offer" testid="m9-offer" @take="takeOffer" />

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
        :title="
          filterName
            ? t('items.noMatchInTag', { tag: filterName })
            : filtering
              ? t('items.noMatchInFilter')
              : t('items.noMatch')
        "
        :hint="
          hitsOutsideFilter.length > 0
            ? t('items.noMatchElsewhere', { n: hitsOutsideFilter.length })
            : undefined
        "
        testid="m9-no-match"
      >
        <IonButton
          v-if="filtering"
          fill="outline"
          size="small"
          data-testid="m9-search-everywhere"
          @click="selection = []"
        >
          {{ hitsOutsideFilter.length > 0 ? t('items.searchAll') : t('items.clearFilter') }}
        </IonButton>
      </EmptyState>

      <IonList v-else class="groups" :style="{ '--list-group-top': `${toolsHeight}px` }">
        <!-- FR-24.8: the heading is the jump control. The axis was used to
             *get somewhere*, not to filter — 3 of 184 items carry a second
             tag — so the navigation is named as navigation and the list
             stays whole. It stays under the tool bar while its rows scroll
             (FR-24.6). -->
        <ListGroup
          v-for="[key, groupItems] in searching ? resultGroups : groups"
          :key="key"
          :ref="(el) => registerSection(key as string, el)"
          :title="searching ? reasonLabel(key as MatchReason) : groupLabel(key)"
          :count="groupItems.length"
          sticky
          :jumpable="canJump"
          head-testid="m9-group-head"
          jump-testid="m9-jump-open"
          @jump="openJump"
        >
          <template v-if="groupMark(key)" #mark>
            <ItemMark :mark="groupMark(key)" surface="plain" :size="16" />
          </template>
          <IonItem
            v-for="item in groupItems"
            :key="item.id"
            button
            :detail="false"
            :data-selected="selecting && selected.has(item.id) ? 'true' : undefined"
            data-testid="m9-row"
            @click="onRowClick(item)"
            @pointerdown="(e: PointerEvent) => rows.press(item.id, e)"
            @pointermove="rows.move"
            @pointerup="rows.release"
            @pointercancel="rows.release"
            @contextmenu.prevent="rows.contextMenu(item.id)"
          >
            <!-- FR-24.9: a tap opens the item, a hold (or right-click) starts
                 a selection with it; while selecting, the same tap picks the
                 row. The whole row is the surface — M9 has no grip to share
                 it with (ADR-075). No `routerLink`: its shadow anchor, left
                 with an empty href while selecting, reloaded the app on a
                 tap — which every bulk case, tapping rows in the mode, would
                 see. -->
            <SelectBox
              v-if="selecting"
              slot="start"
              :on="selected.has(item.id)"
              :data-testid="`m9-row-check-${item.name}`"
            />
            <!-- FR-28.4 + FR-24.13: photo → mark → the primary tag's mark →
                 the tag initial. The inventory is
                 where an item is identified, so this ladder never ends in
                 nothing and the column stays aligned. -->
            <ItemMark
              slot="start"
              :mark="item.icon ?? null"
              :tag-mark="primaryTagMark(item)"
              surface="inventory"
              :photo-item="item"
              :initial="avatarGlyph(item)"
              :size="34"
              class="row-mark"
            />

            <IonLabel>
              <h2>
                {{ item.name }}
                <span v-if="item.id === freshId" class="row-new" data-testid="m9-row-new">{{
                  t('items.rowNew')
                }}</span>
              </h2>
              <!-- FR-24.7: a row that matched through something other than
                   its name says what, or it reads as a bug. -->
              <p v-if="searching && viaOf.get(item.id)" class="row-via" data-testid="m9-row-via">
                {{ t('items.matchVia', { via: viaOf.get(item.id)! }) }}
              </p>
              <!-- FR-1.9: whose job this usually is, where the device asked
                   for it and there is an account to name (G-8). -->
              <p v-if="assigneeOf(item)" class="row-assignee" data-testid="m9-row-assignee">
                <IonIcon :icon="personOutline" />
                {{ assigneeOf(item) }}
              </p>
              <!-- FR-24.4: only when the device asked for them. -->
              <div v-if="props.isShown('tags')" class="row-tags">
                <span v-for="tag in masterStore.getItemTags(item.id)" :key="tag.id" class="row-tag">
                  {{ tag.name }}
                </span>
              </div>
            </IonLabel>

            <div v-if="extrasFor(item).length > 0" slot="end" class="row-extras">
              <span v-for="extra in extrasFor(item)" :key="extra">{{ extra }}</span>
            </div>
            <IonIcon
              v-if="!selecting"
              slot="end"
              :icon="chevronForwardOutline"
              class="row-chevron"
            />
          </IonItem>
        </ListGroup>
      </IonList>

      <!--
        The foot of the list: what the screen is *not* showing, in two
        sentences that are each the way to it. One block, so the clearance
        the FAB needs is paid once below both rather than between them.

        FR-24.12 first: what a cleanup rule found — a sentence here rather
        than a banner over a list that is not wrong, only untidy.

        FR-24.3's other half, said out loud. A retired item is hidden from
        this list by design (ADR-032), but until now nothing here admitted
        the hidden ones exist — so „25 Artikel" read as the whole
        collection, and the way back to them (M23) was reachable only by
        someone who already knew it was there.

        Both behind `itemsKnown` for ADR-033's reason: a partition that has
        not arrived has no findings and no retired rows, and „nothing to
        tidy" and „nothing is hidden" are claims.
      -->
      <div
        v-if="itemsKnown && !selecting && (hygiene.total > 0 || retiredCount > 0)"
        class="retired-note"
      >
        <button
          v-if="hygiene.total > 0"
          type="button"
          data-testid="m9-cleanup-note"
          @click="router.push(PATH.inventoryCleanup)"
        >
          {{ t('items.cleanupHint', { n: hygiene.total }) }}
        </button>
        <button
          v-if="retiredCount > 0"
          type="button"
          data-testid="m9-retired-note"
          @click="router.push(PATH.masterRetired)"
        >
          {{ t('items.retiredHint', { n: retiredCount }) }}
        </button>
      </div>

      <!-- FR-24.9: what the selection can be acted on with. -->
      <BulkBar v-if="selecting && selected.size > 0" data-testid="m9-bulkbar">
        <button type="button" data-testid="m9-bulk-give" @click="bulkSheet = 'give'">
          <IonIcon :icon="pricetagsOutline" />
          {{ t('items.bulkGive') }}
        </button>
        <button type="button" data-testid="m9-bulk-take" @click="bulkSheet = 'take'">
          <IonIcon :icon="removeCircleOutline" />
          {{ t('items.bulkTake') }}
        </button>
        <button type="button" data-testid="m9-bulk-more" @click="openMore">
          <IonIcon :icon="ellipsisHorizontalOutline" />
          {{ t('items.bulkMore') }}
        </button>
        <button type="button" class="danger" data-testid="m9-bulk-retire" @click="retireSelected">
          <IonIcon :icon="trashOutline" />
          {{ t('items.bulkRetire') }}
        </button>
      </BulkBar>

      <BulkTagSheet
        :is-open="bulkSheet !== null"
        :mode="bulkSheet ?? 'give'"
        :tags="bulkTags"
        :counts="bulkCounts"
        :selected="selected.size"
        @dismiss="bulkSheet = null"
        @create="createAndGive"
        @pick="
          ({ tagId, primary }) => (bulkSheet === 'take' ? takeTag(tagId) : giveTag(tagId, primary))
        "
      />

      <!-- FR-24.15: which of the picked rows stays, and what each brings. -->
      <MergeItemsSheet
        :is-open="mergeSheet"
        :candidates="mergeCandidates"
        @dismiss="mergeSheet = false"
        @pick="mergeSelected"
      />

      <BulkAssigneeSheet
        :is-open="assigneeSheet"
        :directory="directory"
        :counts="assigneeCounts"
        :selected="selected.size"
        :unassigned="unassignedCount"
        @dismiss="assigneeSheet = false"
        @pick="assignSelected"
      />

      <BulkDependencySheet
        :is-open="dependencySheet !== null"
        :direction="dependencySheet ?? DEPENDENCY_LINK_MAIN"
        :items="masterStore.activeItemList"
        :selected="selected.size"
        @dismiss="dependencySheet = null"
        @pick="linkSelected"
      />

      <IonFab v-if="!selecting" :id="FAB_ANCHOR.m9" vertical="bottom" horizontal="end" slot="fixed">
        <IonFabButton :aria-label="t('items.new')" data-testid="m9-fab" @click="newItem">
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>

      <CreateItemSheet
        :is-open="createOpen"
        :name="offer?.name ?? ''"
        :tag-ids="createTagIds"
        :preferred-tag-ids="preferredTagIds"
        @dismiss="createOpen = false"
        @created="onCreated"
      />

      <!-- FR-24.8: everything the three chips do not offer. -->
      <TagFilterSheet
        :is-open="filterOpen"
        :tags="masterStore.tagList"
        :counts="counts"
        :untagged-count="untaggedCount"
        :selection="selection"
        :mode="filterMode"
        :shown="shownCount"
        @dismiss="filterOpen = false"
        @update:selection="selection = $event"
        @update:mode="filterMode = $event"
      />

      <!-- FR-24.10: where a tag itself is renamed, merged, reordered, deleted. -->
      <TagManagerSheet
        :is-open="tagsOpen"
        :tags="masterStore.tagList"
        :counts="tagUsage"
        @dismiss="tagsOpen = false"
        @rename="renameTag"
        @merge="mergeTag"
        @merge-many="mergeTagsSelected"
        @remove="removeTag"
        @move="orchestrator.reorderTags"
        @mark="markingTag = $event"
      />

      <!-- FR-24.13: a tag's mark, chosen with the item mark's own picker. -->
      <MarkPicker
        :is-open="markingTag !== null"
        :name="markingTag?.name ?? ''"
        :current="markingTag?.icon ?? null"
        @pick="onTagMarkPicked"
        @close="markingTag = null"
      />

      <GroupJumpSheet
        :is-open="jumpOpen"
        :groups="jumpGroups"
        :current="currentGroup"
        @dismiss="onJumpDismissed"
        @jump="requestJump"
      />

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
            <IonItem v-for="key in offeredProperties(canAssign)" :key="key" lines="full">
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
/* FR-24.9: the selection's own bar stays at the top while the list scrolls,
   above the tools (which it covers only while it is there). */
.selbar {
  position: sticky;
  top: 0;
  z-index: 3;
}

/* A note, not a row: it reports on what the list does *not* contain, so it
   must not read as one more item in it.

   The wrapper is what spans the width; the button is only as wide as its
   own text. A full-width tap target here runs under the FAB, and the
   rendered screen is the only thing that says so — every tap on the right
   third would have opened the item editor instead of M23. The bottom
   padding clears the FAB for the same reason, so the note can be read as
   well as hit. */
.retired-note {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18px 4px 96px;
}

.retired-note button {
  background: none;
  border: 0;
  padding: 10px 14px;
  color: var(--ct-overlay2);
}

.row-new {
  margin-inline-start: 6px;
  padding: 0 7px;
  border: 1px solid var(--jp-done);
  border-radius: var(--jp-r-pill);
  color: var(--jp-done);
  font-size: var(--jp-text-xs);
  vertical-align: middle;
}

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

/* A tag name is free text, and this instance's longest is „Elektronisches
   Zubehör": left alone, three chips plus the two controls wrap to three rows,
   and the bar is sticky — that height is spent on every screen of the list.
   The count stays outside the clamp, because a chip without its number is a
   chip that stopped saying what it leads to. */
.chip-label {
  min-width: 0;
  max-width: 10rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-count {
  color: var(--ct-overlay1);
  font-size: var(--jp-text-xs);
}

.chip.active .chip-count {
  color: var(--jp-action);
}

.chip ion-icon {
  font-size: var(--jp-icon-xs);
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

/* FR-1.9: one quiet line under the name, the weight of the „via" line above
   it — the account is context for the row, never its headline. */
.row-assignee {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--ct-subtext0);
}

.row-assignee ion-icon {
  font-size: var(--jp-icon-xs);
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
