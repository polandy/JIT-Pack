<script setup lang="ts">
/**
 * M4 — Packing List (Trip Detail) — core screen.
 *
 * Live collaborative packing workspace with:
 * - Sticky header: trip name, KPI strip, back button
 * - Grouping switcher (category/container/person/status)
 * - Item rows with G-6 stepper, mode chips, sliding actions
 * - Filter bar: my items, open only
 * - FAB for ad-hoc item add
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
  IonList,
  IonItemGroup,
  IonItemDivider,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonChip,
  IonIcon,
  IonFab,
  IonFabButton,
  IonRefresher,
  IonRefresherContent,
  IonToggle,
} from '@ionic/vue'
import {
  addOutline,
  cartOutline,
  bagHandleOutline,
  timeOutline,
  funnelOutline,
} from 'ionicons/icons'
import { computed, ref } from 'vue'
import { useTripStore } from '@/stores/tripStore'
import type { GroupBy, TripItem } from '@/types/domain'
import QuantityStepper from '@/components/global/QuantityStepper.vue'

const props = defineProps<{ tripId: string }>()

const store = useTripStore()

const trip = computed(() => store.getTrip(props.tripId))
const kpis = computed(() => store.kpis(props.tripId))
const groupBy = computed(() => store.getGroupBy(props.tripId))
const groups = computed(() => store.groupedItems(props.tripId))

const showFilters = ref(false)
const openOnly = ref(false)
const myItemsOnly = ref(false)

const filteredGroups = computed(() => {
  const result = new Map<string, TripItem[]>()
  for (const [key, items] of groups.value) {
    let filtered = items
    if (openOnly.value) {
      filtered = filtered.filter((i) => i.state !== 'packed' && i.state !== 'skipped')
    }
    if (filtered.length > 0) {
      result.set(key, filtered)
    }
  }
  return result
})

const progressPercent = computed(() => {
  if (kpis.value.totalItems === 0) return 0
  return Math.round((kpis.value.packedItems / kpis.value.totalItems) * 100)
})

function onGroupByChange(event: CustomEvent) {
  store.setGroupBy(props.tripId, event.detail.value as GroupBy)
}

function modeIcon(mode: string): string {
  return mode === 'buy_before' || mode === 'buy_local' ? cartOutline : bagHandleOutline
}

function modeLabel(mode: string): string {
  switch (mode) {
    case 'buy_before': return 'Buy before'
    case 'buy_local': return 'Buy local'
    default: return ''
  }
}

function formatWeight(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${grams} g`
}

async function handleRefresh(event: CustomEvent) {
  const refresher = event.target as HTMLIonRefresherElement
  refresher.complete()
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton default-href="/tabs/trips" />
        </IonButtons>
        <IonTitle>{{ trip?.name ?? 'Packing List' }}</IonTitle>
      </IonToolbar>

      <!-- KPI strip -->
      <IonToolbar class="kpi-strip">
        <div class="kpi-row">
          <div class="kpi">
            <span class="kpi-value">{{ kpis.packedItems }}/{{ kpis.totalItems }}</span>
            <span class="kpi-label">Packed</span>
          </div>
          <div class="kpi-progress">
            <div class="kpi-progress-bar" :style="{ width: `${progressPercent}%` }" />
          </div>
          <div class="kpi" v-if="kpis.totalWeight > 0">
            <span class="kpi-value">{{ formatWeight(kpis.packedWeight) }}</span>
            <span class="kpi-label">of {{ formatWeight(kpis.totalWeight) }}</span>
          </div>
        </div>
      </IonToolbar>

      <!-- Grouping switcher -->
      <IonToolbar>
        <IonSegment :value="groupBy" @ionChange="onGroupByChange">
          <IonSegmentButton value="category"><IonLabel>Category</IonLabel></IonSegmentButton>
          <IonSegmentButton value="status"><IonLabel>Status</IonLabel></IonSegmentButton>
          <IonSegmentButton value="person"><IonLabel>Person</IonLabel></IonSegmentButton>
          <IonSegmentButton value="container"><IonLabel>Container</IonLabel></IonSegmentButton>
        </IonSegment>
      </IonToolbar>
    </IonHeader>

    <IonContent>
      <IonRefresher slot="fixed" @ionRefresh="handleRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <!-- Filter bar -->
      <div class="filter-bar">
        <button class="filter-toggle" @click="showFilters = !showFilters">
          <IonIcon :icon="funnelOutline" />
          Filters
        </button>
        <div v-if="showFilters" class="filter-options">
          <IonItem lines="none">
            <IonLabel>Open only</IonLabel>
            <IonToggle v-model="openOnly" />
          </IonItem>
          <IonItem lines="none">
            <IonLabel>My items</IonLabel>
            <IonToggle v-model="myItemsOnly" />
          </IonItem>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="filteredGroups.size === 0" class="empty-state">
        <IonIcon :icon="bagHandleOutline" class="empty-icon" />
        <p v-if="store.getItems(tripId).length === 0">No items yet</p>
        <p v-else>All items filtered out</p>
      </div>

      <!-- Grouped item list -->
      <IonList v-else>
        <IonItemGroup v-for="[group, items] in filteredGroups" :key="group">
          <IonItemDivider sticky>
            <IonLabel>{{ group }}</IonLabel>
            <span slot="end" class="group-count">{{ items.length }}</span>
          </IonItemDivider>

          <IonItemSliding v-for="item in items" :key="item.id">
            <IonItem
              button
              :router-link="`/trips/${tripId}/items/${item.id}`"
              :class="{
                'item-packed': item.state === 'packed',
                'item-skipped': item.state === 'skipped',
              }"
            >
              <div slot="start">
                <QuantityStepper
                  :quantity="item.quantity"
                  :packed="item.packed_count"
                  @increment="() => {}"
                  @decrement="() => {}"
                  @complete="() => {}"
                  @zero="() => {}"
                  @toggle="() => {}"
                />
              </div>

              <IonLabel>
                <h3>{{ item.name }}</h3>
                <p v-if="item.category_name && groupBy !== 'category'">
                  {{ item.category_name }}
                </p>
              </IonLabel>

              <!-- Mode chip (only for buy modes) -->
              <IonChip
                v-if="item.mode !== 'pack'"
                slot="end"
                :color="item.mode === 'buy_before' ? 'warning' : 'tertiary'"
                outline
              >
                <IonIcon :icon="modeIcon(item.mode)" />
                <IonLabel>{{ modeLabel(item.mode) }}</IonLabel>
              </IonChip>

              <!-- Late packer flag -->
              <IonChip v-if="item.late_packer" slot="end" color="danger" outline>
                <IonIcon :icon="timeOutline" />
              </IonChip>
            </IonItem>

            <!-- Swipe actions -->
            <IonItemOptions side="start">
              <IonItemOption color="primary">Pack</IonItemOption>
            </IonItemOptions>
            <IonItemOptions side="end">
              <IonItemOption color="secondary">Assign</IonItemOption>
            </IonItemOptions>
          </IonItemSliding>
        </IonItemGroup>
      </IonList>

      <!-- FAB: add ad-hoc item -->
      <IonFab vertical="bottom" horizontal="end" slot="fixed">
        <IonFabButton aria-label="Add item">
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>
    </IonContent>
  </IonPage>
</template>

<style scoped>
/* KPI strip */
.kpi-strip {
  --min-height: 48px;
}

.kpi-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  width: 100%;
}

.kpi {
  display: flex;
  flex-direction: column;
  align-items: center;
  white-space: nowrap;
}

.kpi-value {
  font-weight: 700;
  font-size: 1rem;
}

.kpi-label {
  font-size: 0.7rem;
  color: var(--ion-color-medium);
  text-transform: uppercase;
}

.kpi-progress {
  flex: 1;
  height: 6px;
  background: var(--ion-color-light);
  border-radius: 3px;
  overflow: hidden;
}

.kpi-progress-bar {
  height: 100%;
  background: var(--ion-color-primary);
  border-radius: 3px;
  transition: width 0.3s;
}

/* Filter bar */
.filter-bar {
  padding: 8px 16px;
}

.filter-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid var(--ion-color-medium);
  border-radius: 16px;
  padding: 4px 12px;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  cursor: pointer;
}

.filter-options {
  margin-top: 8px;
}

/* Group headers */
.group-count {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}

/* Item states */
.item-packed {
  opacity: 0.5;
}

.item-skipped {
  opacity: 0.4;
  text-decoration: line-through;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  color: var(--ion-color-medium);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

/* Desktop: M5 side panel is handled by router config, not here */
</style>
