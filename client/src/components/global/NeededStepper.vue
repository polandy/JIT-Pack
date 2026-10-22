<script setup lang="ts">
/**
 * FR-9.6's *zu viel* stepper: how many were actually needed, out of how many
 * were packed (ADR-103). Shared by M4's verdict sheet and M5's verdict
 * block — the same control either place a "fewer" verdict can be given.
 */
import { IonIcon } from '@ionic/vue'
import { addOutline, removeOutline } from 'ionicons/icons'
import { computed } from 'vue'

import { t } from '@/i18n'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min: number
    max: number
    /** The sheet's own id for this control — M4's chip and M5's block differ. */
    testid?: string
  }>(),
  { testid: 'm4-verdict-needed' },
)

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const atMin = computed(() => props.modelValue <= props.min)
const atMax = computed(() => props.modelValue >= props.max)

function decrement() {
  if (!atMin.value) emit('update:modelValue', props.modelValue - 1)
}

function increment() {
  if (!atMax.value) emit('update:modelValue', props.modelValue + 1)
}
</script>

<template>
  <div
    class="needed-stepper"
    :data-testid="testid"
    :aria-label="t('verdict.neededLabel', { n: modelValue, m: max })"
  >
    <span class="needed-word">{{ t('verdict.neededWord') }}</span>
    <button
      class="needed-btn"
      type="button"
      :disabled="atMin"
      :aria-label="t('packing.decrease')"
      @click="decrement"
    >
      <IonIcon :icon="removeOutline" />
    </button>
    <span class="needed-count jp-num">{{ modelValue }}</span>
    <button
      class="needed-btn"
      type="button"
      :disabled="atMax"
      :aria-label="t('packing.increase')"
      @click="increment"
    >
      <IonIcon :icon="addOutline" />
    </button>
    <span class="needed-word">{{ t('verdict.neededOf', { m: max }) }}</span>
  </div>
</template>

<style scoped>
.needed-stepper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.needed-word {
  font-size: var(--jp-text-sm);
  color: var(--ion-color-medium);
}

.needed-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--ion-color-medium);
  background: none;
  cursor: pointer;
  color: var(--ion-text-color);
  font-size: var(--jp-icon-sm);
}

.needed-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.needed-btn:active:not(:disabled) {
  background: var(--ion-color-light);
}

.needed-count {
  min-width: 24px;
  text-align: center;
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
}
</style>
