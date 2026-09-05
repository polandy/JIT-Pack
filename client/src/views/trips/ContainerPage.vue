<script setup lang="ts">
/**
 * M11 — Container Management (FR-10.1–10.3), rebuilt 2026-08-16.
 *
 * The list shows each container as a card: name, carrier, weight bar
 * (amber at 90 % of max, red beyond — FR-10.3) and the pairing imbalance
 * line. Editing is the M5 bottom sheet (ContainerSheet); creating is the
 * FR-24.5 minimal form — the ＋ FAB creates the container with a
 * placeholder name and opens its sheet, so a name is enough to start.
 *
 * The "Unassigned items" bucket (FR-10.2) renders one tappable row per
 * item; tapping opens the same sheet surface as a container *picker*,
 * each option showing its current load — "which bag?" is answered where
 * the load is visible. Assignment stays optional and never blocks
 * packing (FR-25.5).
 */
import {
  IonPage,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonFab,
  IonFabButton,
} from '@ionic/vue'
import {
  addOutline,
  bagHandleOutline,
  chevronForwardOutline,
  personOutline,
  scaleOutline,
  warningOutline,
} from 'ionicons/icons'
import { computed, inject, ref } from 'vue'

import EmptyState from '@/components/global/EmptyState.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import ContainerSheet from '@/components/trips/ContainerSheet.vue'

import { useTripScreen } from '@/composables/useTripScreen'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import {
  budgetLevel,
  containerWeight,
  imbalancePercent,
  IMBALANCE_THRESHOLD_PERCENT,
  unassignedItems,
} from '@/domain/containers'
import { t } from '@/i18n'
import { formatWeight } from '@/lib/format'
import { useTripStore } from '@/stores/tripStore'
import type { Container } from '@/types/domain'

const props = defineProps<{ tripId: string }>()

const store = useTripStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const { trip } = useTripScreen(props.tripId, orchestrator)
const containers = computed(() => store.getContainers(props.tripId))
const travelers = computed(() => store.getTravelers(props.tripId))
const items = computed(() => store.getItems(props.tripId))
const unassigned = computed(() => unassignedItems(items.value))

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

function loadLine(container: Container): string {
  const load = formatWeight(weightOf(container.id))
  return container.max_weight_grams
    ? t('container.loadOf', { weight: load, max: formatWeight(container.max_weight_grams) })
    : load
}

/** Imbalance vs. the paired container, or null when unpaired/balanced (FR-10.3). */
function imbalanceOf(container: Container): number | null {
  if (!container.paired_container_id) return null
  const diff = imbalancePercent(weightOf(container.id), weightOf(container.paired_container_id))
  return diff > IMBALANCE_THRESHOLD_PERCENT ? diff : null
}

function carrierName(travelerId: string | null): string | null {
  return travelers.value.find((tr) => tr.id === travelerId)?.name ?? null
}

// --- Edit sheet (M5 grammar) -------------------------------------------------

const openContainerId = ref<string | null>(null)

/** FR-24.5 minimal creation: a placeholder name is enough to start. */
function createContainer() {
  openContainerId.value = orchestrator.addContainer(props.tripId, t('container.new'), {})
}

// --- Assign picker (FR-10.2): the same sheet surface, options show load ------

const pickingItemId = ref<string | null>(null)
const pickingItem = computed(() => items.value.find((i) => i.id === pickingItemId.value))

function assignTo(containerId: string) {
  const item = pickingItem.value
  if (item) orchestrator.assignContainer(props.tripId, item, containerId)
  pickingItemId.value = null
}

// ADR-011: the one header bar renders this page's title.
setHeaderTitle(() => `${t('container.title')} · ${trip.value?.name ?? ''}`)
</script>

<template>
  <IonPage>
    <IonContent>
      <div class="page-pad">
        <!-- G-7 empty state: create is the FAB, already on screen. -->
        <EmptyState
          v-if="containers.length === 0"
          :icon="bagHandleOutline"
          :title="t('container.empty')"
          testid="m11-empty"
        />

        <!-- Container cards (FR-10.1/10.3) -->
        <button
          v-for="container in containers"
          :key="container.id"
          class="container-card jp-card"
          data-testid="m11-container-card"
          @click="openContainerId = container.id"
        >
          <div class="card-head">
            <span class="card-name">{{ container.name }}</span>
            <IonIcon :icon="chevronForwardOutline" class="card-chevron" />
          </div>
          <div class="card-meta">
            <span class="load" :class="{ over: levelOf(container) === 'over' }">
              <IonIcon v-if="levelOf(container) === 'over'" :icon="warningOutline" />
              {{ loadLine(container) }}
            </span>
            <span v-if="carrierName(container.carrier_traveler_id)" class="carrier">
              <IonIcon :icon="personOutline" />
              {{ carrierName(container.carrier_traveler_id) }}
            </span>
          </div>
          <div v-if="container.max_weight_grams" class="weight-bar">
            <div
              class="weight-fill"
              :class="levelOf(container)"
              :style="{ width: `${fillPercent(container)}%` }"
            />
          </div>
          <p v-if="imbalanceOf(container) !== null" class="imbalance" data-testid="m11-imbalance">
            <IonIcon :icon="scaleOutline" />
            {{ t('container.imbalance', { n: imbalanceOf(container)! }) }}
          </p>
        </button>

        <!-- Unassigned bucket (FR-10.2): one tappable row per item. With no
             containers and nothing to list, "everything is assigned" would
             contradict the empty state right above it — the section only
             speaks when there is a container to assign to or an item to
             assign. -->
        <template v-if="containers.length > 0 || unassigned.length > 0">
          <h2 class="section-title jp-eyebrow" data-testid="m11-unassigned-title">
            {{ t('container.unassigned') }} ({{ unassigned.length }})
          </h2>
          <IonList v-if="unassigned.length > 0" class="unassigned-list jp-card">
            <IonItem
              v-for="item in unassigned"
              :key="item.id"
              button
              :detail="true"
              data-testid="m11-unassigned-row"
              @click="pickingItemId = item.id"
            >
              <IonLabel>
                <h3>{{ item.name }}</h3>
                <p v-if="item.weight_grams">
                  {{ formatWeight(item.weight_grams * item.quantity) }}
                </p>
              </IonLabel>
            </IonItem>
          </IonList>
          <div v-else class="empty-hint" data-testid="m11-unassigned-none">
            {{ t('container.unassignedNone') }}
          </div>
        </template>
      </div>

      <IonFab vertical="bottom" horizontal="end" slot="fixed">
        <IonFabButton
          :aria-label="t('container.new')"
          data-testid="m11-fab"
          @click="createContainer"
        >
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>

      <!-- The M5-pattern edit sheet. -->
      <SheetModal :is-open="openContainerId !== null" @dismiss="openContainerId = null">
        <ContainerSheet
          v-if="openContainerId"
          :trip-id="props.tripId"
          :container-id="openContainerId"
          @close="openContainerId = null"
        />
      </SheetModal>

      <!-- The same sheet surface as a container picker (FR-10.2). -->
      <SheetModal :is-open="pickingItemId !== null" @dismiss="pickingItemId = null">
        <section class="picker" data-testid="m11-picker">
          <h1 class="jp-sheet-title">{{ t('container.assignTitle') }}</h1>
          <p class="picker-item">{{ pickingItem?.name }}</p>
          <p v-if="containers.length === 0" class="picker-none">
            {{ t('container.assignNone') }}
          </p>
          <button
            v-for="container in containers"
            :key="container.id"
            class="picker-row"
            data-testid="m11-picker-option"
            @click="assignTo(container.id)"
          >
            <span class="picker-name">{{ container.name }}</span>
            <span class="picker-load" :class="{ over: levelOf(container) === 'over' }">
              {{ loadLine(container) }}
            </span>
          </button>
        </section>
      </SheetModal>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.page-pad {
  padding: 16px 16px 96px;
}

/* --- container cards --- */
.container-card {
  display: block;
  width: 100%;
  padding: 14px;
  margin-bottom: 12px;
  border: none;
  text-align: start;
  cursor: pointer;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.card-name {
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
  color: var(--ct-text);
}

.card-chevron {
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-xs);
}

.card-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 4px;
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext0);
}

.card-meta .load,
.card-meta .carrier {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.card-meta .load.over {
  color: var(--ct-red);
}

.weight-bar {
  height: 8px;
  margin-top: 8px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  overflow: hidden;
}

.weight-fill {
  height: 100%;
  border-radius: var(--jp-r-pill);
  transition: width 0.2s ease;
}

.weight-fill.ok {
  background: var(--jp-done);
}

.weight-fill.warn {
  background: var(--ct-yellow);
}

.weight-fill.over {
  background: var(--ct-red);
}

.imbalance {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  font-size: var(--jp-text-xs);
  color: var(--ct-yellow);
}

/* --- unassigned bucket --- */
.section-title {
  margin: 24px 0 8px;
}

.unassigned-list {
  padding: 0;
  overflow: hidden;
}

.empty-hint {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-base);
}

/* --- empty state (G-7) --- */

/* --- assign picker --- */
.picker {
  padding: 4px 16px 24px;
}

.picker h1 {
  margin: 0;
}

.picker-item {
  margin: 3px 0 12px;
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext0);
}

.picker-none {
  margin: 0;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}

.picker-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 12px 2px;
  border: none;
  border-top: 1px solid var(--ct-surface0);
  background: none;
  color: var(--ct-text);
  font-size: var(--jp-text-base);
  text-align: start;
  cursor: pointer;
}

.picker-load {
  flex: none;
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext0);
}

.picker-load.over {
  color: var(--ct-red);
}
</style>
