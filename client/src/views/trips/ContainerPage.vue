<script setup lang="ts">
/**
 * M11 — Container Management (FR-10.1–10.3)
 *
 * Define luggage containers and balance weight: per-container weight
 * bar (amber at 90 % of max, red beyond), pairing with live imbalance
 * indicator (default 15 %, per-trip override via trip attribute), and
 * the "Unassigned items" bucket (FR-10.2). Every control commits
 * immediately (G-5).
 */
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonBackButton,
  IonButtons,
  IonButton,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonIcon,
  IonNote,
  IonChip,
} from '@ionic/vue'
import { addOutline, trashOutline, scaleOutline, warningOutline } from 'ionicons/icons'
import { computed, inject, ref } from 'vue'

import {
  budgetLevel,
  containerWeight,
  imbalancePercent,
  imbalanceThreshold,
  unassignedItems,
} from '@/domain/containers'
import { useTripStore } from '@/stores/tripStore'
import type { Container } from '@/types/domain'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const props = defineProps<{ tripId: string }>()

const store = useTripStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const trip = computed(() => store.getTrip(props.tripId))
const containers = computed(() => store.getContainers(props.tripId))
const travelers = computed(() => store.getTravelers(props.tripId))
const items = computed(() => store.getItems(props.tripId))
const unassigned = computed(() => unassignedItems(items.value))
const threshold = computed(() => imbalanceThreshold(trip.value?.attributes ?? null))

const newName = ref('')

function addContainer() {
  const name = newName.value.trim()
  if (!name) return
  orchestrator.addContainer(props.tripId, name, {})
  newName.value = ''
}

function weightOf(containerId: string): number {
  return containerWeight(items.value, containerId)
}

function levelOf(container: Container): 'ok' | 'warn' | 'over' {
  return budgetLevel(weightOf(container.id), container.max_weight_grams)
}

function fillPercent(container: Container): number {
  if (!container.max_weight_grams) return 0
  return Math.min(100, (weightOf(container.id) / container.max_weight_grams) * 100)
}

/** Imbalance vs. the paired container, or null when unpaired/balanced. */
function imbalanceOf(container: Container): number | null {
  if (!container.paired_container_id) return null
  const diff = imbalancePercent(weightOf(container.id), weightOf(container.paired_container_id))
  return diff > threshold.value ? diff : null
}

function pairOptions(container: Container): Container[] {
  return containers.value.filter((c) => c.id !== container.id)
}

function carrierName(travelerId: string | null): string | null {
  return travelers.value.find((t) => t.id === travelerId)?.name ?? null
}

function formatWeight(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${grams} g`
}

function onRename(container: Container, name: string) {
  if (name.trim() && name !== container.name) {
    orchestrator.updateContainer(props.tripId, container, { name: name.trim() })
  }
}

function onMaxWeight(container: Container, raw: string) {
  const kg = parseFloat(raw)
  orchestrator.updateContainer(props.tripId, container, {
    max_weight_grams: Number.isFinite(kg) && kg > 0 ? Math.round(kg * 1000) : null,
  })
}

function onCarrier(container: Container, travelerId: string | null) {
  orchestrator.updateContainer(props.tripId, container, { carrier_traveler_id: travelerId || null })
}

function onPair(container: Container, pairedId: string | null) {
  orchestrator.updateContainer(props.tripId, container, { paired_container_id: pairedId || null })
}

function onDelete(containerId: string) {
  orchestrator.deleteContainer(props.tripId, containerId)
}

function onAssign(itemId: string, containerId: string | null) {
  const item = items.value.find((i) => i.id === itemId)
  if (item && containerId) {
    orchestrator.assignContainer(props.tripId, item, containerId)
  }
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton :default-href="`/trips/${tripId}`" />
        </IonButtons>
        <IonTitle>Containers · {{ trip?.name ?? '' }}</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent class="ion-padding">
      <!-- Add container -->
      <div class="add-row">
        <IonInput
          placeholder="New container (e.g. Left Pannier)"
          :value="newName"
          @ionInput="(e: CustomEvent) => (newName = e.detail.value ?? '')"
          @keyup.enter="addContainer"
        />
        <IonButton size="small" :disabled="!newName.trim()" @click="addContainer">
          <IonIcon slot="icon-only" :icon="addOutline" />
        </IonButton>
      </div>

      <!-- Container list -->
      <div v-for="container in containers" :key="container.id" class="container-card">
        <div class="container-head">
          <IonInput
            class="container-name"
            :value="container.name"
            @ionBlur="(e: CustomEvent) => onRename(container, (e.target as HTMLIonInputElement).value as string)"
          />
          <IonButton fill="clear" color="medium" aria-label="Delete container" @click="onDelete(container.id)">
            <IonIcon slot="icon-only" :icon="trashOutline" />
          </IonButton>
        </div>

        <!-- Weight bar (FR-10.3) -->
        <div class="weight-line">
          <span>{{ formatWeight(weightOf(container.id)) }}</span>
          <span v-if="container.max_weight_grams">
            of {{ formatWeight(container.max_weight_grams) }}
          </span>
          <IonChip v-if="imbalanceOf(container) !== null" color="warning" class="imbalance">
            <IonIcon :icon="scaleOutline" />
            <IonLabel>{{ imbalanceOf(container) }}% imbalance</IonLabel>
          </IonChip>
        </div>
        <div v-if="container.max_weight_grams" class="weight-bar">
          <div
            class="weight-fill"
            :class="levelOf(container)"
            :style="{ width: `${fillPercent(container)}%` }"
          />
        </div>
        <IonNote v-if="levelOf(container) === 'over'" color="danger">
          <IonIcon :icon="warningOutline" /> Over the weight limit
        </IonNote>

        <div class="container-fields">
          <IonSelect
            label="Carrier"
            interface="popover"
            :value="container.carrier_traveler_id ?? ''"
            @ionChange="(e: CustomEvent) => onCarrier(container, e.detail.value)"
          >
            <IonSelectOption value="">—</IonSelectOption>
            <IonSelectOption v-for="t in travelers" :key="t.id" :value="t.id">{{ t.name }}</IonSelectOption>
          </IonSelect>
          <IonInput
            label="Max (kg)"
            type="number"
            class="max-input"
            :value="container.max_weight_grams ? container.max_weight_grams / 1000 : ''"
            @ionBlur="(e: CustomEvent) => onMaxWeight(container, (e.target as HTMLIonInputElement).value as string)"
          />
          <IonSelect
            label="Paired with"
            interface="popover"
            :value="container.paired_container_id ?? ''"
            @ionChange="(e: CustomEvent) => onPair(container, e.detail.value)"
          >
            <IonSelectOption value="">—</IonSelectOption>
            <IonSelectOption v-for="c in pairOptions(container)" :key="c.id" :value="c.id">{{ c.name }}</IonSelectOption>
          </IonSelect>
        </div>
        <IonNote v-if="carrierName(container.carrier_traveler_id)">
          carried by {{ carrierName(container.carrier_traveler_id) }}
        </IonNote>
      </div>

      <!-- Unassigned bucket (FR-10.2) -->
      <h2 class="section-title">Unassigned items ({{ unassigned.length }})</h2>
      <IonList v-if="unassigned.length > 0">
        <IonItem v-for="item in unassigned" :key="item.id">
          <IonLabel>
            <h3>{{ item.name }}</h3>
            <p v-if="item.weight_grams">{{ formatWeight(item.weight_grams * item.quantity) }}</p>
          </IonLabel>
          <IonSelect
            slot="end"
            placeholder="Assign…"
            interface="popover"
            :value="''"
            @ionChange="(e: CustomEvent) => onAssign(item.id, e.detail.value)"
          >
            <IonSelectOption v-for="c in containers" :key="c.id" :value="c.id">{{ c.name }}</IonSelectOption>
          </IonSelect>
        </IonItem>
      </IonList>
      <div v-else class="empty-hint">Everything is assigned to a container.</div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.add-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 16px;
}

.container-card {
  border: 1px solid var(--ion-color-light-shade, #ddd);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.container-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.container-name {
  font-weight: 600;
}

.weight-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  color: var(--ion-color-medium);
}

.weight-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--ion-color-light, #eee);
  overflow: hidden;
  margin: 6px 0;
}

.weight-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.2s ease;
}

.weight-fill.ok {
  background: var(--ion-color-success);
}

.weight-fill.warn {
  background: var(--ion-color-warning);
}

.weight-fill.over {
  background: var(--ion-color-danger);
}

.imbalance {
  height: 22px;
  font-size: 0.7rem;
}

.container-fields {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.max-input {
  max-width: 110px;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 24px 0 8px;
}

.empty-hint {
  color: var(--ion-color-medium);
  font-size: 0.9rem;
}
</style>
