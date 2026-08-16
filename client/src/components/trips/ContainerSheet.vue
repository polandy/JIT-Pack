<script setup lang="ts">
/**
 * M11 — container sheet (FR-10.1/10.3), in the M5 sheet grammar like M8's
 * position sheet: header with the container's load, then name, carrier,
 * weight limit and the pairing selector. Every control commits immediately
 * (G-5) — the FR-25.15 ●→✓ indicator confirms local capture, there is no
 * save button.
 *
 * Pairing is exclusive and set on both sides at once; tapping the active
 * partner clears the pair for both (see domain/containers.ts).
 */
import { IonIcon, IonInput, IonAlert } from '@ionic/vue'
import { closeOutline, scaleOutline, trashOutline, warningOutline } from 'ionicons/icons'
import { computed, inject, ref } from 'vue'

import SaveIndicator from '@/components/global/SaveIndicator.vue'

import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import {
  budgetLevel,
  containerWeight,
  imbalancePercent,
  imbalanceThreshold,
} from '@/domain/containers'
import { t } from '@/i18n'
import { formatWeight } from '@/lib/format'
import { useTripStore } from '@/stores/tripStore'

const props = defineProps<{
  tripId: string
  containerId: string
}>()

const emit = defineEmits<{ close: [] }>()

const store = useTripStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const trip = computed(() => store.getTrip(props.tripId))
const containers = computed(() => store.getContainers(props.tripId))
const container = computed(() => containers.value.find((c) => c.id === props.containerId))
const travelers = computed(() => store.getTravelers(props.tripId))
const items = computed(() => store.getItems(props.tripId))

// FR-25.15: the indicator reads the orchestrator's state — an open Local
// Mode write reports as `syncing` (FR-19.2), so "settled" is observed.
const saveState = computed(() => orchestrator.syncStatus.state.value)

const threshold = computed(() => imbalanceThreshold(trip.value?.attributes ?? null))

const load = computed(() => containerWeight(items.value, props.containerId))
const level = computed(() => budgetLevel(load.value, container.value?.max_weight_grams ?? null))

const loadLine = computed(() => {
  const max = container.value?.max_weight_grams
  return max
    ? t('container.loadOf', { weight: formatWeight(load.value), max: formatWeight(max) })
    : formatWeight(load.value)
})

/** Imbalance vs. the pair, shown only beyond the FR-10.3 threshold. */
const imbalance = computed(() => {
  const pairedId = container.value?.paired_container_id
  if (!pairedId) return null
  const diff = imbalancePercent(load.value, containerWeight(items.value, pairedId))
  return diff > threshold.value ? diff : null
})

const pairOptions = computed(() => containers.value.filter((c) => c.id !== props.containerId))

// --- Edits (each commits on the spot, G-5) ---

function update(fields: Record<string, unknown>) {
  if (container.value) orchestrator.updateContainer(props.tripId, container.value, fields)
}

function onName(raw: string | null | undefined) {
  const name = (raw ?? '').trim()
  if (name && name !== container.value?.name) update({ name })
}

function onMaxWeight(raw: string | null | undefined) {
  const kg = parseFloat(raw ?? '')
  const grams = Number.isFinite(kg) && kg > 0 ? Math.round(kg * 1000) : null
  if (grams !== (container.value?.max_weight_grams ?? null)) update({ max_weight_grams: grams })
}

function toggleCarrier(travelerId: string) {
  update({
    carrier_traveler_id: container.value?.carrier_traveler_id === travelerId ? null : travelerId,
  })
}

function togglePair(otherId: string) {
  if (container.value?.paired_container_id === otherId) {
    orchestrator.unpairContainer(props.tripId, props.containerId)
  } else {
    orchestrator.pairContainer(props.tripId, props.containerId, otherId)
  }
}

// --- Delete (items are unassigned, never removed — FR-10.2) ---

const confirmingDelete = ref(false)

function onDelete() {
  orchestrator.deleteContainer(props.tripId, props.containerId)
  emit('close')
}
</script>

<template>
  <section v-if="container" class="sheet-body" data-testid="m11-sheet">
    <header class="head">
      <div class="titles">
        <h1 class="jp-sheet-title" data-testid="m11-sheet-name">{{ container.name }}</h1>
        <p class="context" :class="{ over: level === 'over' }" data-testid="m11-sheet-load">
          <IonIcon v-if="level === 'over'" :icon="warningOutline" />
          {{ loadLine }}
          <span v-if="level === 'over'">· {{ t('container.overLimit') }}</span>
        </p>
      </div>
      <SaveIndicator :state="saveState" />
      <button
        class="x"
        data-testid="m11-sheet-close"
        :aria-label="t('common.close')"
        @click="emit('close')"
      >
        <IonIcon :icon="closeOutline" />
      </button>
    </header>

    <section class="sec">
      <h2 class="sl">{{ t('items.editor.name') }}</h2>
      <IonInput
        class="field"
        data-testid="m11-name-input"
        :value="container.name"
        :placeholder="t('container.namePlaceholder')"
        @ion-blur="(e: CustomEvent) => onName((e.target as HTMLIonInputElement).value as string)"
        @keydown.enter="
          (e: KeyboardEvent) => onName((e.target as HTMLIonInputElement).value as string)
        "
      />
    </section>

    <!-- Absent, not emptied, when the trip has no travelers (the FR-24.5 stance). -->
    <section v-if="travelers.length" class="sec">
      <h2 class="sl">{{ t('container.carrier') }}</h2>
      <div class="chips">
        <button
          v-for="traveler in travelers"
          :key="traveler.id"
          class="pick"
          :class="{ sel: container.carrier_traveler_id === traveler.id }"
          :data-testid="`m11-carrier-${traveler.id}`"
          @click="toggleCarrier(traveler.id)"
        >
          {{ traveler.name }}
        </button>
      </div>
    </section>

    <section class="sec">
      <h2 class="sl">{{ t('container.maxWeight') }}</h2>
      <div class="limit-row">
        <IonInput
          class="field limit"
          type="number"
          inputmode="decimal"
          data-testid="m11-max-input"
          :value="container.max_weight_grams ? container.max_weight_grams / 1000 : ''"
          :placeholder="t('container.noLimit')"
          @ion-blur="
            (e: CustomEvent) => onMaxWeight((e.target as HTMLIonInputElement).value as string)
          "
        />
        <span class="unit">{{ t('container.maxWeightUnit') }}</span>
      </div>
    </section>

    <!-- FR-10.3: exclusive, both sides at once; the active chip clears. -->
    <section v-if="pairOptions.length" class="sec">
      <h2 class="sl">
        {{ t('container.pairing') }}
        <span class="n">{{ t('container.pairingHint', { n: threshold }) }}</span>
      </h2>
      <div class="chips">
        <button
          v-for="other in pairOptions"
          :key="other.id"
          class="pick"
          :class="{ sel: container.paired_container_id === other.id }"
          :data-testid="`m11-pair-${other.id}`"
          @click="togglePair(other.id)"
        >
          {{ other.name }}
        </button>
      </div>
      <p v-if="imbalance !== null" class="imbalance" data-testid="m11-imbalance">
        <IonIcon :icon="scaleOutline" />
        {{ t('container.imbalance', { n: imbalance }) }}
      </p>
    </section>

    <section class="sec">
      <button class="del" data-testid="m11-delete" @click="confirmingDelete = true">
        <IonIcon :icon="trashOutline" />
        {{ t('container.delete') }}
      </button>
      <IonAlert
        :is-open="confirmingDelete"
        :header="t('container.delete')"
        :message="t('container.deleteNote')"
        :buttons="[
          { text: t('common.cancel'), role: 'cancel' },
          { text: t('common.delete'), role: 'destructive', handler: onDelete },
        ]"
        @did-dismiss="confirmingDelete = false"
      />
    </section>
  </section>

  <section v-else class="missing">
    <p>{{ t('container.notFound') }}</p>
  </section>
</template>

<style scoped>
.sheet-body {
  padding: 4px 16px 24px;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 6px 0 12px;
}

.titles {
  flex: 1;
  min-width: 0;
}

.head h1 {
  margin: 0;
}

.context {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 3px 0 0;
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext0);
}

.context.over {
  color: var(--ct-red);
}

.x {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border: none;
  border-radius: 50%;
  background: var(--ct-surface0);
  color: var(--ct-subtext1);
  cursor: pointer;
}

.sec {
  padding: 14px 0;
  border-top: 1px solid var(--ct-surface0);
}

.sl {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 8px;
  font-size: var(--jp-text-2xs);
  font-weight: var(--jp-weight-semibold);
  letter-spacing: var(--jp-tracking-label);
  text-transform: uppercase;
  color: var(--ct-subtext0);
}

.sl .n {
  margin-left: auto;
  text-transform: none;
  letter-spacing: normal;
  font-weight: var(--jp-weight-regular);
  color: var(--ct-overlay0);
  text-align: end;
}

.field {
  --background: var(--ct-surface0);
  --padding-start: 12px;
  --padding-end: 12px;
  border-radius: var(--jp-r-md);
}

.limit-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.limit {
  max-width: 130px;
}

.unit {
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pick {
  padding: 7px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: none;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.pick.sel {
  border-color: var(--jp-action);
  color: var(--jp-action);
  background: color-mix(in srgb, var(--jp-action) 10%, transparent);
}

.imbalance {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 0;
  font-size: var(--jp-text-xs);
  color: var(--ct-yellow);
}

.del {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: none;
  border-radius: var(--jp-r-md);
  background: none;
  color: var(--ct-red);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.missing {
  padding: 32px 16px;
  text-align: center;
  color: var(--ct-subtext0);
}
</style>
