<script setup lang="ts">
/** FR-24.4 „Angezeigte Eigenschaften" — device-local, no save button. */
import { IonItem, IonLabel, IonList, IonModal, IonToggle } from '@ionic/vue'

import {
  offeredProperties,
  type InventoryProperty,
  type inventoryProperties,
} from '@/composables/useInventoryProperties'
import { t } from '@/i18n'

defineProps<{
  isOpen: boolean
  /** G-8: the assignee is offered only where there is somebody to name. */
  canAssign: boolean
  properties: ReturnType<typeof inventoryProperties>
}>()

defineEmits<{ dismiss: [] }>()

function propertyLabel(key: InventoryProperty): string {
  return t(`items.property.${key}`)
}
</script>

<template>
  <IonModal
    :is-open="isOpen"
    :initial-breakpoint="0.5"
    :breakpoints="[0, 0.5]"
    data-testid="m9-properties-sheet"
    @didDismiss="$emit('dismiss')"
  >
    <div class="sheet-body ion-padding">
      <h2 class="jp-sheet-title">{{ t('items.properties') }}</h2>
      <p class="sheet-hint">{{ t('items.propertiesHint') }}</p>

      <IonList>
        <IonItem v-for="key in offeredProperties(canAssign)" :key="key" lines="full">
          <IonLabel>{{ propertyLabel(key) }}</IonLabel>
          <IonToggle
            slot="end"
            :checked="properties.isShown(key)"
            :data-testid="`m9-property-${key}`"
            @ionChange="properties.toggle(key)"
          />
        </IonItem>
      </IonList>
    </div>
  </IonModal>
</template>

<style scoped>
.sheet-hint {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-sm);
  margin: 0 0 12px;
}
</style>
