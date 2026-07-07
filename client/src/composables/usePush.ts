/** Push composable — sends mutations via the single write path (P-2, Sync-API §5). */

import type { APIClient } from '@/api/client'
import type { Mutation, PushResponse, MutationResult } from '@/api/types'
import type { HLCGenerator } from '@/sync/hlc'

export interface PushResult {
  results: MutationResult[]
  pullHintCursor: number
}

export function usePush(client: APIClient, hlc: HLCGenerator) {
  async function pushTrip(tripId: string, mutations: Mutation[]): Promise<PushResult> {
    const resp = await client.post<PushResponse>(`/api/v1/sync/trips/${tripId}`, {
      client_hlc: hlc.next(),
      mutations,
    })
    return { results: resp.results, pullHintCursor: resp.pull_hint.next_cursor }
  }

  async function pushMaster(mutations: Mutation[]): Promise<PushResult> {
    const resp = await client.post<PushResponse>('/api/v1/sync/master', {
      client_hlc: hlc.next(),
      mutations,
    })
    return { results: resp.results, pullHintCursor: resp.pull_hint.next_cursor }
  }

  return { pushTrip, pushMaster }
}
