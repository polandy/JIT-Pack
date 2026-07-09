<script setup lang="ts">
/**
 * M1 — Dashboard "My Tasks"
 *
 * Single entry point: "what do I have to do right now?" across all active trips.
 * Shows greeting, per-trip cards with open items, empty state with CTA.
 */
import {
  IonPage,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonItem,
  IonLabel,
  IonCheckbox,
  IonProgressBar,
  IonButton,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/vue'
import { airplaneOutline, addOutline, buildOutline } from 'ionicons/icons'
import { computed, inject } from 'vue'
import { useTripStore } from '@/stores/tripStore'
import type { Trip, ItemTodo } from '@/types/domain'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const store = useTripStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const activeTrips = computed(() =>
  store.tripList.filter((t) => t.status === 'active'),
)

const isEmpty = computed(() => activeTrips.value.length === 0)

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

function tripKpis(trip: Trip) {
  return store.kpis(trip.id)
}

function progressFraction(trip: Trip): number {
  const k = tripKpis(trip)
  if (k.totalItems === 0) return 0
  return k.packedItems / k.totalItems
}

function previewItems(tripId: string) {
  return store
    .getItems(tripId)
    .filter((i) => i.state !== 'packed' && i.state !== 'skipped')
    .slice(0, 3)
}

function openItemCount(tripId: string): number {
  return store.getItems(tripId).filter((i) => i.state !== 'packed' && i.state !== 'skipped').length
}

/** All open prep todos across active trips, grouped by item name. */
const prepTodos = computed(() => {
  const result: Array<{ tripId: string; tripName: string; itemName: string; todos: ItemTodo[] }> = []

  for (const trip of activeTrips.value) {
    const withPrep = store.itemsWithOpenPrep(trip.id)
    for (const { item, openTodos } of withPrep) {
      result.push({
        tripId: trip.id,
        tripName: trip.name,
        itemName: item.name,
        todos: openTodos,
      })
    }
  }
  return result
})

const totalOpenTodos = computed(() =>
  prepTodos.value.reduce((sum, g) => sum + g.todos.length, 0),
)

function toggleDashboardTodo(tripId: string, todo: ItemTodo) {
  if (todo.task_state === 'open') {
    orchestrator.resolvePrepTodo(tripId, todo)
  } else {
    orchestrator.reopenPrepTodo(tripId, todo)
  }
}

async function handleRefresh(event: CustomEvent) {
  const refresher = event.target as HTMLIonRefresherElement
  const tripIds = activeTrips.value.map((t) => t.id)
  await orchestrator.drainAll(tripIds)
  refresher.complete()
}
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <IonRefresher slot="fixed" @ionRefresh="handleRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <h1 class="dashboard-greeting">{{ greeting }}</h1>
      <p class="dashboard-subtitle">Your packing tasks</p>

      <!-- Empty state (G-7) -->
      <div v-if="isEmpty" class="empty-state">
        <IonIcon :icon="airplaneOutline" class="empty-icon" />
        <p>No active trips</p>
        <IonButton router-link="/trips/new" expand="block">
          <IonIcon slot="start" :icon="addOutline" />
          Plan a trip
        </IonButton>
      </div>

      <!-- Prep to do (FR-7.3) -->
      <IonCard v-if="totalOpenTodos > 0" class="prep-card">
        <IonCardHeader>
          <IonCardTitle>
            <IonIcon :icon="buildOutline" />
            Prep to do ({{ totalOpenTodos }})
          </IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <div v-for="group in prepTodos" :key="`${group.tripId}-${group.itemName}`" class="prep-group">
            <p class="prep-item-name">
              {{ group.itemName }}
              <span class="prep-trip-label">{{ group.tripName }}</span>
            </p>
            <IonItem
              v-for="todo in group.todos"
              :key="todo.id"
              lines="none"
              class="dashboard-item"
            >
              <IonCheckbox
                slot="start"
                :checked="false"
                @ionChange="toggleDashboardTodo(group.tripId, todo)"
              />
              <IonLabel>{{ todo.body }}</IonLabel>
            </IonItem>
          </div>
        </IonCardContent>
      </IonCard>

      <!-- Trip cards -->
      <IonCard
        v-for="trip in activeTrips"
        :key="trip.id"
        button
        :router-link="`/trips/${trip.id}`"
      >
        <IonCardHeader>
          <IonCardTitle>{{ trip.name }}</IonCardTitle>
          <p class="trip-dates">
            <template v-if="trip.start_date">
              {{ trip.start_date }} &ndash; {{ trip.end_date }}
            </template>
            <template v-else>until {{ trip.end_date }}</template>
          </p>
        </IonCardHeader>

        <IonProgressBar :value="progressFraction(trip)" />

        <IonCardContent>
          <p class="item-summary">
            {{ tripKpis(trip).packedItems }}/{{ tripKpis(trip).totalItems }} packed
            <span v-if="openItemCount(trip.id) > 0">
              &middot; {{ openItemCount(trip.id) }} open
            </span>
          </p>

          <IonItem
            v-for="item in previewItems(trip.id)"
            :key="item.id"
            lines="none"
            class="dashboard-item"
          >
            <IonCheckbox
              slot="start"
              :checked="item.packed_count >= item.quantity"
              :indeterminate="item.packed_count > 0 && item.packed_count < item.quantity"
              disabled
            />
            <IonLabel>
              <span>{{ item.name }}</span>
              <span v-if="item.quantity > 1" class="qty-badge">
                {{ item.packed_count }}/{{ item.quantity }}
              </span>
            </IonLabel>
          </IonItem>

          <p v-if="openItemCount(trip.id) > 3" class="more-items">
            +{{ openItemCount(trip.id) - 3 }} more
          </p>
        </IonCardContent>
      </IonCard>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.dashboard-greeting {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 16px 0 4px;
}

.dashboard-subtitle {
  color: var(--ion-color-medium);
  margin: 0 0 24px;
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

.trip-dates {
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  margin: 4px 0 0;
}

.item-summary {
  font-size: 0.9rem;
  color: var(--ion-color-medium);
  margin-bottom: 8px;
}

.dashboard-item {
  --min-height: 36px;
}

.qty-badge {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  margin-left: 8px;
}

.more-items {
  font-size: 0.85rem;
  color: var(--ion-color-primary);
  padding-left: 40px;
  margin-top: 4px;
}

.prep-card {
  border-left: 3px solid var(--ion-color-warning);
}

.prep-group {
  margin-bottom: 12px;
}

.prep-item-name {
  font-weight: 600;
  font-size: 0.9rem;
  margin: 0 0 4px;
}

.prep-trip-label {
  font-weight: 400;
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  margin-left: 8px;
}
</style>
