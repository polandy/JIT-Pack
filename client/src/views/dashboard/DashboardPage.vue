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
import { airplaneOutline, addOutline } from 'ionicons/icons'
import { ref, computed } from 'vue'
import type { DashboardTrip } from '@/types/domain'

// Placeholder — will be wired to a real store/composable
const trips = ref<DashboardTrip[]>([])
const loading = ref(false)

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

const isEmpty = computed(() => trips.value.length === 0 && !loading.value)

function progressFraction(trip: DashboardTrip): number {
  if (trip.trip.item_count === 0) return 0
  return trip.trip.packed_count / trip.trip.item_count
}

async function handleRefresh(event: CustomEvent) {
  // Will trigger sync drain
  const refresher = event.target as HTMLIonRefresherElement
  // Placeholder: await sync
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
        <IonButton router-link="/tabs/trips" expand="block">
          <IonIcon slot="start" :icon="addOutline" />
          Plan a trip
        </IonButton>
      </div>

      <!-- Trip cards -->
      <IonCard
        v-for="dt in trips"
        :key="dt.trip.id"
        button
        :router-link="`/trips/${dt.trip.id}`"
      >
        <IonCardHeader>
          <IonCardTitle>{{ dt.trip.name }}</IonCardTitle>
          <p class="trip-dates" v-if="dt.trip.start_date">
            {{ dt.trip.start_date }}
            <span v-if="dt.trip.end_date"> &ndash; {{ dt.trip.end_date }}</span>
          </p>
        </IonCardHeader>

        <IonProgressBar :value="progressFraction(dt)" />

        <IonCardContent>
          <p class="item-summary">
            {{ dt.trip.packed_count }}/{{ dt.trip.item_count }} packed
            <span v-if="dt.myItemCount > 0">
              &middot; {{ dt.myItemCount }} items for you
            </span>
          </p>

          <IonItem
            v-for="item in dt.myItems"
            :key="item.id"
            lines="none"
            class="dashboard-item"
          >
            <IonCheckbox
              slot="start"
              :checked="item.packed >= item.quantity"
              :indeterminate="item.packed > 0 && item.packed < item.quantity"
              disabled
            />
            <IonLabel>
              <span>{{ item.name }}</span>
              <span v-if="item.quantity > 1" class="qty-badge">
                {{ item.packed }}/{{ item.quantity }}
              </span>
            </IonLabel>
          </IonItem>

          <p v-if="dt.myItemCount > 3" class="more-items">
            +{{ dt.myItemCount - 3 }} more
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
</style>
