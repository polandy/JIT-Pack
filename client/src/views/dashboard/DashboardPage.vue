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
import { trainOutline, addOutline, buildOutline, personOutline, alarmOutline } from 'ionicons/icons'
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { delegatedToMe, latePackersDepartingToday } from '@/domain/dashboardSections'
import { t } from '@/i18n'
import { loadSeenDelegations, markDelegationsSeen } from '@/local/delegationSeen'
import { formatTripPeriod } from '@/lib/format'
import { greetingKey } from '@/lib/greeting'
import { useTripStore } from '@/stores/tripStore'
import type { Trip, ItemTodo } from '@/types/domain'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const store = useTripStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!
const router = useRouter()

onMounted(() => {
  // Who I am, for the delegation section. Local Mode answers nothing and
  // Single-User has no accounts, so a refusal is the expected answer in two
  // of three modes and leaves the section absent rather than broken.
  orchestrator
    .fetchMe()
    .then((me) => {
      myUserId.value = me?.user_id ?? null
    })
    .catch(() => {
      myUserId.value = null
    })
})

const activeTrips = computed(() => store.tripList.filter((t) => t.status === 'active'))

/*
 * The rows this screen aggregates have to *be here*. A trip partition arrives
 * when its trip is opened, so on a fresh Server-Mode boot M1 was counting an
 * empty store: every active trip rendered with „0 open", no preview rows and
 * no prep, until the user had visited each trip in this page session. Local
 * Mode never showed it, because everything there is rehydrated from IndexedDB
 * on boot, and the pull-to-refresh already pulled exactly this — the screen
 * simply never asked on arrival. Found 2026-08-31, building the two sections
 * below, which read the same rows.
 *
 * A watcher rather than a call in `onMounted`: the trip list itself arrives
 * with the master partition, which on a cold boot has not landed yet, so a
 * one-shot call at mount would ask for nothing. `ensureTripData` is idempotent
 * and deduplicates in flight, so re-running it as the list grows costs one
 * request per trip and no more.
 */
watch(
  () => activeTrips.value.map((trip) => trip.id).join(','),
  () => {
    for (const trip of activeTrips.value) {
      void orchestrator.ensureTripData(trip.id)
      // …and *follow* them: FR-4.4 wants the delegation section to update
      // without a refresh, and only M4 had ever subscribed to a trip channel,
      // so a device sitting on the dashboard heard nothing about the trips it
      // was displaying. Subscribing is idempotent per channel.
      orchestrator.subscribeTrip(trip.id)
    }
  },
  { immediate: true },
)

const isEmpty = computed(() => activeTrips.value.length === 0)

const greeting = computed(() => t(greetingKey(new Date().getHours())))

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
  const result: Array<{
    tripId: string
    tripName: string
    itemId: string
    itemName: string
    todos: ItemTodo[]
  }> = []

  for (const trip of activeTrips.value) {
    const withPrep = store.itemsWithOpenPrep(trip.id)
    for (const { item, openTodos } of withPrep) {
      result.push({
        tripId: trip.id,
        tripName: trip.name,
        itemId: item.id,
        itemName: item.name,
        todos: openTodos,
      })
    }
  }
  return result
})

const totalOpenTodos = computed(() => prepTodos.value.reduce((sum, g) => sum + g.todos.length, 0))

function toggleDashboardTodo(tripId: string, todo: ItemTodo) {
  if (todo.task_state === 'open') {
    orchestrator.resolvePrepTodo(tripId, todo)
  } else {
    orchestrator.reopenPrepTodo(tripId, todo)
  }
}

// --- The two cross-trip sections (FR-6.1/6.3, FR-5.1) ---

/**
 * Every active trip reduced to what the two rules read. One shape for both,
 * because they ask the same question of the same rows.
 */
const sectionTrips = computed(() =>
  activeTrips.value.map((trip) => ({
    tripId: trip.id,
    tripName: trip.name,
    startDate: trip.start_date,
    rows: store.getItems(trip.id),
  })),
)

/**
 * FR-6.1/6.3: what somebody handed me, with what arrived since this device
 * last showed me the section marked. Server Mode only — the other two have no
 * account for a row to be assigned to, so the section is **absent** rather
 * than empty (G-8), and the list above it stays the full aggregation.
 */
const myUserId = ref<string | null>(null)
const seenDelegations = ref<ReadonlySet<string>>(loadSeenDelegations())

const delegated = computed(() =>
  delegatedToMe(sectionTrips.value, myUserId.value, seenDelegations.value),
)
const newDelegations = computed(() => delegated.value.filter((row) => row.isNew).length)

/**
 * FR-5.1: the things somebody put off until the last morning, on the morning
 * that is. `todayISO` is read once per mount rather than per render — a
 * computed calling `new Date()` re-answers on every unrelated store change,
 * and a dashboard left open overnight is a rarer case than a list that
 * flickers. It refreshes on the next visit, which is when the section matters.
 */
const todayISO = new Date().toISOString().slice(0, 10)
const latePackers = computed(() => latePackersDepartingToday(sectionTrips.value, todayISO))

/**
 * Leaving the screen is what marks the highlights read — doing it on arrival
 * would clear them in the same paint that showed them.
 *
 * Two exits, because Vue only knows about one: `onUnmounted` covers an in-app
 * navigation, and `pagehide` covers the browser leaving the document, which
 * tears the page down without running a single Vue hook. With only the first,
 * a delegation stayed *new* for ever on a device whose user left by a real
 * link or closed the tab.
 */
function markSeen(): void {
  if (myUserId.value) markDelegationsSeen(delegated.value.map((row) => row.itemId))
}

onMounted(() => window.addEventListener('pagehide', markSeen))
onUnmounted(() => {
  window.removeEventListener('pagehide', markSeen)
  markSeen()
})

/** FR-7.3: the prep card's item name is the way into its row (UI-Spec M1). */
function openItem(tripId: string, itemId: string): void {
  void router.push(`/trips/${tripId}/items/${itemId}`)
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

      <h1 class="dashboard-greeting jp-hero-title" data-testid="dashboard-greeting">
        {{ greeting }}
      </h1>
      <p class="dashboard-subtitle">{{ t('dashboard.subtitle') }}</p>

      <!-- Empty state (G-7) -->
      <div v-if="isEmpty" class="empty-state" data-testid="dashboard-empty">
        <IonIcon :icon="trainOutline" class="empty-icon" />
        <p>{{ t('trips.emptyActive') }}</p>
        <IonButton router-link="/trips/new" expand="block" data-testid="dashboard-plan-trip">
          <IonIcon slot="start" :icon="addOutline" />
          {{ t('dashboard.planTrip') }}
        </IonButton>
      </div>

      <!--
        FR-6.1/6.3: what somebody handed me. Absent where there is no account
        to be assigned anything (G-8), which is Local and Single-User Mode in
        full — the aggregation below stays unfiltered either way, because a
        personal filter would empty the screen in exactly those two modes.
      -->
      <IonCard v-if="delegated.length > 0" class="prep-card" data-testid="dashboard-delegated">
        <IonCardHeader>
          <IonCardTitle>
            <IonIcon :icon="personOutline" />
            {{ t('dashboard.delegated', { n: delegated.length }) }}
            <span v-if="newDelegations > 0" class="new-badge" data-testid="dashboard-delegated-new">
              {{ t('dashboard.delegatedNew', { n: newDelegations }) }}
            </span>
          </IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <IonItem
            v-for="row in delegated"
            :key="row.itemId"
            lines="none"
            button
            class="dashboard-item"
            :class="{ 'is-new': row.isNew }"
            :data-testid="`dashboard-delegated-${row.itemName}`"
            :data-new="row.isNew ? 'true' : null"
            @click="openItem(row.tripId, row.itemId)"
          >
            <IonLabel>
              <h3>{{ row.itemName }}</h3>
              <p>{{ row.tripName }}</p>
            </IonLabel>
          </IonItem>
        </IonCardContent>
      </IonCard>

      <!--
        FR-5.1: the rows somebody deliberately left until the last morning,
        on the morning it is. Absent on every other day — a permanent section
        counting down to a date is a different feature.
      -->
      <IonCard v-if="latePackers.length > 0" class="prep-card" data-testid="dashboard-late">
        <IonCardHeader>
          <IonCardTitle>
            <IonIcon :icon="alarmOutline" />
            {{ t('dashboard.latePackers', { n: latePackers.length }) }}
          </IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <IonItem
            v-for="row in latePackers"
            :key="row.itemId"
            lines="none"
            button
            class="dashboard-item"
            :data-testid="`dashboard-late-${row.itemName}`"
            @click="openItem(row.tripId, row.itemId)"
          >
            <IonLabel>
              <h3>{{ row.itemName }}</h3>
              <p>{{ row.tripName }}</p>
            </IonLabel>
          </IonItem>
        </IonCardContent>
      </IonCard>

      <!-- Prep to do (FR-7.3) -->
      <IonCard v-if="totalOpenTodos > 0" class="prep-card" data-testid="dashboard-prep">
        <IonCardHeader>
          <IonCardTitle>
            <IonIcon :icon="buildOutline" />
            {{ t('dashboard.prepTodo', { n: totalOpenTodos }) }}
          </IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <div
            v-for="group in prepTodos"
            :key="`${group.tripId}-${group.itemName}`"
            class="prep-group"
          >
            <!--
              A button, not a `<p>` with a handler: the name is the way into
              the row it names (UI-Spec M1, FR-7.3), and a tap target has to
              be one for the keyboard and for assistive tech as well.
            -->
            <button
              type="button"
              class="prep-item-name"
              :data-testid="`dashboard-prep-item-${group.itemName}`"
              @click="openItem(group.tripId, group.itemId)"
            >
              {{ group.itemName }}
              <span class="prep-trip-label">{{ group.tripName }}</span>
            </button>
            <IonItem
              v-for="todo in group.todos"
              :key="todo.id"
              lines="none"
              class="dashboard-item"
              :data-testid="`dashboard-todo-${todo.body}`"
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
        :data-testid="`dashboard-trip-${trip.name}`"
      >
        <IonCardHeader>
          <IonCardTitle>{{ trip.name }}</IonCardTitle>
          <p class="trip-dates">{{ formatTripPeriod(trip) }}</p>
        </IonCardHeader>

        <IonProgressBar :value="progressFraction(trip)" />

        <IonCardContent>
          <p class="item-summary" :data-testid="`dashboard-summary-${trip.name}`">
            {{
              t('trips.itemSummary', {
                packed: tripKpis(trip).packedItems,
                total: tripKpis(trip).totalItems,
              })
            }}
            <span v-if="openItemCount(trip.id) > 0">
              &middot; {{ t('dashboard.openCount', { n: openItemCount(trip.id) }) }}
            </span>
          </p>

          <IonItem
            v-for="item in previewItems(trip.id)"
            :key="item.id"
            lines="none"
            class="dashboard-item"
            :data-testid="`dashboard-preview-${item.name}`"
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

          <p
            v-if="openItemCount(trip.id) > 3"
            class="more-items"
            :data-testid="`dashboard-more-${trip.name}`"
          >
            {{ t('dashboard.moreItems', { n: openItemCount(trip.id) - 3 }) }}
          </p>
        </IonCardContent>
      </IonCard>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.dashboard-greeting {
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
  font-size: var(--jp-icon-2xl);
  margin-bottom: 16px;
}

.trip-dates {
  font-size: var(--jp-text-sm);
  color: var(--ion-color-medium);
  margin: 4px 0 0;
}

.item-summary {
  font-size: var(--jp-text-base);
  color: var(--ion-color-medium);
  margin-bottom: 8px;
}

.dashboard-item {
  --min-height: 36px;
}

.qty-badge {
  font-size: var(--jp-text-sm);
  color: var(--ion-color-medium);
  margin-left: 8px;
}

.more-items {
  font-size: var(--jp-text-sm);
  color: var(--ion-color-primary);
  padding-left: 40px;
  margin-top: 4px;
}

/* Preparation is a brand affordance in the concept, not a caution. */
.prep-card {
  border-left: 3px solid var(--jp-brand);
}

.prep-group {
  margin-bottom: 12px;
}

/* A button that reads as the heading it replaced: the element changed for
   the keyboard and for assistive tech, not for the eye. */
.prep-item-name {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  text-align: start;
  color: var(--ion-text-color);
  font-weight: var(--jp-weight-semibold);
  font-size: var(--jp-text-base);
  margin: 0 0 4px;
  cursor: pointer;
}

/* FR-6.1: what arrived since this device last showed the section. The action
   role (G-11), because it is the one thing here that is *news*. */
.dashboard-item.is-new {
  border-inline-start: 3px solid var(--jp-action);
}

.new-badge {
  margin-inline-start: 8px;
  padding: 2px 8px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-action);
  color: var(--ct-base);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
}

.prep-trip-label {
  font-weight: var(--jp-weight-regular);
  font-size: var(--jp-text-sm);
  color: var(--ion-color-medium);
  margin-left: 8px;
}
</style>
