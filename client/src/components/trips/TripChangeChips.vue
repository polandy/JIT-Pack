<script setup lang="ts">
/**
 * What has happened to a trip since it was generated: where it came from,
 * and what its groups changed — taken over or still waiting (FR-16.2,
 * FR-27.4).
 *
 * One component rather than one block per representation: M2 draws the same
 * trip as a row or — for the trip you are on — as a hero (FR-21.15), and a
 * chip written into both templates is a chip that is eventually only in one.
 *
 * It decides nothing about the changes themselves; the page owns the sheet
 * the chip opens.
 */
import { computed } from 'vue'
import { changesChip } from '@/lib/refreshWording'
import { t } from '@/i18n'

const props = withDefaults(
  defineProps<{
    /** The trip's name, which every one of these testids is addressed by. */
    name: string
    /** FR-16.2: this trip came out of a spreadsheet, not out of the app. */
    imported?: boolean
    /** FR-27.4: how many group changes are waiting on the trip. */
    proposed?: number
    /** FR-27.4: how many changes a refresh already took over. */
    applied?: number
  }>(),
  { imported: false, proposed: 0, applied: 0 },
)

const emit = defineEmits<{ open: [] }>()

const chip = computed(() => changesChip(props.applied, props.proposed))
</script>

<template>
  <!-- FR-16.2: `trips.imported` is written by M15; on an instance carrying a
       decade of migrated history it is what separates the two kinds of past. -->
  <span v-if="imported" class="chip imported-chip" :data-testid="`m2-imported-chip-${name}`">
    {{ t('trips.importedChip') }}
  </span>
  <!-- FR-27.4: one chip for what the trip took over and what still waits,
       one line however many there are (UX-20). It sits inside a row or card
       that is itself a link, so it stops the tap: reading what changed must
       not also open the trip. -->
  <button
    v-if="chip"
    type="button"
    class="chip changes-chip"
    :data-testid="`m2-changes-chip-${name}`"
    @click.stop.prevent="emit('open')"
  >
    <span v-if="chip.total">{{ chip.total }}</span>
    <span v-if="chip.total && chip.open" class="sep" aria-hidden="true"> · </span>
    <span v-if="chip.open" class="open">{{ chip.open }}</span>
  </button>
</template>

<style scoped>
/*
 * The chips share a shape and differ only in what they paint with it:
 * `.chip` is a rule of its own, so none draws a background with no padding
 * around the word inside it.
 *
 * The size is stated rather than inherited: inside a row these sit in an
 * `ion-label` and would take the body size from it, and the hero has no
 * `ion-label` to inherit from. A chip qualifies the name above it, so it
 * takes the step under the body the rest of the app gives a subordinate line
 * (FR-21.14).
 */
.chip {
  border-radius: var(--jp-r-sm);
  display: inline-flex;
  font-size: var(--jp-text-sm);
  margin-top: 6px;
  padding: 2px 8px;
}

.imported-chip {
  background: var(--ct-surface0);
  color: var(--ct-subtext1);
}

/* One line, always: the row is three lines with it (UX-20). The words are
   short enough for the narrowest row; a wrap would make it a block again.
   Inline rather than flex, so the spaces around the separator stay text. */
.changes-chip {
  background: var(--jp-surface-sunken);
  border: none;
  color: var(--jp-action);
  cursor: pointer;
  display: inline-block;
  white-space: nowrap;
}

.changes-chip:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}

.changes-chip .sep {
  color: var(--ct-overlay1);
}

/* What still waits for an answer takes the brand; the record keeps the action colour. */
.changes-chip .open {
  color: var(--jp-brand);
  font-weight: var(--jp-weight-semibold);
}
</style>
