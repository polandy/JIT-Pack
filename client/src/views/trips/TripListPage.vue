<script setup lang="ts">
/**
 * M2 — Trip List
 *
 * Overview and entry to all trips. Segmented filter Active/Planned/Archived,
 * per-trip progress ring, FAB for new trip, pull-to-refresh.
 */
import {
  IonPage,
  IonContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonList,
  IonItem,
  IonIcon,
  IonFab,
  IonFabButton,
  IonRefresher,
  IonRefresherContent,
  IonButton,
  actionSheetController,
  onIonViewWillEnter,
} from '@ionic/vue'
import {
  addOutline,
  trainOutline,
  albumsOutline,
  archiveOutline,
  playOutline,
  cloudUploadOutline,
  copyOutline,
  createOutline,
  documentTextOutline,
  downloadOutline,
  peopleOutline,
  trashOutline,
} from 'ionicons/icons'
import { ref, computed, onMounted, onUnmounted, watch, type ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/global/EmptyState.vue'
import TripChangeChips from '@/components/trips/TripChangeChips.vue'
import TripHero from '@/components/trips/TripHero.vue'
import { hasCollaborativeSession } from '@/mode'
import { serializeTrip } from '@/domain/portable'
import { safeFilename, saveText } from '@/lib/download'
import {
  countTripsByFilter,
  openingFilter,
  parseTripFilter,
  TRIP_FILTERS,
  TRIP_FILTER_QUERY,
  type TripFilter,
} from './tripFilter'
import { proposedChangeCount } from '@/domain/refresh'
import { useOnFirstVisible } from '@/composables/useOnFirstVisible'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { AppliedChange, Trip } from '@/types/domain'
import { TRIP_STATUS_ARCHIVED, TRIP_STATUS_PLANNING } from '@/types/domain'
import { useIdentity } from '@/composables/useTripIdentity'
import SearchRow from '@/components/global/SearchRow.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import {
  heroTripOf,
  isActive,
  tripOrderKey,
  tripRowActions,
  type TripRowAction,
} from '@/domain/trips'
import { useLongPress } from '@/composables/useLongPress'
import { t, type MessageKey } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { formatTripPeriod } from '@/lib/format'
import { presentToast } from '@/lib/toast'
import { useContextSearch } from '@/composables/useContextSearch'
import { setHeaderActions } from '@/composables/useHeaderActions'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { PATH, seriesPath, tripClosingPath, tripPath, tripSubPath } from '@/router/paths'
import { confirmDestructive } from '@/lib/confirm'
import { useOrchestrator } from '@/composables/useOrchestrator'

const tripStore = useTripStore()
const masterStore = useMasterStore()
const orchestrator = useOrchestrator()
const { myUserId, load } = useIdentity(orchestrator)
const route = useRoute()

// Map DB 'planning' to display filter 'planned' for UI clarity
type FilterStatus = TripFilter
const filter = ref<FilterStatus>('active')

/**
 * Another screen may name the segment this list should open on (`?status=`).
 * A watch rather than a read at setup: Ionic keeps this page mounted, so a
 * restore arriving while it is already alive would otherwise land on whatever
 * segment was last tapped. An absent or unknown value changes nothing — it
 * must never quietly reset a choice the user made.
 */
watch(
  () => route.query[TRIP_FILTER_QUERY],
  (value) => {
    const asked = parseTripFilter(value)
    if (asked) filter.value = asked
  },
  { immediate: true },
)

function matchesFilter(trip: Trip): boolean {
  switch (filter.value) {
    case 'active':
      return isActive(trip)
    case 'planned':
      return trip.status === TRIP_STATUS_PLANNING
    case 'archived':
      return trip.status === TRIP_STATUS_ARCHIVED
  }
}

/**
 * Dev only (see src/dev/sampleTrip.ts): `import.meta.env.DEV` is false in
 * every build, so both the button and the module behind it are gone from
 * a production bundle. This is not Demo Mode returning.
 */
const isDev = import.meta.env.DEV

/**
 * Seeds the whole world, not only the trip: a fresh install has no inventory
 * and no templates, so every §3.27 surface opens empty and testing one starts
 * with twenty minutes of typing.
 *
 * It reports both outcomes. An async handler that only navigates on success is
 * indistinguishable from a dead button when anything throws — a stale module
 * graph after a dev-server restart is enough — and with no feedback nobody
 * notices that it did not work.
 */
async function addSampleData() {
  // The guard is what removes the seed from a production bundle, not the
  // `v-if` on the button: `import.meta.env.DEV` is a compile-time constant, so
  // this block and the chunk behind it are pruned — while a dynamic import in
  // a live code path is emitted whether or not anything can reach it. The
  // gallery route has had this shape all along (router/index.ts); the seed
  // claimed it and did not have it, and shipped three chunks to every instance.
  if (!import.meta.env.DEV) return
  try {
    const { seedSampleData } = await import('@/dev/sampleData')
    const outcome = await seedSampleData(orchestrator)
    await report(outcome.summary)
    router.push(tripPath(outcome.tripId))
  } catch (error) {
    // Dev-only surface, so the message is the developer's — untranslated and
    // as specific as the failure was.
    console.error('sample data seeding failed', error)
    await report(`Beispieldaten fehlgeschlagen: ${(error as Error).message}`, 8000)
  }
}

async function report(message: string, duration = 4000) {
  await presentToast({ message, duration, positionAnchor: FAB_ANCHOR.m2 })
}

const {
  term: search,
  isOpen: searchOpen,
  toggle: toggleSearch,
  action,
  matches,
} = useContextSearch()
setHeaderTitle(() => t('trips.title'))

// The two import entries are screen-level actions, so they belong in the one
// place a screen states those (G-12); the name is the frame's (ADR-050).
setHeaderActions(() => [
  action(),
  {
    // M18: portable trip import (FR-18.4)
    id: 'm2-portable-import',
    icon: documentTextOutline,
    label: t('trips.importPortable'),
    onClick: () => router.push(PATH.importFile),
  },
  {
    // M15: legacy spreadsheet import (FR-16.1)
    id: 'm2-spreadsheet-import',
    icon: cloudUploadOutline,
    label: t('items.importSpreadsheet'),
    onClick: () => router.push(PATH.importSpreadsheet),
  },
])

/** The temporal line under a trip's name, whatever it actually knows (UX-5). */
/**
 * Faces on the row before the „+N" bubble (FR-2.1/8.1).
 *
 * **Two, measured rather than chosen.** At 390 px a four-traveller pile of
 * three faces plus „+1" is 64 px wide and pushes „Sommerferien im Tessin 2027"
 * onto a second line — the row goes from 87 px to 106 px. Two faces plus „+2"
 * is 61 px and the name stays on one. It is the wrap *boundary* rather than a
 * comfortable margin: a longer name still wraps, and that is fine — what is
 * not fine is paying a line for a face nobody asked for.
 */
const TRAVELER_FACES = 2

/**
 * The trip's roster — who it is *for*, not who is connected (that is G-10).
 *
 * Empty where the trip's partition has not arrived, rather than „nobody": in
 * Server Mode a trip's travellers come with its rows, so a list on a fresh
 * boot would otherwise say every trip is for no one. That is the same
 * distinction the progress ring already draws with `tripDataKnown` — it shows
 * a „·" rather than 0 % — and the pile draws it by being absent, which is what
 * a trip with genuinely no travellers looks like too. The two cases are
 * indistinguishable on the row on purpose: neither is a claim.
 */
function travelersOf(trip: Trip) {
  return tripDataKnown(trip) ? tripStore.getTravelers(trip.id) : []
}

function shownTravelers(trip: Trip) {
  return travelersOf(trip).slice(0, TRAVELER_FACES)
}

function hiddenTravelers(trip: Trip): number {
  return Math.max(0, travelersOf(trip).length - TRAVELER_FACES)
}

const tripWhen = formatTripPeriod

/**
 * The search alone, without the segment: what M2 shows is one slice of this,
 * and each segment's count (FR-2.8) is the size of its own slice — which is
 * why the search is applied once, here, rather than by each of them.
 */
const searchedTrips = computed(() => tripStore.tripList.filter((trip) => matches(trip.name)))

const filteredTrips = computed(() =>
  searchedTrips.value
    .filter((trip) => matchesFilter(trip))
    // Newest first (Addendum, M2 default ordering). The key survives a
    // trip that has only its year (FR-2.1b), which a raw date compare did
    // not — it put such a trip wherever the sort happened to leave it.
    .sort((a, b) => tripOrderKey(b).localeCompare(tripOrderKey(a))),
)
const isEmpty = computed(() => filteredTrips.value.length === 0)

/**
 * FR-21.15: the trip you are on, as a card at the head of the screen.
 *
 * **Only on *Active*.** The hero answers „which one am I packing", and the
 * other two segments have no answer to give: a planned trip is not being
 * packed and an archived one is done, so a card over either would state
 * something untrue about the list under it. Exactly one per screen (FR-21.13)
 * follows from `heroTripOf` returning one trip rather than a list.
 *
 * It reads `filteredTrips`, so a search that excludes the trip removes the
 * hero with it — the card is a member of the list it heads, not a fixture
 * above it.
 */
const heroTrip = computed(() =>
  filter.value === 'active' ? heroTripOf(filteredTrips.value) : null,
)

/**
 * What the grouped list below the hero shows. The hero is *lifted out* rather
 * than repeated: two cards for one trip say two trips, and the count on the
 * series header counts what it shows for the same reason.
 */
const listedTrips = computed(() =>
  filteredTrips.value.filter((trip) => trip.id !== heroTrip.value?.id),
)

/** The series the hero came out of, which its own line has to keep saying. */
const heroSeriesName = computed(() => {
  const id = heroTrip.value?.series_id
  return id ? (masterStore.getSeries(id)?.name ?? t('trips.seriesFallback')) : null
})

/**
 * Who the hero trip is for, and where it sits — the two facts the row it
 * replaced carried as faces and as its position in a series group.
 */
const heroMeta = computed(() => {
  const trip = heroTrip.value
  if (!trip) return null
  const travelers = travelersOf(trip).map((traveler) => traveler.name)
  return [heroSeriesName.value, ...travelers].filter(Boolean).join(' · ') || null
})

/**
 * FR-2.8 — the segments, their counts and the opening decision.
 *
 * `countsKnown` is the guard the whole feature turns on: in Server Mode the
 * trip list arrives after this screen is already on the display, and zeros
 * read off a list that has not come yet are not zeros. Until the master
 * partition is here, a segment shows its label alone and the walk does not
 * run — deciding on nothing would send every cold start to the archive and,
 * because the walk decides on entry only, leave it there.
 */
const countsKnown = computed(() => orchestrator.masterDataLoaded())

/** The label each segment carries; the count is the line under it. */
const SEGMENT_LABELS: Record<TripFilter, MessageKey> = {
  active: 'trips.filterActive',
  planned: 'trips.filterPlanned',
  archived: 'trips.filterArchived',
}

/** The displayed counts follow the search, so they say where the hits are. */
const segmentCounts = computed(() => countTripsByFilter(searchedTrips.value))

const segments = computed(() =>
  TRIP_FILTERS.map((value) => {
    const label = t(SEGMENT_LABELS[value])
    const count = countsKnown.value ? segmentCounts.value[value] : null
    return {
      value,
      label,
      count,
      testid: `trips-filter-${value}`,
      // The count is part of the name rather than a digit read out after it.
      a11y: count === null ? label : t('trips.filterCount', { label, n: count }),
    }
  }),
)

/**
 * Whether an entry to this screen still owes its decision. Ionic keeps M2
 * mounted, so entering is the view becoming visible — and the decision is
 * deferred rather than dropped when the list is not here yet, because the
 * settled signal usually arrives a moment *after* the screen does.
 */
const openingDecisionOwed = ref(false)

function decideOpeningSegment(): void {
  if (!openingDecisionOwed.value || !countsKnown.value) return
  openingDecisionOwed.value = false
  // A caller that named the segment has the answer this rule is guessing at.
  if (parseTripFilter(route.query[TRIP_FILTER_QUERY])) return
  filter.value = openingFilter(filter.value, countTripsByFilter(tripStore.tripList))
}

/**
 * The walk reads the *unfiltered* counts, so a search left on the field
 * cannot decide where the user lands — and it runs on entry only, so
 * archiving the last active trip from M2's own context menu does not
 * reorganise the list under the finger that did it.
 */
function enterScreen(): void {
  openingDecisionOwed.value = true
  decideOpeningSegment()
}

// Both, and neither is redundant: `onMounted` is the first entry — the app
// starting on this tab — and `onIonViewWillEnter` is every one after it,
// since Ionic keeps the page alive when you navigate away from it.
onMounted(enterScreen)
onIonViewWillEnter(enterScreen)
watch(countsKnown, decideOpeningSegment)

/**
 * FR-13.1: trips grouped by series with a tappable header (→ M16);
 * series-less trips follow in a trailing unlabeled group.
 */
const groupedTrips = computed(() => {
  const groups: { seriesId: string | null; seriesName: string | null; trips: Trip[] }[] = []
  const index = new Map<string | null, number>()
  for (const trip of listedTrips.value) {
    const key = trip.series_id
    if (!index.has(key)) {
      index.set(key, groups.length)
      groups.push({
        seriesId: key,
        seriesName: key ? (masterStore.getSeries(key)?.name ?? t('trips.seriesFallback')) : null,
        trips: [],
      })
    }
    groups[index.get(key)!]!.trips.push(trip)
  }
  return groups.sort((a, b) => Number(a.seriesId === null) - Number(b.seriesId === null))
})

/**
 * ADR-033: a trip's rows live in its own partition, so a trip this device has
 * never opened has nothing to sum. The ring and the line report that as
 * *unknown* rather than as zero — summing nothing and printing `0/0 gepackt`
 * is the "not pulled yet is not empty" mistake the orchestrator guards
 * against everywhere else.
 */
function tripDataKnown(trip: Trip): boolean {
  return orchestrator.tripDataLoaded(trip.id)
}

function progressPercent(trip: Trip): number {
  const k = tripStore.kpis(trip.id)
  if (k.totalItems === 0) return 0
  return Math.round((k.packedItems / k.totalItems) * 100)
}

function progressColor(trip: Trip): string {
  const pct = progressPercent(trip)
  // Headway only ever runs the done ramp (G-11). Peach below half would
  // read as the brand shouting at you for not having packed yet.
  if (pct >= 100) return 'var(--jp-done)'
  return 'var(--jp-done-far)'
}

function itemSummary(trip: Trip): string {
  const k = tripStore.kpis(trip.id)
  return t('trips.itemSummary', { packed: k.packedItems, total: k.totalItems })
}

/**
 * Fetch a row's own data when the row is on screen, not when the list is.
 * A decade of archived trips is a decade of partitions; the viewport is what
 * bounds the cost, and it grows with scrolling instead of with the archive.
 */
const rowsOnScreen = useOnFirstVisible((tripId) => {
  void orchestrator.ensureTripData(tripId)
})

function watchRow(el: Element | ComponentPublicInstance | null, tripId: string) {
  const node = el instanceof Element ? el : ((el?.$el ?? null) as Element | null)
  if (node) rowsOnScreen.observe(node, tripId)
}

onUnmounted(() => rowsOnScreen.stop())

/*
 * The hero is not a row and never enters the observer, so it asks for its own
 * partition. Without this it renders „items loading" forever on the one trip
 * the screen exists to answer for (ADR-033).
 */
watch(heroTrip, (trip) => trip && void orchestrator.ensureTripData(trip.id), { immediate: true })

function onFilterChange(event: CustomEvent) {
  filter.value = event.detail.value as FilterStatus
}

const router = useRouter()

// Share is omitted without an OIDC session — Single-User and Local
// Mode have no second account to share with (FR-17.3/FR-19.3/G-8).
const collaborative = hasCollaborativeSession()

/** FR-27.4: the trip whose *foldable* applied-changes log is open, if any. */
const expandedApplied = ref<string | null>(null)

function toggleApplied(tripId: string) {
  expandedApplied.value = expandedApplied.value === tripId ? null : tripId
}

/**
 * What the refresh took over on this trip. No status rule: a running trip
 * takes changes over too, and only a *past* one is frozen — which cannot
 * produce entries in the first place, so
 * the record is simply whatever the log holds.
 */
function appliedChanges(trip: Trip): AppliedChange[] {
  return tripStore.getAppliedChanges(trip.id)
}

/**
 * FR-27.4: how many changes are *waiting* on this trip. The chip is a
 * pointer, not a control — the decision belongs at the trip, and tapping the
 * row is already the way there.
 *
 * It can only speak for a trip whose partition this device holds: a proposal
 * is a diff against the trip's rows, and in Server Mode those arrive when the
 * trip is opened. An absent chip therefore means "nothing to say from here",
 * never "nothing to decide" — which is why M4 asks again on open rather than
 * trusting this list.
 */
function proposedCount(trip: Trip): number {
  const plan = orchestrator.refreshProposals.value[trip.id]
  return plan ? proposedChangeCount(plan) : 0
}

onMounted(async () => {
  if (collaborative) await load()
})

// Delete is Owner-only (destructive, FR-4.5). Outside collaborative mode
// there is a single account that owns everything, so it's always allowed;
// in collaborative mode we check the roster against our own id.
function canDelete(trip: Trip): boolean {
  if (!collaborative) return true
  return tripStore
    .getMembers(trip.id)
    .some((m) => m.user_id === myUserId.value && m.role === 'owner')
}

/** Delete removes the trip entirely after an explicit confirm (M2). */
async function deleteTrip(trip: Trip) {
  const confirmed = await confirmDestructive({
    header: t('trips.deleteTitle', { name: trip.name }),
    message: t('trips.deleteMessage'),
    confirmLabel: t('common.delete'),
  })
  if (confirmed) orchestrator.deleteTrip(trip.id)
}

/** Start moves a planning trip into packing — see M4's onStart. */
async function startTrip(tripId: string) {
  orchestrator.activateTrip(tripId)
  // What starting changes is invisible on this screen — the list's later
  // additions count as forgotten (FR-9.1) — so it is said once, here.
  await presentToast({ message: t('packing.startedToast'), positionAnchor: FAB_ANCHOR.m2 })
}

/**
 * *Reise abschliessen* opens the packing list in FR-9.3's closing pass rather
 * than archiving here: the pass is the one point where the user looks at the
 * whole trip at once, and it is what archives — *Fertig* archives and opens
 * M14. Archiving straight from M2 would skip it; M4's ⋮ holds none of the
 * trip-wide steps.
 */
function archiveTrip(tripId: string) {
  router.push(tripClosingPath(tripId))
}

/** FR-18.3: the user chooses progress vs clean; generated client-side. */
async function exportTrip(trip: Trip) {
  const sheet = await actionSheetController.create({
    header: t('trips.exportHeader', { name: trip.name }),
    buttons: [
      { text: t('trips.exportWithProgress'), data: true },
      { text: t('trips.exportClean'), data: false },
      { text: t('common.cancel'), role: 'cancel' },
    ],
  })
  await sheet.present()
  const { data, role } = await sheet.onDidDismiss()
  if (role === 'cancel' || typeof data !== 'boolean') return
  const yaml = serializeTrip({
    trip,
    items: tripStore.getItems(trip.id),
    travelers: tripStore.getTravelers(trip.id),
    containers: tripStore.getContainers(trip.id),
    includeProgress: data,
    ...masterStore.portableResolvers(),
  })
  saveText(yaml, `${safeFilename(trip.name)}.yaml`)
}

/** How one of M2's per-trip actions looks and what it does. */
interface TripActionView {
  icon: string
  labelKey: MessageKey
  /**
   * The row menu's entry id. Whole literals rather than one template, so
   * `scripts/testid-gate.mjs` can see each of them.
   */
  menuTestid: string
  /** Ionic's sheet role; the destructive entry is drawn as one (M7's shape). */
  role?: 'destructive'
  run: (trip: Trip) => void
}

const TRIP_ACTION_VIEW: Record<TripRowAction, TripActionView> = {
  // FR-2.7: the trip's own properties
  edit: {
    icon: createOutline,
    labelKey: 'tripEdit.title',
    menuTestid: 'm2-menu-edit',
    run: (trip) => void router.push(tripSubPath(trip.id, 'edit')),
  },
  // FR-18.3: portable YAML export with progress choice
  export: {
    icon: downloadOutline,
    labelKey: 'trips.actionExport',
    menuTestid: 'm2-menu-export',
    run: (trip) => void exportTrip(trip),
  },
  // FR-4.5: member management
  share: {
    icon: peopleOutline,
    labelKey: 'trips.actionShare',
    menuTestid: 'm2-menu-share',
    run: (trip) => void router.push(tripSubPath(trip.id, 'members')),
  },
  // FR-12.1: clone from the archive
  clone: {
    icon: copyOutline,
    labelKey: 'trips.actionClone',
    menuTestid: 'm2-menu-clone',
    run: (trip) => void router.push(tripSubPath(trip.id, 'clone')),
  },
  // planning → active, the step that makes archiving (and M14/M21) reachable
  start: {
    icon: playOutline,
    labelKey: 'trips.actionStart',
    menuTestid: 'm2-menu-start',
    run: (trip) => void startTrip(trip.id),
  },
  // → M4's closing pass (FR-9.3), whose *Fertig* archives and opens M14
  archive: {
    icon: archiveOutline,
    labelKey: 'trips.actionArchive',
    menuTestid: 'm2-menu-archive',
    run: (trip) => archiveTrip(trip.id),
  },
  // destructive, Owner-only (FR-4.5)
  delete: {
    icon: trashOutline,
    labelKey: 'trips.actionDelete',
    menuTestid: 'm2-menu-delete',
    role: 'destructive',
    run: (trip) => void deleteTrip(trip),
  },
}

function actionsOf(trip: Trip): TripRowAction[] {
  return tripRowActions(trip, { collaborative, canDelete: canDelete(trip) })
}

/** One entry of the hero's action row (FR-21.15). */
interface HeroAction {
  id: TripRowAction
  icon: string
  label: string
  run: () => void
}

/**
 * The hero's actions, from the same list as the row's menu rather than from
 * „it is active, so it can be archived": a hero over a trip whose lifecycle
 * says otherwise would offer a step the row does not. Clone and start never
 * appear because the hero is only ever a running trip.
 */
const heroActions = computed<HeroAction[]>(() => {
  const trip = heroTrip.value
  if (!trip) return []
  return actionsOf(trip).map((id) => ({
    id,
    icon: TRIP_ACTION_VIEW[id].icon,
    label: t(TRIP_ACTION_VIEW[id].labelKey),
    run: () => TRIP_ACTION_VIEW[id].run(trip),
  }))
})

// --- Row menu: hold / right-click (M4, M7 shape) ---------------------------
//
// Not a swipe: no list hides its actions behind one, and M4 and M7 answer a
// hold with a sheet. The 500 ms live in useLongPress; `contextmenu` covers
// desktop and is the seam the e2e drives.

const hold = useLongPress<Trip>(openRowMenu)

/**
 * Row taps are ignored while a menu lives — counted from before the overlay
 * attaches until it is gone, so the release-click of a hold cannot also open
 * the trip. M7's `rowMenuActive`, and a state for the same reason: a one-shot
 * "swallow the next click" would go stale and eat a real tap. A count, since
 * a second menu can open while the first is still leaving.
 */
let rowMenusAlive = 0

function openTrip(trip: Trip) {
  if (rowMenusAlive > 0) return
  router.push(tripPath(trip.id))
}

/**
 * The hero is a link rather than a row, so the guard `openTrip` keeps has to
 * stop the link itself: the release-click of a hold lands while the menu is up.
 */
function onHeroClick(event: MouseEvent) {
  if (rowMenusAlive > 0) event.preventDefault()
}

/**
 * A sheet is up and not yet leaving. Narrower than `rowMenusAlive`: a long
 * press on touch fires `contextmenu` as well as the timer, and only the first
 * may open a sheet — but a menu asked for during the last one's leave
 * animation is a new request, and waiting for `onDidDismiss` swallowed it.
 */
let rowMenuShowing: symbol | null = null

async function openRowMenu(trip: Trip) {
  hold.cancel()
  if (rowMenuShowing) return
  const mine = Symbol(trip.id)
  rowMenuShowing = mine
  rowMenusAlive++
  try {
    const sheet = await actionSheetController.create({
      header: trip.name,
      buttons: [
        ...actionsOf(trip).map((id) => ({
          text: t(TRIP_ACTION_VIEW[id].labelKey),
          icon: TRIP_ACTION_VIEW[id].icon,
          role: TRIP_ACTION_VIEW[id].role,
          htmlAttributes: { 'data-testid': TRIP_ACTION_VIEW[id].menuTestid },
          handler: () => TRIP_ACTION_VIEW[id].run(trip),
        })),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    })
    await sheet.present()
    await sheet.onWillDismiss()
    if (rowMenuShowing === mine) rowMenuShowing = null
    await sheet.onDidDismiss()
  } finally {
    // finally: a failed present() must not leave the list tap-dead — nor
    // clear the flag of a menu opened since.
    if (rowMenuShowing === mine) rowMenuShowing = null
    rowMenusAlive--
  }
}

async function handleRefresh(event: CustomEvent) {
  const refresher = event.target as HTMLIonRefresherElement
  const tripIds = tripStore.tripList.map((t) => t.id)
  await orchestrator.drainAll(tripIds)
  refresher.complete()
}
</script>

<template>
  <IonPage>
    <IonContent>
      <IonRefresher slot="fixed" @ionRefresh="handleRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <SearchRow
        v-if="searchOpen || search"
        v-model="search"
        testid="trips-search-input"
        :placeholder="t('trips.searchPlaceholder')"
        @close="toggleSearch"
      />

      <div class="ion-padding">
        <IonSegment :value="filter" @ionChange="onFilterChange">
          <IonSegmentButton
            v-for="segment in segments"
            :key="segment.value"
            :value="segment.value"
            :data-testid="segment.testid"
            :aria-label="segment.a11y"
          >
            <IonLabel>
              <span class="segment-label">{{ segment.label }}</span>
              <!-- FR-2.8: beside the label, in brackets.
                   Absent while the count is unknown, `(0)` where the segment
                   is empty — the two are not the same thing. -->
              <span v-if="segment.count !== null" class="segment-count jp-num">
                ({{ segment.count }})</span
              >
            </IonLabel>
          </IonSegmentButton>
        </IonSegment>
      </div>

      <!-- FR-21.15: the trip you are on, as a card rather than as one row
           among five. A hold or right-click opens the rows' menu on it too;
           its foot states the same actions besides. -->
      <TripHero
        v-if="heroTrip"
        class="hero-card"
        :name="heroTrip.name"
        :when="tripWhen(heroTrip)"
        :meta="heroMeta"
        :percent="tripDataKnown(heroTrip) ? progressPercent(heroTrip) : 0"
        :progress="tripDataKnown(heroTrip) ? itemSummary(heroTrip) : t('trips.itemsUnknown')"
        :to="tripPath(heroTrip.id)"
        :testid="`trip-hero-${heroTrip.name}`"
        @click.capture="onHeroClick"
        @contextmenu.prevent="openRowMenu(heroTrip!)"
        @pointerdown="(e: PointerEvent) => hold.down(heroTrip!, e.clientX, e.clientY)"
        @pointermove="(e: PointerEvent) => hold.move(e.clientX, e.clientY)"
        @pointerup="hold.cancel()"
        @pointercancel="hold.cancel()"
      >
        <TripChangeChips
          :trip-id="heroTrip.id"
          :name="heroTrip.name"
          :imported="heroTrip.imported"
          :proposed="proposedCount(heroTrip)"
          :applied="appliedChanges(heroTrip)"
          :expanded="expandedApplied === heroTrip.id"
          @toggle="toggleApplied(heroTrip.id)"
        />

        <template #foot>
          <!-- The same actions the row keeps behind its hold, stated. The
               trip a person packs daily is
               the last one whose export and share should be the hidden
               ones (FR-21.15). -->
          <IonButton
            v-for="entry in heroActions"
            :key="entry.id"
            fill="clear"
            size="small"
            :data-testid="`m2-hero-${entry.id}-${heroTrip.name}`"
            :aria-label="entry.label"
            @click.stop.prevent="entry.run()"
          >
            <IonIcon slot="icon-only" :icon="entry.icon" />
          </IonButton>
        </template>
      </TripHero>

      <!--
        Not here yet is not empty (ADR-033) — the guard the counts have
        (FR-2.8), on the screen. The same component *without* its
        illustration on purpose: that is what makes it a notice rather than
        the G-7 absence, and it keeps one spacing rule instead of adding a
        second loading layout beside it. The block does change height when
        the state settles — `EmptyState` drops the icon with a `v-if` — so
        this buys one component, not a still frame.
      -->
      <EmptyState
        v-if="isEmpty && !countsKnown"
        :title="t('trips.listUnknown')"
        testid="m2-list-loading"
      />

      <!-- Empty state (G-7) -->
      <EmptyState
        v-else-if="isEmpty"
        :icon="trainOutline"
        :title="
          filter === 'active'
            ? t('trips.emptyActive')
            : filter === 'planned'
              ? t('trips.emptyPlanned')
              : t('trips.emptyArchived')
        "
        testid="m2-empty"
      >
        <!-- Dev only, and gone from any build — see addSampleData. -->
        <IonButton
          v-if="isDev"
          size="small"
          fill="outline"
          data-testid="dev-sample-trip"
          @click="addSampleData"
        >
          Beispieldaten anlegen (Dev)
        </IonButton>
      </EmptyState>

      <!-- Trip list, grouped by series (FR-13.1) -->
      <IonList v-else class="trip-list">
        <template v-for="group in groupedTrips" :key="group.seriesId ?? 'none'">
          <!-- Series header → M16 -->
          <IonItem
            v-if="group.seriesId"
            button
            detail
            class="series-header"
            :data-testid="`series-header-${group.seriesName}`"
            :router-link="seriesPath(group.seriesId)"
          >
            <IonIcon slot="start" :icon="albumsOutline" />
            <IonLabel>
              <h2>{{ group.seriesName }}</h2>
              <p>{{ t('trips.seriesCount', { n: group.trips.length }) }}</p>
            </IonLabel>
          </IonItem>
          <div class="jp-card trip-card">
            <IonItem
              v-for="trip in group.trips"
              :key="trip.id"
              :ref="(el) => watchRow(el as Element | ComponentPublicInstance | null, trip.id)"
              button
              :data-testid="`trip-row-${trip.name}`"
              :class="{ archived: trip.status === TRIP_STATUS_ARCHIVED }"
              @click="openTrip(trip)"
              @contextmenu.prevent="openRowMenu(trip)"
              @pointerdown="(e: PointerEvent) => hold.down(trip, e.clientX, e.clientY)"
              @pointermove="(e: PointerEvent) => hold.move(e.clientX, e.clientY)"
              @pointerup="hold.cancel()"
              @pointercancel="hold.cancel()"
            >
              <div slot="start" class="progress-ring">
                <svg viewBox="0 0 36 36" class="ring-svg">
                  <circle class="ring-bg" cx="18" cy="18" r="15.5" fill="none" stroke-width="3" />
                  <circle
                    class="ring-fg"
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke-width="3"
                    :stroke="progressColor(trip)"
                    :stroke-dasharray="`${tripDataKnown(trip) ? progressPercent(trip) : 0} 100`"
                    stroke-linecap="round"
                  />
                  <!-- font-size is an SVG attribute, not CSS: inside viewBox="0 0 36 36"
                       it is 9 *user units*, a proportion of the ring, and a px token
                       from the type scale would be meaningless here. -->
                  <text x="18" y="20.5" font-size="9" class="ring-text">
                    {{ tripDataKnown(trip) ? `${progressPercent(trip)}%` : '·' }}
                  </text>
                </svg>
              </div>
              <IonLabel>
                <h2>{{ trip.name }}</h2>
                <!-- FR-2.1b: a trip may have both dates, one, or neither.
                     With neither, its year is what it is called by. -->
                <p data-testid="trip-when">{{ tripWhen(trip) }}</p>
                <p data-testid="trip-item-summary">
                  {{ tripDataKnown(trip) ? itemSummary(trip) : t('trips.itemsUnknown') }}
                </p>
                <TripChangeChips
                  :trip-id="trip.id"
                  :name="trip.name"
                  :imported="trip.imported"
                  :proposed="proposedCount(trip)"
                  :applied="appliedChanges(trip)"
                  :expanded="expandedApplied === trip.id"
                  @toggle="toggleApplied(trip.id)"
                />
              </IonLabel>
              <!-- FR-2.1/8.1: who the trip is for. The *roster*, not the
                     presence facepile, which G-10 keeps off this list. -->
              <div
                v-if="travelersOf(trip).length > 0"
                slot="end"
                class="traveler-faces"
                :data-testid="`m2-travelers-${trip.name}`"
              >
                <UserAvatar
                  v-for="traveler in shownTravelers(trip)"
                  :key="traveler.id"
                  :name="traveler.name"
                  :seed="traveler.id"
                  :size="20"
                  data-testid="m2-traveler-face"
                />
                <span
                  v-if="hiddenTravelers(trip) > 0"
                  class="traveler-more"
                  data-testid="m2-traveler-more"
                >
                  {{ t('trips.travelersMore', { n: hiddenTravelers(trip) }) }}
                </span>
              </div>
            </IonItem>
          </div>
        </template>
      </IonList>

      <!-- FAB: New Trip -->
      <IonFab
        :id="FAB_ANCHOR.m2"
        vertical="bottom"
        horizontal="end"
        slot="fixed"
        class="mobile-fab"
      >
        <IonFabButton
          data-testid="trips-new"
          :aria-label="t('trips.new')"
          :router-link="PATH.newTrip"
        >
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>
    </IonContent>
  </IonPage>
</template>

<style scoped>
/*
 * FR-2.8: the count beside the segment's label. Recessive by opacity rather
 * than by a colour of its own, so it follows the button through selected and
 * unselected instead of needing a token per state.
 */
.segment-count {
  opacity: 0.7;
}

/*
 * The bracketed count costs four characters, and it is the German
 * *ARCHIVIERT (29)* — the family's own archive — that has to fit at 390 px.
 * Measured rather than guessed: with Ionic's default padding the number was
 * cut off, and with the padding alone it still was. So the padding goes (the
 * same remedy as M21's deviation segment) and the segment takes one step
 * down the type scale, which is the last of these two the label can spend.
 */
ion-segment-button {
  --padding-start: 4px;
  --padding-end: 4px;
}

.segment-label,
.segment-count {
  font-size: var(--jp-text-xs);
}

.archived {
  opacity: 0.6;
}

/* The list is scaffolding, not a surface: each series is its own card
   on the page plane (G-14), so the list itself must not paint one. */
.trip-list {
  background: transparent;
  padding: 0 8px;
}

.trip-card {
  margin-bottom: 12px;
}

/* Aligned with the list's own gutter rather than with the page's: the hero
   is the head of that list, not a band above it. */
.hero-card {
  display: block;
  margin: 0 8px 12px;
  /* A hold is the row menu here, not the browser's link preview. */
  -webkit-touch-callout: none;
}

/* Rows inside a card still need a seam between them: the card gives the
   group an edge, not its entries. The last one's line is the card's own
   bottom edge, so Ionic's is removed — `ion-list` does this itself for a
   direct child, which a row inside a card is not. */
.trip-card ion-item:last-child {
  --inner-border-width: 0;
}

/* A series label belongs *above* its card, the way the concept prototype
   sets it — a header row inside the card would read as the first trip. */
.series-header {
  --background: transparent;
  --padding-start: 4px;
  font-weight: var(--jp-weight-semibold);
}

/* Progress ring */
.progress-ring {
  width: 44px;
  height: 44px;
  margin-right: 8px;
}

.ring-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-bg {
  stroke: var(--ion-color-light);
}

.ring-fg {
  transition: stroke-dasharray 0.3s;
}

.ring-text {
  text-anchor: middle;
  fill: var(--ion-text-color);
  transform: rotate(90deg);
  transform-origin: 18px 18px;
}

.traveler-faces {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}

/* The overflow bubble reads as one of the faces rather than as a chip: it is
   the rest of the same list, not a different fact about the trip. */
.traveler-more {
  color: var(--ct-subtext1);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
  margin-inline-start: 2px;
}

/* G-9: on desktop the FAB could be inline in header */
@media (min-width: 900px) {
  .mobile-fab {
    bottom: 24px;
    right: 24px;
  }
}
</style>
