<script setup lang="ts">
/**
 * M4 — Packing list, and since the phase hub was dropped (2026-08-08) the
 * trip screen itself: tapping a trip opens this, with nothing in between.
 *
 * Rebuilt from the concept mock (UI-Spec M4, Addendum §3.25). What the
 * shape is answering, in one line each:
 *
 *  - **The header line** (trip line): the trip's name where the app bar has
 *    no room for it, its *other views* as labelled icons, then progress,
 *    weight, open prep and the presence facepile. It stays unfiltered
 *    whatever the list shows (G-12), so a short list is never mistaken for
 *    a finished trip. It hides on scroll-down and returns on any upward
 *    scroll, which is where the list height comes from — and the page head
 *    above it goes with it, deliberately (the name used to live in this
 *    line, and the owner's call was that it goes too).
 *  - **Actions in the app bar** (G-12): search behind its icon (FR-25.11k)
 *    and fold-all (FR-25.16). No ⋯ overflow — three destinations behind an
 *    unlabelled glyph is exactly where concept testing kept failing.
 *  - **Rows** come from `buildPackingView`: per-person clusters (FR-25.1),
 *    done rows dropping out (FR-25.2), one avatar at the right edge that
 *    is the assignee while open and the packer once packed (FR-25.19).
 *  - **Nothing hides silently.** The done bar (FR-25.2) and the reveal bar
 *    (FR-25.20) name their counts, and an empty list distinguishes "all
 *    packed" from "nothing matches" (FR-25.11e) — announcing completion
 *    over a narrowed list is the failure that rule exists to prevent.
 */
import {
  IonPage,
  IonContent,
  IonList,
  IonItem,
  IonIcon,
  IonLabel,
  IonButton,
  IonCheckbox,
  IonRefresher,
  IonRefresherContent,
  IonFab,
  IonFabButton,
  IonPopover,
  actionSheetController,
  onIonViewDidEnter,
  onIonViewWillLeave,
} from '@ionic/vue'
import {
  addOutline,
  archiveOutline,
  bagHandleOutline,
  contrastOutline,
  closeCircleOutline,
  removeCircleOutline,
  refreshOutline,
  buildOutline,
  checkmarkDoneOutline,
  chevronDownOutline,
  contractOutline,
  createOutline,
  expandOutline,
  funnelOutline,
  layersOutline,
  locationOutline,
  lockOpenOutline,
  peopleOutline,
  personOutline,
  playOutline,
  textOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons'

import { packedPercent, stateFor } from '@/domain/packState'
import { progressByTraveler, showsTravelerProgress } from '@/domain/travelerProgress'
import { PANEL_HOST_SELECTOR } from '@/lib/frameSlots'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EmptyState from '@/components/global/EmptyState.vue'
import RevealBar from '@/components/global/RevealBar.vue'
import FilterSheet from '@/components/global/FilterSheet.vue'
import ArchivedTripCard from '@/components/trips/ArchivedTripCard.vue'
import ClosingPassBanner from '@/components/trips/ClosingPassBanner.vue'
import ClusterHead from '@/components/trips/ClusterHead.vue'
import TripTodoFigure from '@/components/trips/TripTodoFigure.vue'
import TripTodoList from '@/components/trips/TripTodoList.vue'
import TravelerProgressStrip from '@/components/trips/TravelerProgressStrip.vue'
import { tripTodoProgress, tripTodoStatus, tripTodosUnfolded } from '@/domain/tripTodos'
import ItemDetailSheet from '@/components/trips/ItemDetailSheet.vue'
import PackingRow, {
  type PackingRowNotes,
  type RowEdgeAvatar,
} from '@/components/trips/PackingRow.vue'
import ForWhomStrip from '@/components/trips/ForWhomStrip.vue'
import PresenceFacepile from '@/components/global/PresenceFacepile.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import ProgressFigure from '@/components/global/ProgressFigure.vue'
import SearchRow from '@/components/global/SearchRow.vue'
import QuickAddItem from '@/components/global/QuickAddItem.vue'
import { groupAdditionMessage } from '@/lib/groupAdditionMessage'
import {
  activeChips as chipsFor,
  emptyReason as emptyReasonFor,
  filterFacets as facetsFor,
  filterSwitches as switchesFor,
  SWITCH_KEYS,
  groupingAxis,
  onlyOthersHidden as isOnlyOthersHidden,
} from '@/lib/packingFilterPanel'
import { hasCollaborativeSession } from '@/mode'
import { presentToast } from '@/lib/toast'
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import { useTripScreen } from '@/composables/useTripScreen'
import QuantityEditor from '@/components/global/QuantityEditor.vue'
import { quantityChoices } from '@/domain/quantityChoices'
import { durationDays } from '@/domain/instantiate'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useContextSearch } from '@/composables/useContextSearch'
import { useLongPress } from '@/composables/useLongPress'
import { usePackingFilter } from '@/composables/usePackingFilter'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { usePackAnnouncer } from '@/composables/usePackAnnouncer'
import type { RowUndoRecord } from '@/composables/useRowUndo'
import { browseRowStates } from '@/domain/browseRows'
import type { AddedItemDecision } from '@/sync/mutations'
import {
  buildPackingView,
  isReshaped,
  type PackingCluster,
  type PackingEntry,
  rowEdgeAvatar,
} from '@/domain/packingView'
import { avatarAssignable, rowMenuEntries, type RowMenuAction } from '@/domain/rowMenu'
import {
  clusterMenuEntries,
  clusterTargets,
  type ClusterFanOut,
  type ClusterInstance,
  type ClusterMenuContext,
  type ClusterMenuAction,
} from '@/domain/clusterActions'
import { canJudgeUnused, isActive, nextLifecycleStep } from '@/domain/trips'
import { formatWeight } from '@/lib/format'
import { t, type MessageKey } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { isScrollGesture, nextHeadState } from '@/lib/headScroll'
import { collapseRow } from '@/lib/rowCollapse'
import type { HeadScrollState } from '@/lib/headScroll'
import { buildReviewProposals } from '@/domain/review'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import GroupChangesProposal from '@/components/trips/GroupChangesProposal.vue'
import InventoryNamesSheet from '@/components/trips/InventoryNamesSheet.vue'
import type { InventoryRename } from '@/domain/inventoryNames'
import type {
  FacetKey,
  GroupBy,
  ItemTodo,
  MasterItem,
  TripItem,
  TripParticipant,
  TripTodo,
} from '@/types/domain'
import { ITEM_MODE_BUY_LOCAL, ITEM_MODE_PACK, TRIP_STATUS_ARCHIVED } from '@/types/domain'
import { ITEM_QUERY_PARAM, tripItemPath, tripPath, tripSubPath } from '@/router/paths'
import { confirmAction, confirmDestructive } from '@/lib/confirm'
import { removalSentence } from '@/lib/removalLabels'
import { removalNeedsConfirm } from '@/domain/rowRemoval'
import { lockNoteText, packedStampText, responsibleNote, skippedNote } from '@/lib/rowFacts'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { SPREAD } from '@/composables/sync/actions/packing'
import { forWhomColumn, membershipKey, rowsCarryingContent } from '@/domain/membership'
import type { BrowseAddition } from '@/components/global/QuickAddItem.vue'

const props = defineProps<{ tripId: string; itemId?: string }>()

const tripStore = useTripStore()
const masterStore = useMasterStore()
const router = useRouter()
const route = useRoute()
const orchestrator = useOrchestrator()

// ADR-033: `loaded` says whether this trip's partition is on the device. M4's
// three empty states all read off rows that arrive after the screen paints.
const {
  trip,
  loaded: rowsLoaded,
  ensure: ensureTripRows,
} = useTripScreen(props.tripId, orchestrator)

// --- Identity, for FR-25.19/25.20 ---------------------------------------
const {
  myUserId,
  participants,
  nameOf,
  load: loadIdentity,
} = useTripIdentity(props.tripId, orchestrator)

onMounted(async () => {
  // Joins the load `useTripScreen` started; it does not begin a second one.
  await ensureTripRows()
  // FR-27.4: opening the trip is the moment it works out what the groups it
  // follows would change. After the drain, not before — the diff must see the
  // rows the pull just brought, or it would offer what another device already
  // applied.
  orchestrator.proposeTripRefresh(props.tripId)
  await loadIdentity()
})

// --- View state ---------------------------------------------------------
// The filter, the two reveal switches and the grouping live in their own
// composable because they outlive this component (FR-25.18): the filter
// for the session, the grouping durably. The search term deliberately
// does not — see there.
const { facets, showDone, showOthers, showLate, groupBy, reset, toggleValue, clearFacet } =
  usePackingFilter(props.tripId)

const {
  term: search,
  isOpen: searchOpen,
  toggle: toggleSearch,
  action: searchAction,
} = useContextSearch('m4-search')
const collapsedGroups = ref<string[]>([])
/** FR-25.24: per-person clusters the user opened; shut is the default. */
const expandedClusters = ref<string[]>([])
const showPrep = ref(false)
/**
 * FR-7.4: the user's own fold of *Aufgaben für die Reise* this visit; null
 * while untouched, and then the todos decide (`tripTodosUnfolded`).
 */
const tripTodosFold = ref<boolean | null>(null)
/** FR-7.4: the section itself, which the header figure scrolls to. */
const tripTodosSection = ref<HTMLElement | null>(null)
const filterOpen = ref(false)
const quickAdd = ref<InstanceType<typeof QuickAddItem> | null>(null)

/** Whether the composer is open — the ＋ has nothing to add while it is. */
const quickAddExpanded = computed(() => quickAdd.value?.expanded ?? false)

function openQuickAdd() {
  void quickAdd.value?.open()
}

/**
 * FR-27.4: what the groups this trip follows would change. Derived on open
 * and after every master pull; nothing is written until one of the two
 * buttons is pressed.
 */
const groupProposal = computed(() => orchestrator.refreshProposals.value[props.tripId] ?? null)

/**
 * FR-27.16: the names on this trip the inventory has moved on from. Derived,
 * like the proposal above, and never stored — the ⋮ entry and M5's line both
 * read it, and it empties itself once the names match.
 */
const inventoryRenames = computed(() => orchestrator.inventoryRenamesOf(props.tripId))
const inventoryNamesOpen = ref(false)

/** The choice the open row belongs to, for M5's own „Übernehmen". */
const openItemRename = computed(
  () =>
    inventoryRenames.value.find((r) => r.rows.some((row) => row.id === openItemId.value)) ?? null,
)

/**
 * Takes the chosen names over, from the sheet or from M5's one-row line.
 * Armed with the snackbar's undo like a pack: taking every name over is one
 * tap on „Alle", and a tap that renames a dozen rows needs a way back.
 */
function adoptInventoryNames(chosen: InventoryRename[]) {
  inventoryNamesOpen.value = false
  if (chosen.length === 0) return
  const undo = orchestrator.adoptInventoryNames(props.tripId, chosen)
  rowUndo.armUndo(
    undo.adoption.rows.map((r) => r.item),
    () => orchestrator.restoreInventoryNames(props.tripId, undo),
  )
  void announceRenamed(chosen.length)
}

async function applyGroupChanges() {
  const applied = orchestrator.acceptTripRefresh(props.tripId)
  await reportGroupAnswer(t('trips.proposedApplied', { n: applied?.log.length ?? 0 }))
}

async function declineGroupChanges() {
  orchestrator.declineTripRefresh(props.tripId)
  await reportGroupAnswer(t('trips.proposedDeclined'))
}

/** A plain toast: both answers are final, and neither has an undo to offer. */
async function reportGroupAnswer(message: string) {
  await presentToast({ message, positionAnchor: FAB_ANCHOR.m4 })
}

/**
 * FR-9.4: the first proposals the review would offer, for the closing card.
 *
 * UI-Spec M14 has promised since the screen shipped that the card *„teases the
 * first two proposals"*, and it read none — so it said the same thing whether
 * eleven suggestions were waiting or none, which is the one question the tap
 * answers. Two, because the card is a tease and the list is one tap away.
 *
 * It calls the same rule M14 calls (invariant 4): a second, cheaper
 * approximation here would be a rule implemented twice, and the one that
 * drifts is always the summary.
 *
 * The computed is read only inside the card's own `v-if`, so on an active
 * trip — M4's ordinary state — it never runs.
 */
const CLOSING_TEASER_COUNT = 2

const closingProposals = computed(() =>
  buildReviewProposals({
    items: allItems.value,
    templates: masterStore.templateList,
    templateItems: (id) => masterStore.getTemplateItems(id),
    masterItems: masterStore.itemList,
  }).slice(0, CLOSING_TEASER_COUNT),
)

/**
 * Rows whose confirmed removal is still inside the snackbar's undo (FR-25.31).
 * They leave the screen at once and the trip only when the undo lapses — the
 * row, its comments and its todos are never deleted and re-created, so the
 * undo cannot resurrect a note under the wrong author (invariant 3).
 */
const removingRows = ref(new Set<string>())
/** The same for the trip's own tasks (FR-7.4). */
const removingTodos = ref(new Set<string>())

const kpis = computed(() =>
  tripStore.kpis(props.tripId, new Set([...removingRows.value, ...removingTodos.value])),
)
const active = computed(() => isActive(trip.value))
/** FR-9.3's window, decided once in the domain (`canJudgeUnused`). */
const judgeable = computed(() => canJudgeUnused(trip.value))

/**
 * FR-9.3's closing pass: a *mode of M4*, not a screen of its own. It keeps
 * this list's grouping, facets and search — at a hundred and twenty rows
 * that is the whole reason it lives here — and takes the ending the
 * rejected own-screen variant had: *Fertig* archives and opens M14, so
 * the pass leads where the marks are going rather than handing back the
 * list it started in. The only door into it is the archive action.
 */
const closingPass = ref(false)

const allItems = computed(() =>
  tripStore.getItems(props.tripId).filter((row) => !removingRows.value.has(row.id)),
)

/**
 * FR-25.19: the people this trip's rows can be handed to — members of the
 * trip, minus myself. The same rule M5's control uses, and for the same
 * reason: assigning a row to myself says nothing, and in Single-User and
 * Local Mode there is nobody else at all, so the control is absent rather
 * than inert (G-8).
 */
const assignableMembers = computed(() => {
  const members = new Set(tripStore.getMembers(props.tripId).map((m) => m.user_id))
  return participants.value.filter(
    (person) => members.has(person.user_id) && person.user_id !== myUserId.value,
  )
})

/**
 * FR-7.5: who a trip todo can be handed to — every member, *me included*.
 * A row leaves me out because an unassigned row is already mine to see
 * (FR-25.20); a todo has no such filter, and „I'll do it" is the most
 * common thing a household says about one.
 */
const todoAssignees = computed(() => {
  const members = new Set(tripStore.getMembers(props.tripId).map((m) => m.user_id))
  return participants.value.filter((person) => members.has(person.user_id))
})

/** FR-25.25, decided in the domain (`avatarAssignable`) — see there for why. */
function assignableRow(item: TripItem): boolean {
  return avatarAssignable(item, {
    hasAssignees: assignableMembers.value.length > 0,
    closingPass: closingPass.value,
    locked: locked(item),
  })
}

/**
 * The person picker, shared by the row's avatar and the cluster head's „für
 * alle" (FR-25.25/25.26). Resolves to the chosen assignment — `null` is
 * *nobody*, which is a choice like any other — or to `undefined` when the
 * sheet was dismissed, because "assign to nobody" and "never mind" must not
 * arrive here as the same value.
 */
async function pickAssignee(
  header: string,
  current: string | null,
  people: readonly TripParticipant[] = assignableMembers.value,
): Promise<string | null | undefined> {
  let picked: string | null | undefined
  const sheet = await actionSheetController.create({
    header,
    buttons: [
      ...people.map((person) => ({
        text: person.display_name,
        icon: personOutline,
        role: person.user_id === current ? 'selected' : undefined,
        handler: () => {
          picked = person.user_id
        },
      })),
      {
        text: t('item.assignedToNobody'),
        icon: removeCircleOutline,
        role: current === null ? 'selected' : undefined,
        handler: () => {
          picked = null
        },
      },
      { text: t('common.cancel'), role: 'cancel' },
    ],
  })
  await sheet.present()
  await sheet.onDidDismiss()
  return picked
}

/**
 * FR-25.25: the row's own avatar, tapped.
 *
 * The traveler is passed in rather than resolved here because only the view
 * model knows whether this row is an instance of a per-person item: under a
 * cluster the row is named by its *person*, so a sheet headed with the item
 * alone would not name the row it was opened from. Same composition M4 uses
 * for a lone per-person row's label.
 */
async function onAssignRow(item: TripItem, traveler?: string | null): Promise<void> {
  if (!assignableRow(item)) return
  const header = traveler ? `${item.name} · ${traveler}` : item.name
  const picked = await pickAssignee(header, item.packer_user_id)
  if (picked === undefined) return
  const previous = item.packer_user_id
  actUndoably(
    item,
    picked === null
      ? t('packing.unassignedToast', { name: item.name })
      : t('packing.assignedToast', { name: item.name, who: nameOf(picked) ?? '' }),
    () => orchestrator.setPacker(props.tripId, item, picked),
    (live) => orchestrator.setPacker(props.tripId, live, previous),
  )
}

/**
 * FR-25.13c: what the trip already carries — skipped rows included — is
 * not offered again by the quick-add, and it is the context the composer's
 * chip rows relate to. Bringing a skipped item back is M4's reveal + undo
 * path (FR-5.5), not a second add.
 */
const quickAddExcludeIds = computed(() => [
  ...new Set(
    allItems.value.map((item) => item.source_item_id).filter((id): id is string => id !== null),
  ),
])
/**
 * FR-25.13f: what the browse-sheet's two verbs may do, per master item.
 * Built here rather than in the sheet because only M4 knows the trip's rows
 * and G-3's holders — the sheet renders the answer and emits the verb.
 */
const browseStates = computed(() =>
  browseRowStates(
    allItems.value,
    (item) => (locked(item) ? (lockNote(item) ?? t('packing.lockedByUnknown')) : null),
    travelers.value,
  ),
)

const openPrepItems = computed(() => tripStore.itemsWithOpenPrep(props.tripId))

/**
 * FR-28.7: the row inherits the master item's photo and mark, it never copies
 * them — the mark is a property of the thing, not of one trip's plan. An
 * ad-hoc row has no master item and therefore no mark, and shows an empty
 * slot rather than a placeholder.
 */
function masterOf(item: TripItem): MasterItem | null {
  return (item.source_item_id ? masterStore.getItem(item.source_item_id) : undefined) ?? null
}

// --- FR-25.28: who an item is for, answered on the row -------------------

/** FR-25.28's *who* column — the rule is `forWhomColumn`'s. */
const seatColumn = computed(() => forWhomColumn(travelers.value.length, closingPass.value))

/**
 * Which item's strip is open — at most one, so working down a list costs one
 * tap per row to move on. Held by {@link membershipKey} rather than by a row
 * id: the first traveler turns a row into a cluster and the last one turns it
 * back, and the strip has to stay open across both.
 */
const forWhomKey = ref<string | null>(null)

function forWhomKeyOf(entry: PackingEntry): string | null {
  if (entry.kind === 'item') return membershipKey(entry.item)
  const instance = allItems.value.find((i) => i.id === entry.instanceIds[0])
  return instance ? membershipKey(instance) : null
}

/**
 * The entry the open strip hangs under: the first one of that item in list
 * order. Grouped by traveler, one item is several rows in several groups, and
 * a strip under each would be one control drawn N times.
 */
const forWhomAnchor = computed<PackingEntry | null>(() => {
  if (forWhomKey.value === null || !seatColumn.value) return null
  for (const group of view.value.groups) {
    for (const entry of group.entries) {
      if (forWhomKeyOf(entry) === forWhomKey.value) return entry
    }
  }
  return null
})

/** What the list shows right now, as `isReshaped` wants it: which items, and which rows. */
const shownForWhom = computed(() => {
  const keys = new Set<string>()
  const rowIds = new Set<string>()
  for (const group of view.value.groups) {
    for (const entry of group.entries) {
      const key = forWhomKeyOf(entry)
      if (key !== null) keys.add(key)
      if (entry.kind === 'item') rowIds.add(entry.item.id)
      else for (const id of entry.instanceIds) rowIds.add(id)
    }
  }
  return { keys, rowIds }
})

const existingRowIds = computed(() => new Set(allItems.value.map((i) => i.id)))

function forWhomOpenOn(entry: PackingEntry): boolean {
  return forWhomAnchor.value === entry
}

function seatFor(entry: PackingEntry): { open: boolean } | null {
  return seatColumn.value ? { open: forWhomOpenOn(entry) } : null
}

function toggleForWhom(entry: PackingEntry) {
  const key = forWhomKeyOf(entry)
  forWhomKey.value = forWhomKey.value === key ? null : key
}

/**
 * The same resolution for a per-person cluster, which has no `TripItem` of
 * its own — the head is the item, its children are the travelers.
 */
function clusterMaster(cluster: PackingCluster): MasterItem | null {
  return (cluster.sourceItemId ? masterStore.getItem(cluster.sourceItemId) : undefined) ?? null
}

const travelers = computed(() => tripStore.getTravelers(props.tripId))

/** FR-25.29: every traveler's share of the whole trip — unfiltered, like the trip line. */
const travelerShares = computed(() => progressByTraveler(allItems.value, travelers.value))

/**
 * FR-25.29: a tap toggles that traveler in the person facet, so the rings are
 * quick filters — *mine and the shared ones* is two taps, OR'd like the
 * sheet's chips. Narrowing to one alone used to cost a trip to the sheet for
 * exactly the combination a packer wants most.
 */
function selectTraveler(value: string) {
  toggleValue('person', value)
}

const view = computed(() =>
  buildPackingView({
    items: allItems.value,
    travelers: travelers.value,
    containers: tripStore.getContainers(props.tripId),
    participants: participants.value,
    groupBy: groupBy.value,
    showDone: showDone.value || closingPass.value,
    facets: facets.value,
    search: search.value,
    currentUserId: myUserId.value,
    showOthers: showOthers.value,
    // FR-9.3's closing pass reviews what was taken along, and a late-packer
    // row was taken along like any other.
    showLate: showLate.value || closingPass.value,
    collapsedGroups: collapsedGroups.value,
    expandedClusters: expandedClusters.value,
    itemsWithOpenPrep: openPrepItems.value.map((entry) => entry.item.id),
    packedOnly: closingPass.value,
  }),
)

// --- M5, as a sheet over this list (UI-Spec M5) --------------------------
// Driven by the route rather than by local state: the same URL opens it
// from a tap, a deep link and a reload, and `‹ back` closes it because
// the route declares the item as its overlay (`meta.overlayQuery`).
//
// Read off the query, not off a prop: Ionic caches a page's route props
// for the page's lifetime, and the point of `?item=` (ADR-046) is that
// this page *keeps* living — a path parameter made every open mount a
// second copy of the list, which stood beside the first, unhidden, for as
// long as its children took to become ready.
const openItemId = computed(() => {
  const value = route.query[ITEM_QUERY_PARAM]
  return typeof value === 'string' && value !== '' ? value : null
})

/**
 * Opening and closing the sheet **replaces** the route rather than
 * pushing: the sheet is a state of this screen, not a screen of its own,
 * and one screen keeps one history entry — the browser's back with the
 * sheet open is router/overlayBackGuard's to answer.
 */
function openItem(itemId: string) {
  if (rowMenuActive) return
  // One posture, one meaning (FR-9.3): in the pass the tap is the mark,
  // and the detail sheet — which asks a dozen other questions — is not
  // what this screen is asking.
  if (closingPass.value) return
  router.replace(tripItemPath(props.tripId, itemId))
}

// --- FR-25.24: how many of this are coming along -------------------------
//
// The editor hangs off the row's own count rather than living a screen
// away: correcting an amount is something a person does to five rows in a
// row while looking at the list, and a sheet per row would cost the list
// five times. M5 carries the same control in a block of its own, for the
// other posture — one row, read properly.
/**
 * The rows the editor writes: one when a row opened it, every instance the
 * head's *Menge* reaches when a cluster head did (FR-25.26) — the amount is
 * per person, so the same number is written to each of them.
 */
const quantityRowIds = ref<string[]>([])

/**
 * What the popover names when it stands for several rows — the item and how
 * many people it writes for. Null for a single row, which names itself.
 */
const quantityClusterLabel = ref<string | null>(null)

/**
 * The tap that opened the editor, which is what Ionic anchors the popover
 * to. Undefined when it was opened from the row menu, where there is no
 * row on screen to point at any more — Ionic then centres it.
 */
const quantityEvent = ref<MouseEvent | undefined>(undefined)

const quantityRows = computed(() => rowsOf(quantityRowIds.value))

/**
 * The row whose amount the editor shows. For a cluster that is the first
 * instance: the instances may disagree, and the first tap writes one number
 * to every one of them, after which the display is true of all.
 */
const quantityItem = computed(() => quantityRows.value[0] ?? null)

/** The floor the editor warns about: the most any written row has packed. */
const quantityPacked = computed(() =>
  Math.max(0, ...quantityRows.value.map((row) => row.packed_count)),
)

const quantityChoiceList = computed(() =>
  quantityChoices({
    durationDays: durationDays(trip.value?.start_date ?? null, trip.value?.end_date ?? null),
    travelerCount: travelers.value.length,
    perPerson: Boolean(quantityItem.value?.assigned_traveler_id),
  }),
)

/**
 * G-3 and FR-9.3 keep the editor shut for the same reasons the stepper is
 * inert: somebody else holds the row, or the screen is asking a different
 * question and this is not an answer to it.
 */
function openQuantity(item: TripItem, event?: MouseEvent): void {
  if (closingPass.value || locked(item)) return
  quantityEvent.value = event
  quantityClusterLabel.value = null
  quantityRowIds.value = [item.id]
}

function closeQuantity(): void {
  quantityRowIds.value = []
  quantityClusterLabel.value = null
}

/**
 * The row as the editor found it (FR-25.31). One editing session is one act:
 * three taps on ＋ are one change of amount, and the undo goes back to where
 * the popover opened rather than one step. Announced on close, not per tap —
 * a snackbar raised over the open popover would also be the overlay Escape
 * dismisses first, leaving the popover standing and the undo gone.
 */
let quantityBefore: TripItem[] | null = null

function onSetQuantity(quantity: number): void {
  // Snapshotted at the first write rather than at opening, so both openers —
  // a row and a cluster head (FR-25.26) — share one capture of every row.
  quantityBefore ??= quantityRows.value.map((row) => ({ ...row }))
  for (const row of quantityRows.value) orchestrator.setQuantity(props.tripId, row, quantity)
}

function onQuantityClosed(): void {
  closeQuantity()
  const before = quantityBefore
  quantityBefore = null
  const first = before?.[0]
  if (!before || !first) return
  const now = liveRow(first.id)
  if (!now || now.quantity === first.quantity) return
  // Three fields, as the write has them: an amount cut below the packed count
  // clamps the count, and the undo has to give both back (FR-25.24).
  rowUndo.armUndo(before, (records) => orchestrator.restoreSkip(props.tripId, records))
  void announceAct(t('packing.quantityToast', { name: now.name, n: now.quantity }))
}

// --- Row menu: press and hold (FR-5.5, FR-5.2) --------------------------
//
// The same gesture M7 uses, chosen over the swipe it replaces: the swipe
// was announced by nothing and its option panel broke out of the row's
// card, which is where it also lost the M7 round. The 500 ms live in
// useLongPress, unit-tested with fake timers; `contextmenu` covers desktop
// and is the seam the e2e case drives.
const hold = useLongPress<TripItem>(openRowMenu)

/**
 * FR-5.5's press-and-hold is the *row's*, and the packing control is not the
 * row (E2E-G6-01). That exception used to live here as a `closest()` on the
 * control column's class — a rule about a component, written one file away
 * from it and coupled to its stylesheet. `PackingRow` stops the press at the
 * control itself now, so a press that reaches this handler is already the
 * row's.
 */
function onRowPress(item: TripItem, event: PointerEvent): void {
  hold.down(item, event.clientX, event.clientY)
}

/**
 * Row taps are ignored while the menu lives — same reasoning as M7's: the
 * release of a hold usually lands on the overlay rather than the row, so a
 * "swallow the next click" flag would go stale and eat a later tap.
 */
let rowMenuActive = false

/**
 * Label and glyph for each entry `rowMenuEntries` can return — the wording
 * and the icons are the screen's, the decision is the domain's.
 */
const ROW_MENU_BUTTONS: Record<
  RowMenuAction,
  { labelKey: MessageKey; icon: string; role?: 'destructive' }
> = {
  takeover: { labelKey: 'packing.takeoverAction', icon: lockOpenOutline },
  release: { labelKey: 'packing.releaseAction', icon: lockOpenOutline },
  unskip: { labelKey: 'packing.unskipAction', icon: refreshOutline },
  quantity: { labelKey: 'quantity.edit', icon: layersOutline },
  packingNow: { labelKey: 'mode.pack', icon: contrastOutline },
  skip: { labelKey: 'packing.skipAction', icon: closeCircleOutline },
  // FR-5.9: the glyphs the row's own mode badge shows, so the entry names the
  // state it leaves the row in.
  buyLocal: { labelKey: 'mode.buyLocal', icon: locationOutline },
  packInstead: { labelKey: 'packing.packInsteadAction', icon: bagHandleOutline },
  latePackerOn: { labelKey: 'packing.latePackerOn', icon: timeOutline },
  latePackerOff: { labelKey: 'packing.latePackerOff', icon: timeOutline },
  flagUnused: { labelKey: 'packing.flagUnusedAction', icon: removeCircleOutline },
  unflagUnused: { labelKey: 'packing.unflagUnusedAction', icon: removeCircleOutline },
  // FR-5.8: the one entry that deletes — iOS paints it red, the way
  // `confirmDestructive` marks its button.
  remove: { labelKey: 'packing.removeAction', icon: trashOutline, role: 'destructive' },
}

function runRowMenu(action: RowMenuAction, item: TripItem): void {
  switch (action) {
    case 'takeover':
      void onTakeOver(item)
      return
    case 'release':
      onReleaseClaim(item)
      return
    case 'unskip':
      onUnskipItem(item)
      return
    case 'quantity':
      // No event to hang it off: the menu is an overlay, and the row it was
      // opened from may have scrolled. Ionic centres a popover with no
      // reference, which is where the menu itself just was.
      openQuantity(item)
      return
    case 'packingNow':
      onPackingNow(item)
      return
    case 'skip':
      onSkipItem(item)
      return
    case 'buyLocal':
      onSetMode(item, ITEM_MODE_BUY_LOCAL)
      return
    case 'packInstead':
      onSetMode(item, ITEM_MODE_PACK)
      return
    case 'latePackerOn':
      onLatePacker(item, true)
      return
    case 'latePackerOff':
      onLatePacker(item, false)
      return
    case 'flagUnused':
      void onFlagUnused(item, true)
      return
    case 'unflagUnused':
      void onFlagUnused(item, false)
      return
    case 'remove':
      void onRemoveItem(item)
  }
}

// --- FR-25.26: the cluster head acts on every instance under it ----------
//
// The head is the only line that knows an item is one thing several people
// carry, and `late_packer` and the FR-25.19 assignment are the two fields
// that are usually a statement about the item rather than about a person —
// everybody brushes their teeth on the morning the trip leaves. Said
// instance by instance it cost one trip through M5 per traveler.

/** The same press the rows use; the short tap stays the fold (FR-25.23). */
const clusterHold = useLongPress<PackingCluster>(openClusterMenu)

/**
 * What the head may act on: the instances it *counts*, with the G-3 holder
 * resolved for each. Rows the filter or FR-25.2 removed are not among them —
 * the head's numbers describe the same set, and an action reaching past what
 * the reader can see would be a second, invisible list.
 */
function clusterInstances(cluster: PackingCluster): ClusterInstance[] {
  return cluster.instanceIds.flatMap((id) => {
    const item = allItems.value.find((row) => row.id === id)
    if (!item) return []
    const holder = locked(item) ? orchestrator.lockHolder(props.tripId, item) : null
    return [
      {
        id: item.id,
        row: item,
        lockedBy: holder ? nameOf(holder) : null,
        mine: orchestrator.holdsClaim(props.tripId, item),
      },
    ]
  })
}

/** What the head's rule reads beyond the instances — a row menu's context. */
function clusterMenuContext(): ClusterMenuContext {
  return {
    closingPass: closingPass.value,
    canAssign: assignableMembers.value.length > 0,
    judgeable: judgeable.value,
  }
}

/** The rows behind a fan-out plan, in the order the plan names them. */
function rowsOf(ids: string[]): TripItem[] {
  return ids.flatMap((id) => allItems.value.filter((row) => row.id === id))
}

/**
 * Say what a fan-out did — and, where a claim kept it off a row, say that
 * too. A group action that quietly wrote three of four would be indis-
 * tinguishable from one that wrote all four (G-3, advisory since 2026-08-30).
 */
function announceFanOut(written: number, total: number, blockedBy: string[]): void {
  void announceAct(
    blockedBy.length === 0
      ? t('packing.fanOutApplied', { n: written })
      : t('packing.fanOutPartial', {
          n: written,
          total,
          who: blockedBy.join(', '),
        }),
  )
}

/**
 * The name a fan-out's own snackbar reports under: the item, and — where a
 * claim kept the write off some instances — how many it did reach. The skip
 * and the removal carry an undo, so they cannot hand their report to
 * {@link announceFanOut}'s toast without losing it.
 */
function fanOutName(name: string, plan: ClusterFanOut): string {
  if (plan.blockedBy.length === 0) return name
  const total = plan.targetIds.length + plan.blockedBy.length
  return t('packing.clusterPartialName', { name, n: plan.targetIds.length, total })
}

/**
 * FR-5.5 over every instance at once: one undo for all of them, the way the
 * row's own skip arms one for its companions. `affected` is gathered from the
 * skips themselves — FR-20.2 co-skips a companion only once no traveler's row
 * still needs it, which only the last instance's skip can see.
 */
function skipRows(name: string, rows: TripItem[]): void {
  const affected: TripItem[] = []
  for (const row of rows) {
    for (const hit of orchestrator.skipItem(props.tripId, row)) {
      if (!affected.some((known) => known.id === hit.id)) affected.push(hit)
    }
  }
  rowUndo.armUndo(affected, (records) => orchestrator.restoreSkip(props.tripId, records))
  const targets = new Set(rows.map((row) => row.id))
  void announceSkipped(
    name,
    affected.filter((row) => !targets.has(row.id)).map((row) => row.name),
  )
}

/**
 * FR-5.8 over every instance at once, with the row's own two paths: nothing
 * on any of them goes behind one undo, anything the undo cannot return is
 * asked first. The inventory item goes only when these rows were its last use
 * (ADR-065) — the instances are no use of each other.
 */
async function removeRows(name: string, rows: TripItem[]): Promise<void> {
  const removal = orchestrator.planRowsRemoval(props.tripId, rows)
  const leftItem = orchestrator.itemLeftByRemovals(rows)
  const pruneLeftItem = () => {
    if (leftItem !== null) void orchestrator.pruneItemLeftByRemoval(props.tripId, leftItem)
  }
  if (!removalNeedsConfirm(removal)) {
    const snapshots = rows.map((row) => ({ ...row }))
    rowUndo.armUndo(
      snapshots,
      () => {
        for (const snapshot of snapshots) orchestrator.restoreRemovedItem(props.tripId, snapshot)
      },
      pruneLeftItem,
    )
    for (const row of rows) removeRow(row)
    void announceRemoved(name, leftItem !== null)
    return
  }
  const confirmed = await confirmDestructive({
    header: t('packing.removeConfirmTitle', { name }),
    message: removalSentence(removal, leftItem !== null),
    confirmLabel: t('common.remove'),
    testid: 'm4-remove-confirm',
  })
  if (!confirmed) return
  removeConfirmed(rows, removal.companions, pruneLeftItem)
  void announceRemoved(name, leftItem !== null)
}

async function runClusterMenu(action: ClusterMenuAction, cluster: PackingCluster): Promise<void> {
  const instances = clusterInstances(cluster)
  const plan = clusterTargets(action, instances, clusterMenuContext())
  const rows = rowsOf(plan.targetIds)
  const reached = plan.targetIds.length + plan.blockedBy.length
  const report = () => announceFanOut(rows.length, reached, plan.blockedBy)

  switch (action) {
    case 'assignAll': {
      // The head has no assignment of its own to show as picked: its instances
      // may disagree, and presenting one of them as the cluster's answer would
      // be a claim the model does not make.
      const picked = await pickAssignee(cluster.name, null)
      if (picked === undefined) return
      // Per row: the instances may have disagreed before the fan-out, and the
      // undo gives each its own value back (FR-25.31).
      const previous = new Map(rows.map((row) => [row.id, row.packer_user_id]))
      armRowsUndo(rows, (live) =>
        orchestrator.setPacker(props.tripId, live, previous.get(live.id) ?? null),
      )
      orchestrator.setPackerForRows(props.tripId, rows, picked)
      report()
      return
    }
    case 'latePackerOn':
    case 'latePackerOff': {
      const previous = new Map(rows.map((row) => [row.id, row.late_packer]))
      armRowsUndo(rows, (live) =>
        orchestrator.setLatePacker(props.tripId, live, previous.get(live.id) ?? false),
      )
      orchestrator.setLatePackerForRows(props.tripId, rows, action === 'latePackerOn')
      report()
      return
    }
    case 'release':
      armRowsUndo(rows, (live) => {
        if (!locked(live)) orchestrator.packingNow(props.tripId, live)
      })
      for (const row of rows) orchestrator.releaseClaim(props.tripId, row)
      report()
      return
    case 'unskip':
      rowUndo.armUndo(rows, (records) => orchestrator.restoreSkip(props.tripId, records))
      for (const row of rows) orchestrator.unskipItem(props.tripId, row)
      report()
      return
    case 'packingNow':
      armRowsUndo(rows, (live) => {
        if (orchestrator.holdsClaim(props.tripId, live))
          orchestrator.releaseClaim(props.tripId, live)
      })
      for (const row of rows) orchestrator.packingNow(props.tripId, row)
      report()
      return
    case 'buyLocal':
    case 'packInstead': {
      const mode = action === 'buyLocal' ? ITEM_MODE_BUY_LOCAL : ITEM_MODE_PACK
      const previous = new Map(rows.map((row) => [row.id, row.mode]))
      armRowsUndo(rows, (live) =>
        orchestrator.setMode(props.tripId, live, previous.get(live.id) ?? live.mode),
      )
      for (const row of rows) orchestrator.setMode(props.tripId, row, mode)
      report()
      return
    }
    case 'flagUnused':
    case 'unflagUnused': {
      const previous = new Map(rows.map((row) => [row.id, row.flag_unused]))
      armRowsUndo(rows, (live) =>
        orchestrator.setReviewFlag(props.tripId, live, 'unused', previous.get(live.id) ?? false),
      )
      for (const row of rows) {
        orchestrator.setReviewFlag(props.tripId, row, 'unused', action === 'flagUnused')
      }
      report()
      return
    }
    case 'quantity':
      // Centred, like the row menu's: the head it came from may have moved.
      quantityEvent.value = undefined
      quantityClusterLabel.value = fanOutName(cluster.name, plan)
      quantityRowIds.value = plan.targetIds
      return
    case 'skip':
      skipRows(fanOutName(cluster.name, plan), rows)
      return
    case 'remove':
      await removeRows(fanOutName(cluster.name, plan), rows)
  }
}

async function openClusterMenu(cluster: PackingCluster): Promise<void> {
  clusterHold.cancel()
  const entries = clusterMenuEntries(clusterInstances(cluster), clusterMenuContext())
  if (entries.length === 0) return

  rowMenuActive = true
  try {
    const sheet = await actionSheetController.create({
      header: cluster.name,
      // The scope, before the actions rather than after them: the head writes
      // several rows, and how many is the part a reader cannot see on a shut
      // cluster.
      subHeader: t('packing.clusterScope', { n: cluster.instanceIds.length }),
      buttons: [
        ...entries.map((action) => ({
          text: t(CLUSTER_MENU_BUTTONS[action].labelKey),
          icon: CLUSTER_MENU_BUTTONS[action].icon,
          role: CLUSTER_MENU_BUTTONS[action].role,
          handler: () => {
            void runClusterMenu(action, cluster)
          },
        })),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    })
    await sheet.present()
    await sheet.onDidDismiss()
  } finally {
    rowMenuActive = false
  }
}

/**
 * Label and glyph per cluster entry; the decision is the domain's. The head
 * speaks the row's words for the row's actions — its sub-header already says
 * how many rows they reach — and keeps its own for the three it had first,
 * whose „für alle" wording says what a row's could not.
 */
const CLUSTER_MENU_BUTTONS: Record<
  ClusterMenuAction,
  { labelKey: MessageKey; icon: string; role?: 'destructive' }
> = {
  ...ROW_MENU_BUTTONS,
  latePackerOn: { labelKey: 'packing.clusterLatePackerOn', icon: timeOutline },
  latePackerOff: { labelKey: 'packing.clusterLatePackerOff', icon: timeOutline },
  assignAll: { labelKey: 'packing.clusterAssignAll', icon: peopleOutline },
}

async function openRowMenu(item: TripItem) {
  hold.cancel()
  const entries = rowMenuEntries(item, {
    closingPass: closingPass.value,
    locked: locked(item),
    canTakeOver,
    mine: orchestrator.holdsClaim(props.tripId, item),
    judgeable: judgeable.value,
  })
  if (entries.length === 0) return

  rowMenuActive = true
  try {
    const sheet = await actionSheetController.create({
      header: item.name,
      buttons: [
        ...entries.map((action) => ({
          text: t(ROW_MENU_BUTTONS[action].labelKey),
          icon: ROW_MENU_BUTTONS[action].icon,
          role: ROW_MENU_BUTTONS[action].role,
          handler: () => runRowMenu(action, item),
        })),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    })
    await sheet.present()
    await sheet.onDidDismiss()
  } finally {
    // finally, not after the awaits: a failed present() must not leave the
    // list permanently tap-dead.
    rowMenuActive = false
  }
}

function closeItem() {
  router.replace(tripPath(props.tripId))
}

/**
 * G-9: below the breakpoint the detail is a bottom sheet; at or above it
 * a persistent side panel beside the list, so selecting another row swaps
 * the panel's content instead of covering the list.
 */
const isDesktop = ref(window.matchMedia('(min-width: 900px)').matches)
const breakpoint = window.matchMedia('(min-width: 900px)')
const onBreakpoint = (event: MediaQueryListEvent) => (isDesktop.value = event.matches)
breakpoint.addEventListener('change', onBreakpoint)
onUnmounted(() => breakpoint.removeEventListener('change', onBreakpoint))

// --- Who is working here (FR-4.9) ---------------------------------------
// The roster on M1 lists people by the trip they have *open*, which is not the
// subscription — the dashboard follows every active trip and never lets go.
// Ionic keeps a page mounted under the one that replaced it, so leaving is a
// view event and unmounting only the fallback.
onIonViewDidEnter(() => orchestrator.setViewing(props.tripId))
onIonViewWillLeave(() => orchestrator.setViewing(null))
onUnmounted(() => orchestrator.setViewing(null))

// --- Header line --------------------------------------------------------

const presenceUsers = computed(() => orchestrator.getPresence(props.tripId))

/**
 * How many faces fit before G-10's "+N" bubble. A question about the
 * header's width, so the screen that owns the header answers it.
 */
const PRESENCE_FACES_MOBILE = 2
const PRESENCE_FACES_DESKTOP = 4

/**
 * G-10's faces are named from the same directory the packing stamps use.
 * The presence event carries user ids alone, and an id is a random hex
 * string — a facepile initialled from it says who is here in a code
 * nobody can read.
 */
const presenceNames = computed<Record<string, string>>(() =>
  Object.fromEntries(participants.value.map((p) => [p.user_id, p.display_name])),
)
const openPrepCount = computed(() => tripStore.getOpenTodos(props.tripId).length)

const tripTodoCount = computed(() =>
  tripTodoProgress(
    tripStore.getTripTodos(props.tripId).filter((todo) => !removingTodos.value.has(todo.id)),
  ),
)
const tripTodoState = computed(() => tripTodoStatus(tripTodoCount.value))

/** FR-7.4: the section head's own check, apart from every packing figure. */
const tripTodoLine = computed(() => {
  if (tripTodoState.value === 'none') return null
  if (tripTodoState.value === 'allDone') return t('tripTodos.allDone')
  return t('tripTodos.progress', {
    done: tripTodoCount.value.done,
    total: tripTodoCount.value.total,
  })
})

/** FR-7.4: open while anything is owed, one line once nothing is. */
const tripTodosOpen = computed(() => tripTodosUnfolded(tripTodoState.value, tripTodosFold.value))

/**
 * FR-7.4: the header figure leads to the todos — unfolded, and in view,
 * because the header line stays while the section may be scrolled past.
 */
function revealTripTodos() {
  tripTodosFold.value = true
  tripTodosSection.value?.scrollIntoView({ block: 'nearest' })
}

/**
 * The ring in the header line, which is not the hero's: the line yields to
 * the list on the way down (FR-21.17) and is the one figure on the screen
 * that has to earn every pixel it keeps.
 */
const RING_SIZE_HEADER = 42

/**
 * What qualifies the share: the weight the trip is carrying, and the prep
 * that is still owed. Under the sentence rather than beside it, because a
 * figure reads as one line and this is the second (FR-21.23).
 */
const statsDetail = computed(() => {
  const parts: string[] = []
  if (kpis.value.totalWeight > 0) parts.push(formatWeight(kpis.value.totalWeight))
  if (openPrepCount.value > 0) parts.push(t('packing.openPrep', { n: openPrepCount.value }))
  return parts.length > 0 ? parts.join(' · ') : null
})

/**
 * The header line *and the page head above it* yield to the list on the way
 * down and come back on an upward gesture. The rule itself is a pure step in
 * `lib/headScroll.ts` — its interesting cases are the readings it must not
 * act on, none of which a listener can reach.
 */
const head = ref<HeadScrollState>({ top: 0, collapsed: false })
const headCollapsed = computed(() => head.value.collapsed)

/**
 * The scroller behind the ion-content. Resolved at mount rather than from
 * the first event: `nextHeadState` needs its geometry to tell a list that
 * survives yielding from one that does not, and the first event of a page is
 * the one a short list's jump starts on. The event stays as the fallback.
 */
let scrollEl: HTMLElement | null = null
const packContent = ref<{ $el: HTMLIonContentElement } | null>(null)

/**
 * Whether the reader is the one scrolling right now (FR-21.17).
 *
 * Armed by the inputs that scroll a list and disarmed when the scroller
 * comes to rest, so a flick's momentum still counts as the flick. Without
 * it the head answered scrolls nobody made — the browser's own, when it
 * brings a control into view for a keyboard focus or for a click aimed at
 * a row below the fold — and each answer moved every row by the head's
 * height while a finger was already on its way to one (E2E-M4-135).
 */
let gesture = false
function onScrollerInput(event: Event) {
  const key = event instanceof KeyboardEvent ? event.key : undefined
  if (isScrollGesture({ type: event.type, key, onScroller: event.target === scrollEl }))
    gesture = true
}

/** Listened for on the scroller rather than the content, because that is what the reader drives. */
const SCROLLER_INPUTS = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const

onMounted(() => {
  void packContent.value?.$el.getScrollElement?.().then((el) => {
    scrollEl = el
    for (const type of SCROLLER_INPUTS) el.addEventListener(type, onScrollerInput, { passive: true })
  })
})

onUnmounted(() => {
  for (const type of SCROLLER_INPUTS) scrollEl?.removeEventListener(type, onScrollerInput)
})

function onScroll(event: CustomEvent<{ scrollTop: number }>) {
  if (scrollEl === null) {
    const content = event.target as { getScrollElement?: () => Promise<HTMLElement> }
    void content.getScrollElement?.().then((el) => (scrollEl = el))
  }
  head.value = nextHeadState(head.value, {
    top: event.detail.scrollTop,
    viewport: scrollEl,
    gesture,
  })
}

/** The scroller has come to rest, so whatever moves it next has to say who asked. */
function onScrollEnd() {
  gesture = false
}

// --- App-bar cluster (G-12) --------------------------------------------

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

/**
 * FR-25.24: the opened set, not the shut one, because a cluster is shut by
 * default. Keyed like a group's fold so a re-render — or packing one
 * instance — does not close what the user just opened.
 */
function toggleCluster(key: string) {
  // The release of a hold lands on the overlay rather than on the head, but
  // a dismissed sheet can still deliver the click — the same swallow the
  // rows do, or opening the head's menu would also fold it.
  if (rowMenuActive) return
  expandedClusters.value = expandedClusters.value.includes(key)
    ? expandedClusters.value.filter((k) => k !== key)
    : [...expandedClusters.value, key]
}

/**
 * G-12: the cluster acts on *this list*, so it lives in the one app bar
 * where it stays reachable while the header line below scrolls away.
 * Described rather than teleported — see useHeaderActions for the render
 * crash that mechanism caused on a cold boot.
 */
setHeaderActions(() => {
  const items: HeaderAction[] = [
    searchAction(),
    {
      id: 'm4-filter',
      icon: funnelOutline,
      label: t('filter.open'),
      active: view.value.activeFacetCount > 0,
      badge: view.value.activeFacetCount,
      onClick: () => (filterOpen.value = true),
    },
    {
      id: 'm4-fold-all',
      icon: allFolded.value ? expandOutline : contractOutline,
      label: allFolded.value ? t('packing.unfoldAll') : t('packing.foldAll'),
      onClick: toggleFoldAll,
    },
  ]
  // One posture, one question (FR-9.3): the pass is *inside* the archive
  // action, so offering it again — or the trip's properties — from the bar
  // would be two doors into a room you are standing in. Search, filter and
  // fold stay: they are why the pass is a mode of M4 at all.
  if (closingPass.value) return items
  // The trip's other three views are the switcher under the page's name now
  // (FR-21.21, ADR-051), so what is left behind the ⋮ is what *changes* the
  // trip rather than where you can go with it.
  //
  // FR-2.7: the trip's own properties, before the lifecycle steps — it is
  // the one action here that changes the trip instead of advancing it. As
  // words in the menu they say what they do, which a glyph could not.
  items.push({
    id: 'm4-edit',
    icon: createOutline,
    label: t('tripEdit.title'),
    overflow: true,
    onClick: () => router.push(tripSubPath(props.tripId, 'edit')),
  })
  // FR-27.16: offered only while there is something to take over, and on a
  // past trip too — renaming history is the user's call, not a prompt.
  if (inventoryRenames.value.length > 0) {
    items.push({
      id: 'm4-inventory-names',
      icon: textOutline,
      label: t('inventoryNames.menu', { n: inventoryRenames.value.length }),
      overflow: true,
      onClick: () => (inventoryNamesOpen.value = true),
    })
  }
  // The two lifecycle steps, each offered only where it is the next one.
  // Without the first, *active* was unreachable in the whole app — and with
  // it the archive action below, FR-9.1's Missing flagging and everything
  // downstream of an archived trip (M14, M21).
  const step = nextLifecycleStep(trip.value)
  if (step === 'start') {
    items.push({
      id: 'm4-start',
      icon: playOutline,
      label: t('packing.start'),
      overflow: true,
      onClick: onStart,
    })
  }
  if (step === 'archive') {
    items.push({
      id: 'm4-archive',
      icon: archiveOutline,
      label: t('packing.archive'),
      overflow: true,
      onClick: onArchive,
    })
  }
  return items
})

// --- Rows ---------------------------------------------------------------

function openTodoCount(itemId: string): number {
  return tripStore.getItemTodos(props.tripId, itemId).filter((todo) => todo.task_state === 'open')
    .length
}

function locked(item: TripItem): boolean {
  return orchestrator.isLockedByOther(props.tripId, item)
}

/** G-3's "in progress by Andy", worded in `lib/rowFacts.ts` (U-2). */
function lockNote(item: TripItem): string | null {
  return lockNoteText(orchestrator.lockHolder(props.tripId, item), nameOf)
}

/**
 * The row I claimed says so to *me*: nothing is locked for my own device,
 * so without a word here I cannot tell that I am holding the row against
 * everyone else.
 */
function ownClaimNote(item: TripItem): string | null {
  return orchestrator.holdsClaim(props.tripId, item) ? t('packing.claimedByMe') : null
}

/** FR-25.17: "gepackt von Andy · heute 14:32", on revealed rows only. */
function packedStamp(item: TripItem): string | null {
  return packedStampText(item, nameOf)
}

/**
 * FR-5.5, worded in `lib/rowFacts.ts`. A row that is done because it was
 * left behind used to be revealed with nothing at all where a packed row
 * carries its FR-25.17 stamp, which is exactly the "forgot it" / "decided
 * against it" confusion FR-5.5 exists to remove.
 */
function skippedNoteFor(item: TripItem): string | null {
  return skippedNote(item, allItems.value, masterStore.dependencyList)
}

/** Named only where it differs from the packer — otherwise it is noise. */
function responsibleNoteFor(item: TripItem): string | null {
  return responsibleNote(item, nameOf)
}

/**
 * The four sentences a row can put under its name, all of them — `PackingRow`
 * owns the order it prefers them in, because both kinds of row prefer the
 * same one and that is the rule worth having in one place.
 */
function rowNotes(item: TripItem): PackingRowNotes {
  return {
    lock: lockNote(item),
    ownClaim: ownClaimNote(item),
    skipped: skippedNoteFor(item),
    packed: packedStamp(item),
    responsible: responsibleNoteFor(item),
  }
}

/** FR-25.19's edge avatar, with the name the row shows resolved here. */
function edgeAvatarFor(item: TripItem): RowEdgeAvatar | null {
  const edge = rowEdgeAvatar(item)
  return edge ? { ...edge, name: nameOf(edge.id) } : null
}

// --- Empty states (FR-25.11e) ------------------------------------------

const visibleOpenRows = computed(
  () =>
    view.value.groups
      .flatMap((group) => group.entries)
      .flatMap((entry) => (entry.kind === 'item' ? [entry] : entry.children))
      .filter((row) => !row.done).length,
)

// Rows on both sides (FR-25.22): the sentence counts *Sachen* behind the
// filter, and the left-hand side used to be the trip's open **units**, so a
// single open row of quantity three reported two hidden things on a list
// hiding nothing.
const hiddenOpenCount = computed(() => Math.max(view.value.openRowCount - visibleOpenRows.value, 0))

const searching = computed(() => search.value.trim() !== '')

const onlyOthersHidden = computed(() => isOnlyOthersHidden(view.value, search.value))

const emptyReason = computed(() => emptyReasonFor(view.value, search.value, hiddenOpenCount.value))

/**
 * FR-25.11e: a reset that leaves part of the narrowing behind re-renders
 * the same empty screen, so this clears all of it — search, facets and all
 * three reveal switches.
 */
function resetNarrowing() {
  search.value = ''
  searchOpen.value = false
  reset()
  showOthers.value = true
}

// --- The filter panel (FR-25.11) ---------------------------------------

const filterFacets = computed(() => facetsFor(view.value))

const grouping = computed(() => groupingAxis(groupBy.value))

const filterSwitches = computed(() =>
  switchesFor({
    showDone: showDone.value,
    showOthers: showOthers.value,
    showLate: showLate.value,
    packedCount: view.value.doneCount,
    hiddenOtherCount: view.value.hiddenOtherCount,
    lateCount: view.value.lateCount,
  }),
)

function onToggleSwitch(key: string) {
  if (key === SWITCH_KEYS.done) showDone.value = !showDone.value
  else if (key === SWITCH_KEYS.late) showLate.value = !showLate.value
  else showOthers.value = !showOthers.value
}

const activeChips = computed(() => chipsFor(view.value, facets.value))

// --- Actions ------------------------------------------------------------

/**
 * Claiming and giving back are each other's undo (G-3). The release derives
 * the state from the packed count, which is what the row read before the
 * claim; a re-claim is only offered back while nobody else has taken the row.
 */
function onPackingNow(item: TripItem) {
  actUndoably(
    item,
    t('packing.claimedToast', { name: item.name }),
    () => orchestrator.packingNow(props.tripId, item),
    (live) => {
      if (orchestrator.holdsClaim(props.tripId, live)) orchestrator.releaseClaim(props.tripId, live)
    },
  )
}

/** Give the row back without packing it (G-3). */
function onReleaseClaim(item: TripItem) {
  actUndoably(
    item,
    t('packing.releasedToast', { name: item.name }),
    () => orchestrator.releaseClaim(props.tripId, item),
    (live) => {
      if (!locked(live)) orchestrator.packingNow(props.tripId, live)
    },
  )
}

/**
 * FR-5.7: the only way past somebody else's claim. Server Mode only —
 * Local Mode has no server and Single-User Mode has one account, so
 * there is nobody to take a row from and the surface is absent rather
 * than shown inert (G-8).
 */
const canTakeOver = hasCollaborativeSession()

/**
 * The confirmation is the requirement, not politeness: it names whom you
 * are interrupting *before* the fact, and that is the whole difference
 * between a lock that can be broken and a lock that is not a lock.
 */
async function onTakeOver(item: TripItem) {
  const holderId = orchestrator.lockHolder(props.tripId, item)
  const who = holderId ? nameOf(holderId) : ''
  const confirmed = await confirmAction({
    header: t('packing.takeoverConfirmTitle'),
    message: who
      ? t('packing.takeoverConfirmBody', { who, item: item.name })
      : t('packing.takeoverConfirmBodyUnknown', { item: item.name }),
    confirmLabel: t('packing.takeoverAction'),
  })
  if (!confirmed) return

  try {
    const previous = await orchestrator.takeOverClaim(props.tripId, item)
    const previousName = previous ? nameOf(previous) : ''
    await presentToast({
      message: previousName
        ? t('packing.takeoverDone', { who: previousName })
        : t('packing.takeoverDoneUnknown'),
      positionAnchor: FAB_ANCHOR.m4,
    })
  } catch {
    // The claim did not move, and the likeliest reason is that the screen
    // is behind: the holder packed or released the row while the sheet
    // was open. Saying so beats a silent no-op.
    await presentToast({
      message: t('packing.takeoverFailed'),
      positionAnchor: FAB_ANCHOR.m4,
    })
  }
}

/**
 * FR-5.5: say that a thing is deliberately not coming, rather than leaving
 * it open and indistinguishable from forgotten.
 *
 * The snackbar is not decoration here: FR-20.2 may take companions along,
 * and a cascade the user never sees is a list that changed behind their
 * back. It names them and offers the one undo that puts the whole cascade
 * back.
 */
function onSkipItem(item: TripItem) {
  // Armed from what the skip reports rather than from the row in hand: the
  // companions are only known once the cascade has run, and `skipItem`
  // returns them as they were *before* it wrote (pinned by its own test).
  const affected = orchestrator.skipItem(props.tripId, item)
  rowUndo.armUndo(affected, (records) => orchestrator.restoreSkip(props.tripId, records))
  void announceSkipped(
    item.name,
    affected.slice(1).map((row) => row.name),
  )
}

/**
 * The write, and the detail it leaves open: a removed row's M5 would otherwise
 * stand beside the list saying the item cannot be found — true, and about the
 * one thing the reader just did on purpose.
 */
function removeRow(item: TripItem): void {
  orchestrator.removeItem(props.tripId, item, [])
  if (openItemId.value === item.id) closeItem()
}

/**
 * FR-5.8: off the list altogether. An untouched row goes at once and the
 * snackbar can bring it back; a row carrying packing, notes or companions says
 * what it takes along first, and is asked instead of offered.
 *
 * The inventory item the row was the only use of goes too (ADR-065) — but
 * only once the removal is final, when the snackbar lapses. So the undo only
 * ever re-inserts a row, or, after a confirmation, un-hides one (FR-25.31).
 */
async function onRemoveItem(item: TripItem) {
  const removal = orchestrator.planRowRemoval(props.tripId, item)
  const leftItem = orchestrator.itemLeftByRemoval(item)
  const pruneLeftItem = () => {
    if (leftItem !== null) void orchestrator.pruneItemLeftByRemoval(props.tripId, leftItem)
  }
  if (!removalNeedsConfirm(removal)) {
    // A copy, not the store's row: the undo re-inserts from it after the row
    // has left the store.
    const snapshot = { ...item }
    rowUndo.armUndo(
      [snapshot],
      () => orchestrator.restoreRemovedItem(props.tripId, snapshot),
      pruneLeftItem,
    )
    removeRow(item)
    void announceRemoved(item.name, leftItem !== null)
    return
  }
  const confirmed = await confirmDestructive({
    header: t('packing.removeConfirmTitle', { name: item.name }),
    message: removalSentence(removal, leftItem !== null),
    confirmLabel: t('common.remove'),
    testid: 'm4-remove-confirm',
  })
  if (!confirmed) return
  removeConfirmed([item], removal.companions, pruneLeftItem)
  void announceRemoved(item.name, leftItem !== null)
}

/**
 * FR-25.31: a confirmed removal has an undo too. Its companions are skipped
 * now — an ordinary write the snackbar can take back — but the rows themselves
 * only leave the screen: deleting them would take their comments and todos
 * along, and those cannot be written back under their own authors. The delete
 * is what lapses, with ADR-065's prune after it.
 */
function removeConfirmed(
  rows: readonly TripItem[],
  companions: readonly TripItem[],
  afterDelete: () => void,
): void {
  const ids = new Set(rows.map((row) => row.id))
  const unhide = () => {
    for (const id of ids) removingRows.value.delete(id)
  }
  rowUndo.armUndo(
    [...rows, ...companions],
    (records) => {
      unhide()
      orchestrator.restoreSkip(
        props.tripId,
        records.filter((record) => !ids.has(record.itemId)),
      )
    },
    () => {
      for (const id of ids) {
        const live = liveRow(id)
        if (live) orchestrator.removeItem(props.tripId, live, [])
      }
      unhide()
      afterDelete()
    },
  )
  for (const id of ids) removingRows.value.add(id)
  if (openItemId.value !== null && ids.has(openItemId.value)) closeItem()
  orchestrator.skipRows(props.tripId, companions)
}

/**
 * FR-9.3: the flag is a judgement, not a stamp. The same menu entry sets it
 * and takes it back, and since FR-25.31 the snackbar does too — the one undo
 * every act on the list offers.
 */
function onFlagUnused(item: TripItem, value: boolean) {
  const previous = item.flag_unused
  actUndoably(
    item,
    value
      ? t('packing.flagUnusedToast', { item: item.name })
      : t('packing.unflagUnusedToast', { item: item.name }),
    () => orchestrator.setReviewFlag(props.tripId, item, 'unused', value),
    (live) => orchestrator.setReviewFlag(props.tripId, live, 'unused', previous),
  )
}

/**
 * The pass's single gesture. It raises the same snackbar as the menu's
 * entry (FR-25.31, owner 2026-09-19): one at a time, each replacing the last,
 * so a run of taps leaves one undo for the latest rather than a stack.
 */
function onPassToggle(item: TripItem) {
  // G-3 reaches into the leaf: a row somebody else is holding is theirs,
  // and the pass is no exception. A packed row rarely carries a live claim
  // — packing ends it — but this control must not be the one place that
  // decides otherwise.
  if (locked(item)) return
  onFlagUnused(item, !item.flag_unused)
}

function onUnskipItem(item: TripItem) {
  rowUndo.armUndo([item], (records) => orchestrator.restoreSkip(props.tripId, records))
  orchestrator.unskipItem(props.tripId, item)
  void announceAct(t('packing.unskippedToast', { name: item.name }))
}

function onLatePacker(item: TripItem, latePacker: boolean) {
  const previous = item.late_packer
  actUndoably(
    item,
    t(latePacker ? 'packing.latePackerOnToast' : 'packing.latePackerOffToast', {
      name: item.name,
    }),
    () => orchestrator.setLatePacker(props.tripId, item, latePacker),
    (live) => orchestrator.setLatePacker(props.tripId, live, previous),
  )
}

/** FR-5.9 from the row menu, taken back like every other act (FR-25.31). */
function onSetMode(item: TripItem, mode: typeof ITEM_MODE_BUY_LOCAL | typeof ITEM_MODE_PACK) {
  const previous = item.mode
  actUndoably(
    item,
    t(mode === ITEM_MODE_BUY_LOCAL ? 'packing.buyLocalToast' : 'packing.packInsteadToast', {
      name: item.name,
    }),
    () => orchestrator.setMode(props.tripId, item, mode),
    (live) => orchestrator.setMode(props.tripId, live, previous),
  )
}

/**
 * A step of the counter is announced like a pack, and the step that
 * completes the row *is* one — it leaves the list the same way (FR-25.2).
 */
function onIncrement(item: TripItem) {
  packStep(item, Math.min(item.packed_count + 1, item.quantity), () =>
    orchestrator.packIncrement(props.tripId, item),
  )
}

function onDecrement(item: TripItem) {
  packStep(item, Math.max(item.packed_count - 1, 0), () =>
    orchestrator.packDecrement(props.tripId, item),
  )
}

function packStep(item: TripItem, packed: number, act: () => void) {
  const name = item.name
  rowUndo.actWithUndo([item], act, restorePacked)
  void (packed >= item.quantity
    ? announcePacked(name)
    : announceAct(t('packing.countToast', { name, packed, quantity: item.quantity })))
}

function onComplete(item: TripItem) {
  const name = item.name
  rowUndo.actWithUndo([item], () => orchestrator.packComplete(props.tripId, item), restorePacked)
  void announcePacked(name)
}

function onZero(item: TripItem) {
  const name = item.name
  rowUndo.actWithUndo([item], () => orchestrator.packZero(props.tripId, item), restorePacked)
  void announceAct(t('packing.unpackedToast', { name }))
}

/* --- FR-25.2: the pack registers, and it can be taken back ------------ */

/**
 * The duration lives in CSS only. The hook below waits on `transitionend`
 * rather than on a number, so there is nothing here to keep in step — an
 * earlier version declared the 300 ms twice on the theory that both sides
 * needed it, and the second copy was never read.
 */

/** Honoured for the row collapse as well as the flash — checked live, since
 *  the setting can change while the screen is open. */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

/**
 * Collapse a leaving row to zero height — the rules are in `collapseRow`.
 *
 * **Except where the item is only changing shape** (FR-25.28, `isReshaped`):
 * its old shape goes at once rather than standing beside its replacement.
 */
function onRowLeave(el: Element, done: () => void) {
  const { forWhomKey: key, rowId } = (el as HTMLElement).dataset
  if (
    key !== undefined &&
    isReshaped({ key, rowId: rowId ?? null }, shownForWhom.value, existingRowIds.value)
  ) {
    done()
    return
  }
  collapseRow(el as HTMLElement, done, reducedMotion.matches)
}

const {
  rowUndo,
  packAnnouncements,
  announcePacked,
  announceSkipped,
  announceRemoved,
  announceRenamed,
  announceTaskDone,
  announceAct,
} = usePackAnnouncer()

/** The row as it is now, or null once it has left the trip. */
function liveRow(itemId: string): TripItem | null {
  return tripStore.getItems(props.tripId).find((row) => row.id === itemId) ?? null
}

/**
 * FR-25.31: act on one row behind the snackbar's undo. `restore` gets the row
 * as it is *when the undo fires* and writes back only the field its act
 * changed — building the write from the row in hand would revert whatever
 * landed in between (the reason `restorePack` re-reads, too). A row deleted
 * meanwhile stays deleted.
 */
function actUndoably(
  item: TripItem,
  message: string,
  act: () => void,
  restore: (live: TripItem) => void,
) {
  const id = item.id
  rowUndo.armAction(item.name, () => {
    const live = liveRow(id)
    if (live) restore(live)
  })
  act()
  void announceAct(message)
}

/** The same for a fan-out over several rows (FR-25.26): one undo for all. */
function armRowsUndo(rows: readonly TripItem[], restore: (live: TripItem) => void) {
  const ids = rows.map((row) => row.id)
  rowUndo.armAction(rows[0]?.name ?? '', () => {
    for (const id of ids) {
      const live = liveRow(id)
      if (live) restore(live)
    }
  })
}

/** Put back what a pack changed, and only that (FR-25.2). */
function restorePacked(records: RowUndoRecord[]) {
  for (const record of records) {
    orchestrator.restorePack(props.tripId, record.itemId, record.packedCount, record.state)
  }
}

function onToggle(item: TripItem) {
  // Un-packing a revealed done row is announced too (FR-25.31, owner
  // 2026-09-19): its result is on screen, but a mistap on a list of done rows
  // is as expensive to find again as one on the open list.
  const reads = stateFor(item.packed_count, item.quantity)
  const unpacks = reads === 'packed' || reads === 'skipped'
  const name = item.name
  rowUndo.actWithUndo([item], () => orchestrator.packToggle(props.tripId, item), restorePacked)
  void (unpacks ? announceAct(t('packing.unpackedToast', { name })) : announcePacked(name))
}

/** The trip's own task as it is now — the undo never writes from a snapshot. */
function liveTripTodo(id: string): TripTodo | null {
  return tripStore.getTripTodos(props.tripId).find((row) => row.id === id) ?? null
}

/** FR-7.4: the same undo for the trip's own tasks, which live in `TripTodoList`. */
function onTripTodoResolved(todo: TripTodo) {
  rowUndo.armAction(todo.body, () => {
    const live = liveTripTodo(todo.id)
    if (live?.task_state === 'resolved') orchestrator.reopenTripTodo(live)
  })
  void announceTaskDone(todo.body)
}

function onTripTodoReopened(todo: TripTodo) {
  rowUndo.armAction(todo.body, () => {
    const live = liveTripTodo(todo.id)
    if (live?.task_state === 'open') orchestrator.resolveTripTodo(live)
  })
  void announceAct(t('packing.taskReopenedToast', { body: todo.body }))
}

function onTripTodoAdded(id: string, body: string) {
  rowUndo.armAction(body, () => {
    const live = liveTripTodo(id)
    if (live) orchestrator.deleteTripTodo(live)
  })
  void announceAct(t('packing.taskAddedToast', { body }))
}

/** FR-7.5: the todo's seat, tapped — the row's picker and the row's undo. */
async function onTripTodoAssign(todo: TripTodo) {
  const picked = await pickAssignee(todo.body, todo.assignee_user_id, todoAssignees.value)
  if (picked === undefined || picked === todo.assignee_user_id) return
  const previous = todo.assignee_user_id
  rowUndo.armAction(todo.body, () => {
    const live = liveTripTodo(todo.id)
    if (live) orchestrator.assignTripTodo(live, previous)
  })
  orchestrator.assignTripTodo(todo, picked)
  void announceAct(
    picked === null
      ? t('packing.unassignedToast', { name: todo.body })
      : t('packing.assignedToast', { name: todo.body, who: nameOf(picked) ?? '' }),
  )
}

/** Hidden now and deleted when the undo lapses — the confirmed removal's reason. */
function onTripTodoRemove(todo: TripTodo) {
  const id = todo.id
  rowUndo.armAction(
    todo.body,
    () => removingTodos.value.delete(id),
    () => {
      const live = liveTripTodo(id)
      if (live) orchestrator.deleteTripTodo(live)
      removingTodos.value.delete(id)
    },
  )
  removingTodos.value.add(id)
  void announceAct(t('packing.taskDeletedToast', { body: todo.body }))
}

function togglePrepTodo(todo: ItemTodo) {
  // Looked up again on undo: the `todo` in hand is the pre-tap snapshot, and
  // writing from it would hand the optimistic layer a stale baseline.
  const live = () =>
    tripStore.getItemTodos(props.tripId, todo.trip_item_id).find((row) => row.id === todo.id)
  if (todo.task_state === 'open') {
    orchestrator.resolvePrepTodo(props.tripId, todo)
    rowUndo.armAction(todo.body, () => {
      const row = live()
      if (row?.task_state === 'resolved') orchestrator.reopenPrepTodo(props.tripId, row)
    })
    void announceTaskDone(todo.body)
  } else {
    orchestrator.reopenPrepTodo(props.tripId, todo)
    rowUndo.armAction(todo.body, () => {
      const row = live()
      if (row?.task_state === 'open') orchestrator.resolvePrepTodo(props.tripId, row)
    })
    void announceAct(t('packing.taskReopenedToast', { body: todo.body }))
  }
}

/**
 * FR-25.13f: how to take back what the browse-sheet last did, keyed by the
 * master item its line stands for.
 *
 * A plain `Map` rather than the FR-25.2 snackbar's `useRowUndo`: the sheet's
 * undo lives *in the row* and therefore for as long as the sheet is open,
 * where the snackbar's lives for three seconds and only ever holds one act.
 * Each entry replaces the one before it, because the line only ever offers
 * the way back out of the last thing it did.
 */
const browseUndo = new Map<string, () => void>()

/** The master item's own fields, as an add takes them (FR-25.7 defaults). */
function quickAddOptions(item: BrowseAddition) {
  return {
    sourceItemId: item.sourceItemId,
    weightGrams: item.weightGrams,
    valueCents: item.valueCents,
    categoryName: item.categoryName,
  }
}

/**
 * FR-25.28: a composer add is for whoever the strip over the field names — no
 * traveler is a shared row, as it always was. It goes through the same action
 * FR-25.13h's avatar buttons use, called with no existing rows, so an add for
 * two people and a browse-sheet pick of the same two write identical rows. A
 * decided add (FR-25.13f) only ever comes from the browse-sheet, which answers
 * *for whom* per line and sends no travelers here.
 */
function onQuickAdd(item: BrowseAddition & { travelerIds: string[] }, decided?: AddedItemDecision) {
  const opts = quickAddOptions(item)
  const { id: addedId, companions } = decided
    ? orchestrator.addDecidedItem(props.tripId, item.name, opts, active.value, decided)
    : orchestrator.setTravelerAssignment(
        props.tripId,
        item.name,
        opts,
        active.value,
        [],
        item.travelerIds,
      )
  browseUndo.set(item.sourceItemId, () => orchestrator.removeAddedItem(props.tripId, addedId))
  announceCompanions(companions)
}

/**
 * FR-20.4: say what came along. Named rather than counted, the way FR-20.2's
 * skip names what it took with it — a bare number sends the reader looking for
 * what changed, which is the complaint this answers.
 */
function announceCompanions(companions: string[]) {
  if (companions.length === 0) return
  void presentToast({
    message: t('packing.companionsAdded', {
      n: companions.length,
      names: companions.join(', '),
    }),
    // Above the composer's own anchor, like every other M4 toast: this one
    // fires while the quick-add is still open for the next entry.
    positionAnchor: FAB_ANCHOR.m4,
  })
}

/**
 * FR-25.13g: the browse-sheet's „für alle" on a line the trip does not carry
 * yet — one tap adds the row and hands it to every traveler.
 *
 * The undo takes out **every** row the tap left behind, the re-pointed one
 * included: none of them existed before it.
 */
function onBrowseAddForAll(item: BrowseAddition) {
  const result = orchestrator.addItemForEveryTraveler(
    props.tripId,
    item.name,
    quickAddOptions(item),
    active.value,
  )
  if (item.sourceItemId) {
    const ids = result.ids
    browseUndo.set(item.sourceItemId, () => {
      for (const id of ids) orchestrator.removeAddedItem(props.tripId, id)
    })
  }
  if (result.outcome !== SPREAD.done) void reportSpreadRefused()
  announceCompanions(result.companions)
}

/**
 * FR-25.13h: the browse-sheet's avatar buttons / long-press pick — always
 * sent as the whole desired set of travelers, so a second tap adds a second
 * traveler to the row this run already wrote (or removes one, tapped again)
 * rather than starting a second, unrelated row for the same item.
 *
 * `rowsOfMasterItem` is read fresh rather than passed a cached id: the sheet
 * itself has no row ids to hand back after the first tap (it only ever sees
 * `BrowseAddition`s), and the undo has the same shape — recomputed live at
 * the moment it fires, so it always removes whatever this run currently has
 * for the item rather than a snapshot that a later toggle already changed.
 */
function onBrowseAssignForTravelers(item: BrowseAddition, travelerIds: string[]) {
  const { companions } = orchestrator.setTravelerAssignment(
    props.tripId,
    item.name,
    quickAddOptions(item),
    active.value,
    item.sourceItemId ? rowsOfMasterItem(item.sourceItemId) : [],
    travelerIds,
  )
  if (item.sourceItemId) {
    const itemId = item.sourceItemId
    browseUndo.set(itemId, () => {
      for (const row of rowsOfMasterItem(itemId)) orchestrator.removeAddedItem(props.tripId, row.id)
    })
  }
  announceCompanions(companions)
}

/**
 * FR-25.13g on a line the trip already carries: the travelers without a row
 * for it get one, and what is already there keeps the amount somebody chose
 * (ADR-036 keep-and-repoint).
 */
function onBrowseSpread(itemId: string) {
  const rows = rowsOfMasterItem(itemId)
  const result = orchestrator.spreadOverEveryTraveler(props.tripId, rows, rowsWithContent(rows))
  if (result.outcome !== SPREAD.done || !result.restore) {
    void reportSpreadRefused()
    return
  }
  const restore = result.restore
  browseUndo.set(itemId, () => orchestrator.restoreMembership(props.tripId, restore))
}

/** What a delete of these rows would cost beyond the rows (FR-7.1/7.3). */
function rowsWithContent(rows: TripItem[]): string[] {
  return rowsCarryingContent(rows, {
    hasComments: (rowId) => tripStore.getItemComments(props.tripId, rowId).length > 0,
    hasTodo: (rowId) => tripStore.getTodos(props.tripId).some((t) => t.trip_item_id === rowId),
  })
}

/**
 * A spread declines rather than deletes: its own way back cannot recreate a
 * row, so a plan carrying a delete is refused and said out loud. Deciding it
 * belongs to the membership editor, which has the confirm for it (ADR-036).
 */
function reportSpreadRefused() {
  return presentToast({
    message: t('packing.forAllRefused'),
    positionAnchor: FAB_ANCHOR.m4,
  })
}

/** Every row the trip carries for one master item (FR-25.21's fan-out). */
function rowsOfMasterItem(itemId: string): TripItem[] {
  return allItems.value.filter((row) => row.source_item_id === itemId)
}

/**
 * FR-25.13f: pack everything this master item stands for on the trip, in one
 * tap. A row that is packed already is left alone — packing it again would
 * restamp somebody else's packing record with mine.
 */
function onBrowsePack(itemId: string) {
  const rows = rowsOfMasterItem(itemId).filter((row) => row.state !== 'packed')
  const records = rows.map((row) => ({
    itemId: row.id,
    name: row.name,
    quantity: row.quantity,
    packedCount: row.packed_count,
    state: row.state,
  }))
  for (const row of rows) orchestrator.packComplete(props.tripId, row)
  browseUndo.set(itemId, () => restorePacked(records))
}

/**
 * FR-25.13f: leave everything this master item stands for at home (FR-5.5),
 * companions included — `skipItem` reports what went along, and the undo
 * puts back exactly those rows.
 */
function onBrowseSkip(itemId: string) {
  const affected = rowsOfMasterItem(itemId)
    .filter((row) => row.state !== 'skipped')
    .flatMap((row) => orchestrator.skipItem(props.tripId, row))
  const records = affected.map((row) => ({
    itemId: row.id,
    quantity: row.quantity,
    packedCount: row.packed_count,
    state: row.state,
  }))
  browseUndo.set(itemId, () => orchestrator.restoreSkip(props.tripId, records))
}

/**
 * FR-25.13i: put every row this master item stands for back on the list,
 * whoever decided it and whenever.
 *
 * Not `onBrowseUndo`: that one replays a closure this run recorded, and a
 * decision from yesterday — or from another device — left none. So this is a
 * **reset** rather than a restore, and deliberately the same two writes M4's
 * own row menu makes: a skipped row comes back at amount one (FR-5.5's skip
 * zeroed it, and only the row's own history knows what it was), a packed one
 * keeps its amount and loses its packed count.
 */
function onBrowseReopen(itemId: string) {
  for (const row of rowsOfMasterItem(itemId)) {
    if (row.state === 'skipped') orchestrator.unskipItem(props.tripId, row)
    else orchestrator.packZero(props.tripId, row)
  }
}

function onBrowseUndo(itemId: string) {
  const undo = browseUndo.get(itemId)
  if (!undo) return
  browseUndo.delete(itemId)
  undo()
}

/**
 * FR-27.10: one tap in the quick-add expands a whole group onto the trip.
 *
 * **The result is always reported** — which sentence, and why each outcome
 * needs its own, is `groupAdditionMessage`.
 */
async function onQuickAddGroup(templateId: string) {
  const report = orchestrator.addGroupToTrip(props.tripId, templateId)
  await reportGroupAnswer(groupAdditionMessage(report))
}

/**
 * Starting moves a planning trip into packing (`active`). The wizard only
 * ever creates planning trips, so this is the transition that makes FR-9.1's
 * Missing flagging and the archive action reachable at all — deliberately a
 * plain status change here, not the richer departure ritual the North-Star
 * Plan/During phases own.
 */
async function onStart() {
  orchestrator.activateTrip(props.tripId)
  await presentToast({ message: t('packing.startedToast') })
}

/**
 * Archiving completes the trip and opens the M14 review (FR-9.2).
 * With no FR-9.1 flags there is nothing to judge, so the assistant is
 * skipped with a toast instead of an empty screen (UI-Spec M14 states);
 * the archived M4 leads with the closing card either way.
 */
/**
 * FR-9.3: *Reise abschliessen* does not archive straight away — it opens
 * the closing pass, the one point in the lifecycle where the user is
 * thinking about the whole trip at once. The pass never gates archiving:
 * *Fertig* finishes it whether or not anything was marked.
 */
function onArchive() {
  closingPass.value = true
}

/** Leaves the pass without archiving — the door asks, so it can be closed. */
function onCancelClosingPass() {
  closingPass.value = false
}

/** FR-9.3's ending: the pass archives the trip and continues into M14. */
async function onFinishClosingPass() {
  closingPass.value = false
  await archiveAndReview()
}

async function archiveAndReview() {
  orchestrator.archiveTrip(props.tripId)
  const flagged = tripStore
    .getItems(props.tripId)
    .some((item) => item.flag_unused || item.flag_missing)
  if (!flagged) {
    await presentToast({ message: t('review.nothingToast') })
    return
  }
  router.push(tripSubPath(props.tripId, 'review'))
}

async function handleRefresh(event: CustomEvent) {
  const refresher = event.target as HTMLIonRefresherElement
  await orchestrator.drainTrip(props.tripId)
  refresher.complete()
}

const tripName = computed(() => trip.value?.name ?? t('packing.title'))

/**
 * The trip's name, written exactly once, in the page head (ADR-050).
 *
 * It used to depend on the width: below the G-9 breakpoint the bar could not
 * hold it — with search, filter, fold-all, the lifecycle step, the sync glyph
 * and the gear beside it, 54 px were left and "Samedan 2026" rendered as
 * "S…" — so M4 registered no title there and its header line led with the
 * name. The bar names no page any more, so nothing turns on the viewport and
 * the header line is one row of figures at every width.
 *
 * The third argument is why the name is *still* the header line's business:
 * the owner's 2026-08-19 call was that scrolling down takes the whole line,
 * name included. ADR-050 moved the name into the frame and the collapse
 * stayed behind with the figures, so the biggest block on the screen became
 * the one thing that never yielded — 89 of a phone's 844 px, permanently, on
 * the screen that is scrolled most. The head now yields on the same gesture.
 */
setHeaderTitle(
  () => tripName.value,
  undefined,
  () => headCollapsed.value,
)
</script>

<template>
  <IonPage>
    <IonContent
      ref="packContent"
      class="pack-content"
      :data-pack-announcements="packAnnouncements"
      :scroll-events="true"
      @ion-scroll="onScroll"
      @ion-scroll-end="onScrollEnd"
    >
      <IonRefresher slot="fixed" @ionRefresh="handleRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <!-- One header line (G-12): what the trip stands at. Deliberately
           unfiltered — see FR-25.20. The trip's *other views* used to sit
           here as three glyphs; they are words in the bar's menu now
           (ADR-050), and the name is the page's own head. -->
      <!-- Collapsed for a second reason since ADR-033: with the figure below
           waiting for the partition the line holds nothing, and an empty band
           above the note is a container asserting itself. The state that
           yields the space already exists, so it is reused rather than
           doubled. -->
      <div
        class="trip-line"
        :class="{ collapsed: headCollapsed || !rowsLoaded, paired: tripTodoState !== 'none' }"
        data-testid="m4-header"
      >
        <!-- Where the trip stands, and who else is here. Tabular throughout:
             the weight under the share changes on the same tap as the share
             itself, and proportional digits shift both as it does. -->
        <div class="trip-stats" :class="{ paired: tripTodoState !== 'none' }">
          <!-- ADR-033: „0/0 packed" under an empty track is the verdict the
               note below declines to give, in the form a reader trusts most.
               It waits for the partition; 0/0 is honest once measured. -->
          <ProgressFigure
            v-if="rowsLoaded"
            class="figure jp-num"
            :percent="packedPercent(kpis)"
            :headline="t('trips.itemSummary', { packed: kpis.packedItems, total: kpis.totalItems })"
            :detail="statsDetail"
            :ring-size="RING_SIZE_HEADER"
            :paired="tripTodoState !== 'none'"
            headline-testid="m4-progress"
            detail-testid="m4-stats-detail"
          />
          <!-- FR-7.4: the second check, beside the share and never inside
               it; a tap leads to the section that ticks it. -->
          <button
            v-if="rowsLoaded && tripTodoState !== 'none'"
            class="todo-figure-button"
            data-testid="m4-trip-todos-figure"
            :aria-label="tripTodoLine ?? undefined"
            @click="revealTripTodos"
          >
            <TripTodoFigure
              :trip-id="tripId"
              :ring-size="RING_SIZE_HEADER"
              testid="m4-trip-todos-progress"
            />
          </button>
          <PresenceFacepile
            v-if="presenceUsers.length > 1"
            :users="presenceUsers"
            :names="presenceNames"
            :max="isDesktop ? PRESENCE_FACES_DESKTOP : PRESENCE_FACES_MOBILE"
          />
        </div>
      </div>

      <ClosingPassBanner
        v-if="closingPass"
        @finish="onFinishClosingPass"
        @cancel="onCancelClosingPass"
      />

      <!-- FR-25.29: who the trip is for, and how far each of them is. Below
           the sticky line rather than in it, so it scrolls away with the list
           instead of holding a second band of the screen for the whole visit.
           Waits for the partition like the figure above it (ADR-033). -->
      <TravelerProgressStrip
        v-if="rowsLoaded && !closingPass && showsTravelerProgress(travelers)"
        :progress="travelerShares"
        :selected="facets.person"
        @select="selectTraveler"
      />

      <!-- FR-7.4: the trip's own todos — chores that prepare no row. Written
           here, in the trip; M1 only reports them. Above the list, because at
           its foot they went unseen; unfolded while any is open, one line once
           none is. Always present, because the section is where the first one
           is typed — but only once the partition is here (ADR-033): before
           that it would read „folded" and then spring open under a tap that
           was meant to open it, which closes it again. -->
      <div
        v-if="rowsLoaded && !closingPass"
        ref="tripTodosSection"
        class="prep-section trip-todos-section jp-card"
        :class="{ done: tripTodoState === 'allDone' }"
        data-testid="m4-trip-todos"
      >
        <button
          class="prep-header"
          data-testid="m4-trip-todos-toggle"
          :aria-expanded="tripTodosOpen ? 'true' : 'false'"
          @click="tripTodosFold = !tripTodosOpen"
        >
          <IonIcon :icon="checkmarkDoneOutline" />
          <span>
            {{ t('tripTodos.section') }}
            <template v-if="tripTodoLine">
              · <span data-testid="m4-trip-todos-status">{{ tripTodoLine }}</span>
            </template>
          </span>
          <IonIcon :icon="chevronDownOutline" class="caret" :class="{ open: tripTodosOpen }" />
        </button>
        <TripTodoList
          v-if="tripTodosOpen"
          :trip-id="tripId"
          :removing="removingTodos"
          :assignable="todoAssignees.length > 1"
          :name-of="nameOf"
          @assign="onTripTodoAssign"
          @resolved="onTripTodoResolved"
          @reopened="onTripTodoReopened"
          @added="onTripTodoAdded"
          @remove="onTripTodoRemove"
        />
      </div>
      <!-- FR-25.11k: the field exists only while it is being used. -->
      <SearchRow
        v-if="searchOpen || search"
        v-model="search"
        testid="m4-search-input"
        :placeholder="t('packing.searchPlaceholder')"
        @close="toggleSearch"
      />

      <!-- FR-25.11a: an active filter is never invisible — every value is a
           removable chip. With none set the row states the grouping instead,
           which is the other thing arranging the list. -->
      <div class="filter-bar" data-testid="m4-filter-bar">
        <template v-if="activeChips.length > 0">
          <button
            v-for="chip in activeChips"
            :key="`${chip.key}:${chip.value}`"
            class="chip"
            :data-testid="`m4-chip-${chip.key}-${chip.value}`"
            @click="toggleValue(chip.key, chip.value)"
          >
            <b>{{ chip.facetLabel }}</b> {{ chip.label }} <span class="x">×</span>
          </button>
          <button class="chip-reset" data-testid="m4-chip-reset" @click="reset">
            {{ t('filter.reset') }}
          </button>
        </template>
        <span v-else class="grouped-by">
          {{ t('filter.groupedBy', { axis: t(`group.${groupBy}` as const) }) }}
        </span>
      </div>

      <!-- FR-27.4: the groups changed, and the trip is asked before it moves.
           Above the list because it is about the list, and answered here
           because the trip is where the consequence lands. -->
      <GroupChangesProposal
        v-if="groupProposal"
        :plan="groupProposal"
        @apply="applyGroupChanges"
        @decline="declineGroupChanges"
      />

      <ArchivedTripCard
        v-if="trip?.status === TRIP_STATUS_ARCHIVED"
        :trip-id="tripId"
        :proposal-names="closingProposals.map((proposal) => proposal.itemName)"
      />

      <QuickAddItem
        v-if="!closingPass"
        ref="quickAdd"
        :is-active="active"
        :show-trigger="false"
        :offer-groups="true"
        :traveler-count="travelers.length"
        :travelers="travelers"
        :exclude-item-ids="quickAddExcludeIds"
        :browse-row-states="browseStates"
        @add="onQuickAdd"
        @add-for-all="onBrowseAddForAll"
        @assign-for-travelers="onBrowseAssignForTravelers"
        @spread-carried="onBrowseSpread"
        @add-group="onQuickAddGroup"
        @pack-carried="onBrowsePack"
        @skip-carried="onBrowseSkip"
        @undo-browse="onBrowseUndo"
        @reopen-carried="onBrowseReopen"
      />

      <IonList v-if="view.groups.length > 0">
        <template v-for="group in view.groups" :key="group.key">
          <button
            class="group-head"
            :class="{ shut: group.collapsed }"
            :data-testid="`m4-group-${group.key || 'none'}`"
            @click="toggleGroup(group.key)"
          >
            <IonIcon :icon="chevronDownOutline" class="caret" />
            <span class="group-name">{{ group.name ?? t('common.none') }}</span>
            <!-- Collapsed, the header is all that is left of the group, so it
                 answers what the hidden rows would have (FR-25.16). -->
            <span class="group-count">
              {{
                group.collapsed
                  ? t('packing.openCount', { n: group.openCount })
                  : `${group.doneCount}/${group.totalCount}`
              }}
            </span>
          </button>

          <!-- FR-25.2: a packed row leaves rather than vanishes. TransitionGroup
               keeps the node until its leave finishes, so nothing here has to
               hold a "still animating" set in the view model — the DOM does it.
               `tag="div"` because the card needs a block child; `:css="false"`
               is deliberately *not* used, the height is driven from a hook and
               the fade from CSS. -->
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
              <!-- FR-25.1: a per-person item is named once, with one child
                   row per traveler under it. -->
              <div
                v-if="entry.kind === 'cluster'"
                class="cluster"
                :data-for-whom-key="forWhomKeyOf(entry)"
              >
                <ClusterHead
                  :name="entry.name"
                  :mode="entry.mode"
                  :late="entry.latePacker"
                  :done-count="entry.doneCount"
                  :total-count="entry.totalCount"
                  :open-count="entry.openCount"
                  :collapsed="entry.collapsed"
                  :faces="entry.faces"
                  :master="clusterMaster(entry)"
                  :seat="seatFor(entry)"
                  @for-whom="toggleForWhom(entry)"
                  @toggle="toggleCluster(entry.key)"
                  @menu="openClusterMenu(entry)"
                  @press-start="(e: PointerEvent) => clusterHold.down(entry, e.clientX, e.clientY)"
                  @press-move="(e: PointerEvent) => clusterHold.move(e.clientX, e.clientY)"
                  @press-end="clusterHold.cancel()"
                />

                <ForWhomStrip
                  v-if="forWhomOpenOn(entry)"
                  :trip-id="tripId"
                  :item-id="entry.instanceIds[0] ?? ''"
                  :participants="participants"
                  :test-key="entry.name"
                />

                <div v-if="!entry.collapsed" class="cluster-children">
                  <PackingRow
                    v-for="child in entry.children"
                    :key="child.item.id"
                    variant="child"
                    :item="child.item"
                    :label="child.traveler?.name ?? child.label"
                    :test-key="`${entry.name}-${child.traveler?.name ?? ''}`"
                    :done="child.done"
                    :locked="locked(child.item)"
                    :closing-pass="closingPass"
                    :notes="rowNotes(child.item)"
                    :traveler="child.traveler"
                    :edge-avatar="edgeAvatarFor(child.item)"
                    :assignable="assignableRow(child.item)"
                    :seat-column="seatColumn"
                    @assign="onAssignRow(child.item, child.traveler?.name)"
                    @open="openItem(child.item.id)"
                    @menu="openRowMenu(child.item)"
                    @press-start="(e: PointerEvent) => onRowPress(child.item, e)"
                    @press-move="(e: PointerEvent) => hold.move(e.clientX, e.clientY)"
                    @press-end="hold.cancel()"
                    @pass-toggle="onPassToggle(child.item)"
                    @edit-quantity="(e: MouseEvent) => openQuantity(child.item, e)"
                    @increment="onIncrement(child.item)"
                    @decrement="onDecrement(child.item)"
                    @complete="onComplete(child.item)"
                    @zero="onZero(child.item)"
                    @toggle="onToggle(child.item)"
                  />
                </div>
              </div>

              <PackingRow
                v-else
                :item="entry.item"
                :label="entry.label"
                :test-key="entry.item.name"
                :done="entry.done"
                :locked="locked(entry.item)"
                :closing-pass="closingPass"
                :notes="rowNotes(entry.item)"
                :traveler="entry.traveler"
                :master="masterOf(entry.item)"
                :prep-count="openTodoCount(entry.item.id)"
                :edge-avatar="edgeAvatarFor(entry.item)"
                :assignable="assignableRow(entry.item)"
                :seat="seatFor(entry)"
                :data-for-whom-key="forWhomKeyOf(entry)"
                :data-row-id="entry.item.id"
                @for-whom="toggleForWhom(entry)"
                @assign="onAssignRow(entry.item)"
                @open="openItem(entry.item.id)"
                @menu="openRowMenu(entry.item)"
                @press-start="(e: PointerEvent) => onRowPress(entry.item, e)"
                @press-move="(e: PointerEvent) => hold.move(e.clientX, e.clientY)"
                @press-end="hold.cancel()"
                @pass-toggle="onPassToggle(entry.item)"
                @edit-quantity="(e: MouseEvent) => openQuantity(entry.item, e)"
                @increment="onIncrement(entry.item)"
                @decrement="onDecrement(entry.item)"
                @complete="onComplete(entry.item)"
                @zero="onZero(entry.item)"
                @toggle="onToggle(entry.item)"
              />
              <!-- FR-25.28: the strip unfolds under the row it belongs to, as a
                   line of the same card. Keyed, because a TransitionGroup
                   child has to be. -->
              <ForWhomStrip
                v-if="entry.kind === 'item' && forWhomOpenOn(entry)"
                key="for-whom"
                :data-for-whom-key="forWhomKeyOf(entry)"
                :trip-id="tripId"
                :item-id="entry.item.id"
                :participants="participants"
                :test-key="entry.item.name"
              />
            </template>
          </TransitionGroup>
        </template>
      </IonList>

      <!-- An empty list means one of *three* things, and conflating them is how
           a packing app tells someone they are finished when they are not. The
           first is not a state of the list at all: until the partition is here
           there is nothing to be narrowed, empty or done (ADR-033). -->
      <EmptyState
        v-else-if="!rowsLoaded"
        :title="t('packing.listUnknown')"
        testid="m4-list-loading"
      />

      <EmptyState
        v-else-if="view.narrowed"
        :title="onlyOthersHidden ? t('packing.emptyOthersHead') : t('packing.noMatches')"
        :hint="emptyReason"
        testid="packing-empty"
      >
        <IonButton size="small" fill="outline" data-testid="m4-reset" @click="resetNarrowing">
          {{
            onlyOthersHidden
              ? t('packing.emptyOthersAction')
              : search.trim() && view.activeFacetCount === 0
                ? t('packing.resetSearch')
                : t('packing.resetAll')
          }}
        </IonButton>
      </EmptyState>

      <EmptyState
        v-else-if="allItems.length === 0"
        :icon="bagHandleOutline"
        :title="t('packing.empty')"
        :hint="t('packing.emptyHint')"
        testid="packing-empty"
      />

      <EmptyState
        v-else
        :title="t('packing.allDone')"
        :hint="t('packing.allDoneHint')"
        testid="packing-empty"
      />

      <!-- The bars run in the order the rows do (owner, 2026-09-18): the two
           whose rows still ask for something first — packed on departure day
           (FR-25.27), then in somebody else's hands (FR-25.20) — and last the
           one whose rows ask for nothing. Hidden only on request, and never
           silently: this bar is what keeps „alles gepackt" from covering rows
           nobody has touched. -->
      <!-- Like the Erledigte bar, absent while a term is typed: the search
           already shows its late-packer matches (FR-25.32). -->
      <RevealBar
        v-if="view.lateCount > 0 && !searching"
        :open="showLate"
        :label="
          showLate
            ? t('packing.lateShown', { n: view.lateCount })
            : t('packing.lateHidden', { n: view.lateCount })
        "
        testid="m4-late-bar"
        @toggle="showLate = !showLate"
      />
      <RevealBar
        v-if="view.hiddenOtherCount > 0 || showOthers"
        :open="showOthers"
        :label="
          showOthers
            ? t('packing.othersShown', {
                n: view.hiddenOtherCount,
                who: view.hiddenOtherNames.join(' · '),
              })
            : t('packing.othersHidden', {
                n: view.hiddenOtherCount,
                who: view.hiddenOtherNames.join(' · '),
              })
        "
        testid="m4-others-bar"
        @toggle="showOthers = !showOthers"
      />
      <!-- FR-25.2: state the count, one tap to reveal. Not while a term is typed:
           the search already shows its packed matches (FR-25.32), so the offer
           would sit beside a packed row that is on screen. -->
      <RevealBar
        v-if="view.doneCount > 0 && !closingPass && !searching"
        :open="showDone"
        :label="
          showDone
            ? t('packing.hidePacked', { n: view.doneCount })
            : t('packing.showPacked', { n: view.doneCount })
        "
        testid="m4-done-bar"
        @toggle="showDone = !showDone"
      />

      <!-- Preparation (FR-7.3): the open todos of the whole trip, resolvable
           without opening each item. -->
      <div v-if="openPrepItems.length > 0" class="prep-section" data-testid="m4-prep-section">
        <button class="prep-header" data-testid="m4-prep-toggle" @click="showPrep = !showPrep">
          <IonIcon :icon="buildOutline" />
          <span
            >{{ t('packing.prepSection') }} ·
            {{ t('packing.openPrep', { n: openPrepCount }) }}</span
          >
          <IonIcon :icon="chevronDownOutline" class="caret" :class="{ open: showPrep }" />
        </button>
        <IonList v-if="showPrep">
          <template v-for="{ item, openTodos } in openPrepItems" :key="item.id">
            <div class="prep-item">{{ item.name }}</div>
            <IonItem v-for="todo in openTodos" :key="todo.id" lines="inset">
              <IonCheckbox slot="start" :checked="false" @ion-change="togglePrepTodo(todo)" />
              <IonLabel>{{ todo.body }}</IonLabel>
            </IonItem>
          </template>
        </IonList>
      </div>

      <!-- FR-25.13a: the ＋ opens *and focuses* the quick-add. Expanding it
           without focus costs a second tap on the only path that has to be
           one-handed. -->
      <!-- The id is the snackbar's anchor: FR-25.2's undo is the one control
           the FAB must never sit on top of (the same rule as FR-25.11h, one
           layer up). -->
      <IonFab :id="FAB_ANCHOR.m4" slot="fixed" vertical="bottom" horizontal="end">
        <IonFabButton
          v-if="!quickAddExpanded && !closingPass"
          data-testid="m4-fab"
          :aria-label="t('common.add')"
          @click="openQuickAdd"
        >
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>

      <!-- FR-25.24: the amount, over the list rather than instead of it —
           the rows around the one being corrected are what makes the number
           decidable. -->
      <IonPopover
        :is-open="quantityRowIds.length > 0"
        :event="quantityEvent"
        data-testid="m4-quantity-popover"
        @did-dismiss="onQuantityClosed"
      >
        <div class="qty-pop">
          <p class="qty-pop-head">
            <span class="jp-eyebrow">{{ t('quantity.title') }}</span>
            <span class="qty-pop-name">{{ quantityClusterLabel ?? quantityItem?.name }}</span>
          </p>
          <QuantityEditor
            v-if="quantityItem"
            :quantity="quantityItem.quantity"
            :packed="quantityPacked"
            :choices="quantityChoiceList"
            @update="onSetQuantity"
          />
        </div>
      </IonPopover>

      <!-- M5 (UI-Spec M5 + G-9): a sheet on a phone, a side panel on a
           desktop — one content component either way. The sheet is the app's
           own chrome (U-3) and therefore as tall as what it holds: at a fixed
           88 % of the viewport an item with no notes and no prep spent two
           thirds of the screen on nothing (FR-21.25). -->
      <SheetModal
        v-if="!isDesktop"
        :is-open="openItemId !== null"
        testid="m5-modal"
        @dismiss="closeItem"
      >
        <ItemDetailSheet
          v-if="openItemId"
          :trip-id="tripId"
          :item-id="openItemId"
          :participants="participants"
          :current-user-id="myUserId"
          :inventory-rename="openItemRename"
          @close="closeItem"
          @adopt-name="(rename) => adoptInventoryNames([rename])"
        />
      </SheetModal>
      <!-- Into the frame's second pane (G-9), not into this screen: a
           detail pane has to reach the window's edge, and `.ion-page`
           carries `contain: layout`, which bounds anything positioned
           inside a screen to the content column. `defer` because a deep
           link opens the item on the same tick the screen mounts, before
           the host exists. -->
      <Teleport v-if="isDesktop && openItemId" defer :to="PANEL_HOST_SELECTOR">
        <aside class="item-panel" data-testid="m5-panel">
          <ItemDetailSheet
            :trip-id="tripId"
            :item-id="openItemId"
            :participants="participants"
            :current-user-id="myUserId"
            :inventory-rename="openItemRename"
            @close="closeItem"
            @adopt-name="(rename) => adoptInventoryNames([rename])"
          />
        </aside>
      </Teleport>

      <SheetModal
        :is-open="inventoryNamesOpen"
        testid="inventory-names-modal"
        @dismiss="inventoryNamesOpen = false"
      >
        <InventoryNamesSheet
          v-if="inventoryNamesOpen"
          :renames="inventoryRenames"
          :travelers="travelers"
          @close="inventoryNamesOpen = false"
          @adopt="adoptInventoryNames"
        />
      </SheetModal>

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
    </IonContent>
  </IonPage>
</template>

<style>
/*
 * FR-25.2's snackbar. Unscoped on purpose: Ionic renders overlays in the app
 * root, so a scoped rule never reaches them — which is why the toast first
 * shipped in Ionic's stock palette with an undo nobody could read.
 *
 * The shape follows the concept prototype's `.snack`: a raised surface with
 * a rim, and the action in the brand colour, because undo is the only thing
 * on it worth tapping.
 */
.pack-toast {
  --background: var(--ct-surface1);
  --color: var(--ct-text);
  --border-color: var(--ct-surface2);
  --border-width: 1px;
  --border-style: solid;
  --border-radius: var(--jp-r-md);
  --box-shadow: var(--jp-shadow);
  --button-color: var(--jp-brand);
}
</style>

<style scoped>
/* FR-25.24's popover holds one control and its name, so it is padded like
   a card rather than like a screen. */
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

/* M5 as a sheet (phone) or a panel (desktop, G-9). The panel is the frame's
   second pane, teleported into it, so it is laid out beside the list rather
   than over it and the column re-centres in what is left. Nothing here
   positions it: being a flex sibling of the column is what puts it at the
   window's edge, and the frame's own row is what gives it the height. */
.item-panel {
  width: var(--jp-panel-w);
  overflow-y: auto;
  background: var(--ct-mantle);
  border-left: 1px solid var(--ct-surface1);
  box-shadow: var(--jp-shadow-panel);
}

/* The header line collapses by giving up its own height in the scrolled
   content, and the browser answers that with a scroll-anchoring adjustment
   of the same size. Read back through @ion-scroll it is an upward scroll,
   which re-opens the line, which grows the content again — the line then
   flips open and shut for as long as anyone watches. Anchoring is off here
   because this list has one thing above the rows and it is the element that
   moves. */
ion-content.pack-content::part(scroll) {
  overflow-anchor: none;
  /* The measure column (surfaces.css) no longer spans the full viewport on
     a tablet, which otherwise leaves the browser's default scrollbar
     rendered at the true screen edge, disconnected from the content it
     scrolls. A thin, token-coloured bar reads as this list's own control
     instead of a stray line in the gutter. */
  scrollbar-width: thin;
  scrollbar-color: var(--ct-overlay1) transparent;
}

ion-content.pack-content::part(scroll)::-webkit-scrollbar {
  width: 6px;
}

ion-content.pack-content::part(scroll)::-webkit-scrollbar-thumb {
  background: var(--ct-overlay1);
  border-radius: var(--jp-r-pill);
}

/* FR-25.11h: nothing may sit permanently under the FAB. The list has to be
   able to scroll clear of its whole footprint, or the last row's right edge
   — where the packer avatar lives — is both unreadable and untappable. */
.pack-content {
  --padding-bottom: 96px;
}

/* --- Header line ------------------------------------------------------ */
.trip-line {
  display: flex;
  gap: 2px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ct-surface0);
  /* An explicit token, not --ion-background-color: inside ion-content that
     one resolves to nothing, so the sticky line was transparent and the
     rows scrolled *through* the trip's progress figure. */
  background: var(--ct-base);
  position: sticky;
  top: 0;
  /* Above the rows: ion-item-sliding is a positioned, transformed element,
     so at z-index 2 the list painted straight over the trip's figures. */
  z-index: 10;
  overflow: hidden;
  /* The figure's own height plus the padding: ring, share, what qualifies
     it, and the track under them (FR-21.23). */
  max-height: 96px;
  /* Clipped, never faded: a half-transparent sticky line reads as two
     lines printed on top of each other while the list slides past it. */
  transition:
    max-height 0.18s ease,
    padding 0.18s ease;
}

/* Scrolling down still takes the whole line (owner call, 2026-08-19): you
   know which packing list you are on, and the rows are what the screen is
   for. Any upward scroll brings it back. The name is no longer in here —
   the same flag collapses the frame's page head, see setHeaderTitle. */
.trip-line.collapsed {
  max-height: 0;
  padding-block: 0;
  border-bottom-color: transparent;
}

.trip-stats {
  display: flex;
  align-items: stretch;
  gap: 10px;
}

/* A lone share keeps its own width; a pair takes the line and wraps to two
   rows where two columns would ellipsize a sentence — the basis is the
   header ring, its gap and the longest sentence measured (*„118/118
   gepackt"*), as on M1's hero (FR-7.4). */
.trip-stats.paired {
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
  row-gap: 8px;
}

.trip-stats.paired > .figure,
.trip-stats.paired > .todo-figure-button {
  flex: 1 1 10.5rem;
}

/* Two stacked figures are taller than the one the line was sized for;
   `:not(.collapsed)` so scrolling down still takes the whole line. */
.trip-line.paired:not(.collapsed) {
  max-height: 136px;
}

/* Stretched so a paired figure's two tracks share a level (FR-7.4); the
   facepile keeps to the middle of the line. */
.trip-stats > .wrap {
  align-self: center;
}

/* The ring is punched in the colour it sits on, and the header line is the
   one place that is not a card. */
.figure {
  flex: 1;
  min-width: 0;
  --ring-hole: var(--ct-base);
}

.filter-count {
  position: absolute;
  top: 2px;
  right: 0;
  font-size: var(--jp-text-3xs);
  padding: 2px 4px;
}

/* --- Filter chip row -------------------------------------------------- */
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

/* --- Groups and rows -------------------------------------------------- */
.group-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 20px 6px 8px;
  background: none;
  border: none;
  color: var(--ct-text);
  /* A group heading outranks the rows under it. It used to be 0.82rem
     uppercase micro-type — smaller than the item names it was heading,
     which inverts the hierarchy it exists to state. */
  font-size: var(--jp-text-lg);
  font-weight: var(--jp-weight-bold);
  letter-spacing: var(--jp-tracking-display);
  cursor: pointer;
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

/* Each group is its own block, so the seam between two categories is a
   real edge rather than a slightly larger gap — which is what made them
   run into each other on a long list. The plane, rim, radius and lift all
   come from .jp-card (G-14); this only places it. */
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

.prep-header .caret.open {
  transform: rotate(180deg);
}

/* --- Per-person cluster ----------------------------------------------- */

/*
 * The rule and the step belong to the *children*, not to the block
 * (FR-21.20). Until 2026-09-07 they were on `.cluster`, which carried the
 * head in with them: the item's name sat 8 px right of every other item
 * name in the list and only 6 px left of its own travelers — so the head
 * read as one of its children rather than as their heading. The head is a
 * line of the list; the people under it are the ones stepping in.
 */
.cluster-children {
  border-inline-start: 2px solid var(--ct-surface1);
  margin-inline-start: 12px;
}

/* --- FR-25.2: the pack-out ------------------------------------------- */

/*
 * A packed row leaves in three beats: the done colour washes over it, it
 * collapses to nothing, and it fades. Before this it was simply gone on the
 * next tick — which reads as a glitch rather than as progress, and gives a
 * mistap no evidence it ever happened.
 *
 * The height is driven from `onRowLeave` because `height: auto` does not
 * animate; everything else is here. `overflow: hidden` is what makes the
 * collapse look like a collapse rather than a clip.
 */
.pack-out-leave-active {
  transition:
    height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.3s ease,
    background-color 0.3s ease;
  overflow: hidden;
  pointer-events: none;
}

/*
 * The green is the done role, not a colour picked for the animation — the
 * same one the checkbox turns (G-11).
 *
 * On the *item*, not on the slider around it. Washing both put the tint
 * over two different grounds — the card behind the empty stretch of row,
 * and the item's own surface behind the label — so the row came out in two
 * shades split down the middle. Measuring said so before looking did: one
 * side was the tint over `--ct-base`, the other the same tint over
 * `--ct-surface0`.
 */
.pack-out-leave-from {
  background: color-mix(in srgb, var(--jp-done) 22%, transparent);
}

.pack-out-leave-to {
  opacity: 0;
}

/*
 * Rows below a leaving one slide up instead of jumping. Without this the
 * collapse animates and the list underneath still snaps, which looks worse
 * than no animation at all.
 */
.pack-out-move {
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/*
 * FR-25.2's feedback is the *fact* of the pack, not the motion. With motion
 * reduced the row still leaves and the snackbar still offers the undo; only
 * the travel is dropped. `onRowLeave` matches this by finishing immediately,
 * so the two cannot disagree.
 */
@media (prefers-reduced-motion: reduce) {
  /* The header line yields and returns instantly. Its travel is the largest
     movement on this screen and it happens while the list is moving too,
     which is exactly the pairing the preference is asking us not to make. */
  .trip-line {
    transition: none;
  }

  .pack-out-leave-active,
  .pack-out-move {
    transition: none;
  }

  .pack-out-leave-from {
    background: none;
  }
}

/* --- Bars, cards and sections ----------------------------------------- */
.prep-section {
  margin-top: 16px;
  border-top: 1px solid var(--ct-surface0);
}

.prep-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  background: none;
  border: none;
  color: var(--ct-straw);
  font-size: var(--jp-text-base);
  cursor: pointer;
}

/* FR-7.4: above the list the section is a card of its own, not the strip
   that closed the page — and it turns to the done role once nothing is owed. */
.trip-todos-section {
  margin: 8px 12px 4px;
  border-top: none;
  overflow: hidden;
}

.trip-todos-section.done .prep-header {
  color: var(--jp-done);
}

/* The figure is the control; the button only makes it one. It takes the
   same share of the line as the packing figure, so the two tracks run on
   one level and one length. */
.todo-figure-button {
  min-width: 0;
  padding: 0;
  background: none;
  border: none;
  color: inherit;
  text-align: start;
  cursor: pointer;
  --ring-hole: var(--ct-base);
}

.prep-item {
  padding: 8px 14px 2px;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}
</style>
