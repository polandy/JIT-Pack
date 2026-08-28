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
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonButton,
  actionSheetController,
  alertController,
  onIonViewWillEnter,
} from '@ionic/vue'
import {
  addOutline,
  chevronDown,
  chevronUp,
  trainOutline,
  albumsOutline,
  archiveOutline,
  playOutline,
  cloudUploadOutline,
  copyOutline,
  documentTextOutline,
  downloadOutline,
  peopleOutline,
  trashOutline,
} from 'ionicons/icons'
import {
  ref,
  computed,
  inject,
  onMounted,
  onUnmounted,
  watch,
  type ComponentPublicInstance,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadTokens } from '@/auth/tokens'
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
import { describeAppliedChange } from '@/lib/refreshWording'
import { proposedChangeCount } from '@/domain/refresh'
import { useOnFirstVisible } from '@/composables/useOnFirstVisible'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { AppliedChange, Trip } from '@/types/domain'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import SearchRow from '@/components/global/SearchRow.vue'
import { tripOrderKey } from '@/domain/trips'
import { t, type MessageKey } from '@/i18n'
import { formatTripPeriod } from '@/lib/format'
import { presentToast } from '@/lib/toast'
import { useContextSearch } from '@/composables/useContextSearch'
import { setHeaderActions } from '@/composables/useHeaderActions'

const store = useTripStore()
const masterStore = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!
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
      return trip.status === 'active'
    case 'planned':
      return trip.status === 'planning'
    case 'archived':
      return trip.status === 'archived'
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
 * graph after a dev-server restart is enough — and the owner spent a session
 * on exactly that (2026-08-16): "vielleicht hab ich nicht gemerkt dass es nicht
 * funktionierte weil es kein feedback gab".
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
    router.push(`/trips/${outcome.tripId}`)
  } catch (error) {
    // Dev-only surface, so the message is the developer's — untranslated and
    // as specific as the failure was.
    console.error('sample data seeding failed', error)
    await report(`Beispieldaten fehlgeschlagen: ${(error as Error).message}`, 8000)
  }
}

async function report(message: string, duration = 4000) {
  await presentToast({ message, duration, positionAnchor: 'm2-fab-anchor' })
}

const {
  term: search,
  isOpen: searchOpen,
  toggle: toggleSearch,
  action,
  matches,
} = useContextSearch()
setHeaderActions(() => [action()])

/** The temporal line under a trip's name, whatever it actually knows (UX-5). */
const tripWhen = formatTripPeriod

/**
 * The search alone, without the segment: what M2 shows is one slice of this,
 * and each segment's count (FR-2.8) is the size of its own slice — which is
 * why the search is applied once, here, rather than by each of them.
 */
const searchedTrips = computed(() => store.tripList.filter((trip) => matches(trip.name)))

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
  filter.value = openingFilter(filter.value, countTripsByFilter(store.tripList))
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
  for (const trip of filteredTrips.value) {
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
  const k = store.kpis(trip.id)
  if (k.totalItems === 0) return 0
  return Math.round((k.packedItems / k.totalItems) * 100)
}

function progressColor(trip: Trip): string {
  const pct = progressPercent(trip)
  // Headway only ever runs the done ramp (G-11). It used to end at
  // peach below half, which now reads as the brand shouting at you for
  // not having packed yet.
  if (pct >= 100) return 'var(--jp-done)'
  return 'var(--jp-done-far)'
}

function itemSummary(trip: Trip): string {
  const k = store.kpis(trip.id)
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

function onFilterChange(event: CustomEvent) {
  filter.value = event.detail.value as FilterStatus
}

const router = useRouter()

// Share is omitted without an OIDC session — Single-User and Local
// Mode have no second account to share with (FR-17.3/FR-19.3/G-8).
const collaborative = localStorage.getItem('jitpack_mode') === 'server' && !!loadTokens()

// Delete is Owner-only (destructive, FR-4.5). Outside collaborative mode
// there is a single account that owns everything, so it's always allowed;
// in collaborative mode we check the roster against our own id.
const myUserId = ref<string | null>(null)
/**
 * FR-27.4: above this many changes the log folds away behind the chip.
 * Owner decision 2026-08-18 — a handful of lines is worth reading where it
 * happened, but M2 is the app's main entry and there is deliberately no
 * "seen" state, so an unbounded log would push every other trip down the
 * list until the busy one departs.
 */
const INLINE_LOG_LIMIT = 10

/** FR-27.4: the trip whose *foldable* applied-changes log is open, if any. */
const expandedApplied = ref<string | null>(null)

function toggleApplied(tripId: string) {
  expandedApplied.value = expandedApplied.value === tripId ? null : tripId
}

/** Whether this trip's log is long enough to hide behind the chip. */
function appliedFolds(trip: Trip): boolean {
  return appliedChanges(trip).length > INLINE_LOG_LIMIT
}

function appliedOpen(trip: Trip): boolean {
  return !appliedFolds(trip) || expandedApplied.value === trip.id
}

/**
 * What the refresh took over on this trip. No status rule any more: since the
 * owner's 2026-08-18 change a running trip takes changes over too, and only a
 * *past* one is frozen — which cannot produce entries in the first place, so
 * the record is simply whatever the log holds.
 */
function appliedChanges(trip: Trip): AppliedChange[] {
  return store.getAppliedChanges(trip.id)
}

/**
 * FR-27.4: how many changes are *waiting* on this trip. The chip is a
 * pointer, not a control — the decision belongs at the trip (owner,
 * 2026-08-18), and tapping the row is already the way there.
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
  if (collaborative) myUserId.value = (await orchestrator.fetchMe())?.user_id ?? null
})

function canDelete(trip: Trip): boolean {
  if (!collaborative) return true
  return store.getMembers(trip.id).some((m) => m.user_id === myUserId.value && m.role === 'owner')
}

/** Delete removes the trip entirely after an explicit confirm (M2). */
async function deleteTrip(trip: Trip) {
  const alert = await alertController.create({
    header: t('trips.deleteTitle', { name: trip.name }),
    message: t('trips.deleteMessage'),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('common.delete'), role: 'destructive' },
    ],
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role === 'destructive') orchestrator.deleteTrip(trip.id)
}

/** Start moves a planning trip into packing — see M4's onStart. */
function startTrip(tripId: string) {
  orchestrator.activateTrip(tripId)
}

/** Archive completes the trip and launches the M14 review (FR-9.2). */
function archiveTrip(tripId: string) {
  orchestrator.archiveTrip(tripId)
  router.push(`/trips/${tripId}/review`)
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
    items: store.getItems(trip.id),
    travelers: store.getTravelers(trip.id),
    containers: store.getContainers(trip.id),
    includeProgress: data,
    ...masterStore.portableResolvers(),
  })
  saveText(yaml, `${safeFilename(trip.name)}.yaml`)
}

async function handleRefresh(event: CustomEvent) {
  const refresher = event.target as HTMLIonRefresherElement
  const tripIds = store.tripList.map((t) => t.id)
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
        <div class="title-row">
          <h1 class="page-title jp-page-title">{{ t('trips.title') }}</h1>
          <div>
            <!-- M18: portable trip import (FR-18.4) -->
            <IonButton
              fill="clear"
              size="small"
              :aria-label="t('trips.importPortable')"
              data-testid="m2-portable-import"
              router-link="/portable-import"
            >
              <IonIcon slot="icon-only" :icon="documentTextOutline" />
            </IonButton>
            <!-- M15: legacy spreadsheet import (FR-16.1) -->
            <IonButton
              fill="clear"
              size="small"
              data-testid="m2-spreadsheet-import"
              :aria-label="t('items.importSpreadsheet')"
              router-link="/import"
            >
              <IonIcon slot="icon-only" :icon="cloudUploadOutline" />
            </IonButton>
          </div>
        </div>

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
              <!-- FR-2.8: a second line, because `Archived 129` truncates the
                   label before the number. Absent while the count is unknown,
                   `0` where the segment is empty — the two are not the same. -->
              <span v-if="segment.count !== null" class="segment-count jp-num">{{
                segment.count
              }}</span>
            </IonLabel>
          </IonSegmentButton>
        </IonSegment>
      </div>

      <!-- Empty state (G-7) -->
      <div v-if="isEmpty" class="empty-state">
        <IonIcon :icon="trainOutline" class="empty-icon" />
        <p v-if="filter === 'active'">{{ t('trips.emptyActive') }}</p>
        <p v-else-if="filter === 'planned'">{{ t('trips.emptyPlanned') }}</p>
        <p v-else>{{ t('trips.emptyArchived') }}</p>
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
      </div>

      <!-- Trip list, grouped by series (FR-13.1) -->
      <IonList v-else class="trip-list">
        <template v-for="group in groupedTrips" :key="group.seriesId ?? 'none'">
          <!-- Series header → M16 -->
          <IonItem
            v-if="group.seriesId"
            button
            detail
            class="series-header"
            :router-link="`/series/${group.seriesId}`"
          >
            <IonIcon slot="start" :icon="albumsOutline" />
            <IonLabel>
              <h2>{{ group.seriesName }}</h2>
              <p>{{ t('trips.seriesCount', { n: group.trips.length }) }}</p>
            </IonLabel>
          </IonItem>
          <div class="jp-card trip-card">
            <IonItemSliding v-for="trip in group.trips" :key="trip.id">
              <IonItem
                :ref="(el) => watchRow(el as Element | ComponentPublicInstance | null, trip.id)"
                button
                :data-testid="`trip-row-${trip.name}`"
                :router-link="`/trips/${trip.id}`"
                :class="{ archived: trip.status === 'archived' }"
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
                  <!-- FR-27.4: a trip follows its source groups until it is
                     past. The row says what it took over, because a list that
                     changed under you with no trace reads as data loss.
                     A short log is simply written out; a long one folds away,
                     so one busy trip cannot push the rest of the list off the
                     screen (owner, 2026-08-18). -->
                  <!-- FR-27.4: a group changed and this trip has not answered
                       yet. It says so and stops there — the two answers are
                       at the trip, where the list they change is. -->
                  <span
                    v-if="proposedCount(trip)"
                    class="chip proposed-chip"
                    :data-testid="`m2-proposed-chip-${trip.name}`"
                  >
                    {{ t('trips.proposedChip', { n: proposedCount(trip) }) }}
                  </span>
                  <div v-if="appliedChanges(trip).length" class="applied">
                    <button
                      v-if="appliedFolds(trip)"
                      class="chip applied-chip"
                      :data-testid="`m2-applied-chip-${trip.name}`"
                      :aria-expanded="expandedApplied === trip.id"
                      :aria-controls="`m2-applied-log-${trip.id}`"
                      @click.stop.prevent="toggleApplied(trip.id)"
                    >
                      {{ t('trips.appliedChip', { n: appliedChanges(trip).length }) }}
                      <IonIcon :icon="expandedApplied === trip.id ? chevronUp : chevronDown" />
                    </button>
                    <!-- A short log needs no control: the chip is then the
                       heading of what is already on screen, not a button that
                       reveals it. -->
                    <span
                      v-else
                      class="chip applied-chip static"
                      :data-testid="`m2-applied-chip-${trip.name}`"
                    >
                      {{ t('trips.appliedChip', { n: appliedChanges(trip).length }) }}
                    </span>
                    <div
                      v-if="appliedOpen(trip)"
                      :id="`m2-applied-log-${trip.id}`"
                      class="applied-log"
                      :data-testid="`m2-applied-log-${trip.name}`"
                    >
                      <p v-for="entry in appliedChanges(trip)" :key="entry.id">
                        {{ describeAppliedChange(entry) }}
                      </p>
                      <p class="frozen-note">{{ t('trips.appliedFrozen') }}</p>
                    </div>
                  </div>
                </IonLabel>
              </IonItem>

              <IonItemOptions side="end">
                <!-- FR-18.3: portable YAML export with progress choice -->
                <IonItemOption
                  color="tertiary"
                  :aria-label="t('trips.actionExport')"
                  @click="exportTrip(trip)"
                >
                  <IonIcon slot="icon-only" :icon="downloadOutline" />
                </IonItemOption>
                <!-- FR-4.5: member management (Share) -->
                <IonItemOption
                  v-if="collaborative"
                  color="secondary"
                  :data-testid="`m2-share-${trip.name}`"
                  :aria-label="t('trips.actionShare')"
                  @click="$router.push(`/trips/${trip.id}/members`)"
                >
                  <IonIcon slot="icon-only" :icon="peopleOutline" />
                </IonItemOption>
                <!-- FR-12.1: clone from archive -->
                <IonItemOption
                  v-if="trip.status === 'archived'"
                  color="primary"
                  :aria-label="t('trips.actionClone')"
                  @click="$router.push(`/trips/${trip.id}/clone`)"
                >
                  <IonIcon slot="icon-only" :icon="copyOutline" />
                </IonItemOption>
                <!-- Start: planning → active, the step that makes archiving
                     (and with it M14/M21) reachable at all. -->
                <IonItemOption
                  v-if="trip.status === 'planning'"
                  color="primary"
                  :aria-label="t('trips.actionStart')"
                  @click="startTrip(trip.id)"
                >
                  <IonIcon slot="icon-only" :icon="playOutline" />
                </IonItemOption>
                <!-- Archive → M14 review (FR-9.2) -->
                <IonItemOption
                  v-else-if="trip.status === 'active'"
                  color="medium"
                  :aria-label="t('trips.actionArchive')"
                  @click="archiveTrip(trip.id)"
                >
                  <IonIcon slot="icon-only" :icon="archiveOutline" />
                </IonItemOption>
                <!-- Delete (destructive, Owner-only FR-4.5) -->
                <IonItemOption
                  v-if="canDelete(trip)"
                  color="danger"
                  :aria-label="t('trips.actionDelete')"
                  @click="deleteTrip(trip)"
                >
                  <IonIcon slot="icon-only" :icon="trashOutline" />
                </IonItemOption>
              </IonItemOptions>
            </IonItemSliding>
          </div>
        </template>
      </IonList>

      <!-- FAB: New Trip -->
      <IonFab id="m2-fab-anchor" vertical="bottom" horizontal="end" slot="fixed" class="mobile-fab">
        <IonFabButton data-testid="trips-new" :aria-label="t('trips.new')" router-link="/trips/new">
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>
    </IonContent>
  </IonPage>
</template>

<style scoped>
/*
 * FR-2.8: the count under the segment's label. Recessive by opacity rather
 * than by a colour of its own, so it follows the button through selected and
 * unselected instead of needing a token per state.
 */
.segment-count {
  display: block;
  font-size: var(--jp-text-2xs);
  opacity: 0.7;
}

.page-title {
  margin: 16px 0 16px;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--ion-color-medium);
}

.empty-icon {
  font-size: var(--jp-icon-2xl);
  margin-bottom: 16px;
}

.archived {
  opacity: 0.6;
}

/* The list is scaffolding now, not a surface: each series is its own card
   on the page plane (G-14), so the list itself must not paint one. */
.trip-list {
  background: transparent;
  padding: 0 8px;
}

.trip-card {
  margin-bottom: 12px;
}

/* Rows inside a card still need a seam between them: the card gives the
   group an edge, not its entries. The last one's line is the card's own
   bottom edge, so Ionic's is removed — `ion-list` does this itself for a
   direct child, which a row inside a card is not. */
.trip-card ion-item-sliding:last-child ion-item {
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

/* FR-27.4: the applied-changes chip and its log. When it folds, it is an
   action inside a row that is itself a link, so it stops the tap — expanding
   the log must not also open the trip. When it does not fold, it is a label
   for the lines already below it and takes no interaction at all. */
.applied {
  margin-top: 6px;
}

.proposed-chip {
  background: color-mix(in srgb, var(--jp-brand) 18%, transparent);
  border-radius: var(--jp-r2);
  color: var(--jp-brand);
  display: inline-flex;
  margin-top: 6px;
  padding: 2px 8px;
}

.applied-chip {
  align-items: center;
  background: var(--jp-surface-sunken);
  color: var(--jp-action);
  border: none;
  border-radius: var(--jp-r2);
  display: inline-flex;
  gap: 4px;
  padding: 2px 8px;
}

.applied-chip ion-icon {
  font-size: var(--jp-icon-xs);
}

/* Nothing to press, so nothing that looks pressable. */
.applied-chip.static {
  cursor: default;
}

.applied-log {
  margin-top: 6px;
  color: var(--ct-subtext0);
}

.applied-log .frozen-note {
  color: var(--ct-overlay1);
}

/* G-9: on desktop the FAB could be inline in header */
@media (min-width: 900px) {
  .mobile-fab {
    bottom: 24px;
    right: 24px;
  }
}
</style>
