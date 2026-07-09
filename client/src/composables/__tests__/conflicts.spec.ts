/**
 * G-2 conflict log: the orchestrator fetches a trip's audited LWW
 * losers from the server; Local Mode has no server conflicts and
 * resolves empty without touching the network (FR-19.6).
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('WebSocket', vi.fn())
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

describe('fetchConflicts', () => {
  it('fetches the trip conflict log from the server', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      conflicts: [{
        id: 'c1', entity_table: 'trip_items', entity_id: 'i1',
        field: 'quantity', losing_value: '9', winning_value: '5',
        resolved_at: '2026-07-09T10:00:00Z',
      }],
    }), { status: 200 }))
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })

    const conflicts = await orch.fetchConflicts('t1')

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ field: 'quantity', losing_value: '9' })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/trips/t1/conflicts')
  })

  it('resolves empty in Local Mode without a network call', async () => {
    const orch = useSyncOrchestrator({
      baseUrl: '', getToken: () => null, local: new IndexedDBPersistence(),
    })

    expect(await orch.fetchConflicts('t1')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
