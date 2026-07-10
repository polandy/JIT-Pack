<script setup lang="ts">
/**
 * Quick-add item inline in the packing list (M4).
 *
 * Simple text input with autocomplete from master item inventory.
 * Enter creates the trip_item immediately via outbox (G-5).
 * If the trip is active, new items are auto-flagged missing (FR-9.1).
 */
import { IonInput, IonList, IonItem, IonLabel, IonIcon, IonChip } from '@ionic/vue'
import { addCircleOutline, closeCircleOutline } from 'ionicons/icons'
import { ref, computed } from 'vue'
import { useMasterStore } from '@/stores/masterStore'
import type { MasterItem } from '@/types/domain'

defineProps<{
  tripId: string
  isActive: boolean
}>()

const emit = defineEmits<{
  add: [
    item: {
      name: string
      sourceItemId: string | null
      weightGrams: number | null
      valueCents: number | null
      categoryName: string | null
    },
  ]
}>()

const masterStore = useMasterStore()

const expanded = ref(false)
const query = ref('')
const inputRef = ref<InstanceType<typeof IonInput> | null>(null)

const suggestions = computed(() => {
  if (!query.value || query.value.length < 2) return []
  return masterStore.searchItems(query.value).slice(0, 5)
})

function toggle() {
  expanded.value = !expanded.value
  if (expanded.value) {
    setTimeout(() => inputRef.value?.$el?.setFocus(), 100)
  } else {
    query.value = ''
  }
}

function selectSuggestion(item: MasterItem) {
  const catMap = new Map<string, string>()
  for (const cat of masterStore.categoryList) {
    catMap.set(cat.id, cat.name)
  }

  emit('add', {
    name: item.name,
    sourceItemId: item.id,
    weightGrams: item.weight_grams,
    valueCents: item.value_cents,
    categoryName: item.category_id ? (catMap.get(item.category_id) ?? null) : null,
  })
  query.value = ''
  expanded.value = false
}

function submitFreeText() {
  const name = query.value.trim()
  if (!name) return

  emit('add', {
    name,
    sourceItemId: null,
    weightGrams: null,
    valueCents: null,
    categoryName: null,
  })
  query.value = ''
  // Keep expanded for rapid entry
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    submitFreeText()
  }
  if (event.key === 'Escape') {
    expanded.value = false
    query.value = ''
  }
}
</script>

<template>
  <div class="quick-add" :class="{ expanded }">
    <!-- Collapsed: just a button -->
    <button v-if="!expanded" class="quick-add-trigger" @click="toggle">
      <IonIcon :icon="addCircleOutline" />
      <span>Add item...</span>
    </button>

    <!-- Expanded: input with suggestions -->
    <div v-else class="quick-add-form">
      <div class="input-row">
        <IonInput
          ref="inputRef"
          v-model="query"
          placeholder="Item name..."
          :clear-input="true"
          @keydown="onKeydown"
        />
        <button class="close-btn" @click="toggle" aria-label="Close">
          <IonIcon :icon="closeCircleOutline" />
        </button>
      </div>

      <!-- Active trip hint -->
      <p v-if="isActive" class="add-hint">New items will be flagged as missing</p>

      <!-- Autocomplete suggestions from inventory -->
      <IonList v-if="suggestions.length > 0" class="suggestions">
        <IonItem
          v-for="item in suggestions"
          :key="item.id"
          button
          @click="selectSuggestion(item)"
          lines="inset"
        >
          <IonLabel>
            <h3>{{ item.name }}</h3>
            <p v-if="item.weight_grams">
              {{
                item.weight_grams >= 1000
                  ? `${(item.weight_grams / 1000).toFixed(1)} kg`
                  : `${item.weight_grams} g`
              }}
            </p>
          </IonLabel>
          <IonChip v-if="item.unit !== 'pieces'" slot="end" color="medium" outline>
            {{ item.unit }}
          </IonChip>
        </IonItem>
      </IonList>

      <!-- Free-text submit hint -->
      <p v-if="query.length >= 2 && suggestions.length === 0" class="no-match">
        Press Enter to add "{{ query }}" as new item
      </p>
      <p v-else-if="query.length >= 2" class="enter-hint">
        Press Enter to add "{{ query }}" or pick from above
      </p>
    </div>
  </div>
</template>

<style scoped>
.quick-add {
  padding: 8px 16px;
}

.quick-add-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  background: var(--ion-color-light);
  border: 1px dashed var(--ion-color-medium);
  border-radius: 8px;
  cursor: pointer;
  color: var(--ion-color-medium);
  font-size: 0.95rem;
}

.quick-add-trigger:active {
  background: var(--ion-color-light-shade);
}

.quick-add-form {
  background: var(--ion-color-light);
  border: 1px solid var(--ion-color-primary);
  border-radius: 8px;
  padding: 8px;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.input-row ion-input {
  flex: 1;
}

.close-btn {
  display: flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ion-color-medium);
  font-size: 20px;
  padding: 4px;
}

.suggestions {
  margin-top: 4px;
  background: transparent;
}

.add-hint {
  font-size: 0.75rem;
  color: var(--ion-color-warning);
  margin: 4px 8px 0;
}

.no-match,
.enter-hint {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  margin: 8px 8px 0;
}
</style>
