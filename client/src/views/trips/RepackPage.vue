<script setup lang="ts">
/**
 * M13 — Repack Mode (FR-11.1–11.3)
 *
 * Entry dialog: summary of what a repack would reset, with the FR-11.2
 * exceptions (consumables, locally bought) expandable and overridable
 * per item. After confirmation the trip switches to *repack* status
 * (visible to everyone via sync) and this page becomes the "Nothing
 * left behind" checklist grouped by container or traveler (FR-11.3).
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
  IonIcon,
  IonNote,
  IonToggle,
  IonSegment,
  IonSegmentButton,
  IonItemGroup,
  IonItemDivider,
} from '@ionic/vue'
import { checkmarkCircle, ellipseOutline, repeatOutline } from 'ionicons/icons'
import { computed, inject, ref } from 'vue'
import { useRouter } from 'vue-router'

import { planRepack } from '@/domain/repack'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { TripItem } from '@/types/domain'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const props = defineProps<{ tripId: string }>()

const router = useRouter()
const store = useTripStore()
const masterStore = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const trip = computed(() => store.getTrip(props.tripId))
const items = computed(() => store.getItems(props.tripId))
const repacking = computed(() => trip.value?.status === 'repack')

// --- Entry dialog (FR-11.1/11.2) ---
const plan = computed(() =>
  planRepack(items.value, (sourceItemId) =>
    sourceItemId ? (masterStore.getItem(sourceItemId)?.is_consumable ?? false) : false,
  ),
)

const showExceptions = ref(false)
/** Excluded item ids the user pulled back into the reset (override). */
const overrides = ref<Set<string>>(new Set())

function toggleOverride(itemId: string, include: boolean) {
  const next = new Set(overrides.value)
  if (include) next.add(itemId)
  else next.delete(itemId)
  overrides.value = next
}

const consumableCount = computed(() => plan.value.excluded.filter((e) => e.reason === 'consumable').length)
const buyLocalCount = computed(() => plan.value.excluded.filter((e) => e.reason === 'buy_local').length)
const resetCount = computed(() => plan.value.reset.length + overrides.value.size)

function confirmRepack() {
  const ids = [...plan.value.reset.map((i) => i.id), ...overrides.value]
  orchestrator.startRepack(props.tripId, ids)
}

// --- Leave-behind checklist (FR-11.3) ---
const checklistGroupBy = ref<'container' | 'traveler'>('container')

const checklistGroups = computed(() => {
  const groups = new Map<string, TripItem[]>()
  for (const item of items.value) {
    if (item.state === 'skipped') continue
    const key =
      checklistGroupBy.value === 'container'
        ? (store.getContainers(props.tripId).find((c) => c.id === item.container_id)?.name ?? 'Unassigned')
        : (store.getTravelers(props.tripId).find((t) => t.id === item.assigned_traveler_id)?.name ?? 'Unassigned')
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.entries()]
})

function packedCount(groupItems: TripItem[]): number {
  return groupItems.filter((i) => i.state === 'packed').length
}

function finishRepack() {
  orchestrator.completeRepack(props.tripId)
  router.replace(`/trips/${props.tripId}`)
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton :default-href="`/trips/${tripId}`" />
        </IonButtons>
        <IonTitle>Repack · {{ trip?.name ?? '' }}</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent class="ion-padding">
      <!-- Entry dialog (FR-11.1/11.2) -->
      <template v-if="!repacking">
        <div class="summary">
          <IonIcon :icon="repeatOutline" class="summary-icon" />
          <p>
            <strong>{{ resetCount }}</strong> item{{ resetCount === 1 ? '' : 's' }} will be reset to Open<template v-if="plan.excluded.length > 0">;
            {{ consumableCount }} consumable{{ consumableCount === 1 ? '' : 's' }} and
            {{ buyLocalCount }} locally bought item{{ buyLocalCount === 1 ? '' : 's' }} excluded</template>.
          </p>
        </div>

        <IonButton
          v-if="plan.excluded.length > 0"
          fill="clear"
          size="small"
          @click="showExceptions = !showExceptions"
        >
          {{ showExceptions ? 'Hide' : 'Show' }} exceptions ({{ plan.excluded.length }})
        </IonButton>
        <IonList v-if="showExceptions">
          <IonItem v-for="exclusion in plan.excluded" :key="exclusion.item.id">
            <IonLabel>
              <h3>{{ exclusion.item.name }}</h3>
              <p>{{ exclusion.reason === 'consumable' ? 'Consumable' : 'Bought locally' }}</p>
            </IonLabel>
            <IonToggle
              slot="end"
              :checked="overrides.has(exclusion.item.id)"
              aria-label="Include in reset"
              @ionChange="(e: CustomEvent) => toggleOverride(exclusion.item.id, e.detail.checked)"
            />
          </IonItem>
        </IonList>
        <IonNote v-if="showExceptions">Toggle on to reset an excluded item anyway.</IonNote>

        <IonButton expand="block" class="confirm" :disabled="resetCount === 0" @click="confirmRepack">
          Start return packing
        </IonButton>
      </template>

      <!-- Leave-behind checklist (FR-11.3) -->
      <template v-else>
        <IonSegment
          :value="checklistGroupBy"
          @ionChange="(e: CustomEvent) => (checklistGroupBy = e.detail.value)"
        >
          <IonSegmentButton value="container"><IonLabel>By container</IonLabel></IonSegmentButton>
          <IonSegmentButton value="traveler"><IonLabel>By traveler</IonLabel></IonSegmentButton>
        </IonSegment>

        <IonList>
          <IonItemGroup v-for="[group, groupItems] in checklistGroups" :key="group">
            <IonItemDivider>
              <IonLabel>{{ group }} — {{ packedCount(groupItems) }}/{{ groupItems.length }} packed</IonLabel>
            </IonItemDivider>
            <IonItem v-for="item in groupItems" :key="item.id" :router-link="`/trips/${tripId}/items/${item.id}`" button>
              <IonIcon
                slot="start"
                :icon="item.state === 'packed' ? checkmarkCircle : ellipseOutline"
                :color="item.state === 'packed' ? 'success' : 'medium'"
              />
              <IonLabel>{{ item.name }}</IonLabel>
            </IonItem>
          </IonItemGroup>
        </IonList>

        <IonButton expand="block" class="confirm" @click="finishRepack">
          Complete repack
        </IonButton>
        <IonNote>Packing itself happens in the list — this view is for clearing rooms and vehicles.</IonNote>
      </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.summary-icon {
  font-size: 32px;
  color: var(--ion-color-primary);
}

.confirm {
  margin-top: 24px;
}
</style>
