<script setup lang="ts">
/**
 * M12 — Analytics (FR-8.1/8.2/10.4/14.3)
 *
 * Dimension switcher Person/Category/Container with a stacked bar per
 * dimension value (packed vs. planned weight) and value totals; items
 * without weight metadata appear as "unweighted (n)" so totals stay
 * honest. Tapping a slice opens M4 grouped by that dimension. The
 * trend section shows the series' archived weight history and the most
 * frequently Missing/Unused items — with whatever history is synced.
 */
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonBackButton,
  IonButtons,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonNote,
} from '@ionic/vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  analyzeByDimension,
  seriesWeightTrend,
  topFlagged,
  type AnalyticsDimension,
} from '@/domain/analytics'
import { useTripStore } from '@/stores/tripStore'
import type { GroupBy } from '@/types/domain'

const props = defineProps<{ tripId: string }>()

const router = useRouter()
const store = useTripStore()

const trip = computed(() => store.getTrip(props.tripId))
const dimension = ref<AnalyticsDimension>('category')

const slices = computed(() =>
  analyzeByDimension(store.getItems(props.tripId), dimension.value, {
    travelers: store.getTravelers(props.tripId),
    containers: store.getContainers(props.tripId),
  }),
)

const maxPlanned = computed(() =>
  Math.max(1, ...slices.value.map((s) => s.plannedWeight)),
)

// --- Trends (FR-14.3) ---
const trend = computed(() => {
  const seriesId = trip.value?.series_id
  if (!seriesId) return []
  return seriesWeightTrend(store.tripList, (id) => store.getItems(id), seriesId)
})

const maxTrend = computed(() => Math.max(1, ...trend.value.map((t) => t.plannedWeight)))

const mostMissing = computed(() => topFlagged(store.tripList, (id) => store.getItems(id), 'missing'))
const mostUnused = computed(() => topFlagged(store.tripList, (id) => store.getItems(id), 'unused'))

function openSlice() {
  // M4 filtered to the slice: approximated by grouping M4 by the
  // active dimension (per-slice deep filters are not built yet).
  store.setGroupBy(props.tripId, dimension.value as GroupBy)
  router.push(`/trips/${props.tripId}`)
}

function formatWeight(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${grams} g`
}

function formatValue(cents: number): string {
  return (cents / 100).toFixed(2)
}

function yearOf(date: string | null): string {
  return date ? date.slice(0, 4) : '—'
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton :default-href="`/trips/${tripId}`" />
        </IonButtons>
        <IonTitle>Analytics · {{ trip?.name ?? '' }}</IonTitle>
      </IonToolbar>
      <IonToolbar>
        <IonSegment
          :value="dimension"
          @ionChange="(e: CustomEvent) => (dimension = e.detail.value)"
        >
          <IonSegmentButton value="person"><IonLabel>Person</IonLabel></IonSegmentButton>
          <IonSegmentButton value="category"><IonLabel>Category</IonLabel></IonSegmentButton>
          <IonSegmentButton value="container"><IonLabel>Container</IonLabel></IonSegmentButton>
        </IonSegment>
      </IonToolbar>
    </IonHeader>

    <IonContent class="ion-padding">
      <!-- Dimension slices (FR-8.2) -->
      <div v-if="slices.length > 0" class="slices">
        <button v-for="slice in slices" :key="slice.key" class="slice" @click="openSlice()">
          <div class="slice-head">
            <span class="slice-label">{{ slice.label }}</span>
            <span class="slice-weight">
              {{ formatWeight(slice.packedWeight) }} / {{ formatWeight(slice.plannedWeight) }}
            </span>
          </div>
          <div class="bar">
            <div class="bar-planned" :style="{ width: `${(slice.plannedWeight / maxPlanned) * 100}%` }">
              <div
                class="bar-packed"
                :style="{ width: slice.plannedWeight > 0 ? `${(slice.packedWeight / slice.plannedWeight) * 100}%` : '0%' }"
              />
            </div>
          </div>
          <div class="slice-foot">
            <span v-if="slice.totalValue > 0">Value {{ formatValue(slice.totalValue) }}</span>
            <span v-if="slice.unweightedCount > 0" class="unweighted">
              unweighted ({{ slice.unweightedCount }} item{{ slice.unweightedCount === 1 ? '' : 's' }})
            </span>
          </div>
        </button>
      </div>
      <div v-else class="empty-hint">No items yet — nothing to analyze.</div>

      <!-- Series trends (FR-14.3) -->
      <template v-if="trend.length > 0">
        <h2 class="section-title">Series weight over the years</h2>
        <div class="trend">
          <div v-for="point in trend" :key="point.tripId" class="trend-row">
            <span class="trend-year">{{ yearOf(point.startDate) }}</span>
            <div class="bar trend-bar">
              <div class="bar-planned" :style="{ width: `${(point.plannedWeight / maxTrend) * 100}%` }" />
            </div>
            <span class="trend-weight">{{ formatWeight(point.plannedWeight) }}</span>
          </div>
        </div>
      </template>

      <template v-if="mostMissing.length > 0 || mostUnused.length > 0">
        <div class="flag-columns">
          <div v-if="mostMissing.length > 0">
            <h2 class="section-title">Most often missing</h2>
            <p v-for="f in mostMissing" :key="f.name" class="flag-row">
              {{ f.name }} <span class="flag-count">×{{ f.count }}</span>
            </p>
          </div>
          <div v-if="mostUnused.length > 0">
            <h2 class="section-title">Consistently unused</h2>
            <p v-for="f in mostUnused" :key="f.name" class="flag-row">
              {{ f.name }} <span class="flag-count">×{{ f.count }}</span>
            </p>
          </div>
        </div>
        <IonNote>Based on the archived trips synced to this device.</IonNote>
      </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.slices {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.slice {
  background: none;
  border: none;
  text-align: left;
  padding: 0;
  cursor: pointer;
  color: inherit;
}

.slice-head,
.slice-foot {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
}

.slice-label {
  font-weight: 600;
}

.slice-weight,
.slice-foot {
  color: var(--ion-color-medium);
}

.bar {
  height: 14px;
  border-radius: 7px;
  background: var(--ion-color-light, #eee);
  overflow: hidden;
  margin: 4px 0;
}

.bar-planned {
  height: 100%;
  border-radius: 7px;
  background: var(--ion-color-primary-tint, #7aa7e0);
  overflow: hidden;
}

.bar-packed {
  height: 100%;
  background: var(--ion-color-primary, #3b6fb5);
}

.unweighted {
  font-style: italic;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 24px 0 8px;
}

.trend-row {
  display: grid;
  grid-template-columns: 48px 1fr 72px;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 0.85rem;
}

.trend-year {
  color: var(--ion-color-medium);
}

.trend-weight {
  text-align: right;
  color: var(--ion-color-medium);
}

.flag-columns {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
}

.flag-row {
  margin: 2px 0;
  font-size: 0.9rem;
}

.flag-count {
  color: var(--ion-color-medium);
}

.empty-hint {
  color: var(--ion-color-medium);
}
</style>
