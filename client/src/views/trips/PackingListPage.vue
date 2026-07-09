<script setup lang="ts">
/**
 * M4 — Packing List (Trip Detail) — core screen.
 *
 * Live collaborative packing workspace with:
 * - Sticky header: trip name, KPI strip, back button
 * - Grouping switcher (category/container/person/status)
 * - Item rows with G-6 stepper, mode chips, sliding actions
 * - Inline quick-add for new items without leaving context
 * - Skip action: mark items as "consciously not packing" (FR-5.5)
 * - Filter bar: my items, open only
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
  IonRefresher,
  IonRefresherContent,
  IonToggle,
  IonBadge,
  IonButton,
  IonCheckbox,
} from '@ionic/vue'
import {
  cartOutline,
  bagHandleOutline,
  timeOutline,
  funnelOutline,
  eyeOffOutline,
  eyeOutline,
  buildOutline,
  lockClosedOutline,
} from 'ionicons/icons'
import { computed, inject, ref, onMounted } from 'vue'
import { useTripStore } from '@/stores/tripStore'
import type { GroupBy, TripItem, ItemTodo } from '@/types/domain'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import PresenceFacepile from '@/components/global/PresenceFacepile.vue'
import QuantityStepper from '@/components/global/QuantityStepper.vue'
import QuickAddItem from '@/components/global/QuickAddItem.vue'

const props = defineProps<{ tripId: string }>()

const store = useTripStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

onMounted(() => {
  orchestrator.subscribeTrip(props.tripId)
  orchestrator.drainTrip(props.tripId)
})

const trip = computed(() => store.getTrip(props.tripId))
const kpis = computed(() => store.kpis(props.tripId))
const groupBy = computed(() => store.getGroupBy(props.tripId))
const isActive = computed(() => trip.value?.status === 'active' || trip.value?.status === 'repack')

// M6 toolbar badge: open procurement items; entry hidden at zero.
const shoppingCount = computed(() => {
  const lists = store.getShoppingItems(props.tripId)
  return lists.buyBefore.length + lists.buyLocal.length
})

// G-10: facepile only with company — hides in Single-User/Local (G-8).
const presenceUsers = computed(() => orchestrator.getPresence(props.tripId))

// G-3: item locked by someone else's packing-now claim.
function locked(item: TripItem): boolean {
  return orchestrator.isLockedByOther(props.tripId, item)
}

function onPackingNow(item: TripItem) {
  orchestrator.packingNow(props.tripId, item)
}

const showFilters = ref(false)
const openOnly = ref(false)
const myItemsOnly = ref(false)
const showSkipped = ref(false)
const showPrep = ref(false)

const itemsWithOpenPrep = computed(() => store.itemsWithOpenPrep(props.tripId))
const openTodoCount = computed(() => store.getOpenTodos(props.tripId).length)

/** Count of open todos per item, for badge display. */
function itemOpenTodoCount(itemId: string): number {
  return store.getItemTodos(props.tripId, itemId).filter((t) => t.task_state === 'open').length
}

function togglePrepTodo(todo: ItemTodo) {
  if (todo.task_state === 'open') {
    orchestrator.resolvePrepTodo(props.tripId, todo)
  } else {
    orchestrator.reopenPrepTodo(props.tripId, todo)
  }
}

/** Items split into regular and skipped. */
const allItems = computed(() => store.getItems(props.tripId))

const skippedItems = computed(() =>
  allItems.value.filter((i) => i.state === 'skipped'),
)

const activeItems = computed(() =>
  allItems.value.filter((i) => i.state !== 'skipped'),
)

/** Grouped active (non-skipped) items. */
const groups = computed(() => {
  const gb = store.getGroupBy(props.tripId)
  const grouped = new Map<string, TripItem[]>()

  for (const item of activeItems.value) {
    let key: string
    switch (gb) {
      case 'category':
        key = item.category_name ?? 'Uncategorized'
        break
      case 'container':
        key = item.container_id ?? 'Unassigned'
        break
      case 'person':
        key = item.assigned_traveler_id ?? 'Unassigned'
        break
      case 'status':
        key = item.state
        break
    }
    const group = grouped.get(key) ?? []
    group.push(item)
    grouped.set(key, group)
  }

  return grouped
})

const filteredGroups = computed(() => {
  const result = new Map<string, TripItem[]>()
  for (const [key, items] of groups.value) {
    let filtered = items
    if (openOnly.value) {
      filtered = filtered.filter((i) => i.state !== 'packed')
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

// --- Action handlers (wired to sync orchestrator) ---

function onQuickAdd(item: { name: string; sourceItemId: string | null; weightGrams: number | null; valueCents: number | null; categoryName: string | null }) {
  orchestrator.quickAddItem(props.tripId, item.name, {
    sourceItemId: item.sourceItemId,
    weightGrams: item.weightGrams,
    valueCents: item.valueCents,
    categoryName: item.categoryName,
  }, isActive.value)
}

function onSkipItem(item: TripItem) {
  orchestrator.skipItem(props.tripId, item)
}

function onUnskipItem(item: TripItem) {
  orchestrator.unskipItem(props.tripId, item)
}

function onIncrement(item: TripItem) {
  orchestrator.packIncrement(props.tripId, item)
}

function onDecrement(item: TripItem) {
  orchestrator.packDecrement(props.tripId, item)
}

function onComplete(item: TripItem) {
  orchestrator.packComplete(props.tripId, item)
}

function onZero(item: TripItem) {
  orchestrator.packZero(props.tripId, item)
}

function onToggle(item: TripItem) {
  orchestrator.packToggle(props.tripId, item)
}

async function handleRefresh(event: CustomEvent) {
  const refresher = event.target as HTMLIonRefresherElement
  await orchestrator.drainTrip(props.tripId)
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
        <IonButtons slot="end">
          <!-- G-10: trip presence facepile + group-sync badge -->
          <PresenceFacepile v-if="presenceUsers.length > 1" :users="presenceUsers" />
          <!-- M6 entry point: hidden when both shopping lists are empty -->
          <IonButton
            v-if="shoppingCount > 0"
            :router-link="`/trips/${tripId}/shopping`"
            aria-label="Shopping lists"
          >
            <IonIcon slot="icon-only" :icon="cartOutline" />
            <IonBadge color="primary" class="shopping-badge">{{ shoppingCount }}</IonBadge>
          </IonButton>
        </IonButtons>
      </IonToolbar>

      <!-- KPI strip — tap opens M12 analytics (UI-Spec M4) -->
      <IonToolbar class="kpi-strip">
        <div
          class="kpi-row kpi-tappable"
          role="link"
          aria-label="Open analytics"
          @click="$router.push(`/trips/${tripId}/analytics`)"
        >
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
          <div class="kpi" v-if="kpis.totalTodos > 0">
            <span class="kpi-value" :class="{ 'prep-open': kpis.resolvedTodos < kpis.totalTodos }">
              {{ kpis.resolvedTodos }}/{{ kpis.totalTodos }}
            </span>
            <span class="kpi-label">Prep</span>
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

      <!-- M11 entry: container grouping exposes the editor (UI-Spec M11) -->
      <div v-if="groupBy === 'container'" class="edit-containers">
        <IonButton size="small" fill="outline" :router-link="`/trips/${tripId}/containers`">
          Edit containers
        </IonButton>
      </div>

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

      <!-- Inline quick-add -->
      <QuickAddItem
        :trip-id="tripId"
        :is-active="isActive"
        @add="onQuickAdd"
      />

      <!-- Empty state -->
      <div v-if="filteredGroups.size === 0 && skippedItems.length === 0" class="empty-state">
        <IonIcon :icon="bagHandleOutline" class="empty-icon" />
        <p v-if="allItems.length === 0">No items yet — add one above</p>
        <p v-else>All items filtered out</p>
      </div>

      <!-- Grouped item list -->
      <IonList v-if="filteredGroups.size > 0">
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
                'item-packed': item.state === 'packed' && itemOpenTodoCount(item.id) === 0,
                'item-packed-open-prep': item.state === 'packed' && itemOpenTodoCount(item.id) > 0,
                'item-locked': locked(item),
              }"
            >
              <div slot="start">
                <!-- G-3: locked items are non-interactive for others -->
                <IonIcon v-if="locked(item)" :icon="lockClosedOutline" class="lock-icon" />
                <QuantityStepper
                  v-else
                  :quantity="item.quantity"
                  :packed="item.packed_count"
                  @increment="onIncrement(item)"
                  @decrement="onDecrement(item)"
                  @complete="onComplete(item)"
                  @zero="onZero(item)"
                  @toggle="onToggle(item)"
                />
              </div>

              <IonLabel>
                <h3>
                  {{ item.name }}
                  <IonBadge
                    v-if="itemOpenTodoCount(item.id) > 0"
                    color="warning"
                    class="prep-badge"
                  >
                    <IonIcon :icon="buildOutline" /> {{ itemOpenTodoCount(item.id) }}
                  </IonBadge>
                </h3>
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

              <!-- Missing flag -->
              <IonChip v-if="item.flag_missing" slot="end" color="danger" outline>
                Missing
              </IonChip>

              <!-- Packing-now state: locked for others, badge for self -->
              <IonChip v-if="locked(item)" slot="end" color="primary" outline>
                <IonIcon :icon="lockClosedOutline" />
                <IonLabel>Packing…</IonLabel>
              </IonChip>
              <IonChip v-else-if="item.state === 'packing_now'" slot="end" color="success" outline>
                <IonLabel>Packing now</IonLabel>
              </IonChip>
            </IonItem>

            <!-- Swipe actions (none while locked by someone else, G-3) -->
            <IonItemOptions v-if="!locked(item)" side="start">
              <IonItemOption color="primary" @click="onPackingNow(item)">Packing Now</IonItemOption>
            </IonItemOptions>
            <IonItemOptions v-if="!locked(item)" side="end">
              <IonItemOption color="medium" @click="onSkipItem(item)">
                <IonIcon slot="icon-only" :icon="eyeOffOutline" />
              </IonItemOption>
              <IonItemOption color="secondary">Assign</IonItemOption>
            </IonItemOptions>
          </IonItemSliding>
        </IonItemGroup>
      </IonList>

      <!-- Preparation section (FR-7.3) -->
      <div v-if="itemsWithOpenPrep.length > 0" class="prep-section">
        <button class="prep-header" @click="showPrep = !showPrep">
          <IonIcon :icon="buildOutline" />
          <span>Preparation ({{ openTodoCount }} open)</span>
          <span class="chevron" :class="{ open: showPrep }">&#9662;</span>
        </button>

        <IonList v-if="showPrep">
          <IonItemGroup v-for="{ item, openTodos } in itemsWithOpenPrep" :key="item.id">
            <IonItemDivider>
              <IonLabel>{{ item.name }}</IonLabel>
              <IonBadge slot="end" :color="item.state === 'packed' ? 'warning' : 'medium'">
                {{ item.state === 'packed' ? 'packed, prep open' : item.state }}
              </IonBadge>
            </IonItemDivider>
            <IonItem v-for="todo in openTodos" :key="todo.id" lines="inset">
              <IonCheckbox
                slot="start"
                :checked="false"
                @ionChange="togglePrepTodo(todo)"
              />
              <IonLabel>{{ todo.body }}</IonLabel>
            </IonItem>
          </IonItemGroup>
        </IonList>
      </div>

      <!-- Skipped items section (FR-5.5) -->
      <div v-if="skippedItems.length > 0" class="skipped-section">
        <button class="skipped-header" @click="showSkipped = !showSkipped">
          <IonIcon :icon="eyeOffOutline" />
          <span>Consciously skipped ({{ skippedItems.length }})</span>
          <span class="chevron" :class="{ open: showSkipped }">&#9662;</span>
        </button>

        <IonList v-if="showSkipped">
          <IonItemSliding v-for="item in skippedItems" :key="item.id">
            <IonItem class="item-skipped">
              <IonLabel>
                <h3>{{ item.name }}</h3>
              </IonLabel>
            </IonItem>
            <IonItemOptions side="end">
              <IonItemOption color="success" @click="onUnskipItem(item)">
                <IonIcon slot="icon-only" :icon="eyeOutline" />
              </IonItemOption>
            </IonItemOptions>
          </IonItemSliding>
        </IonList>
      </div>
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

/* KPI prep open */
.prep-open {
  color: var(--ion-color-warning);
}

/* Item states */
.item-packed {
  opacity: 0.5;
}

.item-packed-open-prep {
  border-left: 3px solid var(--ion-color-warning);
}

.prep-badge {
  font-size: 0.65rem;
  vertical-align: middle;
  margin-left: 6px;
}

.item-skipped {
  opacity: 0.5;
}

.item-skipped h3 {
  text-decoration: line-through;
}

/* Preparation section */
.prep-section {
  margin-top: 16px;
  border-top: 1px solid var(--ion-color-light-shade);
}

.prep-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  background: var(--ion-color-warning-tint);
  border: none;
  cursor: pointer;
  color: var(--ion-color-warning-shade);
  font-size: 0.9rem;
}

/* Skipped section */
.skipped-section {
  margin-top: 16px;
  border-top: 1px solid var(--ion-color-light-shade);
}

.skipped-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  background: var(--ion-color-light);
  border: none;
  cursor: pointer;
  color: var(--ion-color-medium);
  font-size: 0.9rem;
}

.chevron {
  margin-left: auto;
  transition: transform 0.2s;
}

.chevron.open {
  transform: rotate(180deg);
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

.shopping-badge {
  margin-left: 4px;
  font-size: 0.7rem;
}

.item-locked {
  opacity: 0.65;
}

.edit-containers {
  padding: 8px 16px 0;
}

.kpi-tappable {
  cursor: pointer;
}

.lock-icon {
  font-size: 22px;
  color: var(--ion-color-primary);
  padding: 8px;
}
</style>
