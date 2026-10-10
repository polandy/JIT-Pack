<script setup lang="ts">
/**
 * M4 — Packing list, and the trip screen itself: tapping a trip opens this,
 * with nothing in between.
 *
 * Built from the concept mock (UI-Spec M4, Addendum §3.25). What the
 * shape is answering, in one line each:
 *
 *  - **The header line** (trip line): the trip's name where the app bar has
 *    no room for it, its *other views* as labelled icons, then progress,
 *    weight, open prep and the presence facepile. It stays unfiltered
 *    whatever the list shows (G-12), so a short list is never mistaken for
 *    a finished trip. It hides on scroll-down and returns on any upward
 *    scroll, which is where the list height comes from — and the page head
 *    above it goes with it, deliberately.
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
 *
 * The page is the wiring. Its parts live beside it in `packing/`: the state
 * they share (`usePackingCore`), each concern's composable, and the header
 * line, the task window, the list body and the amount popover as components.
 */
import {
  IonPage,
  IonContent,
  IonIcon,
  IonButton,
  IonRefresher,
  IonRefresherContent,
  IonFab,
  IonFabButton,
  onIonViewDidEnter,
  onIonViewWillLeave,
} from '@ionic/vue'
import {
  addOutline,
  bagHandleOutline,
  checkmarkDoneOutline,
  contractOutline,
  expandOutline,
  funnelOutline,
  textOutline,
  timeOutline,
} from 'ionicons/icons'

import { progressByTraveler, showsTravelerProgress } from '@/domain/travelerProgress'
import { PANEL_HOST_SELECTOR } from '@/lib/frameSlots'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EmptyState from '@/components/global/EmptyState.vue'
import RevealBar from '@/components/global/RevealBar.vue'
import FilterSheet from '@/components/global/FilterSheet.vue'
import ArchivedTripCard from '@/components/trips/ArchivedTripCard.vue'
import ClosingPassBanner from '@/components/trips/ClosingPassBanner.vue'
import PackingClosedCard from '@/components/trips/PackingClosedCard.vue'
import ClosePackingSheet from '@/components/trips/ClosePackingSheet.vue'
import TripTaskSheet from '@/views/trips/tasks/TripTaskSheet.vue'
import TravelerProgressStrip from '@/components/trips/TravelerProgressStrip.vue'
import ItemDetailSheet from '@/components/trips/ItemDetailSheet.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import SearchRow from '@/components/global/SearchRow.vue'
import QuickAddItem from '@/components/global/QuickAddItem.vue'
import { SWITCH_KEYS, onlyOthersHidden as isOnlyOthersHidden } from '@/lib/packingFilterPanel'
import { readMode } from '@/mode'
import { presentToast } from '@/composables/shared/toast'
import { setHeaderActions, type HeaderAction } from '@/composables/shared/useHeaderActions'
import { setHeaderTitle } from '@/composables/shared/useHeaderTitle'
import { useContextSearch } from '@/composables/useContextSearch'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { useTripScreen } from '@/composables/shared/useTripScreen'
import { usePackingFilter } from '@/composables/usePackingFilter'
import { useDesktopLayout } from '@/composables/shared/useDesktopLayout'
import { buildPackingView } from '@/domain/packingView'
import { t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { useHeadScroll } from '@/composables/useHeadScroll'
import { buildReviewProposals } from '@/domain/review'
import GroupChangesProposal from '@/components/trips/GroupChangesProposal.vue'
import InventoryNamesSheet from '@/components/trips/InventoryNamesSheet.vue'
import type { InventoryRename } from '@/domain/inventoryNames'
import type { FacetKey, GroupBy } from '@/types/domain'
import { TRIP_STATUS_ARCHIVED } from '@/types/domain'
import { ITEM_QUERY_PARAM, tripItemPath, tripPath, tripSubPath } from '@/router/paths'

import PackingGroupList from './packing/PackingGroupList.vue'
import PackingHeadline from './packing/PackingHeadline.vue'
import RowQuantityPopover from './packing/RowQuantityPopover.vue'
import TripTasksSection from './packing/TripTasksSection.vue'
import { useBrowseAdd } from './packing/useBrowseAdd'
import { useForWhom } from './packing/useForWhom'
import { usePackingClose } from './packing/usePackingClose'
import { usePackingCore } from './packing/usePackingCore'
import { usePackingMenus } from './packing/usePackingMenus'
import { usePackingTasks } from './packing/usePackingTasks'
import { useRowActions } from './packing/useRowActions'
import { useRowFacts } from './packing/useRowFacts'
import { usePackingListShape } from './packing/usePackingListShape'
import { useRowQuantity } from './packing/useRowQuantity'

const props = defineProps<{ tripId: string; itemId?: string }>()

const router = useRouter()
const route = useRoute()

const core = usePackingCore(props.tripId, useTripScreen(props.tripId, useOrchestrator()))
const {
  tripStore,
  masterStore,
  orchestrator,
  trip,
  rowsLoaded,
  myUserId,
  participants,
  nameOf,
  closingPass,
  allItems,
  travelers,
  active,
  packingClosed,
  rowUndo,
  packAnnouncements,
  announceRenamed,
} = core

onMounted(async () => {
  // Joins the load `useTripScreen` started; it does not begin a second one.
  await core.ensureTripRows()
  // FR-27.4: opening the trip is the moment it works out what the groups it
  // follows would change. After the drain, not before — the diff must see the
  // rows the pull just brought, or it would offer what another device already
  // applied.
  orchestrator.groupRefresh.proposeTripRefresh(props.tripId)
  await core.loadIdentity()
})

// --- View state ---------------------------------------------------------
// The filter, the two reveal switches and the grouping live in their own
// composable because they outlive this component (FR-25.18): the filter
// for the session, the grouping durably. The search term deliberately
// does not — see there.
const filter = usePackingFilter(props.tripId)
const { facets, showDone, showOthers, showLate, groupBy, reset, toggleValue, clearFacet } = filter

const {
  term: search,
  isOpen: searchOpen,
  toggle: toggleSearch,
  action: searchAction,
} = useContextSearch('m4-search')

// The folds, the filter panel and the reset — the list's shape, which an
// excursion's list shares (`usePackingListShape`).
const {
  collapsedGroups,
  expandedClusters,
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
  reveals: [SWITCH_KEYS.done, SWITCH_KEYS.others, SWITCH_KEYS.late],
  menuActive: () => menus.menuActive(),
})
const filterOpen = ref(false)
const quickAdd = ref<InstanceType<typeof QuickAddItem> | null>(null)
/**
 * FR-7.4: the user's own fold of *Aufgaben für die Reise* this visit; null
 * while untouched, and then the tasks decide (`tripTasksUnfolded`).
 */
const tripTasksFold = ref<boolean | null>(null)
/** FR-7.4: the section itself, which the header figure scrolls to. */
const tasksSection = ref<InstanceType<typeof TripTasksSection> | null>(null)

/**
 * FR-7.4: the header figure leads to the tasks — unfolded, and in view,
 * because the header line stays while the section may be scrolled past.
 */
function revealTripTasks() {
  tripTasksFold.value = true
  tasksSection.value?.scrollIntoView()
}

/** Whether the composer is open — the ＋ has nothing to add while it is. */
const quickAddExpanded = computed(() => quickAdd.value?.expanded ?? false)

function openQuickAdd() {
  void quickAdd.value?.open()
}

const openPrepItems = computed(() => tripStore.itemsWithOpenPrep(props.tripId))

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

function closeItem() {
  router.replace(tripPath(props.tripId))
}

const forWhom = useForWhom(core, view)
const facts = useRowFacts(core)
const acts = useRowActions(core, facts, { openItemId, closeItem })
const quantity = useRowQuantity(core.port)
const menus = usePackingMenus(core, acts, quantity, forWhom)
const browse = useBrowseAdd(core, facts)
const tasks = usePackingTasks(core)
const closing = usePackingClose(core)

/**
 * Opening and closing the sheet **replaces** the route rather than
 * pushing: the sheet is a state of this screen, not a screen of its own,
 * and one screen keeps one history entry — the browser's back with the
 * sheet open is router/overlayBackGuard's to answer.
 */
function openItem(itemId: string) {
  if (menus.menuActive()) return
  // One posture, one meaning (FR-9.3): in the pass the tap is the mark,
  // and the detail sheet — which asks a dozen other questions — is not
  // what this screen is asking.
  if (closingPass.value) return
  router.replace(tripItemPath(props.tripId, itemId))
}

/** G-9: the detail as a bottom sheet, or as a side panel beside the list. */
const isDesktop = useDesktopLayout()

// --- Who is working here (FR-4.9) ---------------------------------------
// The roster on M1 lists people by the trip they have *open*, which is not the
// subscription — the dashboard follows every active trip and never lets go.
// Ionic keeps a page mounted under the one that replaced it, so leaving is a
// view event and unmounting only the fallback.
onIonViewDidEnter(() => orchestrator.presence.setViewing(props.tripId))
onIonViewWillLeave(() => orchestrator.presence.setViewing(null))
onUnmounted(() => orchestrator.presence.setViewing(null))

// --- Header line --------------------------------------------------------

const presenceUsers = computed(() => orchestrator.presence.getPresence(props.tripId))

const kpis = computed(() =>
  tripStore.kpis(props.tripId, new Set([...core.removingRows.value, ...core.removingOwn.value])),
)

/**
 * The header line *and the page head above it* yield to the list on the way
 * down and come back on an upward gesture (FR-21.17) — `useHeadScroll`.
 */
const packContent = ref<{ $el: HTMLIonContentElement } | null>(null)
const { collapsed: headCollapsed, onScroll, onScrollEnd } = useHeadScroll(packContent)

/** FR-25.29: every traveler's share of the whole trip — unfiltered, like the trip line. */
const travelerShares = computed(() => progressByTraveler(allItems.value, travelers.value))

/**
 * FR-25.29: a tap toggles that traveler in the person facet, so the rings are
 * quick filters — *mine and the shared ones* is two taps, OR'd like the
 * sheet's chips. Otherwise narrowing to one alone would cost a trip to the
 * sheet for exactly the combination a packer wants most.
 */
function selectTraveler(value: string) {
  toggleValue('person', value)
}

// --- Group proposals and inventory names (FR-27.4, FR-27.16) -------------

/**
 * FR-27.4: what the groups this trip follows would change. Derived on open
 * and after every master pull; nothing is written until one of the two
 * buttons is pressed.
 */
const groupProposal = computed(
  () => orchestrator.groupRefresh.refreshProposals.value[props.tripId] ?? null,
)

/**
 * FR-27.16: the names on this trip the inventory has moved on from. Derived,
 * like the proposal above, and never stored — the ⋮ entry and M5's line both
 * read it, and it empties itself once the names match.
 */
const inventoryRenames = computed(() =>
  orchestrator.inventoryNames.inventoryRenamesOf(props.tripId),
)
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
  const undo = orchestrator.inventoryNames.adoptInventoryNames(props.tripId, chosen)
  rowUndo.armUndo(
    undo.adoption.rows.map((r) => r.item),
    () => orchestrator.inventoryNames.restoreInventoryNames(props.tripId, undo),
  )
  void announceRenamed(chosen.length)
}

async function applyGroupChanges() {
  const applied = orchestrator.groupRefresh.acceptTripRefresh(props.tripId)
  await reportGroupAnswer(t('trips.proposedApplied', { n: applied?.log.length ?? 0 }))
}

async function declineGroupChanges() {
  orchestrator.groupRefresh.declineTripRefresh(props.tripId)
  await reportGroupAnswer(t('trips.proposedDeclined'))
}

/** A plain toast: both answers are final, and neither has an undo to offer. */
async function reportGroupAnswer(message: string) {
  await presentToast({ message, positionAnchor: FAB_ANCHOR.m4 })
}

/**
 * FR-9.4: the first proposals the review would offer, for the closing card.
 *
 * UI-Spec M14 promises that the card *„teases the first two proposals"*: one
 * that names none says the same thing whether eleven suggestions are waiting
 * or none, which is the one question the tap answers. Two, because the card
 * is a tease and the list is one tap away.
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

// --- App-bar cluster (G-12) --------------------------------------------

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
  // What is left behind the ⋮ is packing's own: the
  // trip's properties and its lifecycle steps change the whole trip, so they
  // are M2's — the trip's row and hero — and the bar here does not repeat
  // them. The luggage and the analytics head the sheet (AppHeader).
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
  // FR-5.10, above the lifecycle steps because it is the step most trips
  // take before them: finishing the packing is not finishing the trip. It is
  // offered on a fully packed list too — declaring a finished list finished is
  // the ordinary case — and disappears once it has been done, where the card
  // at the top of the list carries the way back instead.
  if (trip.value && trip.value.status !== TRIP_STATUS_ARCHIVED && !packingClosed.value) {
    items.push({
      id: 'm4-close-packing',
      icon: checkmarkDoneOutline,
      label: t('packing.closeAction'),
      overflow: true,
      onClick: closing.onClosePacking,
    })
  }
  // FR-32.2: who changed what in this trip. A place to go rather than an
  // act, last because it is the rarest — and here, on the trip's home, rather
  // than on every view: the other views keep a ⋮ only for their own context
  // (ADR-051 amendment 2). Only where a server recorded a log (G-8).
  if (readMode() === 'server') {
    items.push({
      id: 'm4-activity',
      icon: timeOutline,
      label: t('activity.menu'),
      overflow: true,
      onClick: () => router.push(tripSubPath(props.tripId, 'activity')),
    })
  }
  return items
})

// --- Empty states (FR-25.11e) ------------------------------------------

const onlyOthersHidden = computed(() => isOnlyOthersHidden(view.value, search.value))

async function handleRefresh(event: CustomEvent) {
  const refresher = event.target as HTMLIonRefresherElement
  await orchestrator.drainTrip(props.tripId)
  refresher.complete()
}

/**
 * The page head names the screen and puts the trip on the line under it,
 * like every other view of a trip (G-9, ADR-050): a head that read the trip
 * here and the view's name everywhere else would jump on every switch.
 *
 * The bar names no page — beside search, filter, fold-all, the lifecycle
 * step, the sync glyph and the gear, 54 px are left and "Samedan 2026"
 * renders as "S…" — so nothing turns on the viewport and the header line is
 * one row of figures at every width.
 *
 * The third argument is why the head is *still* the header line's business:
 * scrolling down takes the whole line, and the head yields on the same
 * gesture. Otherwise the biggest block on the screen would be the one thing
 * that never yields, on the screen that is scrolled most.
 */
setHeaderTitle(
  () => t('packing.title'),
  () => trip.value?.name,
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

      <PackingHeadline
        :trip-id="tripId"
        :kpis="kpis"
        :loaded="rowsLoaded"
        :collapsed="headCollapsed"
        :tasks="tasks.windowTasks.value"
        :task-state="tasks.state.value"
        :task-line="tasks.line.value"
        :presence-users="presenceUsers"
        :participants="participants"
        :is-desktop="isDesktop"
        @reveal-tasks="revealTripTasks"
      >
        <!-- FR-25.11k: the field exists only while it is being used, and
             opens in the sticky band under the switcher (G-12). -->
        <template v-if="searchOpen || search" #search>
          <SearchRow
            v-model="search"
            testid="m4-search-input"
            :placeholder="t('packing.searchPlaceholder')"
            @close="toggleSearch"
          />
        </template>
      </PackingHeadline>

      <ClosingPassBanner
        v-if="closingPass"
        @finish="closing.onFinishClosingPass"
        @cancel="closing.onCancelClosingPass"
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

      <!-- FR-7.4: the trip's tasks. Above the list, because at its foot
           they went unseen. Always present, because the section is where the
           first one is found — but only once the partition is here
           (ADR-033): before that it would read „folded" and then spring open
           under a tap that was meant to open it, which closes it again. -->
      <TripTasksSection
        v-if="rowsLoaded && !closingPass"
        ref="tasksSection"
        v-model:fold="tripTasksFold"
        :trip-id="tripId"
        :tasks="tasks.windowTasks.value"
        :state="tasks.state.value"
        :line="tasks.line.value"
        :assignable="core.ownTaskAssignees.value.length > 1"
        :name-of="nameOf"
        :today="orchestrator.today()"
        @assign="tasks.acts.assign"
        @toggle="tasks.acts.toggle"
        @remove="tasks.acts.remove"
        @open="tasks.open"
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

      <!-- FR-5.10: a finished list says so, and says when. Not during the
           closing pass, which is a posture of its own asking one question. -->
      <PackingClosedCard
        v-if="packingClosed && !closingPass && trip?.packing_closed_at"
        :at="trip.packing_closed_at"
        :skipped="closing.skippedCount.value"
        :now="orchestrator.now()"
        @reopen="closing.onReopen"
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
        :adds-packed="packingClosed"
        :offer-forgotten="packingClosed"
        :show-trigger="false"
        :offer-groups="true"
        :scope="browse.scope.value"
        @add="browse.onQuickAdd"
        @add-group="browse.onAddGroup"
        @browse="browse.onBrowse"
      />

      <PackingGroupList
        v-if="view.groups.length > 0"
        :trip-id="tripId"
        :groups="view.groups"
        :participants="participants"
        :closing-pass="closingPass"
        :facts="facts"
        :for-whom="forWhom"
        :row-hold="menus.hold"
        :cluster-hold="menus.clusterHold"
        @toggle-group="toggleGroup"
        @toggle-cluster="toggleCluster"
        @cluster-menu="menus.openClusterMenu"
        @row-menu="menus.openRowMenu"
        @toggle-for-whom="forWhom.toggle"
        @assign="acts.onAssignRow"
        @open="openItem"
        @pass-toggle="acts.onPassToggle"
        @edit-quantity="quantity.open"
        @increment="acts.onIncrement"
        @decrement="acts.onDecrement"
        @complete="acts.onComplete"
        @zero="acts.onZero"
        @toggle="acts.onToggle"
      />

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
      >
        <!-- FR-5.10: the step, offered where the moment is. In the state the
             list already shows when the last row goes in — so nothing new
             enters the flow and nothing moves under the finger that packed
             it (ADR-060). The sheet is one deliberate tap away. -->
        <IonButton
          v-if="closing.promptUp.value && !packingClosed && !closingPass"
          size="small"
          data-testid="m4-close-prompt"
          @click="closing.onOpenFromPrompt"
        >
          <IonIcon slot="start" :icon="checkmarkDoneOutline" />
          {{ t('packing.closeAction') }}
        </IonButton>
      </EmptyState>

      <!-- The bars run in the order the rows do: the two
           whose rows still ask for something first — packed on departure day
           (FR-25.27), then in somebody else's hands (FR-25.20) — and last the
           one whose rows ask for nothing. Hidden only on request, and never
           silently: this bar is what keeps „alles erledigt" from covering rows
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
            ? t('packing.hideDone', { n: view.doneCount })
            : t('packing.showDone', { n: view.doneCount })
        "
        testid="m4-done-bar"
        @toggle="showDone = !showDone"
      />

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

      <RowQuantityPopover
        testid="m4-quantity-popover"
        :open="quantity.isOpen.value"
        :event="quantity.event.value"
        :label="quantity.clusterLabel.value"
        :item="quantity.item.value"
        :packed="quantity.packed.value"
        :choices="quantity.choices.value"
        @update="quantity.set"
        @closed="quantity.closed"
      />

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

      <!-- FR-7.7: the task sheet, the same one M25 opens. -->
      <SheetModal
        :is-open="tasks.opened.value !== null"
        testid="m4-task-modal"
        @dismiss="tasks.close"
      >
        <TripTaskSheet
          v-if="tasks.opened.value"
          :task="tasks.opened.value"
          :name-of="nameOf"
          :before-locked="packingClosed"
          :today="orchestrator.today()"
          :trip-start="trip?.start_date ?? null"
          @close="tasks.close"
          @due="tasks.onDue"
          @move="tasks.onMove"
          @remove="tasks.onRemoveFromSheet"
          @toggle="tasks.onToggleFromSheet"
          @rename="tasks.onRename"
        />
      </SheetModal>

      <!-- FR-5.10: the question, as the round drew it. Also the app's own
           way of noticing that the last row went in. -->
      <SheetModal
        :is-open="closing.sheetOpen.value"
        testid="m4-close-modal"
        @dismiss="closing.onSheetDismissed"
      >
        <ClosePackingSheet
          v-if="closing.sheetOpen.value"
          :plan="closing.plan.value"
          :shopping="closing.shoppingCount.value"
          :prompted="closing.prompted.value"
          :starting="closing.starting.value"
          @close="closing.onSheetDismissed"
          @confirm="closing.onConfirm"
          @start-only="closing.onStartOnly"
        />
      </SheetModal>

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

<style scoped>
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
  /* The measure column (surfaces.css) does not span the full viewport on a
     tablet, so the browser's default scrollbar would render at the true
     screen edge, disconnected from the content it scrolls. A thin,
     token-coloured bar reads as this list's own control
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
</style>
