<script setup lang="ts">
/**
 * FR-25.33: M4's note bar in the pack snackbar's place, wired to the row it
 * names. The bar itself only types; what a save or an undo does to the trip
 * is decided here, against the screen's shared core.
 */
import PackNoteBar from '@/components/trips/PackNoteBar.vue'

import type { PackingCore } from './usePackingCore'

const props = defineProps<{ core: PackingCore }>()
const { noteBar, closeNoteBar, rowUndo, liveRow, orchestrator } = props.core

/**
 * Onto the row as it stands now — a sync may have changed it since the
 * snackbar, and a row gone meanwhile stays gone.
 */
function save(typed: string) {
  const live = noteBar.value && liveRow(noteBar.value.id)
  if (live) orchestrator.packNotes.setPackNote(live, typed)
  closeNoteBar()
}

/** The bar's undo is the snackbar's, taken back the same way (FR-25.2). */
function undo() {
  rowUndo.undo()
  closeNoteBar()
}
</script>

<template>
  <PackNoteBar
    v-if="noteBar"
    :key="noteBar.id"
    :message="noteBar.message"
    :current="noteBar.current"
    @save="save"
    @undo="undo"
    @close="closeNoteBar"
  />
</template>
