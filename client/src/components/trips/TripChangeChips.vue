<script setup lang="ts">
/**
 * What has happened to a trip since it was generated: where it came from,
 * what its groups are proposing, and what a refresh already took over
 * (FR-16.2, FR-27.4).
 *
 * One component rather than one block per representation: M2 draws the same
 * trip as a row or — for the trip you are on — as a hero (FR-21.15), and a
 * chip written into both templates is a chip that is eventually only in one.
 *
 * It decides nothing about the changes themselves; the fold is the only rule
 * it owns, and the page owns which trip is unfolded.
 */
import { IonIcon } from '@ionic/vue'
import { chevronDown, chevronUp } from 'ionicons/icons'
import { computed } from 'vue'
import { describeAppliedChange } from '@/lib/refreshWording'
import { t } from '@/i18n'
import type { AppliedChange } from '@/types/domain'

const props = withDefaults(
  defineProps<{
    /** The trip's id, for the log's `aria-controls` target. */
    tripId: string
    /** The trip's name, which every one of these testids is addressed by. */
    name: string
    /** FR-16.2: this trip came out of a spreadsheet, not out of the app. */
    imported?: boolean
    /** FR-27.4: how many group changes are waiting on the trip. */
    proposed?: number
    /** FR-27.4: what a refresh already took over. */
    applied?: readonly AppliedChange[]
    /** Whether this trip's foldable log is the open one. */
    expanded?: boolean
  }>(),
  { imported: false, proposed: 0, applied: () => [], expanded: false },
)

const emit = defineEmits<{ toggle: [] }>()

/**
 * FR-27.4: above this many changes the log folds away behind the chip.
 * Owner decision 2026-08-18 — a handful of lines is worth reading where it
 * happened, but M2 is the app's main entry and there is deliberately no
 * "seen" state, so an unbounded log would push every other trip down the
 * list until the busy one departs.
 */
const INLINE_LOG_LIMIT = 10

/** Whether this trip's log is long enough to hide behind the chip. */
const folds = computed(() => props.applied.length > INLINE_LOG_LIMIT)
const open = computed(() => !folds.value || props.expanded)
</script>

<template>
  <!-- FR-16.2: `trips.imported` had been written by M15 and read by nothing
       until 2026-08-31; on an instance carrying a decade of migrated history
       it is what separates the two kinds of past. -->
  <span v-if="imported" class="chip imported-chip" :data-testid="`m2-imported-chip-${name}`">
    {{ t('trips.importedChip') }}
  </span>
  <!-- FR-27.4: a group changed and this trip has not answered yet. It says
       so and stops there — the two answers are at the trip, where the list
       they change is. -->
  <span v-if="proposed" class="chip proposed-chip" :data-testid="`m2-proposed-chip-${name}`">
    {{ t('trips.proposedChip', { n: proposed }) }}
  </span>
  <!-- FR-27.4: a trip follows its source groups until it is past. It says
       what it took over, because a list that changed under you with no trace
       reads as data loss. A short log is simply written out; a long one folds
       away, so one busy trip cannot push the rest of the list off the screen
       (owner, 2026-08-18). -->
  <div v-if="applied.length" class="applied">
    <button
      v-if="folds"
      class="chip applied-chip"
      :data-testid="`m2-applied-chip-${name}`"
      :aria-expanded="expanded"
      :aria-controls="`m2-applied-log-${tripId}`"
      @click.stop.prevent="emit('toggle')"
    >
      {{ t('trips.appliedChip', { n: applied.length }) }}
      <IonIcon :icon="expanded ? chevronUp : chevronDown" />
    </button>
    <!-- A short log needs no control: the chip is then the heading of what is
         already on screen, not a button that reveals it. -->
    <span v-else class="chip applied-chip static" :data-testid="`m2-applied-chip-${name}`">
      {{ t('trips.appliedChip', { n: applied.length }) }}
    </span>
    <div
      v-if="open"
      :id="`m2-applied-log-${tripId}`"
      class="applied-log"
      :data-testid="`m2-applied-log-${name}`"
    >
      <p v-for="entry in applied" :key="entry.id">{{ describeAppliedChange(entry) }}</p>
      <p class="frozen-note">{{ t('trips.appliedFrozen') }}</p>
    </div>
  </div>
</template>

<style scoped>
/*
 * The three chips share a shape and differ only in what they paint with it:
 * `.chip` had been a name with no rule behind it, so the imported one drew a
 * background with no padding around the word inside it.
 *
 * The size is stated rather than inherited: inside the row these sat in an
 * `ion-label` and took the body size from it, and the hero has no `ion-label`
 * to inherit from. A chip qualifies the name above it, so it takes the step
 * under the body the rest of the app gives a subordinate line (FR-21.14).
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

.proposed-chip {
  background: color-mix(in srgb, var(--jp-brand) 18%, transparent);
  color: var(--jp-brand);
}

/* FR-27.4: when the log folds, the chip is an action inside a row that is
   itself a link, so it stops the tap — expanding the log must not also open
   the trip. When it does not fold, it is a label for the lines already below
   it and takes no interaction at all. */
.applied-chip {
  align-items: center;
  background: var(--jp-surface-sunken);
  border: none;
  color: var(--jp-action);
  gap: 4px;
}

.applied-chip ion-icon {
  font-size: var(--jp-icon-xs);
}

/* Nothing to press, so nothing that looks pressable. */
.applied-chip.static {
  cursor: default;
}

.applied-log {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  margin-top: 6px;
}

.applied-log p {
  margin: 0;
}

.applied-log .frozen-note {
  color: var(--ct-overlay1);
}
</style>
