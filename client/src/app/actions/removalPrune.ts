/**
 * FR-5.8's second half (ADR-065): once a removal can no longer be undone,
 * the inventory item it left unused goes too.
 */
import { API } from '@/api/routes'
import type { MasterPruneResponse } from '@/api/types'
import type { SyncContext } from '../context'
import type { RestClient } from '../restClient'

/** What the prune needs beyond the context. */
export interface RemovalPruneDeps {
  /** Whether any row this device holds still uses the item (the packing group's). */
  itemStillUsed(itemId: string): boolean
  /** Delete — or retire, if something names it — the item (the master-data group's). */
  deleteMasterItem(itemId: string): void
  client: RestClient
  /** Resolves once the trip's queued writes have reached the server. */
  whenTripSent(tripId: string): Promise<void>
  drainMaster(): Promise<void>
}

/** createRemovalPruneActions binds the prune to one sync context. */
export function createRemovalPruneActions(ctx: SyncContext, deps: RemovalPruneDeps) {
  const { local } = ctx

  /**
   * Asked again here rather than trusted from the removal — the row may have
   * come back, or another use arrived, while the snackbar was up.
   *
   * Local Mode holds every trip, so its answer is the whole answer and the
   * item is deleted like any other. A server device holds only the trips it
   * has opened, so it asks the server, which deletes the item only if nothing
   * uses it anywhere and otherwise leaves it exactly as it was — the push's
   * delete would retire it instead (FR-24.3). The removal is sent first: the
   * server would count the row being removed as a use. A device offline at
   * that moment keeps the item, which is the answer a doubt should give.
   */
  async function pruneItemLeftByRemoval(tripId: string, itemId: string) {
    if (deps.itemStillUsed(itemId)) return
    if (local) {
      deps.deleteMasterItem(itemId)
      return
    }
    try {
      await deps.whenTripSent(tripId)
      const resp = await deps.client.post<MasterPruneResponse>(API.masterItemPrune(itemId))
      if (resp.pruned) await deps.drainMaster()
    } catch {
      // Offline, or the removal itself was refused: the item stays.
    }
  }

  return { pruneItemLeftByRemoval }
}
