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
} from '@ionic/vue'
import { addOutline, airplaneOutline, archiveOutline } from 'ionicons/icons'
import { ref, computed } from 'vue'
import type { Trip, TripStatus } from '@/types/domain'

const filter = ref<TripStatus>('active')
const trips = ref<Trip[]>([])
const loading = ref(false)

const filteredTrips = computed(() =>
  trips.value.filter((t) => t.status === filter.value),
)

const isEmpty = computed(() => filteredTrips.value.length === 0 && !loading.value)

function progressPercent(trip: Trip): number {
  if (trip.item_count === 0) return 0
  return Math.round((trip.packed_count / trip.item_count) * 100)
}

function progressColor(trip: Trip): string {
  const pct = progressPercent(trip)
  if (pct >= 100) return 'var(--ion-color-success)'
  if (pct >= 50) return 'var(--ion-color-primary)'
  return 'var(--ion-color-warning)'
}

function onFilterChange(event: CustomEvent) {
  filter.value = event.detail.value as TripStatus
}

async function handleRefresh(event: CustomEvent) {
  const refresher = event.target as HTMLIonRefresherElement
  // Placeholder: await sync
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
        <h1 class="page-title">Trips</h1>

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

      <!-- Trip list -->
      <IonList v-else>
        <IonItemSliding v-for="trip in filteredTrips" :key="trip.id">
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
              <p v-if="trip.start_date">
                {{ trip.start_date }}
                <span v-if="trip.end_date"> &ndash; {{ trip.end_date }}</span>
              </p>
              <p>{{ trip.packed_count }}/{{ trip.item_count }} packed</p>
            </IonLabel>
          </IonItem>

          <IonItemOptions side="end">
            <IonItemOption color="medium">
              <IonIcon slot="icon-only" :icon="archiveOutline" />
            </IonItemOption>
          </IonItemOptions>
        </IonItemSliding>
      </IonList>

      <!-- FAB: New Trip -->
      <IonFab vertical="bottom" horizontal="end" slot="fixed" class="mobile-fab">
        <IonFabButton aria-label="New trip">
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

/* G-9: on desktop the FAB could be inline in header;
   for now keep it but adjust position */
@media (min-width: 900px) {
  .mobile-fab {
    bottom: 24px;
    right: 24px;
  }
}
</style>
