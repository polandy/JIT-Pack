<script setup lang="ts">
/**
 * M10 — Item Editor
 *
 * Edit one master item: name, category, weight, value, unit, consumable,
 * and its companion dependencies (Addendum 3.20).
 * Every change commits immediately (G-5).
 */
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonBackButton,
  IonButtons,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonNote,
  IonButton,
  IonIcon,
  IonSearchbar,
} from '@ionic/vue'
import { addOutline, trashOutline, warningOutline } from 'ionicons/icons'
import { computed, inject, ref } from 'vue'
import { dependencyCycleError } from '@/domain/dependencies'
import { useMasterStore } from '@/stores/masterStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const props = defineProps<{ itemId: string }>()

const masterStore = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const item = computed(() => masterStore.getItem(props.itemId))
const categories = computed(() => masterStore.categoryList)

// --- Depends on / Companions (FR-20.1/20.4) ---

const dependsOn = computed(() => masterStore.getItemDependencies(props.itemId))
const companions = computed(() => masterStore.getCompanionDependencies(props.itemId))

const showMainPicker = ref(false)
const mainSearch = ref('')
const dependencyError = ref('')

const pickableMains = computed(() => {
  const taken = new Set(dependsOn.value.map((d) => d.depends_on_item_id))
  const pool = mainSearch.value ? masterStore.searchItems(mainSearch.value) : masterStore.itemList
  return pool.filter((i) => i.id !== props.itemId && !taken.has(i.id)).slice(0, 10)
})

function itemName(id: string): string {
  return masterStore.getItem(id)?.name ?? 'Unknown item'
}

function closeMainPicker() {
  showMainPicker.value = false
  mainSearch.value = ''
}

function onAddDependency(mainItemId: string) {
  // A cycle cannot be persisted (save-time validation like FR-1.5).
  const error = dependencyCycleError(
    masterStore.dependencyList,
    { item_id: props.itemId, depends_on_item_id: mainItemId },
    itemName,
  )
  if (error) {
    dependencyError.value = error
    return
  }
  dependencyError.value = ''
  closeMainPicker()
  orchestrator.addItemDependency(props.itemId, mainItemId)
}

function onDependencyModeChange(dependencyId: string, mode: string) {
  const dep = dependsOn.value.find((d) => d.id === dependencyId)
  if (dep) orchestrator.updateItemDependency(dep, { mode })
}

function onRemoveDependency(dependencyId: string) {
  orchestrator.deleteItemDependency(dependencyId)
}

function updateField(field: string, value: unknown) {
  if (!item.value) return
  orchestrator.updateMasterItem(item.value, { [field]: value })
}

function onNameChange(event: CustomEvent) {
  const val = (event.target as HTMLIonInputElement).value as string
  if (val?.trim()) updateField('name', val.trim())
}

function onCategoryChange(event: CustomEvent) {
  updateField('category_id', event.detail.value)
}

function onWeightChange(event: CustomEvent) {
  const val = parseInt((event.target as HTMLIonInputElement).value as string)
  updateField('weight_grams', isNaN(val) ? null : val)
}

function onValueChange(event: CustomEvent) {
  const val = parseFloat((event.target as HTMLIonInputElement).value as string)
  updateField('value_cents', isNaN(val) ? null : Math.round(val * 100))
}

function onUnitChange(event: CustomEvent) {
  updateField('unit', event.detail.value)
}

function onRateChange(event: CustomEvent) {
  const val = parseFloat((event.target as HTMLIonInputElement).value as string)
  updateField('per_day_rate', isNaN(val) ? null : val)
}

function onConsumableChange(event: CustomEvent) {
  updateField('is_consumable', event.detail.checked ? 1 : 0)
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton default-href="/tabs/items" />
        </IonButtons>
        <IonTitle>{{ item?.name ?? 'Item' }}</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent class="ion-padding">
      <div v-if="!item" class="empty-state">
        <p>Item not found</p>
      </div>

      <template v-else>
        <IonList>
          <!-- Name -->
          <IonItem>
            <IonLabel position="stacked">Name</IonLabel>
            <IonInput :value="item.name" @ionBlur="onNameChange" />
          </IonItem>

          <!-- Category -->
          <IonItem>
            <IonLabel position="stacked">Category</IonLabel>
            <IonSelect
              :value="item.category_id"
              interface="popover"
              placeholder="None"
              @ionChange="onCategoryChange"
            >
              <IonSelectOption :value="null">None</IonSelectOption>
              <IonSelectOption v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </IonSelectOption>
            </IonSelect>
          </IonItem>

          <!-- Weight -->
          <IonItem>
            <IonLabel position="stacked">Weight (grams)</IonLabel>
            <IonInput
              type="number"
              :value="item.weight_grams ?? ''"
              placeholder="0"
              @ionBlur="onWeightChange"
            />
          </IonItem>

          <!-- Value -->
          <IonItem>
            <IonLabel position="stacked">Value</IonLabel>
            <IonInput
              type="number"
              step="0.01"
              :value="item.value_cents ? (item.value_cents / 100).toFixed(2) : ''"
              placeholder="0.00"
              @ionBlur="onValueChange"
            />
          </IonItem>

          <!-- Unit (FR-1.8) -->
          <IonItem>
            <IonLabel position="stacked">Unit</IonLabel>
            <IonSelect :value="item.unit" interface="popover" @ionChange="onUnitChange">
              <IonSelectOption value="pieces">Pieces</IonSelectOption>
              <IonSelectOption value="pairs">Pairs</IonSelectOption>
              <IonSelectOption value="per_day">Per day</IonSelectOption>
            </IonSelect>
          </IonItem>

          <!-- Per-day rate (only for per_day unit) -->
          <IonItem v-if="item.unit === 'per_day'">
            <IonLabel position="stacked">Rate per day</IonLabel>
            <IonInput
              type="number"
              step="0.1"
              :value="item.per_day_rate ?? ''"
              placeholder="1"
              @ionBlur="onRateChange"
            />
          </IonItem>

          <!-- Consumable (FR-1.7) -->
          <IonItem>
            <IonLabel>Consumable</IonLabel>
            <IonToggle :checked="item.is_consumable" @ionChange="onConsumableChange" />
            <IonNote slot="helper">
              Consumable items are expected to be repurchased between trips
            </IonNote>
          </IonItem>
        </IonList>

        <!-- Depends on / Companions (FR-20.1/20.4) -->
        <h2 class="section-title">Depends on</h2>
        <p class="section-hint">
          Only packed when its main item is on the trip — required joins automatically, suggested
          asks first.
        </p>

        <IonList v-if="dependsOn.length > 0">
          <IonItem v-for="dep in dependsOn" :key="dep.id">
            <IonLabel>{{ itemName(dep.depends_on_item_id) }}</IonLabel>
            <IonSelect
              :value="dep.mode"
              interface="popover"
              slot="end"
              @ionChange="(e: CustomEvent) => onDependencyModeChange(dep.id, e.detail.value)"
            >
              <IonSelectOption value="required">Required</IonSelectOption>
              <IonSelectOption value="suggested">Suggested</IonSelectOption>
            </IonSelect>
            <IonButton fill="clear" color="danger" slot="end" @click="onRemoveDependency(dep.id)">
              <IonIcon slot="icon-only" :icon="trashOutline" />
            </IonButton>
          </IonItem>
        </IonList>

        <IonNote v-if="dependencyError" color="danger" class="dependency-error">
          <IonIcon :icon="warningOutline" />
          {{ dependencyError }}
        </IonNote>

        <IonButton
          v-if="!showMainPicker"
          expand="block"
          fill="outline"
          @click="showMainPicker = true"
        >
          <IonIcon slot="start" :icon="addOutline" />
          Add dependency
        </IonButton>

        <div v-else class="main-picker">
          <IonSearchbar
            :value="mainSearch"
            placeholder="Search items..."
            :debounce="200"
            @ionInput="(e: CustomEvent) => (mainSearch = e.detail.value ?? '')"
          />
          <IonList>
            <IonItem
              v-for="main in pickableMains"
              :key="main.id"
              button
              @click="onAddDependency(main.id)"
            >
              <IonLabel>{{ main.name }}</IonLabel>
            </IonItem>
            <IonItem v-if="pickableMains.length === 0" lines="none">
              <IonLabel color="medium">No matching items</IonLabel>
            </IonItem>
          </IonList>
          <IonButton fill="clear" expand="block" @click="closeMainPicker()">Cancel</IonButton>
        </div>

        <template v-if="companions.length > 0">
          <h2 class="section-title">Companions</h2>
          <p class="section-hint">These items depend on {{ item.name }}:</p>
          <IonList>
            <IonItem v-for="dep in companions" :key="dep.id" lines="none">
              <IonLabel>{{ itemName(dep.item_id) }}</IonLabel>
              <IonNote slot="end">{{ dep.mode }}</IonNote>
            </IonItem>
          </IonList>
        </template>
      </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.empty-state {
  display: flex;
  justify-content: center;
  padding: 48px;
  color: var(--ion-color-medium);
}

.section-title {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--ion-color-medium);
  margin: 24px 0 4px;
}

.section-hint {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  margin: 0 0 8px;
}

.dependency-error {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
  margin: 8px 0;
}

.main-picker {
  border: 1px solid var(--ion-color-primary);
  border-radius: 8px;
  padding: 8px;
  margin-top: 8px;
}
</style>
