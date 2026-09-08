<script setup lang="ts">
/**
 * The bar that shows or hides a set of rows the screen is keeping back
 * (FR-21.22): M4's packed rows and its other people's rows, M6's bought ones.
 *
 * It was a dashed outline in two screens' stylesheets, twenty identical
 * declarations apart. A dashed border is the app's mark for *a place where
 * something is not yet* — the empty picker slot, the quick-add invitation —
 * and this is the opposite: rows that exist, counted in the label, one tap
 * from being on screen. So it is a filled button with a caret that says
 * which way the tap goes, and `aria-expanded` says the same thing to a
 * reader that cannot see the caret.
 */
import { IonIcon } from '@ionic/vue'
import { chevronDownOutline, chevronUpOutline } from 'ionicons/icons'

defineProps<{
  /** Whether the rows it governs are on screen right now. */
  open: boolean
  /** The whole sentence, count included — the screen owns the wording. */
  label: string
  testid: string
}>()

defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    class="reveal-bar"
    :class="{ on: open }"
    :data-testid="testid"
    :aria-expanded="open"
    @click="$emit('toggle')"
  >
    <IonIcon :icon="open ? chevronUpOutline : chevronDownOutline" aria-hidden="true" />
    <span>{{ label }}</span>
  </button>
</template>

<style scoped>
.reveal-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: calc(100% - 24px);
  margin: 10px 12px;
  padding: 10px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-md);
  background: var(--ct-surface0);
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  cursor: pointer;
  text-align: start;
}

/* Open, the bar is the head of the rows under it rather than a lid on
   them: the label carries the screen's text colour and the caret points
   back the way the tap goes. */
.reveal-bar.on {
  color: var(--ct-text);
}

.reveal-bar ion-icon {
  flex: 0 0 auto;
  font-size: var(--jp-icon-sm);
}
</style>
