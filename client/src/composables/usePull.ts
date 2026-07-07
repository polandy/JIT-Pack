/** Pull composable — fetches changes via the single read path (P-1, Sync-API §4). */

import type { APIClient } from '@/api/client'
import type { PullChange, PullResponse } from '@/api/types'
import type { HLCGenerator } from '@/sync/hlc'

export interface PullResult {
  changes: PullChange[]
  nextCursor: number
  hasMore: boolean
}

function observeHLCs(hlc: HLCGenerator, changes: PullChange[]): void {
  for (const c of changes) {
    if (c.row && typeof c.row['updated_hlc'] === 'string') {
      hlc.observe(c.row['updated_hlc'])
    }
  }
}

export function usePull(client: APIClient, hlc: HLCGenerator) {
  async function pullTrip(tripId: string, cursor: number, limit = 500): Promise<PullResult> {
    const resp = await client.get<PullResponse>(`/api/v1/sync/trips/${tripId}`, {
      cursor: String(cursor),
      limit: String(limit),
    })
    observeHLCs(hlc, resp.changes)
    return { changes: resp.changes, nextCursor: resp.next_cursor, hasMore: resp.has_more }
  }

  async function pullMaster(cursor: number, limit = 500): Promise<PullResult> {
    const resp = await client.get<PullResponse>('/api/v1/sync/master', {
      cursor: String(cursor),
      limit: String(limit),
    })
    observeHLCs(hlc, resp.changes)
    return { changes: resp.changes, nextCursor: resp.next_cursor, hasMore: resp.has_more }
  }

  async function pullTripAll(tripId: string, cursor: number): Promise<PullResult> {
    const allChanges: PullChange[] = []
    let cur = cursor
    let hasMore = true
    while (hasMore) {
      const result = await pullTrip(tripId, cur)
      allChanges.push(...result.changes)
      cur = result.nextCursor
      hasMore = result.hasMore
    }
    return { changes: allChanges, nextCursor: cur, hasMore: false }
  }

  async function pullMasterAll(cursor: number): Promise<PullResult> {
    const allChanges: PullChange[] = []
    let cur = cursor
    let hasMore = true
    while (hasMore) {
      const result = await pullMaster(cur)
      allChanges.push(...result.changes)
      cur = result.nextCursor
      hasMore = result.hasMore
    }
    return { changes: allChanges, nextCursor: cur, hasMore: false }
  }

  return { pullTrip, pullMaster, pullTripAll, pullMasterAll }
}
