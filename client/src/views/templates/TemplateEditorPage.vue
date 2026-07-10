<script setup lang="ts">
/**
 * M8 — Template Editor
 *
 * Define items, formulas, and conditions of one template.
 * Item rows with name picker (from M9 inventory), quantity formula,
 * assignment type, default mode, dedup strategy.
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
  IonIcon,
  IonButton,
  IonChip,
  IonNote,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonSearchbar,
} from '@ionic/vue'
import {
  addOutline,
  trashOutline,
  warningOutline,
} from 'ionicons/icons'
import { computed, inject, ref } from 'vue'
import { validateFormula } from '@/domain/formula'
import { useMasterStore } from '@/stores/masterStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const props = defineProps<{ templateId: string }>()

const masterStore = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const template = computed(() => masterStore.getTemplate(props.templateId))
const templateItems = computed(() => masterStore.getTemplateItems(props.templateId))

const showItemPicker = ref(false)
const itemSearch = ref('')

const searchResults = computed(() => {
  if (!itemSearch.value) return masterStore.itemList.slice(0, 10)
  return masterStore.searchItems(itemSearch.value).slice(0, 10)
})

// IDs of items already in the template — used to hide them from picker
const existingItemIds = computed(() => new Set(templateItems.value.map((ti) => ti.item_id)))

const availableItems = computed(() =>
  searchResults.value.filter((i) => !existingItemIds.value.has(i.id)),
)

function dedupLabel(dedup: string): string {
  return dedup === 'max' ? 'Max' : 'Sum'
}

function resolveItemName(itemId: string): string {
  return masterStore.getItem(itemId)?.name ?? 'Unknown item'
}

function onAddItem(itemId: string) {
  showItemPicker.value = false
  itemSearch.value = ''
  orchestrator.addTemplateItem(props.templateId, itemId)
}

function onRemoveItem(templateItemId: string) {
  orchestrator.deleteTemplateItem(templateItemId)
}

// FR-1.5: invalid formulas cannot be persisted — the error stays inline
// until the input parses, the last valid formula remains stored.
const formulaErrors = ref<Record<string, string>>({})

function onFormulaChange(templateItemId: string, formula: string) {
  const ti = templateItems.value.find((t) => t.id === templateItemId)
  if (!ti) return
  const result = validateFormula(formula)
  if (!result.ok) {
    formulaErrors.value = { ...formulaErrors.value, [templateItemId]: result.error }
    return
  }
  const { [templateItemId]: _cleared, ...rest } = formulaErrors.value
  formulaErrors.value = rest
  orchestrator.updateTemplateItem(ti, { quantity_formula: formula })
}

function onAssignmentChange(templateItemId: string, assignment: string) {
  const ti = templateItems.value.find((t) => t.id === templateItemId)
  if (!ti) return
  orchestrator.updateTemplateItem(ti, { assignment })
}

function onModeChange(templateItemId: string, mode: string) {
  const ti = templateItems.value.find((t) => t.id === templateItemId)
  if (!ti) return
  orchestrator.updateTemplateItem(ti, { default_mode: mode })
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonButtons slot="start">
          <IonBackButton default-href="/tabs/templates" />
        </IonButtons>
        <IonTitle>{{ template?.name ?? 'Template' }}</IonTitle>
      </IonToolbar>
    </IonHeader>

    <IonContent class="ion-padding">
      <div v-if="!template" class="empty-state">
        <p>Template not found</p>
      </div>

      <template v-else>
        <!-- Published warning -->
        <div v-if="template.is_published" class="published-warning">
          <IonIcon :icon="warningOutline" />
          <span>Published — changes apply to new trips only</span>
        </div>

        <!-- Template items list -->
        <h2 class="section-title">Items ({{ templateItems.length }})</h2>

        <IonList v-if="templateItems.length > 0">
          <IonItemSliding v-for="ti in templateItems" :key="ti.id">
            <IonItem>
              <IonLabel>
                <h3>{{ resolveItemName(ti.item_id) }}</h3>
                <div class="ti-controls">
                  <div class="ti-field">
                    <span class="ti-label">Qty</span>
                    <IonInput
                      :value="ti.quantity_formula"
                      placeholder="1"
                      class="formula-input"
                      @ionBlur="(e: CustomEvent) => onFormulaChange(ti.id, (e.target as HTMLIonInputElement).value as string)"
                    />
                  </div>
                  <div class="ti-field">
                    <IonSelect
                      :value="ti.assignment"
                      interface="popover"
                      @ionChange="(e: CustomEvent) => onAssignmentChange(ti.id, e.detail.value)"
                    >
                      <IonSelectOption value="per_person">Per person</IonSelectOption>
                      <IonSelectOption value="trip_global">Trip global</IonSelectOption>
                    </IonSelect>
                  </div>
                  <div class="ti-field">
                    <IonSelect
                      :value="ti.default_mode"
                      interface="popover"
                      @ionChange="(e: CustomEvent) => onModeChange(ti.id, e.detail.value)"
                    >
                      <IonSelectOption value="pack">Pack</IonSelectOption>
                      <IonSelectOption value="buy_before">Buy before</IonSelectOption>
                      <IonSelectOption value="buy_local">Buy local</IonSelectOption>
                    </IonSelect>
                  </div>
                  <IonChip color="medium" outline>
                    {{ dedupLabel(ti.dedup) }}
                  </IonChip>
                </div>
                <IonNote v-if="formulaErrors[ti.id]" color="danger" class="formula-error">
                  <IonIcon :icon="warningOutline" />
                  {{ formulaErrors[ti.id] }}
                </IonNote>
              </IonLabel>
            </IonItem>
            <IonItemOptions side="end">
              <IonItemOption color="danger" @click="onRemoveItem(ti.id)">
                <IonIcon slot="icon-only" :icon="trashOutline" />
              </IonItemOption>
            </IonItemOptions>
          </IonItemSliding>
        </IonList>

        <div v-else class="empty-hint">
          <p>No items in this template yet</p>
        </div>

        <!-- Add item button / picker -->
        <div class="add-section">
          <IonButton v-if="!showItemPicker" expand="block" fill="outline" @click="showItemPicker = true">
            <IonIcon slot="start" :icon="addOutline" />
            Add item from inventory
          </IonButton>

          <div v-else class="item-picker">
            <IonSearchbar
              :value="itemSearch"
              placeholder="Search items..."
              @ionInput="(e: CustomEvent) => itemSearch = e.detail.value ?? ''"
              :debounce="200"
            />
            <IonList>
              <IonItem
                v-for="item in availableItems"
                :key="item.id"
                button
                @click="onAddItem(item.id)"
              >
                <IonLabel>
                  <h3>{{ item.name }}</h3>
                  <p v-if="item.weight_grams">{{ item.weight_grams }}g</p>
                </IonLabel>
              </IonItem>
              <IonItem v-if="availableItems.length === 0" lines="none">
                <IonLabel color="medium">No matching items</IonLabel>
              </IonItem>
            </IonList>
            <IonButton fill="clear" expand="block" @click="showItemPicker = false; itemSearch = ''">
              Cancel
            </IonButton>
          </div>
        </div>
      </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.section-title {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--ion-color-medium);
  margin: 16px 0 8px;
}

.published-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--ion-color-warning-tint);
  color: var(--ion-color-warning-shade);
  border-radius: 8px;
  font-size: 0.85rem;
  margin-bottom: 16px;
}

.ti-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.ti-field {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ti-label {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
}

.formula-error {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
  margin-top: 4px;
}

.formula-input {
  max-width: 60px;
  --padding-start: 4px;
  --padding-end: 4px;
  font-size: 0.9rem;
}

.add-section {
  margin-top: 16px;
}

.item-picker {
  border: 1px solid var(--ion-color-primary);
  border-radius: 8px;
  padding: 8px;
}

.empty-state,
.empty-hint {
  display: flex;
  justify-content: center;
  padding: 24px;
  color: var(--ion-color-medium);
}
</style>
