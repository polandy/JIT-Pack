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
  toastController,
} from '@ionic/vue'
import {
  addOutline,
  albumsOutline,
  archiveOutline,
  bagHandleOutline,
  contrastOutline,
  closeCircleOutline,
  flagOutline,
  refreshOutline,
  personOutline,
  pricetagOutline,
  buildOutline,
  cartOutline,
  chevronDownOutline,
  contractOutline,
  createOutline,
  expandOutline,
  funnelOutline,
  briefcaseOutline,
  lockClosedOutline,
  lockOpenOutline,
  locationOutline,
  playOutline,
  sparklesOutline,
  statsChartOutline,
  timeOutline,
} from 'ionicons/icons'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import FilterSheet, {
  type FilterFacet,
  type FilterOption,
} from '@/components/global/FilterSheet.vue'
import ItemDetailSheet from '@/components/trips/ItemDetailSheet.vue'
import PresenceFacepile from '@/components/global/PresenceFacepile.vue'
import SearchRow from '@/components/global/SearchRow.vue'
import QuantityStepper from '@/components/global/QuantityStepper.vue'
import QuickAddItem from '@/components/global/QuickAddItem.vue'
import { groupAdditionMessage } from '@/lib/groupAdditionMessage'
import { presentToast } from '@/lib/toast'
import { peekScroll, rememberScroll, takeScroll } from '@/lib/scrollMemory'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { useContextSearch } from '@/composables/useContextSearch'
import { useLongPress } from '@/composables/useLongPress'
import { usePackingFilter } from '@/composables/usePackingFilter'
import { useRowUndo, type RowUndoRecord } from '@/composables/useRowUndo'
import { skippedVia } from '@/domain/dependencies'
import {
  buildPackingView,
  FACET_KEYS,
  NO_VALUE,
  type PackingCluster,
  type PackingRow,
} from '@/domain/packingView'
import { relativeStamp } from '@/domain/stamp'
import { formatWeight } from '@/lib/format'
import { currentLocale, t } from '@/i18n'
import { useMasterStore } from '@/stores/masterStore'
import ItemMark from '@/components/items/ItemMark.vue'
import { useTripStore } from '@/stores/tripStore'
import GroupChangesProposal from '@/components/trips/GroupChangesProposal.vue'
import type {
  FacetKey,
  GroupBy,
  ItemTodo,
  MasterItem,
  TripItem,
  TripParticipant,
} from '@/types/domain'

const props = defineProps<{ tripId: string; itemId?: string }>()

const store = useTripStore()
const masterStore = useMasterStore()
const router = useRouter()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

// --- Identity, for FR-25.19/25.20 ---------------------------------------
// Both come from the server and both are simply absent in Local Mode, which
// is the correct answer there: nothing is assignable, so nothing is hidden
// and no row can name a packer.
const myUserId = ref<string | null>(null)
const directory = ref<{ user_id: string; display_name: string }[]>([])

onMounted(async () => {
  orchestrator.subscribeTrip(props.tripId)
  await orchestrator.drainTrip(props.tripId)
  // FR-27.4: opening the trip is the moment it works out what the groups it
  // follows would change. After the drain, not before — the diff must see the
  // rows the pull just brought, or it would offer what another device already
  // applied.
  orchestrator.proposeTripRefresh(props.tripId)
  const [users, me] = await Promise.all([orchestrator.fetchUsers(), orchestrator.fetchMe()])
  directory.value = users
  myUserId.value = me?.user_id ?? null
  // After the drain, not before: restoring onto a list whose rows have not
  // arrived yet would clamp the offset to a shorter page.
  await restoreScroll()
})

/**
 * Everyone a row could name. Deliberately the directory *and* the member
 * rows rather than membership alone: Single-User Mode bypasses membership
 * entirely, so a trip there has no member rows at all and every packing
 * record would otherwise render as a raw user id.
 */
const participants = computed<TripParticipant[]>(() => {
  const members = new Map(store.getMembers(props.tripId).map((m) => [m.user_id, m.role]))
  const known = new Map<string, TripParticipant>()
  for (const user of directory.value) {
    known.set(user.user_id, {
      user_id: user.user_id,
      display_name: user.display_name,
      avatar_url: null,
      role: members.get(user.user_id) ?? 'editor',
    })
  }
  for (const [user_id, role] of members) {
    // A member the directory does not carry (removed account, offline
    // first paint): countable, nameable only by id.
    if (!known.has(user_id)) {
      known.set(user_id, { user_id, display_name: user_id, avatar_url: null, role })
    }
  }
  return [...known.values()]
})

/** `null` where nobody is named — the stamp then states the act without a who. */
function nameOf(userId: string | null): string | null {
  if (!userId) return null
  return participants.value.find((p) => p.user_id === userId)?.display_name ?? null
}

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
  await presentToast({ message, duration: 3000, positionAnchor: 'm4-fab-anchor' })
}

const trip = computed(() => store.getTrip(props.tripId))
const kpis = computed(() => store.kpis(props.tripId))
const isActive = computed(() => trip.value?.status === 'active')
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

const view = computed(() =>
  buildPackingView({
    items: allItems.value,
    travelers: store.getTravelers(props.tripId),
    containers: store.getContainers(props.tripId),
    participants: participants.value,
    groupBy: groupBy.value,
    showDone: showDone.value,
    facets: facets.value,
    search: search.value,
    currentUserId: myUserId.value,
    showOthers: showOthers.value,
    collapsedGroups: collapsedGroups.value,
    itemsWithOpenPrep: openPrepItems.value.map((entry) => entry.item.id),
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
  rememberScroll(props.tripId, { top: currentScrollTop, headerCollapsed: headCollapsed.value })
  restorePending = true
  router.replace(`/trips/${props.tripId}/items/${itemId}`)
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
 * Row taps are ignored while the menu lives — same reasoning as M7's: the
 * release of a hold usually lands on the overlay rather than the row, so a
 * "swallow the next click" flag would go stale and eat a later tap.
 */
let rowMenuActive = false

async function openRowMenu(item: TripItem) {
  hold.cancel()
  // A locked row is somebody else's (G-3); its menu would offer actions
  // that the row itself already refuses.
  if (locked(item)) return
  rowMenuActive = true
  try {
    const skipped = item.state === 'skipped'
    // A row I am holding offers the way out of that and nothing else:
    // packing it is already the checkbox's job, and skipping something you
    // are in the middle of packing is not a thing anyone means.
    const mine = orchestrator.holdsClaim(props.tripId, item)
    const sheet = await actionSheetController.create({
      header: item.name,
      buttons: [
        ...(mine
          ? [
              {
                text: t('packing.releaseAction'),
                icon: lockOpenOutline,
                handler: () => onReleaseClaim(item),
              },
            ]
          : skipped
            ? [
                {
                  text: t('packing.unskipAction'),
                  icon: refreshOutline,
                  handler: () => onUnskipItem(item),
                },
              ]
            : [
                {
                  text: t('mode.pack'),
                  icon: contrastOutline,
                  handler: () => onPackingNow(item),
                },
                {
                  text: t('packing.skipAction'),
                  icon: closeCircleOutline,
                  handler: () => onSkipItem(item),
                },
              ]),
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
  router.replace(`/trips/${props.tripId}`)
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
  // FR-2.7: the trip's own properties. Before the lifecycle steps, because
  // it is the one action here that changes the trip rather than advancing it.
  items.push({
    id: 'm4-edit',
    icon: createOutline,
    label: t('tripEdit.title'),
    onClick: () => router.push(`/trips/${props.tripId}/edit`),
  })
  // The two lifecycle steps, each offered only where it is the next one.
  // Without the first, *active* was unreachable in the whole app — and with
  // it the archive action below, FR-9.1's Missing flagging and everything
  // downstream of an archived trip (M14, M21).
  if (trip.value?.status === 'planning') {
    items.push({
      id: 'm4-start',
      icon: playOutline,
      label: t('packing.start'),
      onClick: onStart,
    })
  }
  if (isActive.value) {
    items.push({
      id: 'm4-archive',
      icon: archiveOutline,
      label: t('packing.archive'),
      onClick: onArchive,
    })
  }
  return items
})

// --- Rows ---------------------------------------------------------------

/** 🛒 / 📍 only: 🧳 is the dominant case and stays silent (FR-25.4a). */
function modeIcon(mode: TripItem['mode']): string | null {
  if (mode === 'buy_before') return cartOutline
  if (mode === 'buy_local') return locationOutline
  return null
}

function modeLabel(mode: TripItem['mode']): string {
  return mode === 'buy_before' ? t('mode.buyBefore') : t('mode.buyLocal')
}

function openTodoCount(itemId: string): number {
  return store.getItemTodos(props.tripId, itemId).filter((todo) => todo.task_state === 'open')
    .length
}

function locked(item: TripItem): boolean {
  return orchestrator.isLockedByOther(props.tripId, item)
}

/**
 * G-3 asks the row to name the locker, not only to wear a padlock — "in
 * progress by Andy". A padlock alone says a row is unavailable without
 * saying who to ask, which is the one question it raises.
 */
function lockNote(item: TripItem): string | null {
  const holder = orchestrator.lockHolder(props.tripId, item)
  if (holder === null) return null
  const who = nameOf(holder)
  return who ? t('packing.lockedBy', { who }) : t('packing.lockedByUnknown')
}

/**
 * The row I claimed says so to *me*: nothing is locked for my own device,
 * so without a word here I cannot tell that I am holding the row against
 * everyone else.
 */
function ownClaimNote(item: TripItem): string | null {
  return orchestrator.holdsClaim(props.tripId, item) ? t('packing.claimedByMe') : null
}


/**
 * The one avatar at the right edge (FR-25.19): who packed it once it is
 * packed, who is responsible for it while it is open. Never both — the
 * revealed row's stamp below names them both where they differ, which is
 * where there is room for it.
 */
function edgeAvatar(item: TripItem): { variant: 'assignee' | 'packer'; id: string } | null {
  if (item.packed_by_user_id) return { variant: 'packer', id: item.packed_by_user_id }
  if (item.packer_user_id) return { variant: 'assignee', id: item.packer_user_id }
  return null
}

/** FR-25.17: "gepackt von Andy · heute 14:32", on revealed rows only. */
function packedStamp(item: TripItem): string | null {
  if (!item.packed_at && !item.packed_by_user_id) return null
  const stamp = item.packed_at ? relativeStamp(item.packed_at, new Date(), currentLocale()) : null
  const when = stamp
    ? `${stamp.dayKey ? t(stamp.dayKey === 'today' ? 'stamp.today' : 'stamp.yesterday') : stamp.date} ${stamp.time}`
    : ''
  const who = nameOf(item.packed_by_user_id)
  if (!who) return when ? t('packing.packedByUnknown', { when }) : null
  return t('packing.packedBy', { who, when })
}

/**
 * What a revealed *skipped* row says of itself (FR-5.5) — and, where the
 * FR-20.2 cascade put it there, which decision took it along.
 *
 * A row that is done because it was left behind used to be revealed with
 * nothing at all where a packed row carries its FR-25.17 stamp, which is
 * exactly the "forgot it" / "decided against it" confusion FR-5.5 exists
 * to remove.
 */
function skippedNote(item: TripItem): string | null {
  if (item.state !== 'skipped') return null
  const via = skippedVia(item, allItems.value, masterStore.dependencyList)
  return via ? t('packing.skippedVia', { name: via.name }) : t('packing.skipped')
}

/** Named only where it differs from the packer — otherwise it is noise. */
function responsibleNote(item: TripItem): string | null {
  if (!item.packer_user_id || item.packer_user_id === item.packed_by_user_id) return null
  const who = nameOf(item.packer_user_id)
  return who ? t('packing.responsibleWas', { who }) : null
}

// --- Empty states (FR-25.11e) ------------------------------------------

const visibleOpenRows = computed(
  () =>
    view.value.groups
      .flatMap((group) => group.entries)
      .flatMap((entry) => (entry.kind === 'item' ? [entry] : entry.children))
      .filter((row: PackingRow) => !row.done).length,
)

const openTotal = computed(() => Math.max(kpis.value.totalItems - kpis.value.packedItems, 0))
const hiddenOpenCount = computed(() => Math.max(openTotal.value - visibleOpenRows.value, 0))

const emptyReason = computed(() => {
  const term = search.value.trim()
  if (term && view.value.activeFacetCount > 0) return t('packing.noMatchesBoth', { term })
  if (term) return t('packing.noMatchesSearch', { term })
  return t('packing.noMatchesFilter', { n: hiddenOpenCount.value })
})

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

const FACET_LABELS: Record<FacetKey, string> = {
  person: 'facet.person',
  category: 'facet.category',
  mode: 'facet.mode',
  container: 'facet.container',
  flag: 'facet.flag',
}

/** One glyph per axis, so the panel is scannable before it is read. */
const FACET_ICONS: Record<FacetKey, string> = {
  person: personOutline,
  category: pricetagOutline,
  mode: cartOutline,
  container: briefcaseOutline,
  flag: flagOutline,
}

const GROUP_ICONS: Record<GroupBy, string> = {
  category: pricetagOutline,
  person: personOutline,
  container: briefcaseOutline,
  status: contrastOutline,
}

const MODE_LABELS: Record<string, string> = {
  pack: 'mode.pack',
  buy_before: 'mode.buyBefore',
  buy_local: 'mode.buyLocal',
}

const FLAG_LABELS: Record<string, string> = {
  late: 'facet.flagLate',
  missing: 'facet.flagMissing',
  prep: 'facet.flagPrep',
}

/**
 * The view model labels what is data (a person's name, a category) and
 * leaves everything that is UI copy to be worded here — the absence
 * buckets above all. "Gemeinsam" rather than "Alle": an option labelled
 * *all* reads as *select everything* rather than *the shared items*.
 */
function optionLabel(key: FacetKey, value: string, label: string | null): string {
  if (label !== null) return label
  if (value === NO_VALUE) {
    if (key === 'person') return t('facet.shared')
    if (key === 'container') return t('facet.noLuggage')
    return t('facet.noCategory')
  }
  if (key === 'mode') return t(MODE_LABELS[value] as Parameters<typeof t>[0])
  if (key === 'flag') return t(FLAG_LABELS[value] as Parameters<typeof t>[0])
  return value
}

const filterFacets = computed<FilterFacet[]>(() =>
  FACET_KEYS.map((key) => ({
    key,
    label: t(FACET_LABELS[key] as Parameters<typeof t>[0]),
    icon: FACET_ICONS[key],
    options: view.value.facetValues[key].map<FilterOption>((value) => ({
      value: value.value,
      label: optionLabel(key, value.value, value.label),
      count: value.count,
      selected: value.selected,
    })),
  })).filter((facet) => facet.options.length > 0),
)

const GROUPINGS: GroupBy[] = ['category', 'person', 'container', 'status']

const grouping = computed(() => ({
  value: groupBy.value,
  options: GROUPINGS.map((value) => ({
    value,
    label: t(`group.${value}` as const),
    icon: GROUP_ICONS[value],
  })),
}))

/** Both switches hide a class of rows, so they render from one shape. */
const filterSwitches = computed(() => [
  {
    key: 'done',
    label: t('filter.doneLabel'),
    hint: t('filter.doneHint'),
    on: showDone.value,
    count: kpis.value.packedItems,
  },
  {
    key: 'others',
    label: t('filter.othersLabel'),
    hint: t('filter.othersHint'),
    on: showOthers.value,
    count: view.value.hiddenOtherCount,
  },
])

function onToggleSwitch(key: string) {
  if (key === 'done') showDone.value = !showDone.value
  else showOthers.value = !showOthers.value
}

/** The chip row (FR-25.11a): an active filter must never be invisible. */
const activeChips = computed(() =>
  FACET_KEYS.flatMap((key) =>
    facets.value[key].map((value) => ({
      key,
      value,
      facetLabel: t(FACET_LABELS[key] as Parameters<typeof t>[0]),
      label: optionLabel(
        key,
        value,
        view.value.facetValues[key].find((option) => option.value === value)?.label ?? null,
      ),
    })),
  ),
)

// --- Actions ------------------------------------------------------------

function onPackingNow(item: TripItem) {
  orchestrator.packingNow(props.tripId, item)
}

/** Give the row back without packing it (G-3). */
function onReleaseClaim(item: TripItem) {
  orchestrator.releaseClaim(props.tripId, item)
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

const rowUndo = useRowUndo()

/** Put back what a pack changed, and only that (FR-25.2). */
function restorePacked(records: RowUndoRecord[]) {
  for (const record of records) {
    orchestrator.restorePack(props.tripId, record.itemId, record.packedCount, record.state)
  }
}

/** The snackbar currently on screen, so a second action replaces it. */
let packToast: HTMLIonToastElement | null = null

/**
 * How many packs have been announced on this screen. Rendered onto the
 * content element as `data-pack-announcements`.
 *
 * It exists because one of FR-25.2's rules is an *absence*: un-packing a
 * revealed row must not announce anything. Checking for "no toast" straight
 * after the tap proves nothing — the toast is created asynchronously, so the
 * assertion simply arrives first and passes on a page that was about to show
 * one. It did exactly that, on the build with the guard removed.
 *
 * A counter that only ever goes up turns the absence into a comparison
 * against a number, which is the same reasoning that gave the G-2 indicator
 * its in-flight signal.
 */
const packAnnouncements = ref(0)

/**
 * False once the screen is gone. `toastController.create` is awaited, and
 * tapping back inside that window would otherwise present the snackbar over
 * whatever screen came next — with an undo for a trip the user has left.
 *
 * Guarded rather than covered by a case: the window is a single await, and
 * widening it enough to hit reliably would mean putting a delay into
 * production code to make a test possible, which is the wrong way round.
 */
let live = true

async function announcePacked(name: string) {
  await announce(t('packing.packedToast', { name }))
}

/**
 * FR-5.5 with FR-20.2: the companions that went along are named, because a
 * list that shortened itself by three rows on one tap owes an explanation.
 */
async function announceSkipped(name: string, companions: string[]) {
  await announce(
    companions.length > 0
      ? t('packing.skippedToastWith', { name, companions: companions.join(', ') })
      : t('packing.skippedToast', { name }),
  )
}

async function announce(message: string) {
  // Cleared *before* dismissing, not after. The dismiss handler below
  // disarms the undo, and an outgoing toast resolves its dismissal after
  // the incoming one has already armed a new record — so with the order
  // reversed, packing two rows in a row left the second with no undo at
  // all. Nulling first makes the outgoing handler's identity check fail,
  // which is exactly what it is for.
  const outgoing = packToast
  packToast = null
  void outgoing?.dismiss()

  // The one place that does not go through `presentToast`: the order below is
  // load-bearing — created, checked against `live`, armed with its dismiss
  // handler, and only then presented. A helper that presents on creation would
  // put the snackbar on screen before the check that decides it must not be.
  const toast = await toastController.create({
    message,
    duration: 3000,
    position: 'bottom',
    // Above the FAB rather than behind it — see the anchor's own note.
    positionAnchor: 'm4-fab-anchor',
    cssClass: 'pack-toast',
    buttons: [{ text: t('packing.undo'), handler: () => rowUndo.undo() }],
  })
  if (!live) {
    void toast.dismiss()
    return
  }
  packToast = toast
  packAnnouncements.value += 1
  // The undo outlives the snackbar only by its dismiss animation; disarming
  // on dismiss is what keeps a stale record from being applied later.
  void toast.onDidDismiss().then(() => {
    if (packToast === toast) {
      packToast = null
      rowUndo.clear()
    }
  })
  await toast.present()
}

onUnmounted(() => {
  live = false
  rowUndo.clear()
  void packToast?.dismiss()
})

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

function onQuickAdd(item: {
  name: string
  sourceItemId: string | null
  weightGrams: number | null
  valueCents: number | null
  categoryName: string | null
}) {
  orchestrator.quickAddItem(
    props.tripId,
    item.name,
    {
      sourceItemId: item.sourceItemId,
      weightGrams: item.weightGrams,
      valueCents: item.valueCents,
      categoryName: item.categoryName,
    },
    isActive.value,
  )
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
  await presentToast({ message: t('packing.startedToast'), duration: 3000 })
}

/**
 * Archiving completes the trip and opens the M14 review (FR-9.2).
 * With no FR-9.1 flags there is nothing to judge, so the assistant is
 * skipped with a toast instead of an empty screen (UI-Spec M14 states);
 * the archived M4 leads with the closing card either way.
 */
async function onArchive() {
  orchestrator.archiveTrip(props.tripId)
  const flagged = store.getItems(props.tripId).some((item) => item.flag_unused || item.flag_missing)
  if (!flagged) {
    await presentToast({ message: t('review.nothingToast'), duration: 3000 })
    return
  }
  router.push(`/trips/${props.tripId}/review`)
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
              :router-link="`/trips/${tripId}/shopping`"
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
              :router-link="`/trips/${tripId}/containers`"
              data-testid="m4-nav-luggage"
              :aria-label="t('packing.luggage')"
              :title="t('packing.luggage')"
            >
              <IonIcon slot="icon-only" :icon="briefcaseOutline" />
            </IonButton>
            <IonButton
              fill="clear"
              size="small"
              :router-link="`/trips/${tripId}/analytics`"
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
          <PresenceFacepile v-if="presenceUsers.length > 1" :users="presenceUsers" />
        </div>
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

      <!-- The one real remnant of the dropped "Danach" phase: an archived
           trip leads with what to do next with it. -->
      <div v-if="trip?.status === 'archived'" class="closing-card">
        <!-- No pictorial mark. The puzzle emoji came from the prototype,
             where §3.27 was about composition; it said nothing about a
             finished trip. Nothing replaced it: every other heading in the
             app is plain text, the card already carries two button icons,
             and a third glyph decorated rather than told. -->
        <h2>{{ t('packing.tripFinished') }}</h2>
        <p class="closing-hint">{{ t('packing.tripFinishedHint') }}</p>
        <div class="closing-actions">
          <IonButton
            size="small"
            data-testid="m4-template-from-trip"
            :router-link="`/trips/${tripId}/template`"
          >
            <IonIcon slot="start" :icon="albumsOutline" />
            {{ t('packing.templateFromTrip') }}
          </IonButton>
          <IonButton size="small" fill="outline" :router-link="`/trips/${tripId}/review`">
            <IonIcon slot="start" :icon="sparklesOutline" />
            {{ t('packing.reviewSuggestions') }}
          </IonButton>
        </div>
      </div>

      <QuickAddItem
        ref="quickAdd"
        :is-active="isActive"
        :offer-groups="true"
        :exclude-item-ids="quickAddExcludeIds"
        @add="onQuickAdd"
        @add-group="onQuickAddGroup"
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
                <div class="cluster-head" :data-testid="`m4-cluster-${entry.name}`">
                  <!-- FR-28.4/25.1: a per-person item is named once, here —
                       so this is its row, and this is where its mark goes.
                       The children name travelers, not things, and carry
                       none: one tent, not three. -->
                  <ItemMark
                    :mark="clusterMaster(entry)?.icon ?? null"
                    surface="packing"
                    :photo-item="clusterMaster(entry)"
                    :size="22"
                    class="row-mark"
                  />
                  <span class="cluster-name">{{ entry.name }}</span>
                  <IonIcon
                    v-if="modeIcon(entry.mode)"
                    :icon="modeIcon(entry.mode)!"
                    class="mode-icon"
                    :title="modeLabel(entry.mode)"
                  />
                  <IonIcon
                    v-if="entry.latePacker"
                    :icon="timeOutline"
                    class="late-icon"
                    :title="t('mode.latePacker')"
                  />
                  <span class="cluster-count">{{ entry.doneCount }}/{{ entry.totalCount }}</span>
                </div>

                <IonItem
                  v-for="child in entry.children"
                  :key="child.item.id"
                  button
                  class="child-row"
                  :data-testid="`m4-child-${entry.name}-${child.traveler?.name ?? ''}`"
                  :class="{ done: child.done, locked: locked(child.item) }"
                  @click="openItem(child.item.id)"
                  @contextmenu.prevent="openRowMenu(child.item)"
                  @pointerdown="(e: PointerEvent) => hold.down(child.item, e.clientX, e.clientY)"
                  @pointermove="(e: PointerEvent) => hold.move(e.clientX, e.clientY)"
                  @pointerup="hold.cancel()"
                  @pointercancel="hold.cancel()"
                >
                  <!-- `.prevent` as well as `.stop`: Ionic wraps a router-link item in
                         an anchor, and an anchor's jump is a *default action* — stopping
                         propagation never cancelled it, so every tap on the stepper opened
                         the sheet instead of counting. -->
                  <div slot="start" class="row-start" @click.stop.prevent>
                    <IonIcon v-if="locked(child.item)" :icon="lockClosedOutline" class="lock" />
                    <QuantityStepper
                      v-else
                      :quantity="child.item.quantity"
                      :packed="child.item.packed_count"
                      @increment="onIncrement(child.item)"
                      @decrement="onDecrement(child.item)"
                      @complete="onComplete(child.item)"
                      @zero="onZero(child.item)"
                      @toggle="onToggle(child.item)"
                    />
                    <UserAvatar :name="child.traveler?.name" :seed="child.traveler?.id" />
                  </div>
                  <IonLabel>
                    <h3>{{ child.traveler?.name ?? child.label }}</h3>
                    <p v-if="lockNote(child.item)" class="stamp" data-testid="m4-lock-note">
                      {{ lockNote(child.item) }}
                    </p>
                    <p
                      v-else-if="ownClaimNote(child.item)"
                      class="stamp"
                      data-testid="m4-own-claim"
                    >
                      {{ ownClaimNote(child.item) }}
                    </p>
                    <p v-else-if="skippedNote(child.item)" class="stamp">
                      {{ skippedNote(child.item) }}
                    </p>
                    <p v-else-if="child.done && packedStamp(child.item)" class="stamp">
                      {{ packedStamp(child.item) }}
                      <span v-if="responsibleNote(child.item)" class="muted">
                        · {{ responsibleNote(child.item) }}
                      </span>
                    </p>
                  </IonLabel>
                  <UserAvatar
                    v-if="edgeAvatar(child.item)"
                    slot="end"
                    :variant="edgeAvatar(child.item)!.variant"
                    :name="nameOf(edgeAvatar(child.item)!.id)"
                    :seed="edgeAvatar(child.item)!.id"
                  />
                </IonItem>
              </div>

              <IonItem
                v-else
                button
                :class="{ done: entry.done, locked: locked(entry.item) }"
                :data-testid="`m4-row-${entry.item.name}`"
                @click="openItem(entry.item.id)"
                @contextmenu.prevent="openRowMenu(entry.item)"
                @pointerdown="(e: PointerEvent) => hold.down(entry.item, e.clientX, e.clientY)"
                @pointermove="(e: PointerEvent) => hold.move(e.clientX, e.clientY)"
                @pointerup="hold.cancel()"
                @pointercancel="hold.cancel()"
              >
                <!-- `.prevent` as well as `.stop`: Ionic wraps a router-link item in
                         an anchor, and an anchor's jump is a *default action* — stopping
                         propagation never cancelled it, so every tap on the stepper opened
                         the sheet instead of counting. -->
                <div slot="start" class="row-start" @click.stop.prevent>
                  <IonIcon v-if="locked(entry.item)" :icon="lockClosedOutline" class="lock" />
                  <QuantityStepper
                    v-else
                    :quantity="entry.item.quantity"
                    :packed="entry.item.packed_count"
                    @increment="onIncrement(entry.item)"
                    @decrement="onDecrement(entry.item)"
                    @complete="onComplete(entry.item)"
                    @zero="onZero(entry.item)"
                    @toggle="onToggle(entry.item)"
                  />
                  <UserAvatar
                    v-if="entry.traveler"
                    :name="entry.traveler.name"
                    :seed="entry.traveler.id"
                  />
                </div>
                <ItemMark
                  :mark="masterOf(entry.item)?.icon ?? null"
                  surface="packing"
                  :photo-item="masterOf(entry.item)"
                  :size="22"
                  class="row-mark"
                />
                <IonLabel>
                  <h3>
                    {{ entry.label }}
                    <IonBadge v-if="openTodoCount(entry.item.id) > 0" color="brand" class="prep">
                      <IonIcon :icon="buildOutline" /> {{ openTodoCount(entry.item.id) }}
                    </IonBadge>
                  </h3>
                  <p v-if="lockNote(entry.item)" class="stamp" data-testid="m4-lock-note">
                    {{ lockNote(entry.item) }}
                  </p>
                  <p v-else-if="ownClaimNote(entry.item)" class="stamp" data-testid="m4-own-claim">
                    {{ ownClaimNote(entry.item) }}
                  </p>
                  <p v-else-if="skippedNote(entry.item)" class="stamp">
                    {{ skippedNote(entry.item) }}
                  </p>
                  <p v-else-if="entry.done && packedStamp(entry.item)" class="stamp">
                    {{ packedStamp(entry.item) }}
                    <span v-if="responsibleNote(entry.item)" class="muted">
                      · {{ responsibleNote(entry.item) }}
                    </span>
                  </p>
                </IonLabel>
                <div slot="end" class="row-end">
                  <IonIcon
                    v-if="modeIcon(entry.item.mode)"
                    :icon="modeIcon(entry.item.mode)!"
                    class="mode-icon"
                    :title="modeLabel(entry.item.mode)"
                  />
                  <IonIcon
                    v-if="entry.item.late_packer"
                    :icon="timeOutline"
                    class="late-icon"
                    :title="t('mode.latePacker')"
                  />
                  <UserAvatar
                    v-if="edgeAvatar(entry.item)"
                    :variant="edgeAvatar(entry.item)!.variant"
                    :name="nameOf(edgeAvatar(entry.item)!.id)"
                    :seed="edgeAvatar(entry.item)!.id"
                  />
                </div>
              </IonItem>
            </template>
          </TransitionGroup>
        </template>
      </IonList>

      <!-- An empty list means one of two things, and conflating them is how
           a packing app tells someone they are finished when they are not. -->
      <div v-else class="empty" data-testid="packing-empty">
        <template v-if="view.narrowed">
          <strong>{{ t('packing.noMatches') }}</strong>
          <p>{{ emptyReason }}</p>
          <IonButton size="small" fill="outline" data-testid="m4-reset" @click="resetNarrowing">
            {{
              search.trim() && view.activeFacetCount === 0
                ? t('packing.resetSearch')
                : t('packing.resetAll')
            }}
          </IonButton>
        </template>
        <template v-else-if="allItems.length === 0">
          <IonIcon :icon="bagHandleOutline" class="empty-icon" />
          <strong>{{ t('packing.empty') }}</strong>
          <p>{{ t('packing.emptyHint') }}</p>
        </template>
        <template v-else>
          <strong>{{ t('packing.allDone') }}</strong>
          <p>{{ t('packing.allDoneHint') }}</p>
        </template>
      </div>

      <!-- FR-25.2 / FR-25.20: two classes of hidden rows, one affordance —
           state the count, name the people, one tap to reveal. -->
      <button
        v-if="view.doneCount > 0"
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
      <IonFab id="m4-fab-anchor" slot="fixed" vertical="bottom" horizontal="end">
        <IonFabButton
          v-if="!quickAddExpanded"
          data-testid="m4-fab"
          :aria-label="t('common.add')"
          @click="openQuickAdd"
        >
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>

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
            @close="closeItem"
          />
        </IonContent>
      </IonModal>
      <aside v-else-if="openItemId" class="item-panel" data-testid="m5-panel">
        <ItemDetailSheet
          :trip-id="tripId"
          :item-id="openItemId"
          :participants="participants"
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

.prep {
  color: var(--ct-yellow);
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

.row-start {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-end {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode-icon {
  color: var(--ct-peach);
  font-size: var(--jp-icon-sm);
}

.late-icon {
  color: var(--ct-yellow);
  font-size: var(--jp-icon-sm);
}

.lock {
  font-size: var(--jp-icon-md);
  color: var(--ct-blue);
  padding: 8px;
}

.done {
  opacity: 0.55;
}

.locked {
  opacity: 0.65;
}

.stamp {
  font-size: var(--jp-text-xs);
}

.prep {
  font-size: var(--jp-text-3xs);
  vertical-align: middle;
  margin-left: 6px;
}

/* --- Per-person cluster ----------------------------------------------- */
.cluster {
  border-inline-start: 2px solid var(--ct-surface1);
  margin-inline-start: 12px;
}

.cluster-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 2px;
  /* Three levels, three weights: the category heads the block, the
     per-person item names itself once inside it, and the traveler rows
     under that are plain. Two of them at the same size read as two
     groups rather than as a group and its contents. */
  font-size: var(--jp-text-base);
  font-weight: var(--jp-weight-semibold);
  color: var(--ct-subtext1);
}

.cluster-name {
  flex: 1;
}

.cluster-count {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-medium);
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

.closing-card {
  margin: 12px;
  padding: 14px;
  border-radius: var(--jp-r);
  background: var(--ct-surface0);
}

.closing-card h2 {
  margin: 0 0 4px;
  font-size: var(--jp-text-lg);
}
.closing-hint {
  margin: 0 0 10px;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}
.closing-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 48px 24px;
  color: var(--ct-subtext0);
  text-align: center;
}

.empty p {
  margin: 0;
}

.empty-icon {
  font-size: var(--jp-icon-2xl);
  margin-bottom: 8px;
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

/* FR-28.4: the slot holds its width even when empty, so the names stay in
   one column on a list where most rows carry no mark. */
.row-mark {
  margin-inline-end: 10px;
}
</style>
