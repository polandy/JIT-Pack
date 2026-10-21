<script setup lang="ts">
/**
 * FR-25.33: M5's *Packnotiz* — what exactly went in, on every row: on an
 * open one the plan, on a packed one the record. It writes once the field
 * lets go of the note (Enter or leaving it), because unlike M4's note bar
 * nothing is waiting on it.
 */
import { IonInput } from '@ionic/vue'

import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { PACK_NOTE_MAX_LENGTH, packNoteValue } from '@/domain/packNote'
import { t } from '@/i18n'
import type { TripItem } from '@/types/domain'

const props = defineProps<{
  item: TripItem
  /** Held by somebody else (G-3): shown, not editable. */
  locked: boolean
}>()

const orchestrator = useOrchestrator()

/** An unchanged note is no edit — it would cost a write and an activity line for nothing. */
function onChange(typed: string | null | undefined) {
  if (props.locked) return
  if (packNoteValue(typed ?? '') === (props.item.pack_note ?? null)) return
  orchestrator.packNotes.setPackNote(props.item, typed ?? '')
}
</script>

<template>
  <IonInput
    class="pack-note"
    data-testid="m5-pack-note"
    fill="outline"
    label-placement="stacked"
    :label="t('packing.packNoteLabel')"
    :placeholder="t('packing.packNotePlaceholder')"
    :value="item.pack_note ?? ''"
    :maxlength="PACK_NOTE_MAX_LENGTH"
    :counter="true"
    :disabled="locked"
    enterkeyhint="done"
    @ion-change="(e: CustomEvent) => onChange(e.detail.value)"
  />
</template>

<style scoped>
/* A field of its own under the pack controls, as the skip toggle is. */
.pack-note {
  margin-top: 8px;
}
</style>
