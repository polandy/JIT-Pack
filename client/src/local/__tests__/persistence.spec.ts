/**
 * Local Mode persistence (FR-19.2/NFR-4.11): rows stored in IndexedDB
 * in sync-protocol shape, loaded on startup through the same
 * applyChanges path as a server pull.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach } from 'vitest'

import { IndexedDBPersistence } from '../persistence'
import type { PullChange } from '@/api/types'

function change(table: string, id: string, row: Record<string, unknown> | null, deleted = false): PullChange {
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
      change('items', 'i1', { name: 'Socken', unit: 'pieces' }),
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
    expect(loaded[0].row).toMatchObject({ weight_grams: 100 })
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
})
