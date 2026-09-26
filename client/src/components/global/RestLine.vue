<script setup lang="ts">
/**
 * A list section with nothing left open, folded to one line at the end of the
 * screen (M6 and M25 alike): *„Vor der Reise · nichts offen · 2 gekauft ›"*.
 * A section with nothing to do waits below the one still being worked rather
 * than taking a heading's worth of room above it. The closed *before* of FR-7.12 wears the same line.
 *
 * The line opens only where there is something to show; with nothing done
 * or bought it is a statement, not a control.
 */
import { IonIcon } from '@ionic/vue'
import { chevronForwardOutline } from 'ionicons/icons'

defineProps<{
  label: string
  /** Something to show below it — otherwise the line is plain text. */
  expandable: boolean
  open: boolean
  testid: string
}>()

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <div class="rest-line">
    <button
      v-if="expandable"
      type="button"
      class="line jp-card"
      :aria-expanded="open ? 'true' : 'false'"
      :data-testid="testid"
      @click="emit('toggle')"
    >
      <span>{{ label }}</span>
      <IonIcon :icon="chevronForwardOutline" class="caret" :class="{ open }" aria-hidden="true" />
    </button>
    <p v-else class="line jp-card" :data-testid="testid">{{ label }}</p>
    <slot v-if="expandable && open" />
  </div>
</template>

<style scoped>
.rest-line {
  margin-top: 18px;
}

.line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: calc(100% - 24px);
  margin: 0 12px 8px;
  padding: 12px 16px;
  border: none;
  color: var(--ct-subtext1);
  font: inherit;
  text-align: start;
}

button.line {
  cursor: pointer;
}

button.line:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}

.caret {
  transition: transform 0.15s;
}

.caret.open {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  .caret {
    transition: none;
  }
}
</style>
