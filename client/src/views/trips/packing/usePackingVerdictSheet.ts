/**
 * FR-9.6: the pass's verdict sheet, one row at a time — held by id so the
 * sheet keeps reading the live row (its own undo can change it) rather
 * than a snapshot taken at the tap.
 */
import { computed, ref, watch } from 'vue'

import type { RowVerdict } from '@/domain/verdict'
import type { TripItem } from '@/types/domain'

import type { PackingCore } from './usePackingCore'
import type { RowActions } from './useRowActions'

export function usePackingVerdictSheet(core: PackingCore, acts: RowActions) {
  const verdictRowId = ref<string | null>(null)
  const verdictRow = computed(() => (verdictRowId.value ? core.liveRow(verdictRowId.value) : null))

  /**
   * The sheet's own `row` prop is never null — `SheetModal`'s close transition
   * plays against `isOpen`, not against the sheet unmounting, so the last row
   * shown stays put while it closes rather than vanishing mid-animation.
   */
  const verdictSheetRow = ref<TripItem | null>(null)
  watch(verdictRow, (row) => {
    if (row) verdictSheetRow.value = row
  })

  const verdictSheetOpen = computed(() => verdictRowId.value !== null)

  function openVerdict(item: TripItem) {
    if (core.locked(item)) return
    verdictRowId.value = item.id
  }

  function dismissVerdict() {
    verdictRowId.value = null
  }

  function onVerdictSave(verdict: RowVerdict | null, needed: number | undefined, reason: string) {
    const row = verdictRow.value
    verdictRowId.value = null
    if (row) acts.onSetVerdict(row, verdict, needed, reason)
  }

  return { verdictSheetRow, verdictSheetOpen, openVerdict, dismissVerdict, onVerdictSave }
}
