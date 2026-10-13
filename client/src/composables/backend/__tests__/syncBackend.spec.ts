/**
 * The SyncBackend port (ARCH-14b): the orchestrator is built against one
 * shape and the mode picks the implementation once. Local Mode's side of it
 * must touch no network, hold everything, and answer "loaded" from IndexedDB.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createLocalBackend } from '../local'
import { fixedClock } from '@/__tests__/fixedClock'
import { IndexedDBPersistence } from '@/local/persistence'
import { useSyncStatus } from '@/composables/useSyncStatus'
import { MASTER_PARTITION } from '@/sync/partition'
import type { PullChange } from '@/api/types'

const trip: PullChange = {
  seq: 0,
  table: 'trips',
  id: 't1',
  deleted: false,
  row: { name: 'Engadin', year: 2026 },
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

function build(persistence = new IndexedDBPersistence()) {
  const applied: PullChange[][] = []
  const syncStatus = useSyncStatus(() => fixedClock())
  const backend = createLocalBackend({
    persistence,
    syncStatus,
    apply: (changes) => applied.push(changes),
    onLocalWrite: vi.fn(),
  })
  return { backend, applied, syncStatus, persistence }
}

describe('local SyncBackend (FR-19.2, invariant 5)', () => {
  it('holds everything and has no outbox to push through', () => {
    const { backend, syncStatus } = build()
    expect(backend.deviceHoldsEverything).toBe(true)
    expect(backend.outbox).toBeNull()
    expect(syncStatus.state.value).toBe('local')
  })

  it('answers loaded only once connect() has hydrated from the device', async () => {
    const { backend, applied, persistence } = build()
    await persistence.save([trip])

    expect(backend.masterDataLoaded()).toBe(false)
    expect(backend.tripDataLoaded('t1')).toBe(false)
    await backend.connect()

    expect(applied[0]).toHaveLength(1)
    expect(backend.masterDataLoaded()).toBe(true)
    expect(backend.tripDataLoaded('t1')).toBe(true)
  })

  it('persists applied changes and reports them as captured only once saved', async () => {
    const { backend, persistence } = build()
    backend.applied([trip])
    expect(backend.capturePending.value).toBe(true)
    await vi.waitFor(() => expect(backend.capturePending.value).toBe(false))
    expect((await persistence.load()).map((r) => r.id)).toEqual(['t1'])
  })

  it('has nothing to drain, queue or hold open: every network verb resolves to nothing', async () => {
    const { backend } = build()
    backend.enqueue(MASTER_PARTITION, [])
    backend.push([])
    backend.subscribeTrip('t1')
    backend.setViewing('t1')
    backend.shareLocation('t1', null)
    backend.resume()
    backend.disconnect()
    await expect(backend.drainMaster()).resolves.toBeUndefined()
    await expect(backend.drainTrip('t1')).resolves.toBeUndefined()
    await expect(backend.drainAll(['t1'])).resolves.toBeUndefined()
    await expect(backend.whenSent(MASTER_PARTITION)).resolves.toBeUndefined()
  })
})
