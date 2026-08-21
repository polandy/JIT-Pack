/**
 * Durable outbox storage (B2, NFR-4.1/NFR-4.2a): the queue of unpushed
 * mutations survives a reload and an app kill, because it lives in
 * IndexedDB rather than in a JS array. Same shape and the same
 * serialize-the-writes discipline as `@/local/persistence`.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach } from 'vitest'

import { IndexedDBOutboxStore } from '../outboxStore'
import type { Mutation } from '@/api/types'

function mutation(id: string, fields: Record<string, unknown> = { quantity: 1 }): Mutation {
  return {
    mutation_id: id,
    op: 'upsert',
    table: 'trip_items',
    id: 'i1',
    fields,
    hlc: '0000000001000-0000-abcd1234',
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('IndexedDBOutboxStore', () => {
  it('replays a queue written by an earlier session, in append order', async () => {
    const first = new IndexedDBOutboxStore()
    await first.append('trip:t1', mutation('m1'))
    await first.append('master', mutation('m2', { name: 'Helm' }))
    await first.append('trip:t1', mutation('m3'))

    const second = new IndexedDBOutboxStore()
    const pending = await second.loadPending()

    expect(pending.map((p) => p.mutation.mutation_id)).toEqual(['m1', 'm2', 'm3'])
    expect(pending.map((p) => p.partition)).toEqual(['trip:t1', 'master', 'trip:t1'])
    expect(pending[1]!.mutation.fields).toEqual({ name: 'Helm' })
  })

  it('keeps append order across sessions rather than restarting the sequence', async () => {
    const first = new IndexedDBOutboxStore()
    await first.append('master', mutation('m1'))
    await first.append('master', mutation('m2'))

    // A second session appends without having read the first one's tail —
    // the seed comes from the stored maximum, not from zero, or the new
    // mutation would sort ahead of the ones it followed.
    const second = new IndexedDBOutboxStore()
    await second.append('master', mutation('m3'))

    const third = new IndexedDBOutboxStore()
    expect((await third.loadPending()).map((p) => p.mutation.mutation_id)).toEqual([
      'm1',
      'm2',
      'm3',
    ])
  })

  it('removes acknowledged mutations and leaves the rest queued', async () => {
    const store = new IndexedDBOutboxStore()
    await store.append('master', mutation('m1'))
    await store.append('master', mutation('m2'))
    await store.append('master', mutation('m3'))

    await store.remove(['m1', 'm3'])

    const pending = await new IndexedDBOutboxStore().loadPending()
    expect(pending.map((p) => p.mutation.mutation_id)).toEqual(['m2'])
  })

  it('parks a rejected mutation: out of the queue, still on the device', async () => {
    const store = new IndexedDBOutboxStore()
    await store.append('trip:t1', mutation('m1'))
    await store.park('trip:t1', mutation('m1'), 'unknown column', 1_700_000_000_000)

    const next = new IndexedDBOutboxStore()
    expect(await next.loadPending()).toEqual([])
    expect(await next.loadParked()).toEqual([
      {
        partition: 'trip:t1',
        mutation: mutation('m1'),
        reason: 'unknown column',
        at: 1_700_000_000_000,
      },
    ])
  })

  it('whenSettled resolves only after every issued write has landed', async () => {
    const store = new IndexedDBOutboxStore()
    // Deliberately not awaited: this is the fire-and-forget path the
    // synchronous enqueue uses, and `whenSettled` is the seam that makes
    // it assertable without waiting on a duration.
    void store.append('master', mutation('m1'))
    void store.append('master', mutation('m2'))

    await store.whenSettled()

    expect((await new IndexedDBOutboxStore().loadPending()).length).toBe(2)
  })

  it('reports a refused write to its caller without poisoning later writes', async () => {
    const store = new IndexedDBOutboxStore()
    await store.append('master', mutation('m1'))

    // A value IndexedDB cannot structured-clone is the one failure a test
    // can provoke for real rather than by patching the store. The class of
    // failure it stands in for is the one that matters in the field —
    // QuotaExceededError — and both arrive the same way: the write's own
    // promise rejects. What must not happen is the chain staying broken.
    const uncloneable = mutation('m2', { onDone: () => undefined })
    await expect(store.append('master', uncloneable)).rejects.toBeDefined()

    await store.append('master', mutation('m3'))
    expect(
      (await new IndexedDBOutboxStore().loadPending()).map((p) => p.mutation.mutation_id),
    ).toEqual(['m1', 'm3'])
  })
})
