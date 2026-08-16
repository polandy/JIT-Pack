<script setup lang="ts">
/**
 * M2 — Trip List
 *
 * Overview and entry to all trips. Segmented filter Active/Planned/Archived,
 * per-trip progress ring, FAB for new trip, pull-to-refresh.
 */
import {
  toastController,
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
} from '@ionic/vue'
import {
  addOutline,
  trainOutline,
  albumsOutline,
  archiveOutline,
  cloudUploadOutline,
  copyOutline,
  documentTextOutline,
  downloadOutline,
  peopleOutline,
  trashOutline,
} from 'ionicons/icons'
import { ref, computed, inject, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { loadTokens } from '@/auth/tokens'
import { serializeTrip } from '@/domain/portable'
import { safeFilename, saveText } from '@/lib/download'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { Trip } from '@/types/domain'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import SearchRow from '@/components/global/SearchRow.vue'
import { tripOrderKey } from '@/domain/trips'
import { t } from '@/i18n'
import { useContextSearch } from '@/composables/useContextSearch'
import { setHeaderActions } from '@/composables/useHeaderActions'

const store = useTripStore()
const masterStore = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

// Map DB 'planning' to display filter 'planned' for UI clarity
type FilterStatus = 'active' | 'planned' | 'archived'
const filter = ref<FilterStatus>('active')

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
  const toast = await toastController.create({
    message,
    duration,
    position: 'bottom',
    positionAnchor: 'm2-fab-anchor',
  })
  await toast.present()
}

const {
  term: search,
  isOpen: searchOpen,
  toggle: toggleSearch,
  action,
  matches,
} = useContextSearch()
setHeaderActions(() => [action()])

/** The temporal line under a trip's name, whatever it actually knows. */
function tripWhen(trip: Trip): string {
  if (trip.start_date && trip.end_date) return `${trip.start_date} – ${trip.end_date}`
  if (trip.end_date) return t('trip.until', { date: trip.end_date })
  if (trip.start_date) return t('trip.from', { date: trip.start_date })
  return String(trip.year)
}

const filteredTrips = computed(() =>
  store.tripList
    .filter((trip) => matchesFilter(trip) && matches(trip.name))
    // Newest first (Addendum, M2 default ordering). The key survives a
    // trip that has only its year (FR-2.1b), which a raw date compare did
    // not — it put such a trip wherever the sort happened to leave it.
    .sort((a, b) => tripOrderKey(b).localeCompare(tripOrderKey(a))),
)
const isEmpty = computed(() => filteredTrips.value.length === 0)

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
        seriesName: key ? (masterStore.getSeries(key)?.name ?? 'Series') : null,
        trips: [],
      })
    }
    groups[index.get(key)!]!.trips.push(trip)
  }
  return groups.sort((a, b) => Number(a.seriesId === null) - Number(b.seriesId === null))
})

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
  return `${k.packedItems}/${k.totalItems} packed`
}

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
    header: `Delete "${trip.name}"?`,
    message:
      'This permanently removes the trip and its packing list, travelers and containers for everyone. This cannot be undone.',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Delete', role: 'destructive' },
    ],
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role === 'destructive') orchestrator.deleteTrip(trip.id)
}

/** Archive completes the trip and launches the M14 review (FR-9.2). */
function archiveTrip(tripId: string) {
  orchestrator.archiveTrip(tripId)
  router.push(`/trips/${tripId}/review`)
}

/** FR-18.3: the user chooses progress vs clean; generated client-side. */
async function exportTrip(trip: Trip) {
  const sheet = await actionSheetController.create({
    header: `Export "${trip.name}"`,
    buttons: [
      { text: 'With pack progress', data: true },
      { text: 'Clean list (unpacked)', data: false },
      { text: 'Cancel', role: 'cancel' },
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
          <h1 class="page-title jp-page-title">Trips</h1>
          <div>
            <!-- M18: portable trip import (FR-18.4) -->
            <IonButton
              fill="clear"
              size="small"
              aria-label="Import trip from file"
              router-link="/portable-import"
            >
              <IonIcon slot="icon-only" :icon="documentTextOutline" />
            </IonButton>
            <!-- M15: legacy spreadsheet import (FR-16.1) -->
            <IonButton
              fill="clear"
              size="small"
              aria-label="Import spreadsheet"
              router-link="/import"
            >
              <IonIcon slot="icon-only" :icon="cloudUploadOutline" />
            </IonButton>
          </div>
        </div>

        <IonSegment :value="filter" @ionChange="onFilterChange">
          <IonSegmentButton value="active" data-testid="trips-filter-active">
            <IonLabel>Active</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="planned" data-testid="trips-filter-planned">
            <IonLabel>Planned</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="archived" data-testid="trips-filter-archived">
            <IonLabel>Archived</IonLabel>
          </IonSegmentButton>
        </IonSegment>
      </div>

      <!-- Empty state (G-7) -->
      <div v-if="isEmpty" class="empty-state">
        <IonIcon :icon="trainOutline" class="empty-icon" />
        <p v-if="filter === 'active'">No active trips</p>
        <p v-else-if="filter === 'planned'">No planned trips</p>
        <p v-else>No archived trips</p>
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
              <p>{{ group.trips.length }} trip{{ group.trips.length === 1 ? '' : 's' }}</p>
            </IonLabel>
          </IonItem>
          <div class="jp-card trip-card">
            <IonItemSliding v-for="trip in group.trips" :key="trip.id">
              <IonItem
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
                      :stroke-dasharray="`${progressPercent(trip)} 100`"
                      stroke-linecap="round"
                    />
                    <!-- font-size is an SVG attribute, not CSS: inside viewBox="0 0 36 36"
                       it is 9 *user units*, a proportion of the ring, and a px token
                       from the type scale would be meaningless here. -->
                    <text x="18" y="20.5" font-size="9" class="ring-text">
                      {{ progressPercent(trip) }}%
                    </text>
                  </svg>
                </div>
                <IonLabel>
                  <h2>{{ trip.name }}</h2>
                  <!-- FR-2.1b: a trip may have both dates, one, or neither.
                     With neither, its year is what it is called by. -->
                  <p data-testid="trip-when">{{ tripWhen(trip) }}</p>
                  <p>{{ itemSummary(trip) }}</p>
                </IonLabel>
              </IonItem>

              <IonItemOptions side="end">
                <!-- FR-18.3: portable YAML export with progress choice -->
                <IonItemOption color="tertiary" aria-label="Export trip" @click="exportTrip(trip)">
                  <IonIcon slot="icon-only" :icon="downloadOutline" />
                </IonItemOption>
                <!-- FR-4.5: member management (Share) -->
                <IonItemOption
                  v-if="collaborative"
                  color="secondary"
                  aria-label="Share"
                  @click="$router.push(`/trips/${trip.id}/members`)"
                >
                  <IonIcon slot="icon-only" :icon="peopleOutline" />
                </IonItemOption>
                <!-- FR-12.1: clone from archive -->
                <IonItemOption
                  v-if="trip.status === 'archived'"
                  color="primary"
                  aria-label="Clone trip"
                  @click="$router.push(`/trips/${trip.id}/clone`)"
                >
                  <IonIcon slot="icon-only" :icon="copyOutline" />
                </IonItemOption>
                <!-- Archive → M14 review (FR-9.2) -->
                <IonItemOption
                  v-else-if="trip.status === 'active'"
                  color="medium"
                  aria-label="Archive trip"
                  @click="archiveTrip(trip.id)"
                >
                  <IonIcon slot="icon-only" :icon="archiveOutline" />
                </IonItemOption>
                <!-- Delete (destructive, Owner-only FR-4.5) -->
                <IonItemOption
                  v-if="canDelete(trip)"
                  color="danger"
                  aria-label="Delete trip"
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
        <IonFabButton data-testid="trips-new" aria-label="New trip" router-link="/trips/new">
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>
    </IonContent>
  </IonPage>
</template>

<style scoped>
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

/* G-9: on desktop the FAB could be inline in header */
@media (min-width: 900px) {
  .mobile-fab {
    bottom: 24px;
    right: 24px;
  }
}
</style>
