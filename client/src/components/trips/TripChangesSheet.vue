<script setup lang="ts">
/**
 * What M2's changes chip opens (FR-27.4, UX-20): a trip's group changes,
 * the open ones first, then the record of what was taken over.
 *
 * A sheet rather than a log under the row: the row stays three lines however
 * many changes a trip collected, and M2 has no *seen* state that would let a
 * log written out in the list ever leave it.
 *
 * It answers nothing. The open changes are named so the chip can be read,
 * and the way to answer them is the trip, where the list they change is —
 * the one place the two answers live (M4).
 */
import { IonButton } from '@ionic/vue'

import SheetModal from '@/components/global/SheetModal.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import type { ChangeSummary } from '@/lib/refreshWording'
import { describeAppliedChange, describeProposedChange } from '@/lib/refreshWording'
import { t } from '@/i18n'

defineProps<{
  isOpen: boolean
  /** The trip's name — the sheet's title. */
  name: string
  /** What the trip's groups propose and it has not answered yet. */
  proposed: readonly ChangeSummary[]
  /** What a refresh already took over, newest first. */
  applied: readonly ChangeSummary[]
}>()

const emit = defineEmits<{ dismiss: []; goToTrip: [] }>()
</script>

<template>
  <SheetModal :is-open="isOpen" testid="m2-changes-sheet" @dismiss="emit('dismiss')">
    <section class="sheet-body">
      <SheetHead
        :title="name"
        :meta="t('trips.changesSheetMeta')"
        close-testid="m2-changes-close"
        @close="emit('dismiss')"
      />

      <div v-if="proposed.length" class="block" data-testid="m2-changes-open">
        <h2 class="jp-eyebrow">{{ t('trips.changesOpenHeading', { n: proposed.length }) }}</h2>
        <p v-for="(entry, index) in proposed" :key="`${entry.item_name}-${index}`" class="pending">
          {{ describeProposedChange(entry) }}
        </p>
        <p class="hint">{{ t('trips.changesOpenHint') }}</p>
        <IonButton size="small" data-testid="m2-changes-go" @click="emit('goToTrip')">
          {{ t('trips.changesGoToTrip') }}
        </IonButton>
      </div>

      <div v-if="applied.length" class="block" data-testid="m2-changes-applied">
        <h2 class="jp-eyebrow">{{ t('trips.changesAppliedHeading', { n: applied.length }) }}</h2>
        <p v-for="(entry, index) in applied" :key="`${entry.item_name}-${index}`">
          {{ describeAppliedChange(entry) }}
        </p>
        <p class="frozen">{{ t('trips.appliedFrozen') }}</p>
      </div>
    </section>
  </SheetModal>
</template>

<style scoped>
/* The sheet's own inset, like every other sheet body (§3.25). */
.sheet-body {
  padding: 4px 18px 22px;
}

.block {
  color: var(--ct-subtext1);
  display: grid;
  font-size: var(--jp-text-sm);
  gap: 2px;
  justify-items: start;
}

.block + .block {
  margin-top: 16px;
}

.block p {
  margin: 0;
}

.block h2 {
  margin: 0 0 4px;
}

/* Waiting for an answer: the chip's own colour for its open part. */
.pending {
  color: var(--jp-brand);
}

.hint,
.frozen {
  color: var(--ct-overlay1);
}

.block .hint {
  margin-top: 4px;
}
</style>
