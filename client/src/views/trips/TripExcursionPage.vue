<script setup lang="ts">
/**
 * One excursion's list (FR-31.6) — the packing list, smaller, and built from
 * M4's own parts so it reads and works like it: the sticky progress line that
 * yields to the list (`useHeadScroll`), the search, filter sheet and fold-all
 * in the app bar, the collapsible group heads, `PackingRow` with its stepper
 * and glyphs, FR-25.1's `ClusterHead`, M4's row menu (`rowMenuEntries`, the
 * same labels) and snackbar with its one undo, the amount popover, M4's empty
 * states, the detail as a sheet or a side panel on the route (`?line=`), and
 * the orange ＋ that opens M4's quick-add with its browse verbs and *für wen*
 * strip — over the people going (FR-31.5). What a line needs done stands
 * under its name (`ExcursionFacts`); what the excursion needs done — edit it,
 * save it as a Gruppe, delete it — is in the bar's ⋮.
 */
import {
  IonButton,
  IonContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonList,
  IonPage,
  IonPopover,
  actionSheetController,
} from '@ionic/vue'
import {
  addOutline,
  bagAddOutline,
  bagHandleOutline,
  cartOutline,
  chevronDownOutline,
  contractOutline,
  createOutline,
  cubeOutline,
  documentAttachOutline,
  expandOutline,
  funnelOutline,
  gitBranchOutline,
  layersOutline,
  trashOutline,
} from 'ionicons/icons'
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EmptyState from '@/components/global/EmptyState.vue'
import FilterSheet from '@/components/global/FilterSheet.vue'
import IdeaOrigin from '@/components/global/IdeaOrigin.vue'
import ProgressFigure from '@/components/global/ProgressFigure.vue'
import ExcursionExtraList from '@/components/trips/ExcursionExtraList.vue'
import { EXCURSION_EXTRA_LINES, extraLinesOf, withExtraUnits } from '@/kernel/excursionExtraLines'
import QuantityEditor from '@/components/global/QuantityEditor.vue'
import QuickAddItem, { type BrowseAddition } from '@/components/global/QuickAddItem.vue'
import RevealBar from '@/components/global/RevealBar.vue'
import SearchRow from '@/components/global/SearchRow.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import TrackEditor from '@/components/global/TrackEditor.vue'
import TrackSummary from '@/components/global/TrackSummary.vue'
import ClusterHead from '@/components/trips/ClusterHead.vue'
import ExcursionFacts from '@/components/trips/ExcursionFacts.vue'
import ExcursionItemSheet from '@/components/trips/ExcursionItemSheet.vue'
import ExcursionNotes from '@/components/trips/ExcursionNotes.vue'
import ExcursionSheet, { type ExcursionSheetResult } from '@/components/trips/ExcursionSheet.vue'
import PackingRow, { type PackingRowNotes } from '@/components/trips/PackingRow.vue'
import TravelerProgressStrip from '@/components/trips/TravelerProgressStrip.vue'
import { useContextSearch } from '@/composables/useContextSearch'
import { setHeaderActions } from '@/composables/shared/useHeaderActions'
import { useHeadScroll } from '@/composables/useHeadScroll'
import { setHeaderTitle } from '@/composables/shared/useHeaderTitle'
import { useLongPress } from '@/composables/shared/useLongPress'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { usePackAnnouncer } from '@/composables/usePackAnnouncer'
import { usePackingFilter } from '@/composables/usePackingFilter'
import type { RowUndoRecord } from '@/composables/useRowUndo'
import { useTrackOwner } from '@/composables/shared/useTrackOwner'
import { useTripScreen } from '@/composables/shared/useTripScreen'
import { browseRowStates } from '@/domain/browseRows'
import {
  canAdoptIntoInventory,
  canJoinPackingList,
  draftLinesFor,
  excursionLineAsRow,
  excursionMenuEntries,
  isLeftBehind,
  isOpenPurchase,
  namesItsParticipants,
  participantsOf,
  spanOf,
  suitcaseOf,
  sumUnits,
  type ExcursionMenuAction,
  type LineFor,
} from '@/domain/excursions'
import { durationDays } from '@/domain/instantiate'
import { MAX_TRACKS, decodeLine, movingMinutes } from '@/domain/track'
import { buildPackingView } from '@/domain/packingView'
import { packedPercent, stateFor } from '@/domain/packState'
import { quantityChoices } from '@/domain/quantityChoices'
import type { RowMenuAction } from '@/domain/rowMenu'
import { progressByTraveler, showsTravelerProgress } from '@/domain/travelerProgress'
import { noteThreads, threadsAboutExcursion } from '@/domain/tripNotes'
import { t } from '@/i18n'
import { chooseAction, confirmDestructive, promptText } from '@/composables/shared/confirm'
import { EXCURSION_CONNECTIONS } from '@/kernel/excursionConnections'
import { excursionDays } from '@/lib/excursionText'
import { formatDistance, tracksSummary } from '@/lib/trackFormat'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { PANEL_HOST_SELECTOR } from '@/lib/frameSlots'
import { groupAdditionMessage } from '@/lib/groupAdditionMessage'
import { useTileState } from '@/composables/shared/mapTiles'
import { useRouteFold } from '@/composables/routeFold'
import {
  activeChips as chipsFor,
  emptyReason as emptyReasonFor,
  filterFacets as facetsFor,
  filterSwitches as switchesFor,
  groupingAxis,
  SWITCH_KEYS,
} from '@/lib/packingFilterPanel'
import { collapseRow } from '@/lib/rowCollapse'
import { ROW_MENU_BUTTONS, type RowMenuButton } from '@/lib/rowMenuButtons'
import { sheetBandAttrs } from '@/lib/sheetBands'
import { presentToast } from '@/composables/shared/toast'
import { beforeIsOver, standingOf } from '@/lib/tripPhase'
import { closeOverlayRoute } from '@/composables/shared/closeOverlay'
import {
  LINE_QUERY_PARAM,
  tripExcursionLinePath,
  tripExcursionsPath,
  tripNotesPath,
} from '@/router/paths'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { ExcursionItem, ExcursionTrack, FacetKey, GroupBy, TripItem } from '@/types/domain'
import { ITEM_MODE_BUY_LOCAL, ITEM_MODE_PACK, STATE_SKIPPED } from '@/types/domain'

const props = defineProps<{ tripId: string; excursionId: string }>()

/** M4's header ring (`packing/PackingHeadline.vue`), so the two figures are one size. */
const RING_SIZE_HEADER = 42

/** M4's breakpoint for the detail as a side panel (G-9). */
const DESKTOP_QUERY = '(min-width: 900px)'

/** M4's groupings minus the one an excursion has nothing for — no containers. */
const GROUPING_CONTAINER = 'container'

const orchestrator = useOrchestrator()
/** The planner's section for a connection that belongs to this excursion (FR-29.18). */
const ConnectionsSection = inject(EXCURSION_CONNECTIONS, null)
const tripStore = useTripStore()
const masterStore = useMasterStore()
const router = useRouter()
const route = useRoute()

const { trip, loaded, ensure } = useTripScreen(props.tripId, orchestrator)

const excursion = computed(
  () => tripStore.getExcursions(props.tripId).find((e) => e.id === props.excursionId) ?? null,
)
const travelers = computed(() => tripStore.getTravelers(props.tripId))
const participantRows = computed(() => tripStore.getExcursionTravelers(props.tripId))
const participants = computed(() =>
  participantsOf(props.excursionId, participantRows.value, travelers.value),
)
const lines = computed(() => tripStore.getExcursionItems(props.tripId, props.excursionId))
/** The lines by id, to get from M4's row back to the line it reads. */
const lineById = computed(() => new Map(lines.value.map((l) => [l.id, l])))
function lineOf(item: TripItem): ExcursionItem {
  return lineById.value.get(item.id)!
}
/** The lines as M4's rows — what its view model, browse sheet and undo read. */
const rows = computed(() => lines.value.map(excursionLineAsRow))

// --- M4's view state: filter, reveal, grouping, search (FR-25.11, FR-25.18) ---

/**
 * M4's own composable, scoped to this excursion: the filter for the session,
 * the grouping durably — a Person filter on the hike means nothing on the
 * suitcase, so the two lists keep theirs apart.
 */
const { facets, showDone, groupBy, reset, toggleValue, clearFacet } = usePackingFilter(
  `excursion-${props.excursionId}`,
)
/** A grouping the excursion cannot draw reads as M4's default. */
const shownGroupBy = computed<GroupBy>(() =>
  groupBy.value === GROUPING_CONTAINER ? 'category' : groupBy.value,
)
const {
  term: search,
  isOpen: searchOpen,
  toggle: toggleSearch,
  action: searchAction,
} = useContextSearch('m27-search')
const searching = computed(() => search.value.trim() !== '')
const filterOpen = ref(false)
const collapsedGroups = ref<string[]>([])
/** FR-25.24: per-person clusters the user opened; shut is the default. */
const expandedClusters = ref<string[]>([])

/**
 * M4's own view model over the lines read as M4's rows (FR-31.6): the same
 * grouping, clusters, facets, search, counts and FR-25.2 departure, so the
 * list behaves as the packing list does because it is built by the same
 * function. Nobody's lines are hidden as somebody else's (FR-25.20 is the
 * suitcase's), and no line is packed late (FR-25.27).
 */
const view = computed(() =>
  buildPackingView({
    items: rows.value,
    travelers: travelers.value,
    containers: [],
    participants: [],
    groupBy: shownGroupBy.value,
    showDone: showDone.value,
    facets: facets.value,
    search: search.value,
    currentUserId: null,
    showOthers: true,
    showLate: true,
    collapsedGroups: collapsedGroups.value,
    expandedClusters: expandedClusters.value,
    itemsWithOpenPrep: [],
  }),
)
/**
 * FR-7.15: the threads about this excursion. No reader is named, so none
 * reads as new here — M26's pill already counts that.
 */
const notes = computed(() =>
  threadsAboutExcursion(
    noteThreads(tripStore.getTripComments(props.tripId), [], null),
    props.excursionId,
  ),
)

function openNote(threadId: string) {
  void router.push(tripNotesPath(props.tripId, threadId))
}

/** FR-33.6: another module's lines on this list — a picnic — counted in its share. */
const extraSources = inject(EXCURSION_EXTRA_LINES, [])
const extras = computed(() => extraLinesOf(extraSources, props.tripId, props.excursionId))
const units = computed(() => withExtraUnits(sumUnits(lines.value), extras.value))
const toBuy = computed(() => lines.value.filter(isOpenPurchase).length)
const tripItems = computed(() => tripStore.getItems(props.tripId))

const suitcaseOpen = computed(
  () => trip.value !== undefined && !beforeIsOver(standingOf(trip.value), orchestrator.today()),
)

// An excursion deleted — here or on another device — has nothing left to show.
watch([loaded, excursion], ([ready, current]) => {
  if (ready && !current) void router.replace(tripExcursionsPath(props.tripId))
})

const metaLine = computed(() => {
  const ex = excursion.value
  if (!ex) return null
  const days = excursionDays(spanOf(ex)) ?? t('excursions.undated')
  const who = namesItsParticipants(ex.id, participantRows.value)
    ? participants.value.map((p) => p.name).join(', ')
    : t('excursions.participantsAll')
  return `${days} · ${who}`
})

/** A line says nothing in M4's own note slots — its facts are its own. */
const NO_NOTES: PackingRowNotes = {
  lock: null,
  ownClaim: null,
  skipped: null,
  packed: null,
  responsible: null,
}

function masterOf(sourceItemId: string | null) {
  return sourceItemId ? (masterStore.getItem(sourceItemId) ?? null) : null
}

/** FR-25.29: a tap toggles that person in the person facet — M4's quick filter. */
function selectPerson(value: string) {
  toggleValue('person', value)
}

// --- the folds (view state, as on M4) ---

const allFolded = computed(
  () => view.value.groups.length > 0 && view.value.groups.every((g) => g.collapsed),
)

/** Fold-all turns the list into a table of contents, and back (FR-25.16). */
function toggleFoldAll() {
  collapsedGroups.value = allFolded.value ? [] : view.value.groups.map((g) => g.key)
}

function toggleGroup(key: string) {
  collapsedGroups.value = collapsedGroups.value.includes(key)
    ? collapsedGroups.value.filter((k) => k !== key)
    : [...collapsedGroups.value, key]
}

function toggleCluster(key: string) {
  if (menuActive) return
  expandedClusters.value = expandedClusters.value.includes(key)
    ? expandedClusters.value.filter((k) => k !== key)
    : [...expandedClusters.value, key]
}

// --- the filter sheet, as M4's (FR-25.11) ---

const filterFacets = computed(() => facetsFor(view.value))
const grouping = computed(() => {
  const axis = groupingAxis(shownGroupBy.value)
  return { ...axis, options: axis.options.filter((o) => o.value !== GROUPING_CONTAINER) }
})
/** Erledigte is the one reveal an excursion has — FR-25.20/25.27 are the suitcase's. */
const filterSwitches = computed(() =>
  switchesFor({
    showDone: showDone.value,
    showOthers: true,
    showLate: true,
    packedCount: view.value.doneCount,
    hiddenOtherCount: 0,
    lateCount: 0,
  }).filter((s) => s.key === SWITCH_KEYS.done),
)
function onToggleSwitch(key: string) {
  if (key === SWITCH_KEYS.done) showDone.value = !showDone.value
}
const activeChips = computed(() => chipsFor(view.value, facets.value))
const emptyReason = computed(() =>
  emptyReasonFor(view.value, search.value, Math.max(view.value.openRowCount, 0)),
)

/** FR-25.11e: a reset clears all of the narrowing, or the same empty screen comes back. */
function resetNarrowing() {
  search.value = ''
  searchOpen.value = false
  reset()
}

// --- the header line yields to the list (FR-21.17), as M4's ---

const content = ref<{ $el: HTMLIonContentElement } | null>(null)
const { collapsed: headCollapsed, onScroll, onScrollEnd } = useHeadScroll(content)

// --- the line's acts, each behind M4's snackbar and its one undo (FR-25.31) ---

/**
 * M4's snackbar and its one undo (FR-25.2, FR-25.31), anchored above this
 * screen's ＋: a pack registers, the row leaves, and a mistap is taken back
 * from the snackbar — as on the packing list.
 */
const {
  rowUndo,
  packAnnouncements,
  announcePacked,
  announceSkipped,
  announceRemoved,
  announceAct,
} = usePackAnnouncer(FAB_ANCHOR.m27Excursion)

function restoreCounts(records: RowUndoRecord[]) {
  for (const record of records) {
    const line = lineById.value.get(record.itemId)
    if (line) orchestrator.setLineCount({ ...line, quantity: record.quantity }, record.packedCount)
  }
}

/**
 * One act behind the snackbar's undo. `restore` gets the line as it is when
 * the undo fires, so it writes back only what the act changed (M4's
 * `actUndoably`); a line removed meanwhile stays removed.
 */
function actUndoably(
  line: ExcursionItem,
  message: string,
  act: () => void,
  restore: (live: ExcursionItem) => void,
) {
  const id = line.id
  rowUndo.armAction(line.name, () => {
    const live = lineById.value.get(id)
    if (live) restore(live)
  })
  act()
  void announceAct(message)
}

/** M4's stepper and tick, on the line's own count — each announced like M4's. */
function count(line: ExcursionItem, packed: number) {
  const target = Math.min(Math.max(packed, 0), line.quantity)
  const name = line.name
  rowUndo.actWithUndo(
    [excursionLineAsRow(line)],
    () => orchestrator.setLineCount(line, target),
    restoreCounts,
  )
  void (target >= line.quantity
    ? announcePacked(name)
    : target === 0
      ? announceAct(t('packing.unpackedToast', { name }))
      : announceAct(t('packing.countToast', { name, packed: target, quantity: line.quantity })))
}

function tick(line: ExcursionItem) {
  const reads = stateFor(line.packed_count, line.quantity)
  count(line, reads === 'packed' ? 0 : line.quantity)
}

/** Collapse a leaving row to nothing — M4's `collapseRow`, honouring reduced motion. */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
function onRowLeave(el: Element, done: () => void) {
  collapseRow(el as HTMLElement, done, reducedMotion.matches)
}

/** FR-5.5 on a line: decided against for this outing, M4's snackbar with its undo. */
function skip(line: ExcursionItem) {
  rowUndo.armUndo([excursionLineAsRow(line)], restoreCounts)
  orchestrator.skipLine(line)
  void announceSkipped(line.name, [])
}

function unskip(line: ExcursionItem) {
  rowUndo.armUndo([excursionLineAsRow(line)], restoreCounts)
  orchestrator.unskipLine(line)
  void announceAct(t('packing.unskippedToast', { name: line.name }))
}

/** FR-5.8 on a line: off the list, M4's snackbar with its undo. */
function removeLine(line: ExcursionItem) {
  const undo = orchestrator.removeLine(line)
  rowUndo.armAction(line.name, undo)
  void announceRemoved(line.name)
}

/** FR-5.9 on a line (FR-31.8): packed, or bought on the spot. */
function setMode(line: ExcursionItem, mode: typeof ITEM_MODE_BUY_LOCAL | typeof ITEM_MODE_PACK) {
  const before = { mode: line.mode, bought_at: line.bought_at }
  actUndoably(
    line,
    t(mode === ITEM_MODE_BUY_LOCAL ? 'packing.buyLocalToast' : 'packing.packInsteadToast', {
      name: line.name,
    }),
    () => orchestrator.setLineMode(line, mode),
    (live) => orchestrator.updateLine(live, before),
  )
}

/** FR-31.7: *Vor Ort besorgen* — the same change of mode, from the fact line. */
function buyOnSite(line: ExcursionItem) {
  setMode(line, ITEM_MODE_BUY_LOCAL)
}

/** FR-31.8: bought on the spot, or back on the list. */
function markBought(line: ExcursionItem, bought: boolean) {
  const before = line.bought_at
  actUndoably(
    line,
    t(bought ? 'excursions.boughtToast' : 'excursions.unboughtToast', { name: line.name }),
    () => orchestrator.markBought(line, bought),
    (live) => orchestrator.updateLine(live, { bought_at: before }),
  )
}

/** FR-31.13: bought on the spot, kept — with the one undo the act owes. */
function keep(line: ExcursionItem) {
  const undo = orchestrator.addToPackingList(props.tripId, line)
  if (!undo) return
  rowUndo.armAction(line.name, undo)
  void announceAct(t('excursions.keptToast', { item: line.name }))
}

/** FR-31.14: a line of the excursion alone becomes an inventory item, undoably. */
function adopt(line: ExcursionItem) {
  const undo = orchestrator.adoptIntoInventory(props.tripId, line)
  if (!undo) return
  rowUndo.armAction(line.name, undo)
  void announceAct(t('excursions.adoptedToast', { item: line.name }))
}

// --- FR-25.24: the amount, in M4's popover over the list ---

const quantityLineId = ref<string | null>(null)
/** The tap that opened it, which Ionic anchors to; none from the menu, which centres it. */
const quantityEvent = ref<MouseEvent | undefined>(undefined)
const quantityLine = computed(() =>
  quantityLineId.value === null ? null : (lineById.value.get(quantityLineId.value) ?? null),
)
const quantityChoiceList = computed(() => {
  const ex = excursion.value
  return quantityChoices({
    durationDays: durationDays(ex?.starts_on ?? null, ex?.ends_on ?? null),
    travelerCount: participants.value.length,
    perPerson: Boolean(quantityLine.value?.assigned_traveler_id),
  })
})

function openQuantity(line: ExcursionItem, event?: MouseEvent) {
  quantityEvent.value = event
  quantityLineId.value = line.id
}

/**
 * The line as the editor found it (M4's rule): one editing session is one act,
 * announced on close with one undo back to where the popover opened.
 */
let quantityBefore: RowUndoRecord | null = null

function onSetQuantity(quantity: number) {
  const line = quantityLine.value
  if (!line) return
  quantityBefore ??= {
    itemId: line.id,
    name: line.name,
    quantity: line.quantity,
    packedCount: line.packed_count,
    state: line.state,
  }
  orchestrator.setLineQuantity(line, quantity)
}

function onQuantityClosed() {
  quantityLineId.value = null
  const before = quantityBefore
  quantityBefore = null
  if (!before) return
  const now = lineById.value.get(before.itemId)
  if (!now || now.quantity === before.quantity) return
  rowUndo.armUndo(
    [{ ...excursionLineAsRow(now), quantity: before.quantity, packed_count: before.packedCount }],
    restoreCounts,
  )
  void announceAct(t('packing.quantityToast', { name: now.name, n: now.quantity }))
}

// --- the detail: M5's sheet, or the side panel on a desktop (G-9) ---

/** Read off the route, as M5's `?item=`: a tap, a deep link and a reload open the same. */
const openLineId = computed(() => {
  const value = route.query[LINE_QUERY_PARAM]
  return typeof value === 'string' && value !== '' ? value : null
})

const isDesktop = ref(window.matchMedia(DESKTOP_QUERY).matches)
const breakpoint = window.matchMedia(DESKTOP_QUERY)
const onBreakpoint = (event: MediaQueryListEvent) => (isDesktop.value = event.matches)
breakpoint.addEventListener('change', onBreakpoint)
onUnmounted(() => breakpoint.removeEventListener('change', onBreakpoint))

/**
 * M4's press-and-hold for a line's menu (`useLongPress`; `contextmenu` on a
 * desktop). While the menu lives, the tap its release lands as is ignored,
 * for M4's reason — the release falls on the overlay, not the row.
 */
let menuActive = false
const hold = useLongPress<ExcursionItem>((line) => void openLine(line))

/**
 * Pushed, unlike M5's `?item=`: under M4 sits a tab's root, and the overlay
 * guard's pop-then-push rebuilds that chain; under this list sits M27, where
 * the same two navigations leave Ionic showing M27 under this URL. A pushed
 * query is the same page (Ionic keeps one per path), so the browser's back
 * only closes the sheet, and ✕ takes that same step back when it can.
 */
function openSheet(line: ExcursionItem) {
  if (menuActive) return
  void router.push(tripExcursionLinePath(props.tripId, props.excursionId, line.id))
}

function closeSheet(): Promise<unknown> {
  return closeOverlayRoute(router, tripExcursionsPath(props.tripId, props.excursionId))
}

function openedLine(): ExcursionItem | undefined {
  return openLineId.value === null ? undefined : lineById.value.get(openLineId.value)
}

// --- the line's menu: M4's entries and labels (FR-5.5), and the excursion's four ---

/** The excursion's own entries, worded as their fact-line actions are. */
const EXCURSION_MENU_BUTTONS: Record<Exclude<ExcursionMenuAction, RowMenuAction>, RowMenuButton> = {
  markBought: { labelKey: 'excursions.markBought', icon: cartOutline },
  markUnbought: { labelKey: 'excursions.markUnbought', icon: cartOutline },
  keep: { labelKey: 'excursions.keep', icon: bagAddOutline },
  adopt: { labelKey: 'excursions.adoptMenu', icon: cubeOutline },
}

function buttonOf(action: ExcursionMenuAction): RowMenuButton {
  return action in EXCURSION_MENU_BUTTONS
    ? EXCURSION_MENU_BUTTONS[action as keyof typeof EXCURSION_MENU_BUTTONS]
    : ROW_MENU_BUTTONS[action as RowMenuAction]
}

function runMenu(action: ExcursionMenuAction, line: ExcursionItem) {
  switch (action) {
    case 'quantity':
      openQuantity(line)
      return
    case 'skip':
      skip(line)
      return
    case 'unskip':
      unskip(line)
      return
    case 'buyLocal':
      setMode(line, ITEM_MODE_BUY_LOCAL)
      return
    case 'packInstead':
      setMode(line, ITEM_MODE_PACK)
      return
    case 'markBought':
      markBought(line, true)
      return
    case 'markUnbought':
      markBought(line, false)
      return
    case 'keep':
      keep(line)
      return
    case 'adopt':
      adopt(line)
      return
    case 'remove':
      removeLine(line)
  }
}

async function openLine(line: ExcursionItem) {
  // A touch hold fires twice — the timer and the browser's own
  // `contextmenu` — and whichever comes second must find the menu taken.
  hold.cancel()
  if (menuActive) return
  const entries = excursionMenuEntries(line)
  if (entries.length === 0) return
  menuActive = true
  try {
    const sheet = await actionSheetController.create({
      header: line.name,
      buttons: [
        ...entries.map((action) => ({
          text: t(buttonOf(action).labelKey),
          icon: buttonOf(action).icon,
          ...sheetBandAttrs(buttonOf(action).band),
          handler: () => runMenu(action, line),
        })),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    })
    sheet.setAttribute('data-testid', 'excursion-line-menu')
    await sheet.present()
    await sheet.onDidDismiss()
  } finally {
    menuActive = false
  }
}

// --- adding: M4's ＋ and quick-add, over the people going (FR-31.5) ---

const quickAdd = ref<InstanceType<typeof QuickAddItem> | null>(null)
const quickAddExpanded = computed(() => quickAdd.value?.expanded ?? false)
const carriedItemIds = computed(() => [
  ...new Set(lines.value.map((l) => l.source_item_id).filter((id): id is string => id !== null)),
])
/** FR-25.13f: what the browse sheet's verbs may do on a thing the list already carries. */
const browseStates = computed(() => browseRowStates(rows.value, () => null, participants.value))

/**
 * The strip's chosen set as the excursion reads it: nobody is shared, every
 * participant is *für alle* — the set that grows with a joiner — and some are
 * named (FR-31.5).
 */
function forWhomOf(travelerIds: readonly string[]): LineFor {
  if (travelerIds.length === 0) return { kind: 'shared' }
  if (travelerIds.length === participants.value.length) return { kind: 'all' }
  return { kind: 'named', travelerIds }
}

/** The browse sheet's per-item undo, as M4 keeps it (FR-25.13f). */
const browseUndo = new Map<string, () => void>()

function linesOfItem(itemId: string): ExcursionItem[] {
  return lines.value.filter((l) => l.source_item_id === itemId)
}

function recordOf(line: ExcursionItem): RowUndoRecord {
  return {
    itemId: line.id,
    name: line.name,
    quantity: line.quantity,
    packedCount: line.packed_count,
    state: line.state,
  }
}

function addFrom(item: BrowseAddition, target: LineFor) {
  const written = orchestrator.addLines(
    props.tripId,
    props.excursionId,
    draftLinesFor(
      {
        source_item_id: item.sourceItemId,
        name: item.name,
        category_name: item.categoryName,
        quantity: 1,
        mode: ITEM_MODE_PACK,
        weight_grams: item.weightGrams,
        value_cents: item.valueCents,
        source_template_id: null,
      },
      target,
      participants.value,
    ),
  )
  if (item.sourceItemId) browseUndo.set(item.sourceItemId, written.undo)
}

function onQuickAdd(item: BrowseAddition & { travelerIds: string[] }) {
  addFrom(item, forWhomOf(item.travelerIds))
}

/** FR-31.14: *Nur für diesen Ausflug* — a line no inventory item names, kept out of the suitcase. */
function onQuickAddLocal(item: { name: string; travelerIds: string[] }) {
  orchestrator.addLines(
    props.tripId,
    props.excursionId,
    draftLinesFor(
      {
        source_item_id: null,
        name: item.name,
        category_name: null,
        quantity: 1,
        mode: ITEM_MODE_PACK,
        weight_grams: null,
        value_cents: null,
        source_template_id: null,
      },
      forWhomOf(item.travelerIds),
      participants.value,
    ),
  )
}

function onQuickAddForAll(item: BrowseAddition) {
  addFrom(item, { kind: 'all' })
}

/**
 * FR-25.13h: the browse sheet's people for one thing — always the whole set,
 * so a second tap changes the lines this run wrote rather than adding more.
 */
function onBrowseAssignForTravelers(item: BrowseAddition, travelerIds: string[]) {
  const first = item.sourceItemId ? linesOfItem(item.sourceItemId)[0] : undefined
  if (!first) {
    addFrom(item, forWhomOf(travelerIds))
    return
  }
  const undo = orchestrator.setForWhom(props.tripId, first, forWhomOf(travelerIds))
  if (item.sourceItemId && !browseUndo.has(item.sourceItemId))
    browseUndo.set(item.sourceItemId, undo)
}

/** FR-25.13g: a carried thing becomes one for everybody going. */
function onBrowseSpread(itemId: string) {
  const first = linesOfItem(itemId)[0]
  if (!first) return
  browseUndo.set(itemId, orchestrator.setForWhom(props.tripId, first, { kind: 'all' }))
}

/** FR-25.13f: everything of this thing into the rucksack, in one tap. */
function onBrowsePack(itemId: string) {
  const open = linesOfItem(itemId).filter(
    (l) => l.state !== STATE_SKIPPED && l.packed_count < l.quantity,
  )
  const records = open.map(recordOf)
  for (const line of open) orchestrator.setLineCount(line, line.quantity)
  browseUndo.set(itemId, () => restoreCounts(records))
}

/** FR-25.13f: leave everything of this thing at home (FR-5.5). */
function onBrowseSkip(itemId: string) {
  const open = linesOfItem(itemId).filter((l) => l.state !== STATE_SKIPPED)
  const records = open.map(recordOf)
  for (const line of open) orchestrator.skipLine(line)
  browseUndo.set(itemId, () => restoreCounts(records))
}

/** FR-25.13i: everything of this thing back on the list — M4's reset, not an undo. */
function onBrowseReopen(itemId: string) {
  for (const line of linesOfItem(itemId)) {
    if (line.state === STATE_SKIPPED) orchestrator.unskipLine(line)
    else orchestrator.setLineCount(line, 0)
  }
}

function onBrowseUndo(itemId: string) {
  const undo = browseUndo.get(itemId)
  if (!undo) return
  browseUndo.delete(itemId)
  undo()
}

async function onQuickAddGroup(templateId: string) {
  const written = orchestrator.addGroupLines(props.tripId, props.excursionId, templateId)
  const group = masterStore.getTemplate(templateId)
  if (!written || !group) return
  await presentToast({
    message: groupAdditionMessage({
      groupName: group.name,
      added: written.lines,
      alreadyPresent: [],
      unassignable: [],
    }),
    positionAnchor: FAB_ANCHOR.m27Excursion,
    buttons: [{ text: t('packing.undo'), handler: written.undo }],
  })
}

// --- the excursion's own acts, in the bar's ⋮ ---

const editing = ref(false)

async function saveEdit(result: ExcursionSheetResult) {
  editing.value = false
  const ex = excursion.value
  if (!ex) return
  orchestrator.updateExcursion(ex, {
    name: result.name,
    startsOn: result.startsOn,
    endsOn: result.endsOn,
  })
  const before = namesItsParticipants(ex.id, participantRows.value)
    ? participants.value.map((p) => p.id)
    : null
  const same =
    (before === null && result.travelerIds === null) ||
    (before !== null &&
      result.travelerIds !== null &&
      before.length === result.travelerIds.length &&
      before.every((id) => result.travelerIds!.includes(id)))
  if (same) return
  const undo = orchestrator.setParticipants(props.tripId, ex.id, result.travelerIds)
  rowUndo.armAction(ex.name, undo)
  void announceAct(t('excursions.participantsChanged'))
}

async function saveAsGroup() {
  const ex = excursion.value
  if (!ex) return
  // FR-31.14: things the inventory does not know join it only if asked to.
  let includeUnlisted = true
  const unlisted = orchestrator.unlistedNames(props.tripId, ex.id)
  if (unlisted.length > 0) {
    const choice = await chooseAction({
      header: t('excursions.unlistedHeader'),
      message: t('excursions.unlistedMessage', { items: unlisted.join(', ') }),
      confirmLabel: t('excursions.unlistedInclude'),
      alternativeLabel: t('excursions.unlistedLeaveOut'),
      testid: 'm27-save-group-unlisted',
    })
    if (choice === null) return
    includeUnlisted = choice
  }
  await promptText({
    header: t('excursions.saveAsGroup'),
    message: t('excursions.saveAsGroupMessage'),
    value: ex.name,
    confirmLabel: t('common.save'),
    testid: 'm27-save-group',
    onConfirm: async (name) => {
      if (!name) return false
      const id = orchestrator.saveAsGroup(props.tripId, ex.id, name, includeUnlisted)
      if (id === null) {
        await presentToast({ message: t('excursions.nameTaken') })
        return false
      }
      await presentToast({ message: t('excursions.savedAsGroup', { name }) })
    },
  })
}

async function remove() {
  const ex = excursion.value
  if (!ex) return
  const ok = await confirmDestructive({
    header: t('excursions.delete'),
    message: t('excursions.deleteConfirm', { name: ex.name }),
    confirmLabel: t('common.delete'),
    testid: 'm27-delete-confirm',
  })
  if (!ok) return
  orchestrator.deleteExcursion(props.tripId, ex.id)
  void router.replace(tripExcursionsPath(props.tripId))
}

// --- GPX tracks (FR-31.15, ADR-089) ---

const tracksOn = computed(() =>
  excursion.value ? orchestrator.tracksOf(props.tripId, excursion.value.id) : [],
)
/** FR-31.15: the route folded to a line, as *Der Tag*'s head says it — the first track's distance and climb. */
const routeSummary = computed(() => tracksSummary(tracksOn.value)?.text ?? null)
const routeDistance = computed(() => {
  const first = tracksOn.value[0]
  return first ? formatDistance(first.distance_m) : null
})
/** FR-29.18: the first track's time with its pauses — the route the way there and back frame. */
const routeMinutes = computed(() => {
  const first = tracksOn.value[0]
  return first ? movingMinutes(first) + first.pause_min : null
})
/** FR-29.18: where the first track starts — the stop nearest it is the way there's destination. */
const routeStart = computed<[number, number] | null>(() => {
  const first = tracksOn.value[0]
  return first ? (decodeLine(first.line)[0] ?? null) : null
})
const tracks = useTrackOwner<ExcursionTrack>(() => {
  const ex = excursion.value
  if (!ex) return null
  return {
    tracks: () => orchestrator.tracksOf(ex.trip_id, ex.id),
    add: (upload) => orchestrator.addTrack(ex, upload),
    replace: (track, upload) => orchestrator.replaceTrack(track, upload),
    update: (track, settings) => orchestrator.updateTrack(track, settings),
    remove: (track) => orchestrator.removeTrack(track),
    file: (track) => orchestrator.trackFile(track),
  }
}, FAB_ANCHOR.m27Excursion)
const trackBusy = tracks.busy
const routeEditor = tracks.editor
const tiles = useTileState()
/** Folded while there is something to pack, open once there is not — or as this device left it. */
const routeFold = useRouteFold(
  () => props.excursionId,
  () => units.value.done < units.value.total,
)
const trackInput = ref<HTMLInputElement | null>(null)

/** A sixth track is refused before a file is chosen, and said. */
function tracksFull(): boolean {
  if (tracksOn.value.length < MAX_TRACKS) return false
  void presentToast({
    message: t('track.full', { max: MAX_TRACKS }),
    positionAnchor: FAB_ANCHOR.m27Excursion,
  })
  return true
}

function chooseTrackFile() {
  if (!tracksFull()) trackInput.value?.click()
}

/** Drawing needs the map: offline, or with tiles off on this instance, it is said instead. */
function drawRoute() {
  if (tracksFull()) return
  if (tiles.value !== 'on') {
    void presentToast({ message: t('track.editNeedsMap'), positionAnchor: FAB_ANCHOR.m27Excursion })
    return
  }
  void tracks.edit(null)
}

function onTrackFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // The same file can be picked again after a failed upload.
  input.value = ''
  if (file) void tracks.add(file)
}

/**
 * G-12, as on M4: search, filter and fold-all act on this list and stay in the
 * bar while the header line scrolls away; the excursion's own acts are behind
 * the ⋮.
 */
setHeaderActions(() =>
  excursion.value
    ? [
        searchAction(),
        {
          id: 'm27-filter',
          icon: funnelOutline,
          label: t('filter.open'),
          active: view.value.activeFacetCount > 0,
          badge: view.value.activeFacetCount,
          onClick: () => (filterOpen.value = true),
        },
        {
          id: 'm27-fold-all',
          icon: allFolded.value ? expandOutline : contractOutline,
          label: allFolded.value ? t('packing.unfoldAll') : t('packing.foldAll'),
          onClick: toggleFoldAll,
        },
        {
          id: 'm27-edit',
          icon: createOutline,
          label: t('excursions.edit'),
          overflow: true,
          onClick: () => (editing.value = true),
        },
        {
          id: 'm27-track-add',
          icon: documentAttachOutline,
          label: t('track.addFile'),
          overflow: true,
          onClick: chooseTrackFile,
        },
        {
          id: 'm27-track-draw',
          icon: gitBranchOutline,
          label: t('track.draw'),
          overflow: true,
          onClick: drawRoute,
        },
        {
          id: 'm27-save-as-group',
          icon: layersOutline,
          label: t('excursions.saveAsGroup'),
          overflow: true,
          onClick: () => void saveAsGroup(),
        },
        {
          id: 'm27-delete',
          icon: trashOutline,
          label: t('excursions.delete'),
          overflow: true,
          onClick: () => void remove(),
        },
      ]
    : [],
)

onMounted(ensure)

setHeaderTitle(
  () => excursion.value?.name,
  () => metaLine.value,
  () => headCollapsed.value,
)
</script>

<template>
  <IonPage>
    <IonContent
      ref="content"
      class="excursion-content"
      data-testid="m27-excursion-page"
      :data-pack-announcements="packAnnouncements"
      :scroll-events="true"
      @ion-scroll="onScroll"
      @ion-scroll-end="onScrollEnd"
    >
      <template v-if="loaded && excursion">
        <!-- FR-29.13: the idea it was made from, where it was. -->
        <IdeaOrigin
          class="excursion-idea"
          :trip-id="tripId"
          :idea-id="excursion.idea_id"
          testid="m27-excursion-idea"
        />
        <!-- FR-29.18/FR-31.15: the day first — there, the route, back — before what to pack for it; it scrolls away. -->
        <component
          :is="ConnectionsSection"
          v-if="ConnectionsSection"
          class="excursion-day"
          :trip-id="tripId"
          :excursion-id="excursionId"
          :title="excursion.name"
          :day="excursion.starts_on"
          :last-day="excursion.ends_on ?? excursion.starts_on"
          :route-minutes="routeMinutes"
          :route-start="routeStart"
          :route-summary="routeSummary"
          :route-distance="routeDistance"
          :open="routeFold.open.value"
          @toggle="routeFold.toggle"
        >
          <template v-if="tracksOn.length > 0" #route="{ ways }">
            <TrackSummary
              headless
              :beside="ways"
              :tracks="tracksOn"
              :title="excursion?.name ?? ''"
              :trip-id="tripId"
              @update="(track, settings) => tracks.update(track as ExcursionTrack, settings)"
              @download="(track) => tracks.download(track as ExcursionTrack)"
              @replace="(track, file) => tracks.replace(track as ExcursionTrack, file)"
              @remove="(track) => tracks.remove(track as ExcursionTrack)"
              @edit="(track) => tracks.edit(track as ExcursionTrack)"
            />
          </template>
        </component>
        <!-- Without the planner bound, the route stands alone. -->
        <div v-else-if="tracksOn.length > 0" class="excursion-day">
          <TrackSummary
            :open="routeFold.open.value"
            @update:open="routeFold.toggle"
            :tracks="tracksOn"
            :title="excursion?.name ?? ''"
            :trip-id="tripId"
            @update="(track, settings) => tracks.update(track as ExcursionTrack, settings)"
            @download="(track) => tracks.download(track as ExcursionTrack)"
            @replace="(track, file) => tracks.replace(track as ExcursionTrack, file)"
            @remove="(track) => tracks.remove(track as ExcursionTrack)"
            @edit="(track) => tracks.edit(track as ExcursionTrack)"
          />
        </div>
        <p v-if="trackBusy" class="track-busy" data-testid="m27-track-busy">
          {{ t('track.reading') }}
        </p>
        <!-- M4's header line: the progress card, sticky, yielding to the list. -->
        <div class="trip-line" :class="{ collapsed: headCollapsed }" data-testid="m27-header">
          <div class="trip-stats jp-card" data-testid="m27-progress-card">
            <ProgressFigure
              class="figure jp-num"
              :percent="packedPercent({ packedItems: units.done, totalItems: units.total })"
              :headline="
                units.total > 0
                  ? t('excursions.packed', { done: units.done, total: units.total })
                  : t('excursions.nothingYet')
              "
              :detail="toBuy > 0 ? t('excursions.toBuy', { n: toBuy }) : null"
              :ring-size="RING_SIZE_HEADER"
              headline-testid="m27-figure"
            />
          </div>
        </div>
        <TravelerProgressStrip
          v-if="showsTravelerProgress(participants)"
          :progress="progressByTraveler(lines, participants)"
          :selected="facets.person"
          @select="selectPerson"
        />
        <ExcursionNotes v-if="notes.length > 0" :threads="notes" @open="openNote" />

        <!-- FR-25.11k: the field exists only while it is being used. -->
        <SearchRow
          v-if="searchOpen || search"
          v-model="search"
          testid="m27-search-input"
          :placeholder="t('excursions.searchPlaceholder')"
          @close="toggleSearch"
        />

        <!-- FR-25.11a: an active filter is never invisible, as on M4. -->
        <div class="filter-bar" data-testid="m27-filter-bar">
          <template v-if="activeChips.length > 0">
            <button
              v-for="chip in activeChips"
              :key="`${chip.key}:${chip.value}`"
              class="chip"
              :data-testid="`m27-chip-${chip.key}-${chip.value}`"
              @click="toggleValue(chip.key, chip.value)"
            >
              <b>{{ chip.facetLabel }}</b> {{ chip.label }} <span class="x">×</span>
            </button>
            <button class="chip-reset" data-testid="m27-chip-reset" @click="reset">
              {{ t('filter.reset') }}
            </button>
          </template>
          <template v-else>
            <span class="list-head jp-eyebrow">{{ t('excursions.listHead') }}</span>
            <span class="grouped-by">
              {{ t('filter.groupedBy', { axis: t(`group.${shownGroupBy}` as const) }) }}
            </span>
          </template>
        </div>

        <QuickAddItem
          ref="quickAdd"
          :show-trigger="false"
          :offer-groups="true"
          :traveler-count="participants.length"
          :travelers="participants"
          :exclude-item-ids="carriedItemIds"
          :browse-row-states="browseStates"
          :offer-local-only="true"
          @add="onQuickAdd"
          @add-local="onQuickAddLocal"
          @add-for-all="onQuickAddForAll"
          @assign-for-travelers="onBrowseAssignForTravelers"
          @spread-carried="onBrowseSpread"
          @add-group="onQuickAddGroup"
          @pack-carried="onBrowsePack"
          @skip-carried="onBrowseSkip"
          @undo-browse="onBrowseUndo"
          @reopen-carried="onBrowseReopen"
        />

        <ExcursionExtraList :lines="extras" />

        <IonList v-if="view.groups.length > 0" class="excursion-list">
          <template v-for="group in view.groups" :key="group.key">
            <button
              class="group-head"
              :class="{ shut: group.collapsed }"
              :data-testid="`m27-group-${group.key || 'none'}`"
              @click="toggleGroup(group.key)"
            >
              <IonIcon :icon="chevronDownOutline" class="caret" />
              <span class="group-name">{{ group.name ?? t('common.none') }}</span>
              <span class="group-count">
                {{
                  group.collapsed
                    ? t('packing.openCount', { n: group.openCount })
                    : `${group.doneCount}/${group.totalCount}`
                }}
              </span>
            </button>

            <!-- FR-25.2 as on M4: a packed row leaves rather than vanishes. -->
            <TransitionGroup
              v-if="!group.collapsed"
              name="pack-out"
              tag="div"
              class="group-card jp-card"
              @leave="onRowLeave"
            >
              <template
                v-for="entry in group.entries"
                :key="entry.kind === 'item' ? entry.item.id : entry.key"
              >
                <div v-if="entry.kind === 'cluster'" class="cluster">
                  <ClusterHead
                    screen="m27"
                    :name="entry.name"
                    :mode="entry.mode"
                    :late="false"
                    :done-count="entry.doneCount"
                    :total-count="entry.totalCount"
                    :open-count="entry.openCount"
                    :collapsed="entry.collapsed"
                    :faces="entry.faces"
                    :master="masterOf(entry.sourceItemId)"
                    @toggle="toggleCluster(entry.key)"
                  />
                  <div v-if="!entry.collapsed" class="cluster-children">
                    <PackingRow
                      v-for="child in entry.children"
                      :key="child.item.id"
                      screen="m27"
                      variant="child"
                      :item="child.item"
                      :label="child.traveler?.name ?? child.label"
                      :test-key="`${entry.name}-${child.traveler?.name ?? ''}`"
                      :done="child.done"
                      :locked="false"
                      :closing-pass="false"
                      :notes="NO_NOTES"
                      :traveler="child.traveler"
                      @open="openSheet(lineOf(child.item))"
                      @menu="openLine(lineOf(child.item))"
                      @press-start="
                        (e: PointerEvent) => hold.down(lineOf(child.item), e.clientX, e.clientY)
                      "
                      @press-move="(e: PointerEvent) => hold.move(e.clientX, e.clientY)"
                      @press-end="hold.cancel()"
                      @edit-quantity="(e: MouseEvent) => openQuantity(lineOf(child.item), e)"
                      @increment="count(lineOf(child.item), child.item.packed_count + 1)"
                      @decrement="count(lineOf(child.item), child.item.packed_count - 1)"
                      @complete="count(lineOf(child.item), child.item.quantity)"
                      @zero="count(lineOf(child.item), 0)"
                      @toggle="tick(lineOf(child.item))"
                    >
                      <template #facts>
                        <ExcursionFacts
                          :line="lineOf(child.item)"
                          :test-key="`${entry.name}-${child.traveler?.name ?? ''}`"
                          :from-luggage="suitcaseOf(lineOf(child.item), tripItems) !== null"
                          :left-behind="
                            child.item.packed_count > 0 &&
                            isLeftBehind(lineOf(child.item), participants)
                          "
                          :can-keep="canJoinPackingList(lineOf(child.item))"
                          :can-adopt="canAdoptIntoInventory(lineOf(child.item))"
                          @buy-on-site="buyOnSite(lineOf(child.item))"
                          @take-out="removeLine(lineOf(child.item))"
                          @keep="keep(lineOf(child.item))"
                          @adopt="adopt(lineOf(child.item))"
                        />
                      </template>
                    </PackingRow>
                  </div>
                </div>

                <PackingRow
                  v-else
                  screen="m27"
                  :item="entry.item"
                  :label="entry.label"
                  :test-key="entry.item.name"
                  :done="entry.done"
                  :locked="false"
                  :closing-pass="false"
                  :notes="NO_NOTES"
                  :traveler="entry.traveler"
                  :master="masterOf(entry.item.source_item_id)"
                  @open="openSheet(lineOf(entry.item))"
                  @menu="openLine(lineOf(entry.item))"
                  @press-start="
                    (e: PointerEvent) => hold.down(lineOf(entry.item), e.clientX, e.clientY)
                  "
                  @press-move="(e: PointerEvent) => hold.move(e.clientX, e.clientY)"
                  @press-end="hold.cancel()"
                  @edit-quantity="(e: MouseEvent) => openQuantity(lineOf(entry.item), e)"
                  @increment="count(lineOf(entry.item), entry.item.packed_count + 1)"
                  @decrement="count(lineOf(entry.item), entry.item.packed_count - 1)"
                  @complete="count(lineOf(entry.item), entry.item.quantity)"
                  @zero="count(lineOf(entry.item), 0)"
                  @toggle="tick(lineOf(entry.item))"
                >
                  <template #facts>
                    <ExcursionFacts
                      :line="lineOf(entry.item)"
                      :test-key="entry.item.name"
                      :from-luggage="suitcaseOf(lineOf(entry.item), tripItems) !== null"
                      :can-keep="canJoinPackingList(lineOf(entry.item))"
                      :can-adopt="canAdoptIntoInventory(lineOf(entry.item))"
                      @buy-on-site="buyOnSite(lineOf(entry.item))"
                      @keep="keep(lineOf(entry.item))"
                      @adopt="adopt(lineOf(entry.item))"
                    />
                  </template>
                </PackingRow>
              </template>
            </TransitionGroup>
          </template>
        </IonList>

        <!-- M4's empty states: narrowed, empty, or finished — never confused. -->
        <EmptyState
          v-else-if="view.narrowed"
          :title="t('packing.noMatches')"
          :hint="emptyReason"
          testid="m27-empty-list"
        >
          <IonButton size="small" fill="outline" data-testid="m27-reset" @click="resetNarrowing">
            {{
              search.trim() && view.activeFacetCount === 0
                ? t('packing.resetSearch')
                : t('packing.resetAll')
            }}
          </IonButton>
        </EmptyState>
        <EmptyState
          v-else-if="lines.length === 0"
          :icon="bagHandleOutline"
          :title="t('packing.empty')"
          :hint="t('packing.emptyHint')"
          testid="m27-empty-list"
        />
        <EmptyState
          v-else
          :title="t('packing.allDone')"
          :hint="t('excursions.allDoneHint')"
          testid="m27-empty-list"
        />

        <!-- FR-25.2: state the count, one tap to reveal — M4's bar. -->
        <RevealBar
          v-if="view.doneCount > 0 && !searching"
          :open="showDone"
          :label="
            showDone
              ? t('packing.hideDone', { n: view.doneCount })
              : t('packing.showDone', { n: view.doneCount })
          "
          testid="m27-done-bar"
          @toggle="showDone = !showDone"
        />
      </template>

      <input
        ref="trackInput"
        type="file"
        accept=".gpx,application/gpx+xml"
        hidden
        data-testid="m27-track-file"
        @change="onTrackFile"
      />
      <TrackEditor
        :open="routeEditor.open.value"
        :title="excursion?.name ?? ''"
        :original="routeEditor.original.value"
        :others="routeEditor.others.value"
        :hue-class="routeEditor.hueClass.value"
        :can-add-new="routeEditor.canAddNew.value"
        @close="tracks.closeEditor"
        @save="tracks.save"
      />

      <ExcursionSheet
        :is-open="editing"
        :travelers="travelers"
        :excursion="excursion"
        :traveler-ids="
          excursion && namesItsParticipants(excursion.id, participantRows)
            ? participants.map((p) => p.id)
            : null
        "
        :suitcase-open="suitcaseOpen"
        :trip-start="trip?.start_date"
        :trip-end="trip?.end_date"
        @dismiss="editing = false"
        @save="saveEdit"
      />

      <!-- FR-25.24: the amount, over the list — M4's popover. -->
      <IonPopover
        :is-open="quantityLineId !== null"
        :event="quantityEvent"
        data-testid="m27-quantity-popover"
        @did-dismiss="onQuantityClosed"
      >
        <div class="qty-pop">
          <p class="qty-pop-head">
            <span class="jp-eyebrow">{{ t('quantity.title') }}</span>
            <span class="qty-pop-name">{{ quantityLine?.name }}</span>
          </p>
          <QuantityEditor
            v-if="quantityLine"
            :quantity="quantityLine.quantity"
            :packed="quantityLine.packed_count"
            :choices="quantityChoiceList"
            @update="onSetQuantity"
          />
        </div>
      </IonPopover>

      <!-- M5's sheet for a line on a phone, M5's side panel on a desktop (G-9). -->
      <SheetModal
        v-if="!isDesktop"
        :is-open="openLineId !== null"
        testid="m27-line-modal"
        @dismiss="closeSheet"
      >
        <ExcursionItemSheet
          v-if="openLineId"
          :trip-id="tripId"
          :line-id="openLineId"
          :participants="participants"
          @close="closeSheet"
          @keep="openedLine() && keep(openedLine()!)"
          @adopt="openedLine() && adopt(openedLine()!)"
        />
      </SheetModal>
      <Teleport v-if="isDesktop && openLineId" defer :to="PANEL_HOST_SELECTOR">
        <aside class="item-panel" data-testid="m27-line-panel">
          <ExcursionItemSheet
            :trip-id="tripId"
            :line-id="openLineId"
            :participants="participants"
            @close="closeSheet"
            @keep="openedLine() && keep(openedLine()!)"
            @adopt="openedLine() && adopt(openedLine()!)"
          />
        </aside>
      </Teleport>

      <FilterSheet
        :open="filterOpen"
        :facets="filterFacets"
        :switches="filterSwitches"
        :grouping="grouping"
        :match-count="view.matchCount"
        :active-count="view.activeFacetCount"
        @close="filterOpen = false"
        @toggle-value="(facet, value) => toggleValue(facet as FacetKey, value)"
        @clear-facet="(facet) => clearFacet(facet as FacetKey)"
        @toggle-switch="onToggleSwitch"
        @set-grouping="(value) => (groupBy = value as GroupBy)"
        @reset="reset"
      />

      <IonFab :id="FAB_ANCHOR.m27Excursion" slot="fixed" vertical="bottom" horizontal="end">
        <IonFabButton
          v-if="!quickAddExpanded"
          data-testid="m27-add-fab"
          :aria-label="t('common.add')"
          @click="quickAdd?.open()"
        >
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.excursion-content {
  /* Room for the FAB over the last row, as on M4. */
  --padding-bottom: 88px;
}

/* M4's header line (`packing/PackingHeadline.vue`): sticky page, one card, yielding to the list. */
/* FR-31.15: the route's card, above the sticky header line, on its gutter. */
.excursion-day {
  /* With the header line's own 8 px, one rhythm of 12 px between the blocks. */
  margin: 8px 12px 4px;
}

.track-busy {
  margin: 0 16px;
  padding: 6px 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.trip-line {
  display: flex;
  padding: 8px 12px;
  background: var(--jp-surface-page);
  position: sticky;
  top: 0;
  z-index: 10;
  overflow: hidden;
  max-height: 118px;
  transition:
    max-height 0.18s ease,
    padding 0.18s ease;
}

.trip-line.collapsed {
  max-height: 0;
  padding-block: 0;
}

.trip-stats {
  flex: 1;
  min-width: 0;
  display: flex;
  padding: 10px 8px;
}

.figure {
  flex: 1;
  min-width: 0;
  --ring-hole: var(--jp-surface-card);
}

/* See M4: the line that moves is the one thing above the rows. */
ion-content.excursion-content::part(scroll) {
  overflow-anchor: none;
}

/* M4's chip row. */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px 12px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border: 1px solid var(--ct-glacier);
  border-radius: var(--jp-r-pill);
  background: none;
  color: var(--ct-text);
  font-size: var(--jp-text-xs);
  cursor: pointer;
}

.chip b {
  color: var(--ct-subtext0);
  font-weight: var(--jp-weight-semibold);
}

.chip .x {
  color: var(--ct-subtext0);
}

.chip-reset {
  background: none;
  border: none;
  color: var(--ct-glacier);
  font-size: var(--jp-text-xs);
  cursor: pointer;
}

.grouped-by {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

/* The list's own head, in the eyebrow every other block on the page wears. */
.list-head {
  padding-inline-start: 4px;
}

.list-head + .grouped-by {
  margin-inline-start: auto;
}

/* M4's amount popover. */
.qty-pop {
  padding: 16px 14px 12px;
}

.qty-pop-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 0 14px;
  text-align: center;
}

.qty-pop-name {
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
}

/* M5's side panel (G-9), as M4 lays it out in the frame's second pane. */
.item-panel {
  width: var(--jp-panel-w);
  overflow-y: auto;
  background: var(--ct-mantle);
  border-left: 1px solid var(--ct-surface1);
  box-shadow: var(--jp-shadow-panel);
}

/* M4's group heads and cards (`packing/PackingGroupList.vue`), so the two lists read alike. */
.excursion-list {
  padding: 0;
  background: transparent;
}

.group-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 20px 6px 8px;
  background: none;
  border: none;
  color: var(--ct-text);
  font-size: var(--jp-text-lg);
  font-weight: var(--jp-weight-bold);
  letter-spacing: var(--jp-tracking-display);
  cursor: pointer;
}

/* The first group follows the chip row directly: its head needs no room
   from a group above it, only from the row's own words. */
.group-head:first-child {
  padding-top: 4px;
}

.group-name {
  flex: 1;
  text-align: start;
}

.group-count {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-medium);
}

.group-card {
  margin: 0 8px;
}

.group-card ion-item {
  --padding-start: 12px;
  --inner-padding-end: 10px;
}

.caret {
  transition: transform 0.18s ease;
}

.group-head.shut .caret {
  transform: rotate(-90deg);
}

.pack-out-leave-active {
  transition:
    height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.3s ease,
    background-color 0.3s ease;
  overflow: hidden;
  pointer-events: none;
}

.pack-out-leave-from {
  background: color-mix(in srgb, var(--jp-done) 22%, transparent);
}

.pack-out-leave-to {
  opacity: 0;
}

.pack-out-move {
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .trip-line,
  .pack-out-leave-active,
  .pack-out-move {
    transition: none;
  }

  .pack-out-leave-from {
    background: none;
  }
}

.cluster-children {
  border-inline-start: 2px solid var(--ct-surface1);
  margin-inline-start: 12px;
}
.excursion-idea {
  margin: 0 16px 6px;
}
</style>
