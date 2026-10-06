<script setup lang="ts">
/**
 * FR-25.28 — the for-whom seat: the door to the strip, laid over the row's
 * lead slot. It draws nothing of its own — the caller puts in what the slot
 * already holds, the item's mark or a lone per-person row's face — because a
 * glyph saying *shared* on nine rows in ten would cost every name a column
 * (UX-03). The row's press-and-hold menu names the same door (*Für wen …*).
 *
 * It is a `role="button"` span rather than the native element because one of
 * its two hosts, the cluster head, *is* one, and interactive content may not nest.
 *
 * It is `ion-activatable` for the same reason in reverse: Ionic's tap feedback
 * listens in the capture phase and lights the first activatable on the event's
 * path, so without the class a tap on the seat rippled the whole row — which
 * says *this opens the item*, the one thing the seat does not do.
 */
import { t } from '@/i18n'

defineProps<{
  /** The item's name, for the accessible label. */
  itemName: string
  open: boolean
  testKey: string
}>()

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <!-- `.stop.prevent` and `@pointerdown.stop` for the reasons PackingRow's
       control column gives: the host's own tap and press-and-hold must not
       fire under a control that has its own meaning. -->
  <span
    class="seat ion-activatable"
    :class="{ open }"
    role="button"
    tabindex="0"
    :aria-expanded="open"
    :aria-label="t('forWhom.seat', { item: itemName })"
    :data-testid="`for-whom-seat-${testKey}`"
    @click.stop.prevent="emit('toggle')"
    @keydown.enter.stop.prevent="emit('toggle')"
    @keydown.space.stop.prevent="emit('toggle')"
    @pointerdown.stop
  >
    <slot />
  </span>
</template>

<style scoped>
/* The lead slot's own box — the mark's 22px + 10px, the face's 24px + 8px —
   so a name starts at one x whether its slot is a door or not (FR-21.19). */
.seat {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 40px;
  border-radius: var(--jp-r-pill);
  cursor: pointer;
}

.seat.open,
.seat.ion-activated {
  background: color-mix(in srgb, var(--jp-action) 16%, transparent);
}
</style>
