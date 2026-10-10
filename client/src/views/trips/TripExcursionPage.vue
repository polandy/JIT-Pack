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
  IonPage,
  actionSheetController,
} from '@ionic/vue'
import {
  addOutline,
  bagAddOutline,
  bagHandleOutline,
  cartOutline,
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
import { computed, inject, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EmptyState from '@/components/global/EmptyState.vue'
import FilterSheet from '@/components/global/FilterSheet.vue'
import IdeaOrigin from '@/components/global/IdeaOrigin.vue'
import ProgressFigure from '@/components/global/ProgressFigure.vue'
import ExcursionExtraList from './excursion/ExcursionExtraList.vue'
import { EXCURSION_EXTRA_LINES, extraLinesOf, withExtraUnits } from '@/kernel/excursionExtraLines'
import QuickAddItem from '@/components/global/QuickAddItem.vue'
import RevealBar from '@/components/global/RevealBar.vue'
import SearchRow from '@/components/global/SearchRow.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import TrackEditor from '@/components/global/TrackEditor.vue'
import TrackSummary from '@/components/global/TrackSummary.vue'
import ExcursionFacts from './excursion/ExcursionFacts.vue'
import ExcursionItemSheet from './excursion/ExcursionItemSheet.vue'
import ExcursionNotes from './excursion/ExcursionNotes.vue'
import ExcursionSheet, { type ExcursionSheetResult } from './excursion/ExcursionSheet.vue'
import { useExcursionAdd } from './excursion/useExcursionAdd'
import { useExcursionRowPort } from './excursion/useExcursionRowPort'
import PackingGroupList from './packing/PackingGroupList.vue'
import RowQuantityPopover from './packing/RowQuantityPopover.vue'
import { actUndoably } from './packing/rowPort'
import { useBrowseVerbs } from './packing/useBrowseVerbs'
import { usePackingListShape } from './packing/usePackingListShape'
import type { ListFacts } from './packing/useRowFacts'
import { useRowQuantity } from './packing/useRowQuantity'
import { useRowSteps } from './packing/useRowSteps'
import type { PackingRowNotes } from '@/components/trips/PackingRow.vue'
import TravelerProgressStrip from '@/components/trips/TravelerProgressStrip.vue'
import { useContextSearch } from '@/composables/useContextSearch'
import { setHeaderActions } from '@/composables/shared/useHeaderActions'
import { useHeadScroll } from '@/composables/useHeadScroll'
import { setHeaderTitle } from '@/composables/shared/useHeaderTitle'
import { useLongPress } from '@/composables/shared/useLongPress'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { usePackAnnouncer } from '@/composables/usePackAnnouncer'
import { useDesktopLayout } from '@/composables/shared/useDesktopLayout'
import { usePackingFilter } from '@/composables/usePackingFilter'
import { useTrackOwner } from '@/composables/shared/useTrackOwner'
import { useTripScreen } from '@/composables/shared/useTripScreen'
import {
  isLeftBehind,
  isOpenPurchase,
  namesItsParticipants,
  participantsOf,
  sumUnits,
} from '@/domain/excursionLines'
import { spanOf } from '@/domain/excursionSchedule'
import {
  canAdoptIntoInventory,
  canJoinPackingList,
  excursionMenuEntries,
  suitcaseOf,
  type ExcursionMenuAction,
} from '@/domain/excursionSuitcase'
import { MAX_TRACKS, decodeLine, movingMinutes } from '@/domain/shared/track'
import { buildPackingView } from '@/domain/packingView'
import { packedPercent } from '@/domain/packState'
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
import { useTileState } from '@/composables/shared/mapTiles'
import { useRouteFold } from '@/composables/routeFold'
import { SWITCH_KEYS } from '@/lib/packingFilterPanel'
import { ROW_MENU_BUTTONS, type RowMenuButton } from '@/lib/rowMenuButtons'
import { sheetBandAttrs } from '@/lib/sheetBands'
import { presentToast } from '@/composables/shared/toast'
import { beforeIsOver, standingOf } from '@/domain/shared/tripPhase'
import { closeOverlayRoute } from '@/composables/shared/closeOverlay'
import {
  LINE_QUERY_PARAM,
  tripExcursionLinePath,
  tripExcursionsPath,
  tripNotesPath,
} from '@/router/paths'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { ExcursionItem, ExcursionTrack, FacetKey, GroupBy } from '@/types/domain'
import { ITEM_MODE_BUY_LOCAL, ITEM_MODE_PACK } from '@/types/domain'

const props = defineProps<{ tripId: string; excursionId: string }>()

/** M4's header ring (`packing/PackingHeadline.vue`), so the two figures are one size. */
const RING_SIZE_HEADER = 42

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

/**
 * M4's snackbar and its one undo (FR-25.2, FR-25.31), anchored above this
 * screen's ＋: a pack registers, the row leaves, and a mistap is taken back
 * from the snackbar — as on the packing list.
 */
const announcer = usePackAnnouncer(FAB_ANCHOR.m27Excursion)
const { rowUndo, packAnnouncements, announceRemoved, announceAct } = announcer

/** M4's row slices over the lines (`rowPort.ts`). */
const { port, lineById } = useExcursionRowPort({
  orchestrator: orchestrator.excursions,
  excursion,
  lines,
  participants,
  announcer,
})
const steps = useRowSteps(port)
const quantity = useRowQuantity(port)

// --- M4's view state: filter, reveal, grouping, search (FR-25.11, FR-25.18) ---

/**
 * M4's own composable, scoped to this excursion: the filter for the session,
 * the grouping durably — a Person filter on the hike means nothing on the
 * suitcase, so the two lists keep theirs apart.
 */
const filter = usePackingFilter(`excursion-${props.excursionId}`)
const { facets, showDone, groupBy, reset, toggleValue, clearFacet } = filter
const {
  term: search,
  isOpen: searchOpen,
  toggle: toggleSearch,
  action: searchAction,
} = useContextSearch('m27-search')
const filterOpen = ref(false)

/**
 * M4's folds, filter panel and reset (`usePackingListShape`). Erledigte is the
 * one reveal an excursion has — FR-25.20/25.27 are the suitcase's — and it has
 * no containers to group by.
 */
const {
  collapsedGroups,
  expandedClusters,
  groupBy: shownGroupBy,
  allFolded,
  toggleFoldAll,
  toggleGroup,
  toggleCluster,
  filterFacets,
  grouping,
  filterSwitches,
  onToggleSwitch,
  activeChips,
  emptyReason,
  searching,
  resetNarrowing,
} = usePackingListShape({
  filter,
  search: { term: search, isOpen: searchOpen },
  view: () => view.value,
  reveals: [SWITCH_KEYS.done],
  withoutGrouping: GROUPING_CONTAINER,
  menuActive: () => menuActive,
})

/**
 * M4's own view model over the lines (FR-31.6): the same
 * grouping, clusters, facets, search, counts and FR-25.2 departure, so the
 * list behaves as the packing list does because it is built by the same
 * function. Nobody's lines are hidden as somebody else's (FR-25.20 is the
 * suitcase's), and no line is packed late (FR-25.27).
 */
const view = computed(() =>
  buildPackingView({
    items: port.rows.value,
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

/**
 * M4's row resolvers as a line answers them: nobody holds or is handed a
 * line, it has no preparation and nothing borrows it — only the master's
 * photo and mark carry over (FR-28.7).
 */
const lineFacts: ListFacts<ExcursionItem> = {
  locked: () => false,
  rowNotes: () => NO_NOTES,
  edgeAvatarFor: () => null,
  assignableRow: () => false,
  masterOf: (item) => masterOf(item.source_item_id),
  clusterMaster: (cluster) => masterOf(cluster.sourceItemId),
  openTodoCount: () => 0,
  borrowedBy: () => [],
}

/** FR-25.29: a tap toggles that person in the person facet — M4's quick filter. */
function selectPerson(value: string) {
  toggleValue('person', value)
}

// --- the header line yields to the list (FR-21.17), as M4's ---

const content = ref<{ $el: HTMLIonContentElement } | null>(null)
const { collapsed: headCollapsed, onScroll, onScrollEnd } = useHeadScroll(content)

// --- the line's acts, each behind M4's snackbar and its one undo (FR-25.31) ---

/** FR-5.8 on a line: off the list, M4's snackbar with its undo. */
function removeLine(line: ExcursionItem) {
  const undo = orchestrator.excursions.removeLine(line)
  rowUndo.armAction(line.name, undo)
  void announceRemoved(line.name)
}

/** FR-5.9 on a line (FR-31.8): packed, or bought on the spot. */
function setMode(line: ExcursionItem, mode: typeof ITEM_MODE_BUY_LOCAL | typeof ITEM_MODE_PACK) {
  const before = { mode: line.mode, bought_at: line.bought_at }
  actUndoably(
    port,
    line,
    t(mode === ITEM_MODE_BUY_LOCAL ? 'packing.buyLocalToast' : 'packing.packInsteadToast', {
      name: line.name,
    }),
    () => orchestrator.excursions.setLineMode(line, mode),
    (live) => orchestrator.excursions.updateLine(live, before),
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
    port,
    line,
    t(bought ? 'excursions.boughtToast' : 'excursions.unboughtToast', { name: line.name }),
    () => orchestrator.excursions.markBought(line, bought),
    (live) => orchestrator.excursions.updateLine(live, { bought_at: before }),
  )
}

/** FR-31.13: bought on the spot, kept — with the one undo the act owes. */
function keep(line: ExcursionItem) {
  const undo = orchestrator.excursions.addToPackingList(props.tripId, line)
  if (!undo) return
  rowUndo.armAction(line.name, undo)
  void announceAct(t('excursions.keptToast', { item: line.name }))
}

/** FR-31.14: a line of the excursion alone becomes an inventory item, undoably. */
function adopt(line: ExcursionItem) {
  const undo = orchestrator.excursions.adoptIntoInventory(props.tripId, line)
  if (!undo) return
  rowUndo.armAction(line.name, undo)
  void announceAct(t('excursions.adoptedToast', { item: line.name }))
}

// --- the detail: M5's sheet, or the side panel on a desktop (G-9) ---

/** Read off the route, as M5's `?item=`: a tap, a deep link and a reload open the same. */
const openLineId = computed(() => {
  const value = route.query[LINE_QUERY_PARAM]
  return typeof value === 'string' && value !== '' ? value : null
})

/** G-9: the detail as a bottom sheet, or as a side panel beside the list. */
const isDesktop = useDesktopLayout()

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
function openSheet(lineId: string) {
  if (menuActive) return
  void router.push(tripExcursionLinePath(props.tripId, props.excursionId, lineId))
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
      quantity.open(line)
      return
    case 'skip':
      steps.onSkipItem(line)
      return
    case 'unskip':
      steps.onUnskipItem(line)
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
/** M4's browse verbs over the lines — nobody holds a line, so none is locked (FR-25.13f). */
const browse = useBrowseVerbs(port, () => null)
const adds = useExcursionAdd({
  tripId: props.tripId,
  excursionId: props.excursionId,
  lines,
  participants,
  verbs: browse,
})
const onBrowse = browse.onBrowse(adds.browseAdds)

// --- the excursion's own acts, in the bar's ⋮ ---

const editing = ref(false)

async function saveEdit(result: ExcursionSheetResult) {
  editing.value = false
  const ex = excursion.value
  if (!ex) return
  orchestrator.excursions.updateExcursion(ex, {
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
  const undo = orchestrator.excursions.setParticipants(props.tripId, ex.id, result.travelerIds)
  rowUndo.armAction(ex.name, undo)
  void announceAct(t('excursions.participantsChanged'))
}

async function saveAsGroup() {
  const ex = excursion.value
  if (!ex) return
  // FR-31.14: things the inventory does not know join it only if asked to.
  let includeUnlisted = true
  const unlisted = orchestrator.excursions.unlistedNames(props.tripId, ex.id)
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
      const id = orchestrator.excursions.saveAsGroup(props.tripId, ex.id, name, includeUnlisted)
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
  orchestrator.excursions.deleteExcursion(props.tripId, ex.id)
  void router.replace(tripExcursionsPath(props.tripId))
}

// --- GPX tracks (FR-31.15, ADR-089) ---

const tracksOn = computed(() =>
  excursion.value ? orchestrator.excursions.tracksOf(props.tripId, excursion.value.id) : [],
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
    tracks: () => orchestrator.excursions.tracksOf(ex.trip_id, ex.id),
    add: (upload) => orchestrator.excursions.addTrack(ex, upload),
    replace: (track, upload) => orchestrator.excursions.replaceTrack(track, upload),
    update: (track, settings) => orchestrator.excursions.updateTrack(track, settings),
    remove: (track) => orchestrator.excursions.removeTrack(track),
    file: (track) => orchestrator.excursions.trackFile(track),
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
          :scope="browse.scope.value"
          :offer-local-only="true"
          @add="adds.onQuickAdd"
          @add-local="adds.onQuickAddLocal"
          @add-group="adds.onAddGroup"
          @browse="onBrowse"
        />

        <ExcursionExtraList :lines="extras" />

        <PackingGroupList
          v-if="view.groups.length > 0"
          class="excursion-list"
          screen="m27"
          :trip-id="tripId"
          :groups="view.groups"
          :closing-pass="false"
          :facts="lineFacts"
          :row-hold="hold"
          @toggle-group="toggleGroup"
          @toggle-cluster="toggleCluster"
          @open="openSheet"
          @row-menu="openLine"
          @edit-quantity="quantity.open"
          @increment="steps.onIncrement"
          @decrement="steps.onDecrement"
          @complete="steps.onComplete"
          @zero="steps.onZero"
          @toggle="steps.onToggle"
        >
          <template #facts="{ item, testKey, child }">
            <ExcursionFacts
              :line="item"
              :test-key="testKey"
              :from-luggage="suitcaseOf(item, tripItems) !== null"
              :left-behind="child && item.packed_count > 0 && isLeftBehind(item, participants)"
              :can-keep="canJoinPackingList(item)"
              :can-adopt="canAdoptIntoInventory(item)"
              @buy-on-site="buyOnSite(item)"
              @take-out="removeLine(item)"
              @keep="keep(item)"
              @adopt="adopt(item)"
            />
          </template>
        </PackingGroupList>

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
      <RowQuantityPopover
        testid="m27-quantity-popover"
        :open="quantity.isOpen.value"
        :event="quantity.event.value"
        :label="quantity.clusterLabel.value"
        :item="quantity.item.value"
        :packed="quantity.packed.value"
        :choices="quantity.choices.value"
        @update="quantity.set"
        @closed="quantity.closed"
      />

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

/* M5's side panel (G-9), as M4 lays it out in the frame's second pane. */
.item-panel {
  width: var(--jp-panel-w);
  overflow-y: auto;
  background: var(--ct-mantle);
  border-left: 1px solid var(--ct-surface1);
  box-shadow: var(--jp-shadow-panel);
}

/* M4's list body (`packing/PackingGroupList.vue`) sits on the page's own ground. */
.excursion-list {
  padding: 0;
  background: transparent;
}

@media (prefers-reduced-motion: reduce) {
  .trip-line {
    transition: none;
  }
}

.excursion-idea {
  margin: 0 16px 6px;
}
</style>
