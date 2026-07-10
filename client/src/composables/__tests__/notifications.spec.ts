/**
 * FR-6.2 client wiring: notification.created pings trigger an unread
 * fetch, each notification surfaces exactly once via onNotification,
 * connect() picks up notifications missed while away, and the prefs /
 * mark-read calls hit the right endpoints.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import type { ServerNotification } from '@/notifications/format'

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
  vi.stubGlobal('WebSocket', function () {
    const inst: WSStub = {
      send: vi.fn(), close: vi.fn(), readyState: 1,
      onopen: null, onmessage: null, onclose: null,
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

function notif(id: string): ServerNotification {
  return {
    id,
    kind: 'delegation',
    payload: { trip_id: 't1', item_id: 'i1', actor_name: 'Andy', item_name: 'Zelt' },
    created_at: '2026-07-09T12:00:00Z',
  }
}

function mockNotificationList(...notifications: ServerNotification[]) {
  fetchMock.mockResolvedValueOnce(new Response(
    JSON.stringify({ notifications }), { status: 200 },
  ))
}

describe('notification.created handling', () => {
  it('connect() surfaces unread notifications missed while away', async () => {
    const surfaced: ServerNotification[] = []
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      onNotification: (n) => surfaced.push(n),
    })
    mockNotificationList(notif('n1'), notif('n2'))

    await orch.connect()
    await vi.waitFor(() => expect(surfaced).toHaveLength(2))

    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).toContain('/api/v1/notifications')
    expect(url).toContain('unread=1')
  })

  it('a WS ping fetches unread and surfaces each notification once', async () => {
    const surfaced: ServerNotification[] = []
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      onNotification: (n) => surfaced.push(n),
    })
    mockNotificationList() // connect()'s initial unread fetch: empty
    await orch.connect()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    mockNotificationList(notif('n1'))
    wsInstances[0]!.onmessage!({
      data: JSON.stringify({ type: 'notification.created', payload: { notification_id: 'n1' } }),
    })
    await vi.waitFor(() => expect(surfaced).toHaveLength(1))

    // Second ping returns the same still-unread row — no double toast.
    mockNotificationList(notif('n1'), notif('n2'))
    wsInstances[0]!.onmessage!({
      data: JSON.stringify({ type: 'notification.created', payload: { notification_id: 'n2' } }),
    })
    await vi.waitFor(() => expect(surfaced).toHaveLength(2))
    expect(surfaced.map((n) => n.id)).toEqual(['n1', 'n2'])
  })

  it('without an onNotification callback nothing is fetched', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })

    await orch.connect()
    await Promise.resolve()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('an offline fetch surfaces nothing and does not throw', async () => {
    const surfaced: ServerNotification[] = []
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      onNotification: (n) => surfaced.push(n),
    })
    fetchMock.mockRejectedValueOnce(new TypeError('network down'))

    await orch.connect()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    expect(surfaced).toHaveLength(0)
  })
})

describe('notification endpoints', () => {
  it('markNotificationRead posts to the read endpoint', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    fetchMock.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

    await orch.markNotificationRead('n1')

    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/notifications/n1/read')
    expect(fetchMock.mock.calls[0]![1].method).toBe('POST')
  })

  it('saveNotificationPrefs puts the toggles', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    fetchMock.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

    await orch.saveNotificationPrefs({ delegation: false, mention: true, task: true })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/api/v1/me/notification-prefs')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ delegation: false, mention: true, task: true })
  })

  it('pushApi wires vapid key, register, and unregister', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })

    fetchMock.mockResolvedValueOnce(new Response('{"key":"BPub"}', { status: 200 }))
    expect(await orch.pushApi.getVapidKey()).toBe('BPub')
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/push/vapid-key')

    fetchMock.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    await orch.pushApi.registerSubscription({ endpoint: 'e', keys: { p256dh: 'p', auth: 'a' } })
    expect(fetchMock.mock.calls[1]![1].method).toBe('POST')

    fetchMock.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    await orch.pushApi.unregisterSubscription('e')
    expect(fetchMock.mock.calls[2]![1].method).toBe('DELETE')
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body as string)).toEqual({ endpoint: 'e' })
  })
})
