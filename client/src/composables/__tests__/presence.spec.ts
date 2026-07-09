/**
 * G-10 presence: the orchestrator consumes presence events into a
 * reactive per-trip map for the M4 facepile, and reports its pull
 * cursor over the WebSocket so the server can compute in_sync
 * (Sync-API §7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import type { PullResponse, PushResponse } from '@/api/types'

interface WSStub {
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  readyState: number
  onopen: (() => void) | null
  onmessage: ((ev: { data: string }) => void) | null
  onclose: (() => void) | null
}

let fetchMock: ReturnType<typeof vi.fn>
let wsInstances: WSStub[]

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn()
  wsInstances = []
  vi.stubGlobal('fetch', fetchMock)
  // Must be constructible ("new WebSocket(...)"), so no arrow function.
  vi.stubGlobal('WebSocket', function () {
    const inst: WSStub = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
      onopen: null,
      onmessage: null,
      onclose: null,
    }
    wsInstances.push(inst)
    return inst
  } as unknown as typeof WebSocket)
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

function newOrch() {
  return useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => 't' })
}

describe('presence handling (G-10)', () => {
  it('stores presence users per trip from the WS event', async () => {
    const orch = newOrch()
    await orch.connect()

    wsInstances[0].onmessage!({
      data: JSON.stringify({
        type: 'presence',
        payload: {
          trip_id: 't1',
          users: [
            { user_id: 'u1', device_count: 2, in_sync: true },
            { user_id: 'u2', device_count: 1, in_sync: false },
          ],
        },
      }),
    })

    const users = orch.getPresence('t1')
    expect(users).toHaveLength(2)
    expect(users[1]).toMatchObject({ user_id: 'u2', in_sync: false })
    expect(orch.getPresence('other')).toHaveLength(0)
  })

  it('reports the pull cursor over the WebSocket after a trip drain', async () => {
    const orch = newOrch()
    await orch.connect()
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ changes: [], next_cursor: 7, has_more: false } satisfies PullResponse),
      { status: 200 },
    ))

    await orch.drainTrip('t1')

    const cursorFrames = wsInstances[0].send.mock.calls
      .map((c) => JSON.parse(String(c[0])))
      .filter((m) => m.cursor)
    expect(cursorFrames).toHaveLength(1)
    expect(cursorFrames[0].cursor).toEqual({ trip_id: 't1', seq: 7 })
  })
})
