/** Pull composable — fetches changes via the single read path (P-1, Sync-API §4). */

import { API } from '@/api/routes'
import type { APIClient } from '@/api/client'
import type { PullChange, PullResponse } from '@/api/types'
import type { HLCGenerator } from '@/sync/hlc'
import { hasFurtherPage, observePulledClocks } from '@/sync/pullProtocol'

export interface PullResult {
  changes: PullChange[]
  nextCursor: number
  hasMore: boolean
}

export function usePull(client: APIClient, hlc: HLCGenerator) {
  async function pullTrip(tripId: string, cursor: number, limit = 500): Promise<PullResult> {
    const resp = await client.get<PullResponse>(API.tripSync(tripId), {
      cursor: String(cursor),
      limit: String(limit),
    })
    observePulledClocks(hlc, resp.changes)
    return { changes: resp.changes, nextCursor: resp.next_cursor, hasMore: resp.has_more }
  }

  async function pullMaster(cursor: number, limit = 500): Promise<PullResult> {
    const resp = await client.get<PullResponse>(API.masterSync, {
      cursor: String(cursor),
      limit: String(limit),
    })
    observePulledClocks(hlc, resp.changes)
    return { changes: resp.changes, nextCursor: resp.next_cursor, hasMore: resp.has_more }
  }

  async function pullTripAll(tripId: string, cursor: number): Promise<PullResult> {
    const allChanges: PullChange[] = []
    let cur = cursor
    for (;;) {
      const askedFrom = cur
      const result = await pullTrip(tripId, cur)
      allChanges.push(...result.changes)
      cur = result.nextCursor
      if (!hasFurtherPage({ has_more: result.hasMore, next_cursor: cur }, askedFrom)) break
    }
    return { changes: allChanges, nextCursor: cur, hasMore: false }
  }

  async function pullMasterAll(cursor: number): Promise<PullResult> {
    const allChanges: PullChange[] = []
    let cur = cursor
    for (;;) {
      const askedFrom = cur
      const result = await pullMaster(cur)
      allChanges.push(...result.changes)
      cur = result.nextCursor
      if (!hasFurtherPage({ has_more: result.hasMore, next_cursor: cur }, askedFrom)) break
    }
    return { changes: allChanges, nextCursor: cur, hasMore: false }
  }

  return { pullTrip, pullMaster, pullTripAll, pullMasterAll }
}
