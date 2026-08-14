<script setup lang="ts">
/**
 * M4 — Packing list, and since the phase hub was dropped (2026-08-08) the
 * trip screen itself: tapping a trip opens this, with nothing in between.
 *
 * Rebuilt from the concept mock (UI-Spec M4, Addendum §3.25). What the
 * shape is answering, in one line each:
 *
 *  - **One header line** (trip line): progress, weight, open prep, the
 *    presence facepile and the trip's *other views* as labelled icons.
 *    It stays unfiltered whatever the list shows (G-12), so a short list
 *    is never mistaken for a finished trip. It hides on scroll-down and
 *    returns on any upward scroll, which is where the list height comes
 *    from; the trip name lives in the one app bar permanently (ADR-011),
 *    so nothing has to migrate up there as it goes.
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
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
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
} from '@ionic/vue'
import {
  addOutline,
  archiveOutline,
  bagHandleOutline,
  contrastOutline,
  flagOutline,
  personOutline,
  pricetagOutline,
  buildOutline,
  cartOutline,
  chevronDownOutline,
  contractOutline,
  expandOutline,
  funnelOutline,
  briefcaseOutline,
  lockClosedOutline,
  locationOutline,
  sparklesOutline,
  statsChartOutline,
  timeOutline,
} from 'ionicons/icons'
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
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
import UserAvatar from '@/components/global/UserAvatar.vue'
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { useContextSearch } from '@/composables/useContextSearch'
import { usePackingFilter } from '@/composables/usePackingFilter'
import { buildPackingView, FACET_KEYS, NO_VALUE, type PackingRow } from '@/domain/packingView'
import { relativeStamp } from '@/domain/stamp'
import { currentLocale, t } from '@/i18n'
import { useTripStore } from '@/stores/tripStore'
import type { FacetKey, GroupBy, ItemTodo, TripItem, TripParticipant } from '@/types/domain'

const props = defineProps<{ tripId: string; itemId?: string }>()

const store = useTripStore()
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
  orchestrator.drainTrip(props.tripId)
  const [users, me] = await Promise.all([orchestrator.fetchUsers(), orchestrator.fetchMe()])
  directory.value = users
  myUserId.value = me?.user_id ?? null
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

function openQuickAdd() {
  void quickAdd.value?.open()
}

const trip = computed(() => store.getTrip(props.tripId))
const kpis = computed(() => store.kpis(props.tripId))
const isActive = computed(() => trip.value?.status === 'active')
const allItems = computed(() => store.getItems(props.tripId))
const openPrepItems = computed(() => store.itemsWithOpenPrep(props.tripId))

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
  router.replace(`/trips/${props.tripId}/items/${itemId}`)
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

function formatWeight(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${grams} g`
}

/**
 * The header line yields to the list on the way down and comes back on any
 * upward scroll. A threshold keeps it from flickering on the rubber-band
 * overscroll at the top, where the direction flips every frame.
 */
const headCollapsed = ref(false)
let lastScrollTop = 0
function onScroll(event: CustomEvent<{ scrollTop: number }>) {
  const top = event.detail.scrollTop
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

function onSkipItem(item: TripItem) {
  orchestrator.skipItem(props.tripId, item)
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
  orchestrator.packComplete(props.tripId, item)
}

function onZero(item: TripItem) {
  orchestrator.packZero(props.tripId, item)
}

function onToggle(item: TripItem) {
  orchestrator.packToggle(props.tripId, item)
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

/** Archiving completes the trip and opens the M14 review (FR-9.2). */
function onArchive() {
  orchestrator.archiveTrip(props.tripId)
  router.push(`/trips/${props.tripId}/review`)
}

async function handleRefresh(event: CustomEvent) {
  const refresher = event.target as HTMLIonRefresherElement
  await orchestrator.drainTrip(props.tripId)
  refresher.complete()
}

// ADR-011: the one header bar renders this page's title.
setHeaderTitle(() => trip.value?.name ?? t('packing.title'))
</script>

<template>
  <IonPage>
    <IonContent class="pack-content" :scroll-events="true" @ion-scroll="onScroll">
      <IonRefresher slot="fixed" @ionRefresh="handleRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <!-- One header line (G-12): what the trip stands at, and where else to
           go within it. Deliberately unfiltered — see FR-25.20. -->
      <div class="trip-line" :class="{ collapsed: headCollapsed }" data-testid="m4-header">
        <PresenceFacepile v-if="presenceUsers.length > 1" :users="presenceUsers" />
        <div class="progress" data-testid="m4-progress">
          <strong class="jp-num">{{ kpis.packedItems }}/{{ kpis.totalItems }}</strong>
          <span v-if="kpis.totalWeight > 0" class="muted">
            · {{ formatWeight(kpis.totalWeight) }}
          </span>
          <span v-if="openPrepCount > 0" class="muted prep">
            · {{ t('packing.openPrep', { n: openPrepCount }) }}
          </span>
        </div>
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
            <IonBadge v-if="shoppingCount > 0" color="warning" class="nav-count">
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

      <!-- The one real remnant of the dropped "Danach" phase: an archived
           trip leads with what to do next with it. -->
      <div v-if="trip?.status === 'archived'" class="closing-card">
        <h2>{{ t('packing.tripFinished') }}</h2>
        <IonButton size="small" fill="outline" :router-link="`/trips/${tripId}/review`">
          <IonIcon slot="start" :icon="sparklesOutline" />
          {{ t('packing.reviewSuggestions') }}
        </IonButton>
      </div>

      <QuickAddItem ref="quickAdd" :trip-id="tripId" :is-active="isActive" @add="onQuickAdd" />

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

          <div v-if="!group.collapsed" class="group-card">
            <template
              v-for="entry in group.entries"
              :key="entry.kind === 'item' ? entry.item.id : entry.key"
            >
              <!-- FR-25.1: a per-person item is named once, with one child
                   row per traveler under it. -->
              <div v-if="entry.kind === 'cluster'" class="cluster">
                <div class="cluster-head">
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

                <IonItemSliding v-for="child in entry.children" :key="child.item.id">
                  <IonItem
                    button
                    class="child-row"
                    :data-testid="`m4-child-${entry.name}-${child.traveler?.name ?? ''}`"
                    :class="{ done: child.done, locked: locked(child.item) }"
                    @click="openItem(child.item.id)"
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
                      <p v-if="child.done && packedStamp(child.item)" class="stamp">
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
                  <IonItemOptions v-if="!locked(child.item)" side="start">
                    <IonItemOption color="primary" @click="onPackingNow(child.item)">
                      {{ t('mode.pack') }}
                    </IonItemOption>
                  </IonItemOptions>
                  <IonItemOptions v-if="!locked(child.item)" side="end">
                    <IonItemOption
                      v-if="child.item.state === 'skipped'"
                      color="success"
                      @click="onUnskipItem(child.item)"
                    >
                      {{ t('packing.undo') }}
                    </IonItemOption>
                    <IonItemOption v-else color="medium" @click="onSkipItem(child.item)">
                      {{ t('packing.skipped') }}
                    </IonItemOption>
                  </IonItemOptions>
                </IonItemSliding>
              </div>

              <IonItemSliding v-else>
                <IonItem
                  button
                  :class="{ done: entry.done, locked: locked(entry.item) }"
                  :data-testid="`m4-row-${entry.item.name}`"
                  @click="openItem(entry.item.id)"
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
                  <IonLabel>
                    <h3>
                      {{ entry.label }}
                      <IonBadge
                        v-if="openTodoCount(entry.item.id) > 0"
                        color="warning"
                        class="prep"
                      >
                        <IonIcon :icon="buildOutline" /> {{ openTodoCount(entry.item.id) }}
                      </IonBadge>
                    </h3>
                    <p v-if="entry.done && packedStamp(entry.item)" class="stamp">
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
                <IonItemOptions v-if="!locked(entry.item)" side="start">
                  <IonItemOption color="primary" @click="onPackingNow(entry.item)">
                    {{ t('mode.pack') }}
                  </IonItemOption>
                </IonItemOptions>
                <IonItemOptions v-if="!locked(entry.item)" side="end">
                  <IonItemOption
                    v-if="entry.item.state === 'skipped'"
                    color="success"
                    @click="onUnskipItem(entry.item)"
                  >
                    {{ t('packing.undo') }}
                  </IonItemOption>
                  <IonItemOption v-else color="medium" @click="onSkipItem(entry.item)">
                    {{ t('packing.skipped') }}
                  </IonItemOption>
                </IonItemOptions>
              </IonItemSliding>
            </template>
          </div>
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
      <div v-if="openPrepItems.length > 0" class="prep-section">
        <button class="prep-header" @click="showPrep = !showPrep">
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
      <IonFab slot="fixed" vertical="bottom" horizontal="end">
        <IonFabButton data-testid="m4-fab" :aria-label="t('common.add')" @click="openQuickAdd">
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

<style scoped>
/* M5 as a sheet (phone) or a panel (desktop, G-9). The panel is fixed to
   the right edge rather than squeezing the list: the list keeps its
   measurements, so opening a detail never re-flows the rows underneath
   the finger that opened it. */
.item-modal {
  --height: 88%;
  --border-radius: 22px 22px 0 0;
  --background: var(--ct-mantle);
  --box-shadow: 0 -16px 40px rgba(0, 0, 0, 0.62);
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
  box-shadow: -16px 0 40px rgba(0, 0, 0, 0.45);
  z-index: 20;
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
  align-items: center;
  gap: 10px;
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
  max-height: 52px;
  /* Clipped, never faded: a half-transparent sticky line reads as two
     lines printed on top of each other while the list slides past it. */
  transition:
    max-height 0.18s ease,
    padding 0.18s ease;
}

.trip-line.collapsed {
  max-height: 0;
  padding-block: 0;
  border-bottom-color: transparent;
}

.progress {
  flex: 1;
  min-width: 0;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.muted {
  color: var(--ct-subtext0);
  font-size: 0.85rem;
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
  font-size: 0.6rem;
  padding: 2px 4px;
}

.filter-count {
  position: absolute;
  top: 2px;
  right: 0;
  font-size: 0.6rem;
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
  border-radius: 999px;
  background: none;
  color: var(--ct-text);
  font-size: 0.78rem;
  cursor: pointer;
}

.chip b {
  color: var(--ct-subtext0);
  font-weight: 600;
}

.chip .x {
  color: var(--ct-subtext0);
}

.chip-reset {
  background: none;
  border: none;
  color: var(--ct-blue);
  font-size: 0.78rem;
  cursor: pointer;
}

.grouped-by {
  color: var(--ct-subtext0);
  font-size: 0.78rem;
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
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  cursor: pointer;
}

.group-name {
  flex: 1;
  text-align: start;
}

.group-count {
  color: var(--ct-subtext0);
  font-size: 0.8rem;
  font-weight: 500;
}

/* Each group is its own block, so the seam between two categories is a
   real edge rather than a slightly larger gap — which is what made them
   run into each other on a long list. */
.group-card {
  margin: 0 8px;
  border: 1px solid var(--ct-surface0);
  border-radius: 14px;
  background: var(--ct-mantle);
  overflow: hidden;
}

.group-card ion-item {
  --background: transparent;
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
  font-size: 1.05rem;
}

.late-icon {
  color: var(--ct-yellow);
  font-size: 1.05rem;
}

.lock {
  font-size: 22px;
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
  font-size: 0.75rem;
}

.prep {
  font-size: 0.65rem;
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
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--ct-subtext1);
}

.cluster-name {
  flex: 1;
}

.cluster-count {
  color: var(--ct-subtext0);
  font-size: 0.75rem;
  font-weight: 500;
}

.child-row {
  --padding-start: 8px;
}

/* --- Bars, cards and sections ----------------------------------------- */
.reveal-bar {
  display: block;
  width: calc(100% - 24px);
  margin: 10px 12px;
  padding: 10px;
  border: 1px dashed var(--ct-surface2);
  border-radius: 12px;
  background: none;
  color: var(--ct-subtext0);
  font-size: 0.85rem;
  cursor: pointer;
}

.reveal-bar.on {
  border-style: solid;
  color: var(--ct-text);
}

.closing-card {
  margin: 12px;
  padding: 14px;
  border-radius: 14px;
  background: var(--ct-surface0);
}

.closing-card h2 {
  margin: 0 0 10px;
  font-size: 1rem;
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
  font-size: 56px;
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
  font-size: 0.9rem;
  cursor: pointer;
}

.prep-item {
  padding: 8px 14px 2px;
  font-size: 0.8rem;
  color: var(--ct-subtext0);
}
</style>
