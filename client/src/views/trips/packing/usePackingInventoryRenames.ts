/**
 * FR-27.16: the names on this trip the inventory has moved on from. Derived,
 * never stored — the ⋮ entry, the sheet it opens and M5's one-row line all
 * read the one set this builds, and it empties itself once the names match.
 */
import { computed, ref, type ComputedRef } from 'vue'

import type { InventoryRename } from '@/domain/inventoryNames'

import type { PackingCore } from './usePackingCore'

export function usePackingInventoryRenames(
  core: PackingCore,
  tripId: string,
  openItemId: ComputedRef<string | null>,
) {
  const { orchestrator, rowUndo, announceRenamed } = core

  const inventoryRenames = computed(() => orchestrator.inventoryNames.inventoryRenamesOf(tripId))
  const inventoryNamesOpen = ref(false)

  /** The choice the open row belongs to, for M5's own „Übernehmen". */
  const openItemRename = computed(
    () =>
      inventoryRenames.value.find((r) => r.rows.some((row) => row.id === openItemId.value)) ?? null,
  )

  /**
   * Takes the chosen names over, from the sheet or from M5's one-row line.
   * Armed with the snackbar's undo like a pack: taking every name over is one
   * tap on „Alle", and a tap that renames a dozen rows needs a way back.
   */
  function adoptInventoryNames(chosen: InventoryRename[]) {
    inventoryNamesOpen.value = false
    if (chosen.length === 0) return
    const undo = orchestrator.inventoryNames.adoptInventoryNames(tripId, chosen)
    rowUndo.armUndo(
      undo.adoption.rows.map((r) => r.item),
      () => orchestrator.inventoryNames.restoreInventoryNames(tripId, undo),
    )
    void announceRenamed(chosen.length)
  }

  return { inventoryRenames, inventoryNamesOpen, openItemRename, adoptInventoryNames }
}
