/**
 * Sync outbox — queues local mutations and drains via push+pull (P-2, G-5).
 *
 * "Online mode" is just "outbox drains fast." All mutations go through the
 * outbox even when online, keeping the write path uniform.
 */

import type { APIClient } from '@/api/client'
import type { Mutation, PullChange, PullResponse, PushResponse } from '@/api/types'
import type { HLCGenerator } from '@/sync/hlc'

type PartitionType = 'trip' | 'master'

/** Server-side push limit per batch (Sync-API §9). */
const MAX_PUSH_BATCH = 200

function partitionKey(type: PartitionType, id: string | null): string {
  return type === 'master' ? 'master' : `trip:${id}`
}

export class SyncOutbox {
  private queues = new Map<string, Mutation[]>()
  private cursors = new Map<string, number>()
  private readonly client: APIClient
  private readonly hlc: HLCGenerator
  private readonly onChanges: (changes: PullChange[]) => void

  constructor(client: APIClient, hlc: HLCGenerator, onChanges: (changes: PullChange[]) => void) {
    this.client = client
    this.hlc = hlc
    this.onChanges = onChanges
  }

  enqueue(type: PartitionType, id: string | null, mutation: Mutation): void {
    const key = partitionKey(type, id)
    const queue = this.queues.get(key) ?? []
    queue.push(mutation)
    this.queues.set(key, queue)
  }

  pendingCount(type: PartitionType, id: string | null): number {
    return this.queues.get(partitionKey(type, id))?.length ?? 0
  }

  totalPending(): number {
    let total = 0
    for (const q of this.queues.values()) {
      total += q.length
    }
    return total
  }

  /** Push pending mutations then pull canonical state. */
  async drain(type: PartitionType, id: string | null): Promise<void> {
    const key = partitionKey(type, id)
    const queue = this.queues.get(key) ?? []
    let cursor = this.cursors.get(key) ?? 0

    if (queue.length > 0) {
      const path = type === 'master' ? '/api/v1/sync/master' : `/api/v1/sync/trips/${id}`
      // The server caps a push at 200 mutations (Sync-API §9) — chunk
      // big batches (e.g. wizard-generated trips) instead of getting the
      // whole queue rejected.
      for (let offset = 0; offset < queue.length; offset += MAX_PUSH_BATCH) {
        const chunk = queue.slice(offset, offset + MAX_PUSH_BATCH)
        const resp = await this.client.post<PushResponse>(path, {
          client_hlc: this.hlc.next(),
          mutations: chunk,
        })
        cursor = resp.pull_hint.next_cursor
        // Drop only what was pushed — a failure keeps the rest queued.
        this.queues.set(key, this.queues.get(key)!.slice(chunk.length))
      }
    }

    const pullPath = type === 'master' ? '/api/v1/sync/master' : `/api/v1/sync/trips/${id}`

    const pullResp = await this.client.get<PullResponse>(pullPath, {
      cursor: String(cursor),
      limit: '500',
    })

    if (pullResp.changes.length > 0) {
      this.onChanges(pullResp.changes)
      for (const c of pullResp.changes) {
        if (c.row && typeof c.row['updated_hlc'] === 'string') {
          this.hlc.observe(c.row['updated_hlc'])
        }
      }
    }

    this.cursors.set(key, pullResp.next_cursor)
  }

  /** Update cursor from an external source (e.g., WebSocket trip.changed hint). */
  setCursor(type: PartitionType, id: string | null, cursor: number): void {
    this.cursors.set(partitionKey(type, id), cursor)
  }

  getCursor(type: PartitionType, id: string | null): number {
    return this.cursors.get(partitionKey(type, id)) ?? 0
  }
}
