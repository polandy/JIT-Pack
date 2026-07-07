<script setup lang="ts">
/**
 * G-6 Quantity Stepper — unified control for packing quantities.
 *
 * qty=1: renders a plain checkbox (tap toggles packed/open).
 * qty>1: renders a stepper showing "packed/total" with +/- buttons.
 * Long-press on + completes fully; long-press on - zeros out.
 */
import { IonCheckbox, IonIcon } from '@ionic/vue'
import { removeOutline, addOutline } from 'ionicons/icons'
import { computed } from 'vue'

const props = defineProps<{
  quantity: number
  packed: number
}>()

const emit = defineEmits<{
  increment: []
  decrement: []
  complete: []
  zero: []
  toggle: []
}>()

const isCheckbox = computed(() => props.quantity === 1)
const isComplete = computed(() => props.packed >= props.quantity)
const isPartial = computed(() => props.packed > 0 && props.packed < props.quantity)

let longPressTimer: ReturnType<typeof setTimeout> | null = null

function onPlusDown() {
  longPressTimer = setTimeout(() => {
    emit('complete')
    longPressTimer = null
  }, 500)
}

function onPlusUp() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
    emit('increment')
  }
}

function onMinusDown() {
  longPressTimer = setTimeout(() => {
    emit('zero')
    longPressTimer = null
  }, 500)
}

function onMinusUp() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
    emit('decrement')
  }
}
</script>

<template>
  <!-- qty=1: checkbox -->
  <div v-if="isCheckbox" class="stepper-checkbox" @click="emit('toggle')">
    <IonCheckbox :checked="isComplete" :indeterminate="false" />
  </div>

  <!-- qty>1: stepper -->
  <div v-else class="stepper">
    <button
      class="stepper-btn"
      :disabled="packed <= 0"
      @pointerdown="onMinusDown"
      @pointerup="onMinusUp"
      @pointerleave="onMinusUp"
      aria-label="Decrease packed count"
    >
      <IonIcon :icon="removeOutline" />
    </button>
    <span class="stepper-count" :class="{ complete: isComplete, partial: isPartial }">
      {{ packed }}/{{ quantity }}
    </span>
    <button
      class="stepper-btn"
      :disabled="packed >= quantity"
      @pointerdown="onPlusDown"
      @pointerup="onPlusUp"
      @pointerleave="onPlusUp"
      aria-label="Increase packed count"
    >
      <IonIcon :icon="addOutline" />
    </button>
  </div>
</template>

<style scoped>
.stepper-checkbox {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.stepper {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.stepper-btn {
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
  font-size: 16px;
}

.stepper-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.stepper-btn:active:not(:disabled) {
  background: var(--ion-color-light);
}

.stepper-count {
  min-width: 36px;
  text-align: center;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.stepper-count.complete {
  color: var(--ion-color-success);
  font-weight: 600;
}

.stepper-count.partial {
  color: var(--ion-color-primary);
}
</style>
