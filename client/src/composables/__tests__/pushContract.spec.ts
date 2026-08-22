import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SyncOutbox } from '../useSyncOutbox'
import type { Mutation, PushResponse, PullResponse } from '@/api/types'
import type { APIClient } from '@/api/client'
import type { HLCGenerator } from '@/sync/hlc'
import type { OutboxStore, ParkedMutation, PendingMutation } from '@/sync/outboxStore'

/**
 * The push envelope is the one shape two codebases have to agree on, and
 * they disagreed: the server writes `outcome`, the client type said
 * `status`. Every rejection therefore read as `undefined`, was never
 * parked, and was forgotten along with the rest of the batch — the whole
 * B2 parked surface was dead against a real server, while the unit tests
 * passed because their fakes answered `status` too.
 *
 * So this test refuses to invent a response. It feeds the client the byte
 * content of `internal/api/testdata/push_response.json`, the same file
 * `TestPushResponse_MatchesTheSharedWireFixture` holds the Go marshalling
 * to. Renaming a key on either side now fails on that side.
 */
// Vitest's root is client/, so the fixture is one level up. A move fails
// loudly here with the path it looked for, rather than silently.
const FIXTURE = resolve(process.cwd(), '../internal/api/testdata/push_response.json')

function serverResponse(): PushResponse {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as PushResponse
}

function mockHLC(): HLCGenerator {
  return {
    next: vi.fn(() => '0000000001000-0000-abcd1234'),
    observe: vi.fn(),
  } as unknown as HLCGenerator
}

function makeMutation(id: string): Mutation {
  return {
    mutation_id: id,
    op: 'upsert',
    table: 'trip_items',
    id: 'i1',
    fields: { quantity: 3 },
    hlc: '0000000001000-0000-abcd1234',
  }
}

class FakeStore implements OutboxStore {
  pending: PendingMutation[] = []
  parked: ParkedMutation[] = []

  loadPending() {
    return Promise.resolve([...this.pending])
  }
  append(partition: string, mutation: Mutation) {
    this.pending.push({ partition, mutation })
    return Promise.resolve()
  }
  remove(ids: string[]) {
    this.pending = this.pending.filter((p) => !ids.includes(p.mutation.mutation_id))
    return Promise.resolve()
  }
  park(partition: string, mutation: Mutation, reason: string, at: number) {
    this.pending = this.pending.filter((p) => p.mutation.mutation_id !== mutation.mutation_id)
    this.parked.push({ partition, mutation, reason, at })
    return Promise.resolve()
  }
  loadParked() {
    return Promise.resolve([...this.parked])
  }
  whenSettled() {
    return Promise.resolve()
  }
}

describe('the push response contract', () => {
  it('names its per-mutation answer `outcome`, as the server writes it', () => {
    const parsed = serverResponse()

    expect(parsed.results).toHaveLength(3)
    for (const result of parsed.results) {
      expect(result.outcome).toBeDefined()
      expect(Object.keys(result)).not.toContain('status')
    }
  })

  it('parks the rejection a real server response carries', async () => {
    const store = new FakeStore()
    const client = {
      get: vi.fn().mockResolvedValue({
        changes: [],
        next_cursor: 0,
        has_more: false,
      } satisfies PullResponse),
      post: vi.fn().mockResolvedValue(serverResponse()),
    }
    const outbox = new SyncOutbox(client as unknown as APIClient, mockHLC(), vi.fn(), {
      store,
      now: () => 1234,
    })

    for (const id of ['uuid-applied', 'uuid-merged', 'uuid-rejected']) {
      outbox.enqueue('trip', 'trip-1', makeMutation(id))
    }
    await outbox.drain('trip', 'trip-1')
    await outbox.whenPersisted()

    expect(store.parked).toEqual([
      {
        partition: 'trip:trip-1',
        mutation: expect.objectContaining({ mutation_id: 'uuid-rejected' }),
        reason: 'column not syncable: trip_items.nope',
        at: 1234,
      },
    ])
    expect(outbox.parkedCount()).toBe(1)
    // The applied and merged ones are acknowledged and gone; only the
    // refusal is kept, and the queue does not hold anything hostage.
    expect(store.pending).toEqual([])
    expect(outbox.pendingCount('trip', 'trip-1')).toBe(0)
  })
})
