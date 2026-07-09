<script setup lang="ts">
/**
 * M6 — Shopping Views
 *
 * Focused procurement checklists (FR-3.2): *Before departure*
 * (BUY_BEFORE) and *At destination* (BUY_LOCAL), grouped by category.
 * Checking off a BUY_BEFORE item transitions it to PACK and it leaves
 * the list (FR-3.3); checking off a BUY_LOCAL item marks it packed.
 * Free-text quick-add lands in the open tab's list.
 *
 * Standing destination-checklist entries (FR-13.3) follow once trip
 * series exist in the client.
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
  IonCheckbox,
  IonIcon,
} from '@ionic/vue'
import { bagHandleOutline } from 'ionicons/icons'
import { computed, inject, ref } from 'vue'

import QuickAddItem from '@/components/global/QuickAddItem.vue'
import { useTripStore } from '@/stores/tripStore'
import type { TripItem } from '@/types/domain'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const props = defineProps<{ tripId: string }>()

const store = useTripStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const tab = ref<'buy_before' | 'buy_local'>('buy_before')

const trip = computed(() => store.getTrip(props.tripId))
const lists = computed(() => store.getShoppingItems(props.tripId))
const activeList = computed(() =>
  tab.value === 'buy_before' ? lists.value.buyBefore : lists.value.buyLocal,
)

const grouped = computed(() => {
  const groups = new Map<string, TripItem[]>()
  for (const item of activeList.value) {
    const key = item.category_name ?? 'Uncategorized'
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.entries()]
})

function checkOff(item: TripItem) {
  if (item.mode === 'buy_before') {
    // FR-3.3: purchased → needs packing now; it leaves this list.
    orchestrator.setMode(props.tripId, item, 'pack')
  } else {
    // Bought at the destination — that is its packed state.
    orchestrator.packComplete(props.tripId, item)
  }
}

const isActive = computed(
  () => trip.value?.status === 'active' || trip.value?.status === 'repack',
)

function quickAdd(item: {
  name: string
  sourceItemId: string | null
  weightGrams: number | null
  valueCents: number | null
  categoryName: string | null
}) {
  orchestrator.quickAddItem(
    props.tripId,
    item.name,
    {
      sourceItemId: item.sourceItemId,
      weightGrams: item.weightGrams,
      valueCents: item.valueCents,
      categoryName: item.categoryName,
      mode: tab.value,
    },
    isActive.value,
  )
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton :default-href="`/trips/${tripId}`" />
        </IonButtons>
        <IonTitle>Shopping · {{ trip?.name ?? '' }}</IonTitle>
      </IonToolbar>
      <IonToolbar>
        <IonSegment
          :value="tab"
          @ionChange="(e: CustomEvent) => (tab = e.detail.value)"
        >
          <IonSegmentButton value="buy_before">
            <IonLabel>Before departure ({{ lists.buyBefore.length }})</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="buy_local">
            <IonLabel>At destination ({{ lists.buyLocal.length }})</IonLabel>
          </IonSegmentButton>
        </IonSegment>
      </IonToolbar>
    </IonHeader>

    <IonContent>
      <QuickAddItem :trip-id="tripId" :is-active="isActive" @add="quickAdd" />

      <IonList v-if="grouped.length > 0">
        <IonItemGroup v-for="[category, items] in grouped" :key="category">
          <IonItemDivider>
            <IonLabel>{{ category }}</IonLabel>
          </IonItemDivider>
          <IonItem v-for="item in items" :key="item.id">
            <IonCheckbox
              slot="start"
              :checked="false"
              :aria-label="`Bought: ${item.name}`"
              @ionChange="checkOff(item)"
            />
            <IonLabel>
              <h3>{{ item.name }}</h3>
              <p v-if="item.quantity > 1">{{ item.quantity }}×</p>
            </IonLabel>
          </IonItem>
        </IonItemGroup>
      </IonList>

      <!-- Empty state (G-7) -->
      <div v-else class="empty-state">
        <IonIcon :icon="bagHandleOutline" class="empty-icon" />
        <p>Nothing to buy {{ tab === 'buy_before' ? 'before departure' : 'at the destination' }}</p>
      </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--ion-color-medium);
  margin-top: 48px;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}
</style>
