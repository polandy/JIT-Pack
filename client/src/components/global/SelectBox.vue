<script setup lang="ts">
/**
 * A row's selection checkbox at its leading edge, in the grip's own place
 * while a list is selecting (`useRowSelection`) — M6, M25 and M9 alike.
 *
 * `off` is a row the selection cannot take: dashed and dimmed, the same
 * refusal `DragGrip`'s `off` draws for a row with nothing to drag.
 */
import { IonIcon } from '@ionic/vue'
import { checkmarkOutline } from 'ionicons/icons'

defineProps<{
  /** Chosen. */
  on?: boolean
  /** Not selectable at all. */
  off?: boolean
}>()
</script>

<template>
  <span class="select-box" :class="{ on: on && !off, off }" aria-hidden="true">
    <IonIcon v-if="on && !off" :icon="checkmarkOutline" />
  </span>
</template>

<style scoped>
.select-box {
  width: 20px;
  height: 20px;
  flex: none;
  display: grid;
  place-items: center;
  margin-inline-end: 12px;
  border: 1.5px solid var(--ct-surface2);
  border-radius: var(--jp-r-xs);
  color: transparent;
}

.select-box.on {
  background: var(--jp-action);
  border-color: var(--jp-action);
  color: var(--ct-crust);
}

.select-box.off {
  border-style: dashed;
  opacity: 0.5;
}
</style>
