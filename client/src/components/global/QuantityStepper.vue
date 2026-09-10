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
import { computed, onUnmounted } from 'vue'

import { t } from '@/i18n'
import { useLongPress } from '@/composables/useLongPress'

const props = withDefaults(
  defineProps<{
    quantity: number
    packed: number
    /** G-3: somebody else holds this row, so it reads but does not write. */
    disabled?: boolean
    /**
     * The control at the size of a screen's main action rather than a row's
     * (FR-21.25). M5 is opened to pack the thing, and the control that does
     * it was the smallest thing on the sheet.
     */
    large?: boolean
  }>(),
  { disabled: false, large: false },
)

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

/**
 * The two holds, on the gesture the row around them already uses.
 *
 * This was a hand-rolled `setTimeout` pair that borrowed only the 500 ms
 * from `useLongPress` and left its three cancellations behind, while
 * `PackingRow` — the very row these buttons sit in — wires all of them.
 * Each missing one wrote to the trip on its own:
 *
 * - no `pointercancel`: the browser takes the pointer to scroll the list
 *   with it, no up and no leave ever arrives, and half a second later the
 *   row packs itself completely;
 * - no travel slop: a flick that begins on ✚ is a scroll, not a hold;
 * - a leave that *committed* rather than cancelled: dragging off the 28 px
 *   circle counted as the tap, so the same flick stepped the row by one;
 * - no clearing on unmount: a filter or a navigation takes the row away
 *   mid-press, and the emit still lands on whatever the parent does next.
 */
type Side = 'plus' | 'minus'

const hold = useLongPress<Side>((side) => {
  if (side === 'plus') emit('complete')
  else emit('zero')
})

function onDown(side: Side, event: PointerEvent) {
  hold.down(side, event.clientX, event.clientY)
}

function onMove(event: PointerEvent) {
  hold.move(event.clientX, event.clientY)
}

/** A release that disarms *this* button's armed hold is its tap. */
function onUp(side: Side) {
  if (hold.cancel() !== side) return
  if (side === 'plus') emit('increment')
  else emit('decrement')
}

onUnmounted(() => void hold.cancel())
</script>

<template>
  <!-- qty=1: checkbox -->
  <div
    v-if="isCheckbox"
    class="stepper-checkbox"
    :class="{ large }"
    data-testid="row-check"
    @click="disabled || emit('toggle')"
  >
    <IonCheckbox :checked="isComplete" :indeterminate="false" :disabled="disabled" />
  </div>

  <!-- qty>1: stepper -->
  <div v-else class="stepper" :class="{ large }">
    <button
      class="stepper-btn"
      :disabled="disabled || packed <= 0"
      @pointerdown="(e: PointerEvent) => onDown('minus', e)"
      @pointermove="onMove"
      @pointerup="onUp('minus')"
      @pointercancel="hold.cancel()"
      @pointerleave="hold.cancel()"
      data-testid="row-minus"
      :aria-label="t('packing.decrease')"
    >
      <IonIcon :icon="removeOutline" />
    </button>
    <span class="stepper-count jp-num" :class="{ complete: isComplete, partial: isPartial }">
      {{ packed }}/{{ quantity }}
    </span>
    <button
      class="stepper-btn"
      :disabled="disabled || packed >= quantity"
      @pointerdown="(e: PointerEvent) => onDown('plus', e)"
      @pointermove="onMove"
      @pointerup="onUp('plus')"
      @pointercancel="hold.cancel()"
      @pointerleave="hold.cancel()"
      data-testid="row-plus"
      :aria-label="t('packing.increase')"
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

/* One control at two sizes, not two controls (G-6): a row's checkbox and
   the sheet's main action are the same thing seen from different distances. */
.stepper-checkbox.large ion-checkbox {
  --size: 30px;
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
  font-size: var(--jp-icon-sm);
}

.stepper.large .stepper-btn {
  width: 38px;
  height: 38px;
  font-size: var(--jp-icon-md);
}

.stepper.large .stepper-count {
  min-width: 48px;
  font-size: var(--jp-text-lg);
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
  font-size: var(--jp-text-sm);
}

.stepper-count.complete {
  color: var(--ion-color-success);
  font-weight: var(--jp-weight-semibold);
}

.stepper-count.partial {
  color: var(--ion-color-primary);
}
</style>
