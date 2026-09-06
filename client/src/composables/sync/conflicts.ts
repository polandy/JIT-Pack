/**
 * The conflict log and its revert — the two halves of NFR-4.2a's promise
 * that a merge is auditable and undoable.
 *
 * Both partitions are read here, because "which log" is a parameter and not
 * two features: the per-trip query filters on `trip_id`, and master rows
 * have none, which is the whole reason the second endpoint exists.
 */
import { API } from '@/api/routes'

import type { ConflictEntry, ConflictListResponse } from '@/api/types'
import type { RestClient } from './restClient'

export interface ConflictDeps {
  client: RestClient
  /**
   * Whether this device has no server (Local Mode). It has one writer and
   * therefore no conflicts at all (FR-19.6) — not an empty log, no log.
   */
  localMode: boolean
  /** Pull the partition the revert was written into, so the row arrives. */
  drainTrip(tripId: string): Promise<void>
  drainMaster(): Promise<void>
}

export interface ConflictActions {
  /** The trip's conflict log, for the G-2 view. */
  fetchConflicts(tripId: string): Promise<ConflictEntry[]>
  /**
   * The *master* partition's log — the losers on inventory, groups, series
   * and a trip's own fields, which are merged there rather than in the trip
   * partition.
   */
  fetchMasterConflicts(): Promise<ConflictEntry[]>
  /**
   * Restore the losing value of one audited merge. The server writes it as
   * an ordinary mutation with a fresh HLC rather than rewriting the past
   * (ADR-023), so the restored value arrives the normal way: the drain pulls
   * it, and every other device pulls it too. `tripId` picks the partition,
   * exactly as the two fetchers do.
   */
  revertConflict(conflictId: string, tripId?: string): Promise<void>
}

export function createConflictActions(deps: ConflictDeps): ConflictActions {
  const { client, localMode, drainTrip, drainMaster } = deps

  return {
    async fetchConflicts(tripId) {
      if (localMode) return []
      const resp = await client.get<ConflictListResponse>(API.tripConflicts(tripId), {})
      return resp.conflicts
    },

    async fetchMasterConflicts() {
      if (localMode) return []
      const resp = await client.get<ConflictListResponse>(API.masterConflicts, {})
      return resp.conflicts
    },

    async revertConflict(conflictId, tripId) {
      if (localMode) return
      if (tripId !== undefined) {
        await client.post(API.tripConflictRevert(tripId, conflictId))
        await drainTrip(tripId)
        return
      }
      await client.post(API.masterConflictRevert(conflictId))
      await drainMaster()
    },
  }
}
