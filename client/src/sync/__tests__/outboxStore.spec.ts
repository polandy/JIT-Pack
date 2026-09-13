/**
 * Durable outbox storage (B2, NFR-4.1/NFR-4.2a): the queue of unpushed
 * mutations survives a reload and an app kill, because it lives in
 * IndexedDB rather than in a JS array. Same shape and the same
 * serialize-the-writes discipline as `@/local/persistence`.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach } from 'vitest'

import { IndexedDBOutboxStore, OutboxUnavailableError } from '../outboxStore'
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

/**
 * The two ways an open can stop answering (NFR-4.1). Neither is an `onerror`,
 * so neither settled the promise the boot path awaits: the app came up with
 * no data, no error and no change to the glyph. The installed PWA and a
 * Safari tab on the same origin is the ordinary way to reach the first.
 */
describe('IndexedDBOutboxStore — an open that answers neither way', () => {
  /** An `indexedDB` whose open hands the test the request and fires nothing. */
  function silentOpen(): IDBOpenDBRequest[] {
    const requests: IDBOpenDBRequest[] = []
    globalThis.indexedDB = {
      open: () => {
        const req = { result: null, error: null } as unknown as IDBOpenDBRequest
        requests.push(req)
        return req
      },
    } as unknown as IDBFactory
    return requests
  }

  /** A timer seam that records rather than runs, so the deadline is reached on purpose. */
  function recordingTimer() {
    const fired: (() => void)[] = []
    let cancelled = 0
    return {
      fired,
      cancelledCount: () => cancelled,
      startTimer: (_ms: number, fn: () => void) => {
        fired.push(fn)
        return () => {
          cancelled += 1
        }
      },
    }
  }

  it('reports a blocked open instead of waiting for a connection it cannot close', async () => {
    const requests = silentOpen()
    const store = new IndexedDBOutboxStore()

    const pending = store.loadPending()
    requests[0]!.onblocked!(new Event('blocked') as IDBVersionChangeEvent)

    await expect(pending).rejects.toBeInstanceOf(OutboxUnavailableError)
    await expect(pending).rejects.toMatchObject({ failure: 'blocked' })
  })

  it('gives up on an open that never answers, so the boot path is not held', async () => {
    const requests = silentOpen()
    const timer = recordingTimer()
    const store = new IndexedDBOutboxStore({ openTimeoutMs: 50, startTimer: timer.startTimer })

    const pending = store.loadPending()
    expect(requests).toHaveLength(1)
    expect(timer.fired).toHaveLength(1)
    timer.fired[0]!() // the deadline, reached deliberately

    await expect(pending).rejects.toMatchObject({ failure: 'timeout' })
  })

  it('cancels the deadline once the database is open — no timer outlives the open', async () => {
    globalThis.indexedDB = new IDBFactory()
    const timer = recordingTimer()
    const store = new IndexedDBOutboxStore({ startTimer: timer.startTimer })

    await store.append('master', mutation('m1'))

    // The positive signal: the canceller ran. Without it a successful open
    // leaves a timer that rejects nothing and keeps the page awake.
    expect(timer.cancelledCount()).toBe(1)
  })

  it('retries the open on the next write rather than caching the refusal', async () => {
    const requests = silentOpen()
    const store = new IndexedDBOutboxStore()

    const first = store.loadPending()
    requests[0]!.onblocked!(new Event('blocked') as IDBVersionChangeEvent)
    await expect(first).rejects.toBeInstanceOf(OutboxUnavailableError)

    // The other tab has gone away: a real database answers this time.
    globalThis.indexedDB = new IDBFactory()
    await store.append('master', mutation('m2'))
    expect((await store.loadPending()).map((p) => p.mutation.mutation_id)).toEqual(['m2'])
  })
})
