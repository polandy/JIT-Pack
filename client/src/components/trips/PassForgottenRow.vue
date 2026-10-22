<script setup lang="ts">
/**
 * FR-9.6: the pass's own door for a thing that never made the list — a free
 * row, written already judged *fehlte* (`addDecidedItem`'s `forgotten`
 * decision sets `flag_missing` itself), so there is no second write after it
 * lands. Collapsed to one line until tapped, like the pass's other controls.
 */
import { IonButton, IonIcon, IonInput } from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { ref } from 'vue'

import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { t } from '@/i18n'

const props = defineProps<{
  tripId: string
  active: boolean
}>()

const orchestrator = useOrchestrator()

const forgottenOpen = ref(false)
const forgottenName = ref('')

function addForgottenRow() {
  const name = forgottenName.value.trim()
  if (!name) return
  orchestrator.packing.addDecidedItem(props.tripId, name, {}, props.active, 'forgotten')
  forgottenName.value = ''
  forgottenOpen.value = false
}
</script>

<template>
  <div class="forgotten-row">
    <button
      v-if="!forgottenOpen"
      type="button"
      class="forgotten-trigger"
      data-testid="m4-pass-forgotten"
      @click="forgottenOpen = true"
    >
      {{ t('verdict.forgottenAction') }}
    </button>
    <form v-else class="forgotten-form" @submit.prevent="addForgottenRow">
      <IonInput
        v-model="forgottenName"
        class="forgotten-input"
        :placeholder="t('verdict.forgottenAction')"
        :aria-label="t('verdict.forgottenAction')"
        data-testid="m4-pass-forgotten-input"
        @ion-blur="
          () => {
            if (!forgottenName.trim()) forgottenOpen = false
          }
        "
      />
      <IonButton
        type="submit"
        fill="clear"
        :disabled="forgottenName.trim() === ''"
        :aria-label="t('common.add')"
        data-testid="m4-pass-forgotten-submit"
      >
        <IonIcon slot="icon-only" :icon="addOutline" aria-hidden="true" />
      </IonButton>
    </form>
  </div>
</template>

<style scoped>
.forgotten-row {
  padding: 8px 16px 4px;
}

.forgotten-trigger {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border: 1px dashed var(--ct-overlay0);
  border-radius: var(--jp-r-pill);
  background: none;
  color: var(--ct-overlay1);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.forgotten-form {
  display: flex;
  align-items: center;
  gap: 4px;
}

.forgotten-input {
  flex: 1;
  --padding-start: 10px;
  --padding-end: 10px;
  border: 1px solid var(--ct-overlay0);
  border-radius: var(--jp-r-pill);
  font-size: var(--jp-text-sm);
}
</style>
