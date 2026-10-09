/**
 * FR-29.19 through the orchestrator: a location frame lands in the trip's
 * positions by the time this device received it, *gone* takes it away, a dead
 * socket forgets them all, and Local Mode tells nobody.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { installHarness } from '@/__tests__/harness'
import { IndexedDBPersistence } from '@/local/persistence'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import 'fake-indexeddb/auto'

interface WSStub {
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  readyState: number
  onopen: (() => void) | null
  onmessage: ((ev: { data: string }) => void) | null
  onclose: (() => void) | null
}

let sockets: WSStub[]

beforeEach(() => {
  installHarness()
  sockets = []
  vi.stubGlobal('WebSocket', function () {
    const s: WSStub = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
      onopen: null,
      onmessage: null,
      onclose: null,
    }
    sockets.push(s)
    return s
  } as unknown as typeof WebSocket)
})

function frame(payload: Record<string, unknown>) {
  return { data: JSON.stringify({ type: 'location', payload }) }
}

const SIA = {
  trip_id: 't1',
  user_id: 'user-sia',
  lat: 46.5,
  lon: 9.8,
  accuracy_m: 8,
  at: 'x',
  gone: false,
}

describe('live locations (FR-29.19)', () => {
  it('keeps a position by the time it arrived, and drops it when the sharer stops', async () => {
    let clock = 1000
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => 't',
      now: () => clock,
    })
    await orch.connect()
    sockets[0]!.onopen!()

    sockets[0]!.onmessage!(frame(SIA))
    expect([...orch.presence.getLiveLocations('t1')]).toEqual([
      ['user-sia', { lat: 46.5, lon: 9.8, accuracyM: 8, at: 1000 }],
    ])
    expect(orch.presence.getLiveLocations('t2').size).toBe(0)

    clock = 2000
    sockets[0]!.onmessage!(frame({ ...SIA, gone: true }))
    expect(orch.presence.getLiveLocations('t1').size).toBe(0)
  })

  it('forgets every position when the socket dies', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => 't' })
    await orch.connect()
    sockets[0]!.onopen!()
    sockets[0]!.onmessage!(frame(SIA))

    sockets[0]!.onclose!()

    expect(orch.presence.getLiveLocations('t1').size).toBe(0)
  })

  it('sends a shared position over the socket, and nothing in Local Mode', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => 't' })
    await orch.connect()
    sockets[0]!.onopen!()
    orch.presence.shareLocation('t1', { lat: 46.5, lon: 9.8, accuracyM: 8 })
    expect(sockets[0]!.send).toHaveBeenLastCalledWith(
      JSON.stringify({ location: { trip_id: 't1', lat: 46.5, lon: 9.8, accuracy_m: 8 } }),
    )

    const local = useSyncOrchestrator({
      baseUrl: '',
      getToken: () => null,
      local: new IndexedDBPersistence(),
    })
    await local.connect()
    const before = sockets.length
    local.presence.shareLocation('t1', { lat: 46.5, lon: 9.8, accuracyM: 8 })
    expect(sockets).toHaveLength(before)
  })
})
