/**
 * G-2 conflict log: the orchestrator fetches a trip's audited LWW
 * losers from the server and can ask the server to take one back
 * (NFR-4.2a's two halves); Local Mode has no server conflicts and
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
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conflicts: [
            {
              id: 'c1',
              entity_table: 'trip_items',
              entity_id: 'i1',
              field: 'quantity',
              losing_value: '9',
              winning_value: '5',
              resolved_at: '2026-07-09T10:00:00Z',
            },
          ],
        }),
        { status: 200 },
      ),
    )
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })

    const conflicts = await orch.fetchConflicts('t1')

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ field: 'quantity', losing_value: '9' })
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/trips/t1/conflicts')
  })

  it('resolves empty in Local Mode without a network call', async () => {
    const orch = useSyncOrchestrator({
      baseUrl: '',
      getToken: () => null,
      local: new IndexedDBPersistence(),
    })

    expect(await orch.fetchConflicts('t1')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('fetchMasterConflicts', () => {
  it('fetches the master partition log, which belongs to no trip', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          conflicts: [
            {
              id: 'c2',
              entity_table: 'templates',
              entity_id: 'tpl-1',
              field: 'name',
              losing_value: '"Sommerferien"',
              winning_value: '"Ferien"',
              resolved_at: '2026-07-09T10:00:00Z',
            },
          ],
        }),
        { status: 200 },
      ),
    )
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })

    const conflicts = await orch.fetchMasterConflicts()

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ entity_table: 'templates', field: 'name' })
    // No trip in the path: this log exists whether or not one is open,
    // which is the whole reason it needs its own endpoint.
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/master/conflicts')
  })

  it('resolves empty in Local Mode without a network call', async () => {
    const orch = useSyncOrchestrator({
      baseUrl: '',
      getToken: () => null,
      local: new IndexedDBPersistence(),
    })

    expect(await orch.fetchMasterConflicts()).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('revertConflict', () => {
  /** An empty 200 for the revert, then one for the drain's pull. */
  function okResponses(): void {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, pull_hint: { next_cursor: 3 }, changes: [] }), {
        status: 200,
      }),
    )
  }

  it('posts a trip conflict to the trip partition endpoint', async () => {
    okResponses()
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })

    await orch.revertConflict('c1', 't1')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/api/v1/trips/t1/conflicts/c1/revert')
    expect((init as RequestInit).method).toBe('POST')
  })

  it('posts a master conflict to the master endpoint, which takes no trip', async () => {
    okResponses()
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })

    await orch.revertConflict('c2')

    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/master/conflicts/c2/revert')
  })

  it('surfaces the server refusal rather than swallowing it', async () => {
    // §6 rule 2 outranks a revert, and the user has to be told which
    // refusal applied — a resolved promise would read as success.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'revert_refused', message: 'no' } }), {
        status: 409,
      }),
    )
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })

    await expect(orch.revertConflict('c3', 't1')).rejects.toMatchObject({
      status: 409,
      apiError: { code: 'revert_refused' },
    })
  })

  it('does nothing in Local Mode, which has no conflicts to revert', async () => {
    const orch = useSyncOrchestrator({
      baseUrl: '',
      getToken: () => null,
      local: new IndexedDBPersistence(),
    })

    await orch.revertConflict('c4', 't1')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
