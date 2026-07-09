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
} from '@ionic/vue'
import { addOutline, airplaneOutline, albumsOutline, archiveOutline, cloudUploadOutline, copyOutline } from 'ionicons/icons'
import { ref, computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { Trip, TripStatus } from '@/types/domain'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const store = useTripStore()
const masterStore = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

// Map DB 'planning' to display filter 'planned' for UI clarity
type FilterStatus = 'active' | 'planned' | 'archived'
const filter = ref<FilterStatus>('active')

function matchesFilter(trip: Trip): boolean {
  switch (filter.value) {
    case 'active': return trip.status === 'active' || trip.status === 'repack'
    case 'planned': return trip.status === 'planning'
    case 'archived': return trip.status === 'archived'
  }
}

const filteredTrips = computed(() => store.tripList.filter(matchesFilter))
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
    groups[index.get(key)!].trips.push(trip)
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
  if (pct >= 100) return 'var(--ion-color-success)'
  if (pct >= 50) return 'var(--ion-color-primary)'
  return 'var(--ion-color-warning)'
}

function itemSummary(trip: Trip): string {
  const k = store.kpis(trip.id)
  return `${k.packedItems}/${k.totalItems} packed`
}

function onFilterChange(event: CustomEvent) {
  filter.value = event.detail.value as FilterStatus
}

const router = useRouter()

/** Archive completes the trip and launches the M14 review (FR-9.2). */
function archiveTrip(tripId: string) {
  orchestrator.archiveTrip(tripId)
  router.push(`/trips/${tripId}/review`)
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

      <div class="ion-padding">
        <div class="title-row">
          <h1 class="page-title">Trips</h1>
          <!-- M15: legacy spreadsheet import (FR-16.1) -->
          <IonButton fill="clear" size="small" aria-label="Import spreadsheet" router-link="/import">
            <IonIcon slot="icon-only" :icon="cloudUploadOutline" />
          </IonButton>
        </div>

        <IonSegment :value="filter" @ionChange="onFilterChange">
          <IonSegmentButton value="active">
            <IonLabel>Active</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="planned">
            <IonLabel>Planned</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="archived">
            <IonLabel>Archived</IonLabel>
          </IonSegmentButton>
        </IonSegment>
      </div>

      <!-- Empty state (G-7) -->
      <div v-if="isEmpty" class="empty-state">
        <IonIcon :icon="airplaneOutline" class="empty-icon" />
        <p v-if="filter === 'active'">No active trips</p>
        <p v-else-if="filter === 'planned'">No planned trips</p>
        <p v-else>No archived trips</p>
      </div>

      <!-- Trip list, grouped by series (FR-13.1) -->
      <IonList v-else>
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
        <IonItemSliding v-for="trip in group.trips" :key="trip.id">
          <IonItem
            button
            :router-link="`/trips/${trip.id}`"
            :class="{ archived: trip.status === 'archived' }"
          >
            <div slot="start" class="progress-ring">
              <svg viewBox="0 0 36 36" class="ring-svg">
                <circle
                  class="ring-bg"
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke-width="3"
                />
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
                <text x="18" y="20.5" class="ring-text">
                  {{ progressPercent(trip) }}%
                </text>
              </svg>
            </div>
            <IonLabel>
              <h2>{{ trip.name }}</h2>
              <p>
                <template v-if="trip.start_date">
                  {{ trip.start_date }} &ndash; {{ trip.end_date }}
                </template>
                <template v-else>until {{ trip.end_date }}</template>
              </p>
              <p>{{ itemSummary(trip) }}</p>
            </IonLabel>
          </IonItem>

          <IonItemOptions side="end">
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
          </IonItemOptions>
        </IonItemSliding>
        </template>
      </IonList>

      <!-- FAB: New Trip -->
      <IonFab vertical="bottom" horizontal="end" slot="fixed" class="mobile-fab">
        <IonFabButton aria-label="New trip" router-link="/trips/new">
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.page-title {
  font-size: 1.8rem;
  font-weight: 700;
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
  font-size: 64px;
  margin-bottom: 16px;
}

.archived {
  opacity: 0.6;
}

.series-header {
  --background: var(--ion-color-light, #f4f5f8);
  font-weight: 600;
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
  font-size: 9px;
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
