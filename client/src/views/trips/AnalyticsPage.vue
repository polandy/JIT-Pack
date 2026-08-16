<script setup lang="ts">
/**
 * M12 — Analytics (FR-8.1/8.2/10.4/14.3), rebuilt on the concept round of
 * 2026-08-08 (dev-docs/UI_Concept_Prototype.html).
 *
 * Dimension switcher Person/Kategorie/Gepäck with a packed-in-planned bar
 * per dimension value; items without weight metadata stay out of the bars
 * and are counted honestly beside them. Tapping a bar makes that value the
 * FR-25.11 facet and opens M4 grouped to match, so the number tapped is
 * the list that appears — the pre-rebuild version only set the grouping,
 * and the tapped number was nowhere on screen. The trend section shows the
 * series' packed weight over the years and its most-flagged items, with
 * whatever history is synced.
 */
import { IonPage, IonContent, IonSegment, IonSegmentButton, IonLabel, IonNote } from '@ionic/vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  analyzeTrip,
  seriesTopFlagged,
  seriesWeightTrend,
  type AnalyticsDimension,
  type DimensionSlice,
} from '@/domain/analytics'
import { t } from '@/i18n'
import { formatWeight } from '@/lib/format'
import { useTripStore } from '@/stores/tripStore'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { setStoredFacet, setStoredGroupBy } from '@/composables/usePackingFilter'

const props = defineProps<{ tripId: string }>()

const router = useRouter()
const store = useTripStore()

const trip = computed(() => store.getTrip(props.tripId))
const dimension = ref<AnalyticsDimension>('category')

const analysis = computed(() =>
  analyzeTrip(store.getItems(props.tripId), dimension.value, {
    travelers: store.getTravelers(props.tripId),
    containers: store.getContainers(props.tripId),
  }),
)

const maxPlanned = computed(() => Math.max(1, ...analysis.value.slices.map((s) => s.plannedWeight)))

/** The absence bucket is UI copy, per facet convention (FR-25.11f/g). */
function sliceLabel(slice: DimensionSlice): string {
  if (slice.label !== null) return slice.label
  switch (dimension.value) {
    case 'person':
      return t('facet.shared')
    case 'category':
      return t('facet.noCategory')
    case 'container':
      return t('facet.noLuggage')
  }
}

/**
 * The tapped bar becomes the one facet in force and the grouping follows,
 * so the slice sits together on arrival (FR-25.11/25.18). Both writes land
 * before the navigation — M4 is still mounted behind this page (ADR-012).
 */
function openSlice(slice: DimensionSlice) {
  setStoredFacet(props.tripId, dimension.value, slice.key)
  setStoredGroupBy(props.tripId, dimension.value)
  router.push(`/trips/${props.tripId}`)
}

// --- Series trends (FR-14.3) ---

const trend = computed(() => {
  const seriesId = trip.value?.series_id
  if (!seriesId) return []
  return seriesWeightTrend(store.tripList, (id) => store.getItems(id), seriesId)
})

const maxTrend = computed(() => Math.max(1, ...trend.value.map((p) => p.packedWeight)))

const flagged = computed(() => {
  const seriesId = trip.value?.series_id
  if (!seriesId) return []
  return seriesTopFlagged(store.tripList, (id) => store.getItems(id), seriesId)
})

function formatValue(cents: number): string {
  return (cents / 100).toFixed(2)
}

function kilos(grams: number): string {
  return (grams / 1000).toFixed(1)
}

function yearOf(date: string | null): string {
  return date ? date.slice(0, 4) : '—'
}

// ADR-011: the one header bar renders this page's title.
setHeaderTitle(() => `${t('packing.analytics')} · ${trip.value?.name ?? ''}`)
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <!-- ADR-011: a view switcher is page content, not header chrome. -->
      <IonSegment :value="dimension" @ionChange="(e: CustomEvent) => (dimension = e.detail.value)">
        <IonSegmentButton value="person" data-testid="analytics-dim-person"
          ><IonLabel>{{ t('facet.person') }}</IonLabel></IonSegmentButton
        >
        <IonSegmentButton value="category" data-testid="analytics-dim-category"
          ><IonLabel>{{ t('facet.category') }}</IonLabel></IonSegmentButton
        >
        <IonSegmentButton value="container" data-testid="analytics-dim-container"
          ><IonLabel>{{ t('facet.container') }}</IonLabel></IonSegmentButton
        >
      </IonSegment>

      <p class="hint">{{ t('analytics.hint') }}</p>

      <!-- Dimension slices (FR-8.2) -->
      <div class="jp-card slice-card">
        <template v-if="analysis.slices.length > 0">
          <button
            v-for="slice in analysis.slices"
            :key="slice.key"
            class="abar-row"
            :data-testid="`analytics-slice-${slice.key || 'none'}`"
            @click="openSlice(slice)"
          >
            <span class="lbl">{{ sliceLabel(slice) }}</span>
            <span class="abar-wrap">
              <span class="abar" :style="{ width: `${(slice.plannedWeight / maxPlanned) * 100}%` }">
                <i
                  :style="{
                    width:
                      slice.plannedWeight > 0
                        ? `${(slice.packedWeight / slice.plannedWeight) * 100}%`
                        : '0%',
                  }"
                />
              </span>
            </span>
            <span class="akg jp-num">
              {{ formatWeight(slice.packedWeight) }}
              <small>/ {{ formatWeight(slice.plannedWeight) }}</small>
            </span>
          </button>
        </template>
        <div v-else class="empty-hint" data-testid="analytics-empty">
          {{ t('analytics.empty') }}
        </div>
      </div>

      <p v-if="analysis.unweightedCount > 0" class="unweighted" data-testid="analytics-unweighted">
        {{ t('analytics.unweighted', { n: analysis.unweightedCount }) }}
      </p>

      <!-- Trip totals (FR-8.1) -->
      <div class="kpis">
        <div class="jp-card kpi" data-testid="analytics-kpi-weight">
          <div class="jp-figure kpi-n">
            {{ formatWeight(analysis.packedWeight) }}
            <span class="kpi-of">/ {{ formatWeight(analysis.plannedWeight) }}</span>
          </div>
          <div class="kpi-l">{{ t('analytics.kpiWeight') }}</div>
        </div>
        <div class="jp-card kpi" data-testid="analytics-kpi-value">
          <div class="jp-figure kpi-n">{{ formatValue(analysis.totalValue) }}</div>
          <div class="kpi-l">{{ t('analytics.kpiValue') }}</div>
        </div>
      </div>

      <!-- Series trend (FR-14.3) -->
      <template v-if="trend.length > 0">
        <h2 class="section-title jp-eyebrow">
          {{ t('analytics.trendTitle', { name: trip?.series_name ?? trip?.name ?? '' }) }}
        </h2>
        <div class="jp-card trend-card" data-testid="analytics-trend">
          <div class="trend">
            <div v-for="point in trend" :key="point.tripId" class="col">
              <b class="jp-num">{{ kilos(point.packedWeight) }}</b>
              <span
                class="bar"
                :style="{ height: `${20 + (point.packedWeight / maxTrend) * 44}px` }"
              />
              <span class="year">{{ yearOf(point.startDate) }}</span>
            </div>
          </div>
          <div class="trend-caption">{{ t('analytics.trendCaption') }}</div>
        </div>
      </template>

      <template v-if="flagged.length > 0">
        <h2 class="section-title jp-eyebrow">{{ t('analytics.flaggedTitle') }}</h2>
        <div class="jp-card" data-testid="analytics-flagged">
          <div v-for="f in flagged" :key="`${f.flag}:${f.name}`" class="flagrow">
            <span class="dot" :class="f.flag" />
            <span class="name">{{ f.name }}</span>
            <span class="flag-chip jp-num" :class="f.flag">
              {{
                t(f.flag === 'unused' ? 'analytics.flagUnused' : 'analytics.flagMissing', {
                  n: f.count,
                })
              }}
            </span>
          </div>
        </div>
        <IonNote class="history-note">{{ t('analytics.historyNote') }}</IonNote>
      </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.hint {
  margin: 12px 4px 8px;
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext0);
}

.slice-card {
  padding: 6px 14px;
}

.abar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 0;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  text-align: left;
}

.abar-row + .abar-row {
  border-top: 1px solid var(--jp-surface-border);
}

.abar-row .lbl {
  width: 88px;
  flex: none;
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.abar-wrap {
  flex: 1;
  min-width: 0;
}

.abar {
  display: block;
  height: 20px;
  border-radius: var(--jp-r-sm);
  background: var(--jp-surface-sunken);
  overflow: hidden;
  min-width: 6px;
}

.abar i {
  display: block;
  height: 100%;
  border-radius: var(--jp-r-sm);
  background: linear-gradient(90deg, var(--jp-done-far), var(--jp-done));
}

.abar-row .akg {
  width: 92px;
  flex: none;
  text-align: right;
  font-size: var(--jp-text-2xs);
  font-weight: var(--jp-weight-bold);
  color: var(--ct-subtext1);
}

.abar-row .akg small {
  font-size: var(--jp-text-2xs);
  font-weight: var(--jp-weight-semibold);
  color: var(--ct-overlay1);
}

.unweighted {
  margin: 8px 4px 0;
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext0);
}

.kpis {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.kpi {
  flex: 1;
  padding: 13px;
  text-align: center;
}

.kpi-of {
  font-size: var(--jp-text-xs);
}

.kpi-l {
  font-size: var(--jp-text-2xs);
  color: var(--ct-overlay1);
  margin-top: 3px;
}

.section-title {
  margin: 24px 4px 8px;
}

.trend-card {
  padding: 8px 14px 14px;
}

.trend {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  min-height: 80px;
  padding: 14px 6px 0;
}

.trend .col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.trend .col b {
  font-size: var(--jp-text-2xs);
  color: var(--ct-subtext1);
  font-weight: var(--jp-weight-bold);
}

.trend .bar {
  width: 100%;
  max-width: 40px;
  border-radius: var(--jp-r-sm) var(--jp-r-sm) 0 0;
  background: linear-gradient(var(--ct-mauve), var(--ct-lavender));
}

.trend .col .year {
  font-size: var(--jp-text-3xs);
  color: var(--ct-overlay1);
}

.trend-caption {
  text-align: center;
  margin-top: 8px;
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext0);
}

.flagrow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
}

.flagrow + .flagrow {
  border-top: 1px solid var(--jp-surface-border);
}

.flagrow .dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
}

.flagrow .dot.unused,
.flag-chip.unused {
  color: var(--ct-peach);
}

.flagrow .dot.unused {
  background: var(--ct-peach);
}

.flagrow .dot.missing,
.flag-chip.missing {
  color: var(--ct-red);
}

.flagrow .dot.missing {
  background: var(--ct-red);
}

.flagrow .name {
  flex: 1;
  min-width: 0;
  font-size: var(--jp-text-base);
}

.flag-chip {
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
}

.history-note {
  display: block;
  margin: 8px 4px 0;
}

.empty-hint {
  padding: 8px 0;
  color: var(--ct-overlay1);
}
</style>
