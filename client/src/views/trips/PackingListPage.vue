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
 *    scroll, which is where the list height comes from — the name goes with
 *    it, deliberately.
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
  IonBadge,
  IonButton,
  IonCheckbox,
  IonRefresher,
  IonRefresherContent,
  IonFab,
  IonFabButton,
  IonModal,
  actionSheetController,
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
  cartOutline,
  chevronDownOutline,
  contractOutline,
  createOutline,
  expandOutline,
  funnelOutline,
  briefcaseOutline,
  lockOpenOutline,
  playOutline,
  statsChartOutline,
} from 'ionicons/icons'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import EmptyState from '@/components/global/EmptyState.vue'
import FilterSheet from '@/components/global/FilterSheet.vue'
import ArchivedTripCard from '@/components/trips/ArchivedTripCard.vue'
import ClosingPassBanner from '@/components/trips/ClosingPassBanner.vue'
import ClusterHead from '@/components/trips/ClusterHead.vue'
import ItemDetailSheet from '@/components/trips/ItemDetailSheet.vue'
import PackingRow, {
  type PackingRowNotes,
  type RowEdgeAvatar,
} from '@/components/trips/PackingRow.vue'
import MembershipSheet from '@/components/trips/MembershipSheet.vue'
import PresenceFacepile from '@/components/global/PresenceFacepile.vue'
import SearchRow from '@/components/global/SearchRow.vue'
import QuickAddItem from '@/components/global/QuickAddItem.vue'
import { groupAdditionMessage } from '@/lib/groupAdditionMessage'
import {
  activeChips as chipsFor,
  emptyReason as emptyReasonFor,
  filterFacets as facetsFor,
  filterSwitches as switchesFor,
  groupingAxis,
  onlyOthersHidden as isOnlyOthersHidden,
} from '@/lib/packingFilterPanel'
import { hasCollaborativeSession } from '@/mode'
import { presentToast } from '@/lib/toast'
import { peekScroll, rememberScroll, takeScroll } from '@/lib/scrollMemory'
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { useContextSearch } from '@/composables/useContextSearch'
import { useLongPress } from '@/composables/useLongPress'
import { usePackingFilter } from '@/composables/usePackingFilter'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { M4_FAB_ANCHOR_ID, usePackAnnouncer } from '@/composables/usePackAnnouncer'
import type { RowUndoRecord } from '@/composables/useRowUndo'
import { browseRowStates } from '@/domain/browseRows'
import type { AddedItemDecision } from '@/composables/useMutations'
import { buildPackingView, type PackingCluster, rowEdgeAvatar } from '@/domain/packingView'
import { rowMenuEntries, type RowMenuAction } from '@/domain/rowMenu'
import { canJudgeUnused, isActive, nextLifecycleStep } from '@/domain/trips'
import { formatWeight } from '@/lib/format'
import { t, type MessageKey } from '@/i18n'
import { buildReviewProposals } from '@/domain/review'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import GroupChangesProposal from '@/components/trips/GroupChangesProposal.vue'
import type { FacetKey, GroupBy, ItemTodo, MasterItem, TripItem } from '@/types/domain'
import { TRIP_STATUS_ARCHIVED } from '@/types/domain'
import { tripItemPath, tripPath, tripSubPath } from '@/router/paths'
import { confirmAction } from '@/lib/confirm'
import { lockNoteText, packedStampText, responsibleNote, skippedNote } from '@/lib/rowFacts'

const props = defineProps<{ tripId: string; itemId?: string }>()

const store = useTripStore()
const masterStore = useMasterStore()
const router = useRouter()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

// --- Identity, for FR-25.19/25.20 ---------------------------------------
const {
  myUserId,
  participants,
  nameOf,
  load: loadIdentity,
} = useTripIdentity(props.tripId, orchestrator)

onMounted(async () => {
  orchestrator.subscribeTrip(props.tripId)
  await orchestrator.drainTrip(props.tripId)
  // FR-27.4: opening the trip is the moment it works out what the groups it
  // follows would change. After the drain, not before — the diff must see the
  // rows the pull just brought, or it would offer what another device already
  // applied.
  orchestrator.proposeTripRefresh(props.tripId)
  await loadIdentity()
  // After the drain, not before: restoring onto a list whose rows have not
  // arrived yet would clamp the offset to a shorter page.
  await restoreScroll()
})

// --- View state ---------------------------------------------------------
// The filter, the two reveal switches and the grouping live in their own
// composable because they outlive this component (FR-25.18): the filter
// for the session, the grouping durably. The search term deliberately
// does not — see there.
const { facets, showDone, showOthers, groupBy, reset, toggleValue, clearFacet } = usePackingFilter(
  props.tripId,
)

const {
  term: search,
  isOpen: searchOpen,
  toggle: toggleSearch,
  action: searchAction,
} = useContextSearch('m4-search')
const collapsedGroups = ref<string[]>([])
const showPrep = ref(false)
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
  await presentToast({ message, positionAnchor: M4_FAB_ANCHOR_ID })
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

const trip = computed(() => store.getTrip(props.tripId))
const kpis = computed(() => store.kpis(props.tripId))
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
const allItems = computed(() => store.getItems(props.tripId))

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
  browseRowStates(allItems.value, (item) =>
    locked(item) ? (lockNote(item) ?? t('packing.lockedByUnknown')) : null,
  ),
)

const openPrepItems = computed(() => store.itemsWithOpenPrep(props.tripId))

/**
 * FR-28.7: the row inherits the master item's photo and mark, it never copies
 * them — the mark is a property of the thing, not of one trip's plan. An
 * ad-hoc row has no master item and therefore no mark, and shows an empty
 * slot rather than a placeholder.
 */
function masterOf(item: TripItem): MasterItem | null {
  return (item.source_item_id ? masterStore.getItem(item.source_item_id) : undefined) ?? null
}

/**
 * The same resolution for a per-person cluster, which has no `TripItem` of
 * its own — the head is the item, its children are the travelers.
 */
function clusterMaster(cluster: PackingCluster): MasterItem | null {
  return (cluster.sourceItemId ? masterStore.getItem(cluster.sourceItemId) : undefined) ?? null
}

const travelers = computed(() => store.getTravelers(props.tripId))

const view = computed(() =>
  buildPackingView({
    items: allItems.value,
    travelers: travelers.value,
    containers: store.getContainers(props.tripId),
    participants: participants.value,
    groupBy: groupBy.value,
    showDone: showDone.value || closingPass.value,
    facets: facets.value,
    search: search.value,
    currentUserId: myUserId.value,
    showOthers: showOthers.value,
    collapsedGroups: collapsedGroups.value,
    itemsWithOpenPrep: openPrepItems.value.map((entry) => entry.item.id),
    packedOnly: closingPass.value,
  }),
)

// --- M5, as a sheet over this list (UI-Spec M5) --------------------------
// Driven by the route rather than by local state: the same URL opens it
// from a tap, a deep link and a reload, and `‹ back` closes it because
// the item route's declared parent is the trip.
const openItemId = computed(() => props.itemId ?? null)

/**
 * Opening and closing the sheet **replaces** the route rather than
 * pushing: Ionic keeps one page per matched *path*, so a push would mount
 * a second copy of this list behind the sheet — two live lists, both
 * subscribed, and the one you were looking at hidden underneath its own
 * twin. Replacing keeps exactly one.
 */
function openItem(itemId: string) {
  if (rowMenuActive) return
  // One posture, one meaning (FR-9.3): in the pass the tap is the mark,
  // and the detail sheet — which asks a dozen other questions — is not
  // what this screen is asking.
  if (closingPass.value) return
  rememberScroll(props.tripId, { top: currentScrollTop, headerCollapsed: headCollapsed.value })
  restorePending = true
  router.replace(tripItemPath(props.tripId, itemId))
}

/**
 * M4's scroll position across the M5 overlay — the repair ADR-012's overlay
 * amendment named and left owed.
 *
 * Opening the sheet `replace`s the route, and a replace re-renders the list
 * from the top; the amendment weighed that against pushing, which would have
 * mounted a second live copy of the list behind the sheet, and kept the
 * replace. The position therefore has to outlive this component — see
 * lib/scrollMemory, which is a module rather than a binding here for exactly
 * that reason.
 */
const remembered = peekScroll(props.tripId)

/**
 * Where the list stands. Seeded from the remembered position rather than
 * from zero: an instance mounted with the sheet already over it never sees
 * a scroll event of its own (see `restorePending`), so starting at zero
 * would let it write a zero back over the offset it is holding.
 */
let currentScrollTop = remembered?.top ?? 0

/**
 * True from the moment the sheet is opened until the position has been put
 * back. The list's own scroll events are noise in that window: the
 * re-render reports its way back from the top, which would expand the
 * header line again *and* overwrite the offset about to be re-applied.
 */
let restorePending = remembered !== undefined

const content = ref<{
  $el: HTMLElement & { scrollToPoint(x: number, y: number, d: number): Promise<void> }
} | null>(null)

/**
 * Rendered evidence that a remembered position was actually put back.
 *
 * It exists for E2E-M4-45: without it the only way to know the restore had
 * happened would be to wait and hope, and a test that can only pass by
 * racing is the production code's fault (working agreement). Absent until a
 * restore lands, so it is a positive signal rather than a default.
 */
const scrollRestored = ref(false)

/**
 * Put this trip's remembered position back.
 *
 * Runs on both ways back, because the replace produces a fresh mount but
 * Vue may also reuse the instance when only the alias params changed. While
 * the sheet is still open the position is re-applied but *kept*, so the list
 * behind it stays where it was and the closing pass still has something to
 * restore.
 *
 * The header state goes back first and without an animation — it holds 84 px
 * of the scrolled content, so applying the offset while its max-height is
 * still travelling lands on a different set of rows each time.
 */
async function restoreScroll() {
  const stillOpen = openItemId.value !== null
  const position = stillOpen ? peekScroll(props.tripId) : takeScroll(props.tripId)
  if (!position) {
    // Nothing to put back, so nothing to be deaf for — a screen that stayed
    // deaf would never collapse its header line again.
    restorePending = false
    return
  }
  headCollapsed.value = position.headerCollapsed
  lastScrollTop = position.top
  currentScrollTop = position.top
  await nextTick()
  // Instantly, not animated: an animation is a race, and there is nothing to
  // see anyway — this frame is the first the user gets after the sheet.
  await content.value?.$el.scrollToPoint(0, position.top, 0)
  restorePending = stillOpen
  if (!stillOpen) scrollRestored.value = true
}

watch(openItemId, (open, wasOpen) => {
  if (!open && wasOpen) void restoreScroll()
})

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
 * row. The stepper has holds of its own — G-6's + completes and − zeroes —
 * and armed together the row's menu opened over a gesture the stepper never
 * got to finish, so the shortcut was unreachable on the one screen that
 * renders it. The row's *click* was already stopped at `.row-start` when the
 * stepper shipped; its press was not (E2E-G6-01).
 */
function onRowPress(item: TripItem, event: PointerEvent): void {
  if ((event.target as Element | null)?.closest('.row-start')) return
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
const ROW_MENU_BUTTONS: Record<RowMenuAction, { labelKey: MessageKey; icon: string }> = {
  takeover: { labelKey: 'packing.takeoverAction', icon: lockOpenOutline },
  release: { labelKey: 'packing.releaseAction', icon: lockOpenOutline },
  unskip: { labelKey: 'packing.unskipAction', icon: refreshOutline },
  packingNow: { labelKey: 'mode.pack', icon: contrastOutline },
  skip: { labelKey: 'packing.skipAction', icon: closeCircleOutline },
  flagUnused: { labelKey: 'packing.flagUnusedAction', icon: removeCircleOutline },
  unflagUnused: { labelKey: 'packing.unflagUnusedAction', icon: removeCircleOutline },
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
    case 'packingNow':
      onPackingNow(item)
      return
    case 'skip':
      onSkipItem(item)
      return
    case 'flagUnused':
      void onFlagUnused(item, true)
      return
    case 'unflagUnused':
      void onFlagUnused(item, false)
  }
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
const openPrepCount = computed(() => store.getOpenTodos(props.tripId).length)

// M6 entry: the count is what makes the icon worth a tap; it stays visible
// at zero because the destination exists either way (G-12 has no overflow
// to hide it in).
const shoppingCount = computed(() => {
  const lists = store.getShoppingItems(props.tripId)
  return lists.buyBefore.length + lists.buyLocal.length
})

/**
 * The header line yields to the list on the way down and comes back on any
 * upward scroll. A threshold keeps it from flickering on the rubber-band
 * overscroll at the top, where the direction flips every frame.
 */
// Seeded from the remembered position rather than reset, and seeded *during
// setup* so the very first frame after the sheet already has the header
// folded — on a fresh mount there is then no max-height transition to race.
const headCollapsed = ref(remembered?.headerCollapsed ?? false)
let lastScrollTop = remembered?.top ?? 0
function onScroll(event: CustomEvent<{ scrollTop: number }>) {
  if (restorePending) return
  const top = event.detail.scrollTop
  currentScrollTop = top
  if (Math.abs(top - lastScrollTop) < 8) return
  headCollapsed.value = top > lastScrollTop && top > 48
  lastScrollTop = top
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
  // FR-2.7: the trip's own properties. Before the lifecycle steps, because
  // it is the one action here that changes the trip rather than advancing it.
  //
  // Behind the ⋮ from here down (UX-13): search, filter and fold are tapped
  // while packing, these once per trip — and as words in the menu they say
  // what they do, which six glyphs in a row could not.
  items.push({
    id: 'm4-edit',
    icon: createOutline,
    label: t('tripEdit.title'),
    overflow: true,
    onClick: () => router.push(tripSubPath(props.tripId, 'edit')),
  })
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
  return store.getItemTodos(props.tripId, itemId).filter((todo) => todo.task_state === 'open')
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

const openTotal = computed(() => Math.max(kpis.value.totalItems - kpis.value.packedItems, 0))
const hiddenOpenCount = computed(() => Math.max(openTotal.value - visibleOpenRows.value, 0))

const onlyOthersHidden = computed(() => isOnlyOthersHidden(view.value, search.value))

const emptyReason = computed(() => emptyReasonFor(view.value, search.value, hiddenOpenCount.value))

/**
 * FR-25.11e: a reset that leaves part of the narrowing behind re-renders
 * the same empty screen, so this clears all of it — search, facets and
 * both reveal switches.
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
    packedCount: kpis.value.packedItems,
    hiddenOtherCount: view.value.hiddenOtherCount,
  }),
)

function onToggleSwitch(key: string) {
  if (key === 'done') showDone.value = !showDone.value
  else showOthers.value = !showOthers.value
}

const activeChips = computed(() => chipsFor(view.value, facets.value))

// --- Actions ------------------------------------------------------------

function onPackingNow(item: TripItem) {
  orchestrator.packingNow(props.tripId, item)
}

/** Give the row back without packing it (G-3). */
function onReleaseClaim(item: TripItem) {
  orchestrator.releaseClaim(props.tripId, item)
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
      positionAnchor: M4_FAB_ANCHOR_ID,
    })
  } catch {
    // The claim did not move, and the likeliest reason is that the screen
    // is behind: the holder packed or released the row while the sheet
    // was open. Saying so beats a silent no-op.
    await presentToast({
      message: t('packing.takeoverFailed'),
      positionAnchor: M4_FAB_ANCHOR_ID,
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
 * FR-9.3: the flag is a judgement, not a stamp — the same menu entry sets
 * it and takes it back, which is the undo, so the confirmation names what
 * happened rather than offering a second path to reverse it.
 */
async function onFlagUnused(item: TripItem, value: boolean) {
  orchestrator.setReviewFlag(props.tripId, item, 'unused', value)
  await presentToast({
    message: value
      ? t('packing.flagUnusedToast', { item: item.name })
      : t('packing.unflagUnusedToast', { item: item.name }),
  })
}

/**
 * The pass's single gesture. No snackbar here, unlike the menu's entry:
 * the row carries the mark, and one toast per tap in a pass over a
 * hundred rows is noise, not confirmation.
 */
function onPassToggle(item: TripItem) {
  // G-3 reaches into the leaf: a row somebody else is holding is theirs,
  // and the pass is no exception. A packed row rarely carries a live claim
  // — packing ends it — but this control must not be the one place that
  // decides otherwise.
  if (locked(item)) return
  orchestrator.setReviewFlag(props.tripId, item, 'unused', !item.flag_unused)
}

function onUnskipItem(item: TripItem) {
  orchestrator.unskipItem(props.tripId, item)
}

function onIncrement(item: TripItem) {
  orchestrator.packIncrement(props.tripId, item)
}

function onDecrement(item: TripItem) {
  orchestrator.packDecrement(props.tripId, item)
}

function onComplete(item: TripItem) {
  const name = item.name
  rowUndo.actWithUndo([item], () => orchestrator.packComplete(props.tripId, item), restorePacked)
  void announcePacked(name)
}

function onZero(item: TripItem) {
  orchestrator.packZero(props.tripId, item)
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
 * Collapse a leaving row to zero height.
 *
 * `height: auto` does not animate, so the height is measured and pinned
 * before being driven to 0 — the one thing CSS alone cannot express here.
 * With reduced motion the hook finishes immediately, which removes the row
 * on the next frame exactly as it did before this feature.
 */
function onRowLeave(el: Element, done: () => void) {
  const node = el as HTMLElement
  if (reducedMotion.matches) {
    done()
    return
  }
  node.style.height = `${node.offsetHeight}px`
  // Read back, or the browser coalesces both writes and nothing transitions.
  void node.offsetHeight
  node.style.height = '0'
  node.addEventListener('transitionend', done, { once: true })
}

const { rowUndo, packAnnouncements, announcePacked, announceSkipped } = usePackAnnouncer()

/** Put back what a pack changed, and only that (FR-25.2). */
function restorePacked(records: RowUndoRecord[]) {
  for (const record of records) {
    orchestrator.restorePack(props.tripId, record.itemId, record.packedCount, record.state)
  }
}

function onToggle(item: TripItem) {
  // Only a pack is announced. The same control un-packs a revealed done row
  // (FR-25.2), and offering to undo *that* would be a snackbar for an action
  // whose result is already visible.
  if (item.packed_count >= item.quantity) {
    orchestrator.packToggle(props.tripId, item)
    return
  }
  const name = item.name
  rowUndo.actWithUndo([item], () => orchestrator.packToggle(props.tripId, item), restorePacked)
  void announcePacked(name)
}

function togglePrepTodo(todo: ItemTodo) {
  if (todo.task_state === 'open') {
    orchestrator.resolvePrepTodo(props.tripId, todo)
  } else {
    orchestrator.reopenPrepTodo(props.tripId, todo)
  }
}

/**
 * FR-25.8: an item quick-added *pro Person* opens the membership editor on the
 * row that was just written, and checking the travelers is what fans it out.
 * The row exists first on purpose — the editor edits rows, and an editor that
 * had to work on a draft would be a second implementation of the rules
 * `domain/membership.ts` already owns (invariant 4). The accepted cost is that
 * an abandoned flow leaves an ordinary shared row behind, which is what the
 * user asked for in the first place.
 */
const membershipItemId = ref<string | null>(null)

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

function onQuickAdd(
  item: {
    name: string
    sourceItemId: string | null
    weightGrams: number | null
    valueCents: number | null
    categoryName: string | null
    perPerson: boolean
  },
  decided?: AddedItemDecision,
) {
  const opts = {
    sourceItemId: item.sourceItemId,
    weightGrams: item.weightGrams,
    valueCents: item.valueCents,
    categoryName: item.categoryName,
  }
  const { id: addedId, companions } = decided
    ? orchestrator.addDecidedItem(props.tripId, item.name, opts, active.value, decided)
    : orchestrator.quickAddItem(props.tripId, item.name, opts, active.value)
  // Only a row that came from the inventory has a line to offer the undo on;
  // a typed name is not in the sheet at all.
  if (item.sourceItemId) {
    browseUndo.set(item.sourceItemId, () => orchestrator.removeAddedItem(props.tripId, addedId))
  }
  if (item.perPerson) membershipItemId.value = addedId
  // FR-20.4: say what came along. Named rather than counted, the way FR-20.2's
  // skip names what it took with it — a bare number sends the reader looking
  // for what changed, which is the complaint this answers.
  if (companions.length > 0) {
    void presentToast({
      message: t('packing.companionsAdded', {
        n: companions.length,
        names: companions.join(', '),
      }),
      // Above the composer's own anchor, like every other M4 toast: this one
      // fires while the quick-add is still open for the next entry.
      positionAnchor: M4_FAB_ANCHOR_ID,
    })
  }
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
  const flagged = store.getItems(props.tripId).some((item) => item.flag_unused || item.flag_missing)
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
 * Where the trip's name is written depends on the width, and it is written
 * exactly once either way (UI-Spec M4, 2026-08-19).
 *
 * Below the G-9 breakpoint the app bar cannot hold it: with search, filter,
 * fold-all, the lifecycle step, the sync glyph and the settings gear beside
 * it, 54 px were left and "Samedan 2026" rendered as "S…". A title that
 * survives as one letter names nothing, so M4 registers none there and the
 * header line leads with the name instead. Above the breakpoint the bar has
 * the room, so it takes the title back — and the header line drops the name
 * rather than printing it twice, which returns that line to one row.
 */
setHeaderTitle(() => (isDesktop.value ? tripName.value : null))
</script>

<template>
  <IonPage>
    <IonContent
      ref="content"
      class="pack-content"
      :data-pack-announcements="packAnnouncements"
      :data-scroll-restored="scrollRestored || null"
      :scroll-events="true"
      @ion-scroll="onScroll"
    >
      <IonRefresher slot="fixed" @ionRefresh="handleRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <!-- One header line (G-12): what the trip stands at, and where else to
           go within it. Deliberately unfiltered — see FR-25.20. -->
      <div class="trip-line" :class="{ collapsed: headCollapsed }" data-testid="m4-header">
        <!-- Row one names the trip — where the app bar has no room for it —
             and offers the trip's other views. -->
        <div class="trip-id">
          <h1 v-if="!isDesktop" class="trip-name jp-screen-title" data-testid="m4-trip-name">
            {{ tripName }}
          </h1>
          <div class="trip-nav">
            <IonButton
              fill="clear"
              size="small"
              :router-link="tripSubPath(tripId, 'shopping')"
              data-testid="m4-nav-shopping"
              :aria-label="t('packing.shopping')"
              :title="t('packing.shopping')"
            >
              <IonIcon slot="icon-only" :icon="cartOutline" />
              <IonBadge v-if="shoppingCount > 0" color="brand" class="nav-count">
                {{ shoppingCount }}
              </IonBadge>
            </IonButton>
            <IonButton
              fill="clear"
              size="small"
              :router-link="tripSubPath(tripId, 'containers')"
              data-testid="m4-nav-luggage"
              :aria-label="t('packing.luggage')"
              :title="t('packing.luggage')"
            >
              <IonIcon slot="icon-only" :icon="briefcaseOutline" />
            </IonButton>
            <IonButton
              fill="clear"
              size="small"
              :router-link="tripSubPath(tripId, 'analytics')"
              data-testid="m4-nav-analytics"
              :aria-label="t('packing.analytics')"
              :title="t('packing.analytics')"
            >
              <IonIcon slot="icon-only" :icon="statsChartOutline" />
            </IonButton>
          </div>
        </div>

        <!-- Row two: where the trip stands, and who else is here. The whole
             line is tabular, not just the counter: the weight beside it
             changes on the same tap and would shift the counter sideways as
             it did. -->
        <div class="trip-stats">
          <div class="progress jp-num" data-testid="m4-progress">
            <strong>{{ kpis.packedItems }}/{{ kpis.totalItems }}</strong>
            <span v-if="kpis.totalWeight > 0" class="muted">
              · {{ formatWeight(kpis.totalWeight) }}
            </span>
            <span v-if="openPrepCount > 0" class="muted prep">
              · {{ t('packing.openPrep', { n: openPrepCount }) }}
            </span>
          </div>
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
        :offer-groups="true"
        :offer-per-person="travelers.length > 1"
        :exclude-item-ids="quickAddExcludeIds"
        :browse-row-states="browseStates"
        @add="onQuickAdd"
        @add-group="onQuickAddGroup"
        @pack-carried="onBrowsePack"
        @skip-carried="onBrowseSkip"
        @undo-browse="onBrowseUndo"
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
                  ? t('packing.groupOpen', { n: group.openCount })
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
              <div v-if="entry.kind === 'cluster'" class="cluster">
                <ClusterHead
                  :name="entry.name"
                  :mode="entry.mode"
                  :late="entry.latePacker"
                  :done-count="entry.doneCount"
                  :total-count="entry.totalCount"
                  :master="clusterMaster(entry)"
                />

                <PackingRow
                  v-for="child in entry.children"
                  :key="child.item.id"
                  class="child-row"
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
                  @open="openItem(child.item.id)"
                  @menu="openRowMenu(child.item)"
                  @press-start="(e: PointerEvent) => onRowPress(child.item, e)"
                  @press-move="(e: PointerEvent) => hold.move(e.clientX, e.clientY)"
                  @press-end="hold.cancel()"
                  @pass-toggle="onPassToggle(child.item)"
                  @increment="onIncrement(child.item)"
                  @decrement="onDecrement(child.item)"
                  @complete="onComplete(child.item)"
                  @zero="onZero(child.item)"
                  @toggle="onToggle(child.item)"
                />
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
                @open="openItem(entry.item.id)"
                @menu="openRowMenu(entry.item)"
                @press-start="(e: PointerEvent) => onRowPress(entry.item, e)"
                @press-move="(e: PointerEvent) => hold.move(e.clientX, e.clientY)"
                @press-end="hold.cancel()"
                @pass-toggle="onPassToggle(entry.item)"
                @increment="onIncrement(entry.item)"
                @decrement="onDecrement(entry.item)"
                @complete="onComplete(entry.item)"
                @zero="onZero(entry.item)"
                @toggle="onToggle(entry.item)"
              />
            </template>
          </TransitionGroup>
        </template>
      </IonList>

      <!-- An empty list means one of two things, and conflating them is how
           a packing app tells someone they are finished when they are not. -->
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

      <!-- FR-25.2 / FR-25.20: two classes of hidden rows, one affordance —
           state the count, name the people, one tap to reveal. -->
      <button
        v-if="view.doneCount > 0 && !closingPass"
        class="reveal-bar"
        :class="{ on: showDone }"
        data-testid="m4-done-bar"
        @click="showDone = !showDone"
      >
        {{
          showDone
            ? t('packing.hidePacked', { n: view.doneCount })
            : t('packing.showPacked', { n: view.doneCount })
        }}
      </button>
      <button
        v-if="view.hiddenOtherCount > 0 || showOthers"
        class="reveal-bar"
        :class="{ on: showOthers }"
        data-testid="m4-others-bar"
        @click="showOthers = !showOthers"
      >
        {{
          showOthers
            ? t('packing.othersShown', {
                n: view.hiddenOtherCount,
                who: view.hiddenOtherNames.join(' · '),
              })
            : t('packing.othersHidden', {
                n: view.hiddenOtherCount,
                who: view.hiddenOtherNames.join(' · '),
              })
        }}
      </button>

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
      <IonFab :id="M4_FAB_ANCHOR_ID" slot="fixed" vertical="bottom" horizontal="end">
        <IonFabButton
          v-if="!quickAddExpanded && !closingPass"
          data-testid="m4-fab"
          :aria-label="t('common.add')"
          @click="openQuickAdd"
        >
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>

      <!-- FR-25.8: the membership editor over a freshly quick-added row.
           `locked` is false because the id was minted a moment ago and nobody
           else can be holding a claim on it yet (G-3). -->
      <IonModal
        :is-open="membershipItemId !== null"
        data-testid="m4-membership-modal"
        @did-dismiss="membershipItemId = null"
      >
        <IonContent>
          <div class="membership-wrap">
            <MembershipSheet
              v-if="membershipItemId"
              :trip-id="tripId"
              :item-id="membershipItemId"
              :locked="false"
              :participants="participants"
              :start-per-person="true"
              @close="membershipItemId = null"
            />
          </div>
        </IonContent>
      </IonModal>

      <!-- M5 (UI-Spec M5 + G-9): a sheet on a phone, a side panel on a
           desktop — one content component either way. -->
      <IonModal
        v-if="!isDesktop"
        :is-open="openItemId !== null"
        class="item-modal"
        data-testid="m5-modal"
        @did-dismiss="closeItem"
      >
        <IonContent class="item-sheet-content">
          <ItemDetailSheet
            v-if="openItemId"
            :trip-id="tripId"
            :item-id="openItemId"
            :participants="participants"
            :current-user-id="myUserId"
            @close="closeItem"
          />
        </IonContent>
      </IonModal>
      <aside v-else-if="openItemId" class="item-panel" data-testid="m5-panel">
        <ItemDetailSheet
          :trip-id="tripId"
          :item-id="openItemId"
          :participants="participants"
          :current-user-id="myUserId"
          @close="closeItem"
        />
      </aside>

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
/* M5 as a sheet (phone) or a panel (desktop, G-9). The panel is fixed to
   the right edge rather than squeezing the list: the list keeps its
   measurements, so opening a detail never re-flows the rows underneath
   the finger that opened it. */
.item-modal {
  --height: 88%;
  --border-radius: var(--jp-r-lg) var(--jp-r-lg) 0 0;
  --background: var(--ct-mantle);
  --box-shadow: var(--jp-shadow-sheet);
  --backdrop-opacity: 0.62;
  align-items: flex-end;
}

.item-sheet-content {
  --background: var(--ct-mantle);
}

.item-panel {
  position: fixed;
  top: 56px;
  right: 0;
  bottom: 0;
  width: 400px;
  overflow-y: auto;
  background: var(--ct-mantle);
  border-left: 1px solid var(--ct-surface1);
  box-shadow: var(--jp-shadow-panel);
  z-index: 20;
}

/* The header line collapses by giving up its own 84 px of the scrolled
   content, and the browser answers that with a scroll-anchoring adjustment
   of the same size. Read back through @ion-scroll it is an upward scroll,
   which re-opens the line, which grows the content again — the line then
   flips open and shut for as long as anyone watches. Anchoring is off here
   because this list has one thing above the rows and it is the element that
   moves. */
ion-content.pack-content::part(scroll) {
  overflow-anchor: none;
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
  flex-direction: column;
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
  /* Two rows since the trip name moved down here: the name with the trip's
     other views, then the figures with the facepile. */
  max-height: 84px;
  /* Clipped, never faded: a half-transparent sticky line reads as two
     lines printed on top of each other while the list slides past it. */
  transition:
    max-height 0.18s ease,
    padding 0.18s ease;
}

/* Scrolling down still takes the whole line, name included (owner call,
   2026-08-19): you know which packing list you are on, and the rows are
   what the screen is for. Any upward scroll brings it back. */
.trip-line.collapsed {
  max-height: 0;
  padding-block: 0;
  border-bottom-color: transparent;
}

.trip-id,
.trip-stats {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* With the name gone to the app bar there is one row's worth of content
   left, so the line goes back to being one row (G-9's breakpoint). */
@media (min-width: 900px) {
  .trip-line {
    flex-direction: row;
  }

  .trip-id {
    order: 2;
  }

  .trip-stats {
    flex: 1;
    min-width: 0;
  }
}

.trip-name {
  flex: 1;
  min-width: 0;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress {
  flex: 1;
  min-width: 0;
  font-size: var(--jp-text-md);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.muted {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.trip-nav {
  display: flex;
  align-items: center;
  flex: none;
}

.nav-count {
  position: absolute;
  top: 2px;
  right: 0;
  font-size: var(--jp-text-3xs);
  padding: 2px 4px;
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
  border: 1px solid var(--ct-blue);
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
  color: var(--ct-blue);
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
.cluster {
  border-inline-start: 2px solid var(--ct-surface1);
  margin-inline-start: 12px;
}

.child-row {
  --padding-start: 8px;
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
.reveal-bar {
  display: block;
  width: calc(100% - 24px);
  margin: 10px 12px;
  padding: 10px;
  border: 1px dashed var(--ct-surface2);
  border-radius: var(--jp-r-md);
  background: none;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.reveal-bar.on {
  border-style: solid;
  color: var(--ct-text);
}

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
  color: var(--ct-yellow);
  font-size: var(--jp-text-base);
  cursor: pointer;
}

.prep-item {
  padding: 8px 14px 2px;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}

/* FR-25.8's membership editor, given the same room M5 gives it. */
.membership-wrap {
  padding: 16px;
  overflow-y: auto;
}
</style>
