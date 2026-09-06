/**
 * FR-6.2 client wiring: a `notification.created` ping off the socket, and a
 * reconnect, reach the notification group's unread fetch. What that group
 * then does with the answer — and every endpoint it speaks to — is
 * `sync/__tests__/notifications.seam.spec.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import type { ServerNotification } from '@/notifications/format'
import { installHarness } from '@/__tests__/harness'

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
  ;({ fetch: fetchMock } = installHarness())
  wsInstances = []
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
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ notifications }), { status: 200 }))
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
})
