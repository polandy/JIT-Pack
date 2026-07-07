<script setup lang="ts">
/**
 * M5 — Item Detail
 *
 * Everything about one trip item. On mobile opens as a page (navigated from M4);
 * on desktop ≥900px could be a side panel (future enhancement).
 *
 * Every control commits immediately (G-5) — no save button.
 */
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonBackButton,
  IonButtons,
  IonList,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonChip,
  IonIcon,
  IonNote,
} from '@ionic/vue'
import {
  bagHandleOutline,
  cartOutline,
  timeOutline,
  alertCircleOutline,
  removeCircleOutline,
} from 'ionicons/icons'
import { computed } from 'vue'
import { useTripStore } from '@/stores/tripStore'
import type { ItemMode } from '@/types/domain'
import QuantityStepper from '@/components/global/QuantityStepper.vue'

const props = defineProps<{ tripId: string; itemId: string }>()

const tripStore = useTripStore()

const item = computed(() =>
  tripStore.getItems(props.tripId).find((i) => i.id === props.itemId),
)

const trip = computed(() => tripStore.getTrip(props.tripId))
const travelers = computed(() => tripStore.getTravelers(props.tripId))
const containers = computed(() => tripStore.getContainers(props.tripId))

const isActive = computed(() => trip.value?.status === 'active' || trip.value?.status === 'repack')

function formatWeight(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${grams} g`
}

function formatValue(cents: number): string {
  return (cents / 100).toFixed(2)
}

function modeIcon(mode: ItemMode): string {
  return mode === 'pack' ? bagHandleOutline : cartOutline
}

// Placeholder handlers — will wire to outbox mutations
function onModeChange(_mode: ItemMode) {}
function onTravelerChange(_id: string | null) {}
function onContainerChange(_id: string | null) {}
function onLatePacker(_val: boolean) {}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton :default-href="`/trips/${tripId}`" />
        </IonButtons>
        <IonTitle>{{ item?.name ?? 'Item' }}</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent class="ion-padding">
      <div v-if="!item" class="empty-state">
        <p>Item not found</p>
      </div>

      <template v-else>
        <!-- Quantity stepper -->
        <div class="detail-section">
          <h2 class="section-title">Quantity</h2>
          <div class="quantity-row">
            <QuantityStepper
              :quantity="item.quantity"
              :packed="item.packed_count"
              @increment="() => {}"
              @decrement="() => {}"
              @complete="() => {}"
              @zero="() => {}"
              @toggle="() => {}"
            />
            <span class="state-badge" :class="item.state">{{ item.state }}</span>
          </div>
        </div>

        <!-- Item info -->
        <div class="detail-section" v-if="item.weight_grams || item.value_cents">
          <h2 class="section-title">Details</h2>
          <IonList>
            <IonItem v-if="item.weight_grams" lines="inset">
              <IonLabel>Weight</IonLabel>
              <IonNote slot="end">{{ formatWeight(item.weight_grams) }}</IonNote>
            </IonItem>
            <IonItem v-if="item.value_cents" lines="inset">
              <IonLabel>Value</IonLabel>
              <IonNote slot="end">{{ formatValue(item.value_cents) }}</IonNote>
            </IonItem>
            <IonItem v-if="item.category_name" lines="none">
              <IonLabel>Category</IonLabel>
              <IonNote slot="end">{{ item.category_name }}</IonNote>
            </IonItem>
          </IonList>
        </div>

        <!-- Mode selector (FR-3.1) -->
        <div class="detail-section">
          <h2 class="section-title">Mode</h2>
          <IonList>
            <IonItem lines="none">
              <IonIcon :icon="modeIcon(item.mode)" slot="start" />
              <IonSelect
                :value="item.mode"
                interface="popover"
                @ionChange="(e: CustomEvent) => onModeChange(e.detail.value)"
              >
                <IonSelectOption value="pack">Pack</IonSelectOption>
                <IonSelectOption value="buy_before">Buy before</IonSelectOption>
                <IonSelectOption value="buy_local">Buy local</IonSelectOption>
              </IonSelect>
            </IonItem>
          </IonList>
        </div>

        <!-- Assignment: Used by (traveler) vs Packed by (user) -->
        <div class="detail-section">
          <h2 class="section-title">Assignment</h2>
          <IonList>
            <IonItem lines="inset">
              <IonLabel>Used by</IonLabel>
              <IonSelect
                :value="item.assigned_traveler_id"
                interface="popover"
                placeholder="Unassigned"
                @ionChange="(e: CustomEvent) => onTravelerChange(e.detail.value)"
              >
                <IonSelectOption :value="null">Unassigned</IonSelectOption>
                <IonSelectOption
                  v-for="t in travelers"
                  :key="t.id"
                  :value="t.id"
                >
                  {{ t.name }}
                </IonSelectOption>
              </IonSelect>
            </IonItem>
            <IonItem lines="none">
              <IonLabel>Container</IonLabel>
              <IonSelect
                :value="item.container_id"
                interface="popover"
                placeholder="None"
                @ionChange="(e: CustomEvent) => onContainerChange(e.detail.value)"
              >
                <IonSelectOption :value="null">None</IonSelectOption>
                <IonSelectOption
                  v-for="c in containers"
                  :key="c.id"
                  :value="c.id"
                >
                  {{ c.name }}
                </IonSelectOption>
              </IonSelect>
            </IonItem>
          </IonList>
        </div>

        <!-- Toggles -->
        <div class="detail-section">
          <h2 class="section-title">Flags</h2>
          <IonList>
            <IonItem lines="inset">
              <IonIcon :icon="timeOutline" slot="start" />
              <IonLabel>Late Packer</IonLabel>
              <IonToggle
                :checked="item.late_packer"
                @ionChange="(e: CustomEvent) => onLatePacker(e.detail.checked)"
              />
            </IonItem>
            <!-- Flags only visible on active trips (FR-9.1) -->
            <IonItem v-if="isActive && item.flag_unused" lines="inset">
              <IonIcon :icon="removeCircleOutline" slot="start" color="warning" />
              <IonLabel color="warning">Flagged unused</IonLabel>
            </IonItem>
            <IonItem v-if="isActive && item.flag_missing" lines="none">
              <IonIcon :icon="alertCircleOutline" slot="start" color="danger" />
              <IonLabel color="danger">Flagged missing</IonLabel>
            </IonItem>
          </IonList>
        </div>

        <!-- Lock overlay (G-3) -->
        <div v-if="item.packing_now_by" class="lock-banner">
          <IonChip color="primary">
            <IonLabel>In progress by another user</IonLabel>
          </IonChip>
        </div>
      </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.detail-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--ion-color-medium);
  margin: 0 0 8px;
  padding: 0 16px;
}

.quantity-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
}

.state-badge {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--ion-color-light);
}

.state-badge.packed {
  background: var(--ion-color-success-tint);
  color: var(--ion-color-success-shade);
}

.state-badge.packing_now {
  background: var(--ion-color-primary-tint);
  color: var(--ion-color-primary-shade);
}

.state-badge.partial {
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-warning-shade);
}

.state-badge.skipped {
  opacity: 0.5;
}

.lock-banner {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: center;
  padding: 12px;
  background: var(--ion-background-color);
}

.empty-state {
  display: flex;
  justify-content: center;
  padding: 48px;
  color: var(--ion-color-medium);
}
</style>
