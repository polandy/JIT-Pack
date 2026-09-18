<script setup lang="ts">
/**
 * The name an item search did not find, offered to create or to restore
 * (FR-24.11).
 *
 * M9's search had it first; M10's companion picker (FR-20.1) offers the same
 * thing, and one rule for „what the search missed" is only one rule if it is
 * one control — which offer applies is the domain's `searchOffer`, and this
 * is how it looks. An offer, not a row: dashed, so it cannot be read as an
 * item the inventory already holds.
 */
import { IonIcon } from '@ionic/vue'
import { addOutline, refreshOutline } from 'ionicons/icons'

import { OFFER_RESTORE, type SearchOffer } from '@/domain/itemSearch'
import { t } from '@/i18n'

const props = defineProps<{
  offer: NonNullable<SearchOffer>
  /** The button's id; its title renders as `${testid}-title`. */
  testid: string
  /** What taking a create offer does here — M9's wording when absent. */
  createHint?: string
  /** What taking a restore offer does here — M9's wording when absent. */
  restoreHint?: string
}>()

const emit = defineEmits<{ take: [] }>()

function hint(): string {
  return props.offer.kind === OFFER_RESTORE
    ? (props.restoreHint ?? t('items.offerRestoreHint'))
    : (props.createHint ?? t('items.offerCreateHint'))
}
</script>

<template>
  <div class="offer" :class="offer.kind">
    <button type="button" :data-testid="testid" @click="emit('take')">
      <span class="offer-glyph">
        <IonIcon :icon="offer.kind === OFFER_RESTORE ? refreshOutline : addOutline" />
      </span>
      <span class="offer-text">
        <strong :data-testid="`${testid}-title`">{{
          offer.kind === OFFER_RESTORE
            ? t('items.offerRestore', { name: offer.name })
            : t('items.offerCreate', { name: offer.name })
        }}</strong>
        <span class="offer-hint">{{ hint() }}</span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.offer {
  padding: 10px 8px 4px;
}

.offer button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 1.5px dashed var(--jp-action);
  border-radius: var(--jp-r);
  background: color-mix(in srgb, var(--jp-action) 8%, var(--jp-surface-card));
  color: var(--ct-text);
  text-align: start;
  cursor: pointer;
}

.offer.restore button {
  border-color: var(--ion-color-warning);
  background: color-mix(in srgb, var(--ion-color-warning) 9%, var(--jp-surface-card));
}

.offer-glyph {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: var(--jp-r-sm);
  background: var(--jp-action);
  color: var(--ct-crust);
  font-size: var(--jp-icon-sm);
}

.offer.restore .offer-glyph {
  background: var(--ion-color-warning);
}

.offer-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-wrap: anywhere;
}

.offer-hint {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-xs);
}
</style>
