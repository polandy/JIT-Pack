<script setup lang="ts">
/**
 * FR-7.15: which excursion a thread is about — one chip per excursion of the
 * trip, at most one pressed, and the pressed one taken off by a second tap.
 * No chip for „none": that is what nothing pressed says, and a trip note is
 * the normal case. Shown only where the trip has an excursion to name.
 */
import { IonIcon } from '@ionic/vue'
import { trailSignOutline } from 'ionicons/icons'

import ChipRow from '@/components/global/ChipRow.vue'
import ChoiceChip from '@/components/global/ChoiceChip.vue'
import { t } from '@/i18n'
import type { Excursion } from '@/types/domain'

defineProps<{ excursions: readonly Excursion[] }>()

const model = defineModel<string | null>({ required: true })

function toggle(id: string) {
  model.value = model.value === id ? null : id
}
</script>

<template>
  <ChipRow :label="t('notes.excursion')" class="note-excursions" data-testid="note-excursion-chips">
    <ChoiceChip
      v-for="excursion in excursions"
      :key="excursion.id"
      :pressed="model === excursion.id"
      :data-testid="`note-excursion-chip-${excursion.id}`"
      @click="toggle(excursion.id)"
    >
      <IonIcon :icon="trailSignOutline" aria-hidden="true" />
      {{ excursion.name }}
    </ChoiceChip>
  </ChipRow>
</template>

<style scoped>
.note-excursions ion-icon {
  font-size: var(--jp-icon-sm);
}
</style>
