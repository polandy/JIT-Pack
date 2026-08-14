/**
 * Local Mode persistence (FR-19.2/NFR-4.11): rows stored in IndexedDB
 * in sync-protocol shape, loaded on startup through the same
 * applyChanges path as a server pull.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { IndexedDBPersistence } from '../persistence'
import type { PullChange } from '@/api/types'

function change(
  table: string,
  id: string,
  row: Record<string, unknown> | null,
  deleted = false,
): PullChange {
  return { seq: 0, table, id, deleted, row }
}

beforeEach(() => {
  // Fresh database per test.
  globalThis.indexedDB = new IDBFactory()
})

describe('IndexedDBPersistence', () => {
  it('round-trips rows across instances in pull-change shape', async () => {
    const first = new IndexedDBPersistence()
    await first.save([
      change('trips', 't1', { name: 'Engadin', end_date: '2026-08-10' }),
      change('items', 'i1', { name: 'Socken' }),
    ])

    const second = new IndexedDBPersistence()
    const loaded = await second.load()

    expect(loaded).toHaveLength(2)
    const trip = loaded.find((c) => c.table === 'trips')
    expect(trip).toMatchObject({ id: 't1', deleted: false, row: { name: 'Engadin' } })
  })

  it('latest write per row wins', async () => {
    const p = new IndexedDBPersistence()
    await p.save([change('items', 'i1', { name: 'Socken', weight_grams: 80 })])
    await p.save([change('items', 'i1', { name: 'Socken', weight_grams: 100 })])

    const loaded = await p.load()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.row).toMatchObject({ weight_grams: 100 })
  })

  it('tombstones remove the stored row', async () => {
    const p = new IndexedDBPersistence()
    await p.save([change('items', 'i1', { name: 'Socken' })])
    await p.save([change('items', 'i1', null, true)])

    expect(await p.load()).toHaveLength(0)
  })

  it('keeps tables with identical ids apart', async () => {
    const p = new IndexedDBPersistence()
    await p.save([
      change('items', 'x', { name: 'Master' }),
      change('trip_items', 'x', { name: 'Trip' }),
    ])

    expect(await p.load()).toHaveLength(2)
  })

  it('stores, retrieves, and removes item image blobs (FR-22 Local Mode)', async () => {
    const p = new IndexedDBPersistence()
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' })

    await p.putImage('item-1', blob)
    const got = await p.getImage('item-1')
    expect(got).not.toBeNull()
    expect(got!.size).toBe(blob.size)

    await p.deleteImage('item-1')
    expect(await p.getImage('item-1')).toBeNull()
  })

  it('returns null for an unknown image', async () => {
    const p = new IndexedDBPersistence()
    expect(await p.getImage('nope')).toBeNull()
  })
})

/**
 * FR-19.2 — a save the caller can wait for.
 *
 * The regression: `save()` was fire-and-forget, so a row added and
 * followed straight away by a reload was written into a transaction the
 * navigation cancelled. The row was gone and the app had already shown
 * it as stored, which reads as data loss rather than as a race.
 */
describe('durability (FR-19.2)', () => {
  it('whenSettled resolves only after the write is readable again', async () => {
    const store = new IndexedDBPersistence()

    store.save([{ seq: 0, table: 'trip_items', id: 'i1', deleted: false, row: { name: 'Zelt' } }])
    await store.whenSettled()

    const rows = await store.load()
    expect(rows.map((r) => r.id)).toEqual(['i1'])
  })

  it('serialises overlapping saves, so the last write of a key wins', async () => {
    const store = new IndexedDBPersistence()

    store.save([{ seq: 0, table: 'trip_items', id: 'i1', deleted: false, row: { name: 'first' } }])
    store.save([{ seq: 0, table: 'trip_items', id: 'i1', deleted: false, row: { name: 'second' } }])
    await store.whenSettled()

    const rows = await store.load()
    expect(rows[0]?.row).toEqual({ name: 'second' })
  })

  /**
   * The serialisation above is what makes these two necessary: the chain
   * that orders the writes must not become the thing that stops them. A
   * quota error or a transaction the browser aborts is a normal event on
   * a device, and FR-19.2 promises durability for every applied change,
   * not for every change up to the first failure.
   *
   * `write` is stubbed rather than provoked through IndexedDB because the
   * rule under test is the chaining, not the storage engine — and a real
   * quota exhaustion is exactly the kind of "probably holds" setup the
   * testing rules forbid.
   */
  interface WriteSeam {
    write(changes: PullChange[]): Promise<void>
  }

  it('keeps writing after a failed write — one rejection may not silence the session (FR-19.2)', async () => {
    const store = new IndexedDBPersistence()
    vi.spyOn(store as unknown as WriteSeam, 'write').mockRejectedValueOnce(
      new Error('QuotaExceededError'),
    )

    await expect(store.save([change('items', 'i1', { name: 'lost' })])).rejects.toThrow(
      'QuotaExceededError',
    )
    await store.save([change('items', 'i2', { name: 'kept' })])

    expect((await store.load()).map((r) => r.id)).toEqual(['i2'])
  })

  it('settles again after a failed write, so the G-2 glyph can leave the syncing state', async () => {
    const store = new IndexedDBPersistence()
    vi.spyOn(store as unknown as WriteSeam, 'write').mockRejectedValueOnce(
      new Error('QuotaExceededError'),
    )

    await expect(store.save([change('items', 'i1', { name: 'lost' })])).rejects.toThrow(
      'QuotaExceededError',
    )

    await expect(store.whenSettled()).resolves.toBeUndefined()
  })
})
