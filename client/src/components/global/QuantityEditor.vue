<script setup lang="ts">
/**
 * How many of a row are meant to come along (FR-25.24) — one control,
 * rendered in two places: M4 hangs it off the row's count (the list stays
 * where it is, so ten corrections cost ten taps), M5 gives it a block of
 * its own above *Einpacken* (there is room there for what the amount is
 * being weighed against).
 *
 * It is deliberately **not** the G-6 stepper: that one counts what is
 * already packed, and the two numbers it shows as `2/5` mean opposite
 * things to the person looking at them. Same row, same digits, different
 * question — so a different control, with the amount alone in the middle.
 *
 * The component owns no state and commits every change immediately (G-5).
 */
import { IonIcon } from '@ionic/vue'
import { addOutline, removeOutline } from 'ionicons/icons'
import { computed } from 'vue'

import { t } from '@/i18n'
import {
  QUANTITY_MAX,
  QUANTITY_MIN,
  clampQuantity,
  type QuantityChoice,
} from '@/domain/quantityChoices'

const props = defineProps<{
  /** The planned amount, as the row has it now. */
  quantity: number
  /** How many are packed already — the floor the row cannot lose. */
  packed: number
  /** The quick amounts to offer, from `quantityChoices`. */
  choices: QuantityChoice[]
  /** G-3: somebody else holds the row, so the editor reads but does not write. */
  disabled?: boolean
}>()

const emit = defineEmits<{ update: [quantity: number] }>()

const atMin = computed(() => props.quantity <= QUANTITY_MIN)
const atMax = computed(() => props.quantity >= QUANTITY_MAX)

/**
 * The one sentence under the number: what lowering it would cost. A row
 * with nothing packed yet has nothing to say here, and says nothing —
 * an always-present line that is usually "0 gepackt" trains the eye to
 * skip the place where the warning appears.
 */
const packedHint = computed(() =>
  props.packed > 0 ? t('quantity.packedHint', { n: props.packed }) : '',
)

/** Whether lowering to `value` would drop rows that are already packed. */
function unpacks(value: number): boolean {
  return value < props.packed
}

function label(choice: QuantityChoice): string {
  if (choice.kind === 'days') return t('quantity.perDay', { n: choice.value })
  if (choice.kind === 'travelers') return t('quantity.perTraveler', { n: choice.value })
  return String(choice.value)
}

function set(value: number): void {
  if (props.disabled) return
  const wanted = clampQuantity(value)
  if (wanted === props.quantity) return
  emit('update', wanted)
}
</script>

<template>
  <div class="qty" data-testid="quantity-editor">
    <div class="qty-row">
      <button
        class="qty-btn"
        type="button"
        :disabled="disabled || atMin"
        :aria-label="t('quantity.less')"
        data-testid="quantity-less"
        @click="set(props.quantity - 1)"
      >
        <IonIcon :icon="removeOutline" />
      </button>
      <div class="qty-value">
        <span class="qty-number jp-num" data-testid="quantity-value">{{ props.quantity }}</span>
        <span v-if="packedHint" class="qty-hint" data-testid="quantity-packed-hint">
          {{ packedHint }}
        </span>
      </div>
      <button
        class="qty-btn"
        type="button"
        :disabled="disabled || atMax"
        :aria-label="t('quantity.more')"
        data-testid="quantity-more"
        @click="set(props.quantity + 1)"
      >
        <IonIcon :icon="addOutline" />
      </button>
    </div>

    <!-- The quick amounts. The two computed ones say what they are rather
         than only what they equal: "pro Tag · 7" is the reason a person
         wanted seven, and it survives being read a week later. -->
    <div class="qty-chips">
      <button
        v-for="choice in props.choices"
        :key="`${choice.kind}-${choice.value}`"
        class="qty-chip"
        type="button"
        :class="{ on: choice.value === props.quantity, computed: choice.kind !== 'plain' }"
        :disabled="disabled"
        :aria-pressed="choice.value === props.quantity"
        :data-testid="`quantity-choice-${choice.kind}-${choice.value}`"
        @click="set(choice.value)"
      >
        {{ label(choice) }}
        <span v-if="unpacks(choice.value)" class="qty-warn" aria-hidden="true">!</span>
      </button>
    </div>

    <!-- FR-5.5 owns zero, and says so here rather than leaving the − button
         looking broken at 1. -->
    <p class="qty-foot">{{ t('quantity.zeroHint') }}</p>
  </div>
</template>

<style scoped>
.qty {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.qty-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
}

/* The same 38 px as the pack stepper's large form: the two blocks are
   siblings on M5, and the screen is opened to pack the thing (FR-21.25) —
   an amount drawn bigger than the packing control inverts that. */
.qty-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--jp-r-pill);
  border: 1px solid var(--ct-surface1);
  background: var(--ct-surface0);
  color: var(--ion-text-color);
  font-size: var(--jp-icon-md);
  cursor: pointer;
}

.qty-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.qty-value {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 84px;
}

.qty-number {
  font-family: var(--jp-font-display);
  font-size: var(--jp-text-display-sm);
  font-weight: var(--jp-weight-semibold);
  line-height: 1.1;
}

.qty-hint {
  font-size: var(--jp-text-2xs);
  color: var(--ct-subtext0);
  text-align: center;
}

.qty-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.qty-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  border-radius: var(--jp-r-pill);
  border: 1px solid var(--ct-surface1);
  background: var(--ct-surface0);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

/* The trip's own arithmetic, marked as a different kind of offer than a
   bare number — dashed, the way the prototype marks a derived value. */
.qty-chip.computed {
  border-style: dashed;
}

.qty-chip.on {
  border-color: color-mix(in srgb, var(--jp-brand) 55%, transparent);
  background: color-mix(in srgb, var(--jp-brand) 20%, transparent);
  color: var(--jp-brand);
}

.qty-chip:disabled {
  opacity: 0.4;
  cursor: default;
}

/* An amount below what is packed is allowed — it is how a mis-count is
   corrected — but it is never the tap somebody meant to make blind. */
.qty-warn {
  color: var(--ct-ember);
  font-weight: var(--jp-weight-bold);
}

.qty-foot {
  margin: 0;
  text-align: center;
  font-size: var(--jp-text-2xs);
  color: var(--ct-subtext0);
}
</style>
