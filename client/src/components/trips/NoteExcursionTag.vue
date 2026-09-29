<script setup lang="ts">
/**
 * FR-7.15: the excursion a thread is about, named quietly under its words —
 * the signpost M4 already puts beside a row an excursion borrows (FR-31.12).
 * A plain label on M26's card, which is one button already; a link into the
 * excursion's list on the thread view.
 */
import { IonIcon } from '@ionic/vue'
import { chevronForward, trailSignOutline } from 'ionicons/icons'

import { t } from '@/i18n'
import type { Excursion } from '@/types/domain'

const props = defineProps<{
  excursion: Excursion
  /** Opens the excursion — the thread view's; the card's tag is only read. */
  link?: boolean
}>()

const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <button
    v-if="props.link"
    type="button"
    class="tag link"
    :aria-label="t('notes.excursionLabel', { name: excursion.name })"
    data-testid="note-excursion-link"
    @click="emit('open')"
  >
    <IonIcon :icon="trailSignOutline" aria-hidden="true" />
    <span>{{ excursion.name }}</span>
    <IonIcon class="chevron" :icon="chevronForward" aria-hidden="true" />
  </button>
  <span
    v-else
    class="tag"
    :aria-label="t('notes.excursionLabel', { name: excursion.name })"
    data-testid="note-thread-excursion"
  >
    <IonIcon :icon="trailSignOutline" aria-hidden="true" />
    <span>{{ excursion.name }}</span>
  </span>
</template>

<style scoped>
.tag {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 5px;
  max-width: 100%;
  color: var(--ct-subtext1);
  font: inherit;
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-medium);
}

.tag span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag ion-icon {
  flex: none;
  font-size: var(--jp-icon-sm);
}

.link {
  margin: 0;
  padding: 4px 10px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--jp-action);
  cursor: pointer;
}

.link .chevron {
  color: var(--ct-subtext0);
}

.link:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}
</style>
