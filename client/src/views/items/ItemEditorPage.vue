<script setup lang="ts">
/**
 * M10 — Item Editor
 *
 * Edit one master item: name, category, weight, value, unit, consumable.
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
} from '@ionic/vue'
import { computed, inject } from 'vue'
import { useMasterStore } from '@/stores/masterStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const props = defineProps<{ itemId: string }>()

const masterStore = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const item = computed(() => masterStore.getItem(props.itemId))
const categories = computed(() => masterStore.categoryList)

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
</style>
