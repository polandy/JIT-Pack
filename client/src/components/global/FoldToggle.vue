<script setup lang="ts">
/**
 * *„› 3 erledigt"* / *„› 2 gekauft"* — the one fold at a section's end that
 * holds what is finished (M25's FR-7.14 fold, M6's FR-25.11j reveal; one
 * component for both). Its words do not change when it opens; the
 * caret and `aria-expanded` say so.
 */
import { IonIcon } from '@ionic/vue'
import { chevronForwardOutline } from 'ionicons/icons'

defineProps<{ label: string; open: boolean; testid: string }>()
const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    class="fold-toggle"
    :class="{ open }"
    :aria-expanded="open ? 'true' : 'false'"
    :data-testid="testid"
    @click="emit('toggle')"
  >
    <IonIcon :icon="chevronForwardOutline" class="caret" aria-hidden="true" />
    {{ label }}
  </button>
</template>

<style scoped>
.fold-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding: 6px 16px;
  border: none;
  background: none;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.fold-toggle:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}

.caret {
  transition: transform 0.15s;
}

.fold-toggle.open .caret {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  .caret {
    transition: none;
  }
}
</style>
