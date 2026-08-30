/**
 * FR-25.15 — "captured on this device", the signal the sheet's save
 * indicator renders.
 *
 * It is deliberately *not* G-2. G-2 answers "did this reach the server";
 * this answers "is this write still open on my machine", and offline is
 * exactly where the two disagree: a device with no network still writes,
 * and while that write is open the honest answer is "not yet".
 *
 * Until 2026-08-30 the indicator was handed `syncStatus.state`, whose
 * precedence returns `offline` before `syncing` — so offline it read
 * *settled* for every write, including one still in flight, which is the
 * one case the requirement exists for. These cases pin the difference.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'
import { installHarness } from '@/__tests__/harness'
import type { OutboxStore } from '@/sync/outboxStore'
import type { Mutation } from '@/api/types'

beforeEach(() => {
  installHarness()
  globalThis.indexedDB = new IDBFactory()
})

/** A device store whose append can be held open, so "in flight" is a state. */
function heldStore(): OutboxStore & { release: () => void; appended: number } {
  let release: () => void = () => {}
  const store = {
    appended: 0,
    release: () => release(),
    async load() {
      return {}
    },
    append(_key: string, _mutation: Mutation) {
      store.appended += 1
      return new Promise<void>((resolve) => {
        release = resolve
      })
    },
    async replace() {},
    async clear() {},
  }
  return store as unknown as OutboxStore & { release: () => void; appended: number }
}

describe('capturePending (FR-25.15)', () => {
  it('is false on a device that has written nothing', () => {
    const orch = useSyncOrchestrator({ baseUrl: '', getToken: () => null })
    expect(orch.capturePending.value).toBe(false)
  })

  it('is true while a Local Mode write is open and false once it lands', async () => {
    const persistence = new IndexedDBPersistence()
    const orch = useSyncOrchestrator({ baseUrl: '', getToken: () => null, local: persistence })

    orch.quickAddItem('t1', 'Socken', {}, false)

    expect(orch.capturePending.value).toBe(true)
    await vi.waitFor(() => expect(orch.capturePending.value).toBe(false))
  })

  it('is true while the outbox has not yet written the mutation to the device', async () => {
    const store = heldStore()
    const orch = useSyncOrchestrator({
      baseUrl: '',
      getToken: () => null,
      outboxStore: store,
    })

    orch.quickAddItem('t1', 'Socken', {}, false)
    await vi.waitFor(() => expect(store.appended).toBe(1))
    expect(orch.capturePending.value).toBe(true)

    store.release()
    await vi.waitFor(() => expect(orch.capturePending.value).toBe(false))
  })

  it('stays true offline — the state G-2 reports has no say in it', async () => {
    const store = heldStore()
    const orch = useSyncOrchestrator({
      baseUrl: '',
      getToken: () => null,
      outboxStore: store,
    })

    orch.quickAddItem('t1', 'Socken', {}, false)
    await vi.waitFor(() => expect(store.appended).toBe(1))
    orch.syncStatus.setOffline()

    // The regression this file exists for: reading `syncStatus.state` here
    // returns 'offline', which the indicator scored as settled.
    expect(orch.syncStatus.state.value).toBe('offline')
    expect(orch.capturePending.value).toBe(true)

    store.release()
    await vi.waitFor(() => expect(orch.capturePending.value).toBe(false))
  })

  it('is unmoved by a pull that writes nothing of the user’s', async () => {
    const orch = useSyncOrchestrator({ baseUrl: '', getToken: () => null })

    orch.syncStatus.setSyncing()

    // A background pull is G-2's business. The sheet has nothing open, so
    // it must not claim to be saving something.
    expect(orch.syncStatus.state.value).toBe('syncing')
    expect(orch.capturePending.value).toBe(false)
  })
})
