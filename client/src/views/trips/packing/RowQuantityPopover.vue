<script setup lang="ts">
/**
 * FR-25.24: the amount, over the list rather than instead of it — the rows
 * around the one being corrected are what makes the number decidable. The
 * state is `useRowQuantity`'s; this is only its popover.
 */
import { IonPopover } from '@ionic/vue'

import QuantityEditor from '@/components/global/QuantityEditor.vue'
import type { QuantityChoice } from '@/domain/quantityChoices'
import { t } from '@/i18n'
import type { TripItem } from '@/types/domain'

defineProps<{
  open: boolean
  /** The tap Ionic anchors to; none centres the popover. */
  event: MouseEvent | undefined
  /** What a popover standing for several rows is named; null names the row. */
  label: string | null
  item: TripItem | null
  packed: number
  choices: QuantityChoice[]
}>()

defineEmits<{ update: [quantity: number]; closed: [] }>()
</script>

<template>
  <IonPopover
    :is-open="open"
    :event="event"
    data-testid="m4-quantity-popover"
    @did-dismiss="$emit('closed')"
  >
    <div class="qty-pop">
      <p class="qty-pop-head">
        <span class="jp-eyebrow">{{ t('quantity.title') }}</span>
        <span class="qty-pop-name">{{ label ?? item?.name }}</span>
      </p>
      <QuantityEditor
        v-if="item"
        :quantity="item.quantity"
        :packed="packed"
        :choices="choices"
        @update="(n: number) => $emit('update', n)"
      />
    </div>
  </IonPopover>
</template>

<style scoped>
/* The popover holds one control and its name, so it is padded like a card
   rather than like a screen. */
.qty-pop {
  padding: 16px 14px 12px;
}

.qty-pop-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 0 14px;
  text-align: center;
}

.qty-pop-name {
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
}
</style>
