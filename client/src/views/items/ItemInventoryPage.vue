<script setup lang="ts">
/**
 * M9 — Item Inventory
 *
 * Central item database. Searchable, category-grouped list.
 * Per row: name, weight, value, unit chip, consumable chip.
 * FAB for new item.
 */
import {
  IonPage,
  IonContent,
  IonSearchbar,
  IonList,
  IonItemGroup,
  IonItemDivider,
  IonItem,
  IonLabel,
  IonIcon,
  IonChip,
  IonFab,
  IonFabButton,
  IonNote,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/vue'
import { addOutline, cubeOutline, leafOutline } from 'ionicons/icons'
import { ref, computed } from 'vue'
import { useMasterStore } from '@/stores/masterStore'
import type { MasterItem } from '@/types/domain'

const store = useMasterStore()
const searchQuery = ref('')

const filteredItems = computed(() => store.searchItems(searchQuery.value))

const groupedItems = computed(() => {
  if (searchQuery.value) {
    // Flat list when searching
    return new Map([['Search results', filteredItems.value]])
  }
  return store.itemsByCategory()
})

const isEmpty = computed(() => store.itemList.length === 0)
const noResults = computed(() => searchQuery.value && filteredItems.value.length === 0)

function formatWeight(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${grams} g`
}

function unitLabel(item: MasterItem): string {
  switch (item.unit) {
    case 'pairs': return 'pairs'
    case 'per_day': return `${item.per_day_rate ?? 1}/day`
    default: return ''
  }
}

function onSearch(event: CustomEvent) {
  searchQuery.value = event.detail.value ?? ''
}

async function handleRefresh(event: CustomEvent) {
  const refresher = event.target as HTMLIonRefresherElement
  refresher.complete()
}
</script>

<template>
  <IonPage>
    <IonContent>
      <IonRefresher slot="fixed" @ionRefresh="handleRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <div class="ion-padding">
        <h1 class="page-title">Items</h1>
        <IonSearchbar
          :value="searchQuery"
          placeholder="Search items..."
          @ionInput="onSearch"
          debounce="200"
        />
      </div>

      <!-- Empty state (G-7) -->
      <div v-if="isEmpty" class="empty-state">
        <IonIcon :icon="cubeOutline" class="empty-icon" />
        <p>No items in your inventory</p>
        <p class="empty-hint">Add items to build your packing templates</p>
      </div>

      <!-- No search results -->
      <div v-else-if="noResults" class="empty-state">
        <p>No items matching "{{ searchQuery }}"</p>
      </div>

      <!-- Category-grouped item list -->
      <IonList v-else>
        <IonItemGroup v-for="[category, items] in groupedItems" :key="category">
          <IonItemDivider sticky>
            <IonLabel>{{ category }}</IonLabel>
            <span slot="end" class="group-count">{{ items.length }}</span>
          </IonItemDivider>

          <IonItem v-for="item in items" :key="item.id" button :router-link="`/items/${item.id}`">
            <IonLabel>
              <h2>{{ item.name }}</h2>
              <p>
                <span v-if="item.weight_grams">{{ formatWeight(item.weight_grams) }}</span>
                <span v-if="item.weight_grams && item.value_cents"> · </span>
                <span v-if="item.value_cents">{{ (item.value_cents / 100).toFixed(2) }}</span>
              </p>
            </IonLabel>

            <!-- Unit chip (only for non-default) -->
            <IonChip v-if="item.unit !== 'pieces'" slot="end" color="medium" outline>
              {{ unitLabel(item) }}
            </IonChip>

            <!-- Consumable chip -->
            <IonChip v-if="item.is_consumable" slot="end" color="success" outline>
              <IonIcon :icon="leafOutline" />
            </IonChip>
          </IonItem>
        </IonItemGroup>
      </IonList>

      <!-- FAB: New item -->
      <IonFab vertical="bottom" horizontal="end" slot="fixed">
        <IonFabButton aria-label="New item">
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.page-title {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 16px 0 8px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--ion-color-medium);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-hint {
  font-size: 0.85rem;
  margin-top: 8px;
}

.group-count {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}
</style>
