/**
 * FR-27.16: M4 takes names over from the inventory on request. The rule —
 * which names differ, what adopting one writes, what the undo puts back — is
 * `domain/inventoryNames.ts`; this group reads the stores into it and sends
 * the writes out.
 *
 * It depends on the FR-27.4 group for one thing only: which renames that
 * card is already asking about, so the same question is not asked twice.
 */
import { itemRow } from '../rows'
import { optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import {
  inventoryRenames,
  planNameAdoption,
  planNameRestore,
  type InventoryRename,
  type NameAdoption,
} from '@/domain/inventoryNames'
import type { GeneratedPosition } from '@/types/domain'
import type { SyncContext } from '../context'
import type { createGroupRefreshActions } from './groupRefresh'

/** What an adoption hands back so the snackbar can undo it. */
export interface NameAdoptionUndo {
  adoption: NameAdoption
  ledgerBefore: GeneratedPosition[]
}

/**
 * createInventoryNameActions binds FR-27.16 to one sync context and the
 * FR-27.4 group whose open proposals it defers to.
 */
export function createInventoryNameActions(
  ctx: SyncContext,
  deps: { groupRefresh: ReturnType<typeof createGroupRefreshActions> },
) {
  const { mutations, enqueueAndDrain, tripStore, masterStore, tripDataLoaded } = ctx

  /**
   * inventoryRenamesOf lists what the trip could take over. Empty while the
   * trip's rows are not on the device: "not loaded" is not "nothing differs",
   * and a count derived from half a trip would be a claim about all of it.
   */
  function inventoryRenamesOf(tripId: string): InventoryRename[] {
    if (!tripDataLoaded(tripId)) return []
    const proposal = deps.groupRefresh.refreshProposals.value[tripId]
    const proposedRowIds = new Set(
      (proposal?.update ?? []).filter((u) => u.fields.name !== undefined).map((u) => u.item.id),
    )
    return inventoryRenames({
      items: tripStore.getItems(tripId),
      masterItems: masterStore.itemList,
      ledger: tripStore.getGeneratedPositions(tripId),
      proposedRowIds,
    })
  }

  /**
   * adoptInventoryNames renames the chosen rows and moves their ledger
   * entries along (see `planNameAdoption`). Returns what the undo needs.
   */
  function adoptInventoryNames(tripId: string, chosen: InventoryRename[]): NameAdoptionUndo {
    const ledgerBefore = tripStore.getGeneratedPositions(tripId)
    const adoption = planNameAdoption(chosen, ledgerBefore)
    write(tripId, adoption)
    return { adoption, ledgerBefore }
  }

  /** restoreInventoryNames is the snackbar's undo. */
  function restoreInventoryNames(tripId: string, undo: NameAdoptionUndo): void {
    write(tripId, planNameRestore(undo.adoption, undo.ledgerBefore))
  }

  function write(tripId: string, plan: NameAdoption): void {
    // Each row is read back from the store rather than taken from the plan:
    // the optimistic update merges into the row as it stands now, and the
    // plan's copy is from before the adoption.
    const current = new Map(tripStore.getItems(tripId).map((i) => [i.id, i]))
    for (const { item, name } of plan.rows) {
      const row = current.get(item.id)
      if (!row) continue
      const mutation = mutations.updateGeneratedTripItem(row.id, { name })
      enqueueAndDrain('trip', tripId, {
        mutation,
        optimistic: optimisticUpdate(mutation, itemRow(row)),
      })
    }
    for (const entry of plan.ledger) {
      const mutation = mutations.writeGeneratedPosition(entry)
      enqueueAndDrain('trip', tripId, {
        mutation,
        optimistic: optimisticInsert(mutation),
      })
    }
  }

  return { inventoryRenamesOf, adoptInventoryNames, restoreInventoryNames }
}
