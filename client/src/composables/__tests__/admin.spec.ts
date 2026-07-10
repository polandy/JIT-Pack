/**
 * M20 wiring (Addendum 3.23): the orchestrator's admin API hits the
 * /api/v1/admin/ endpoints with the right methods.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('WebSocket', vi.fn(() => ({
    send: vi.fn(), close: vi.fn(), readyState: 1,
    onopen: null, onmessage: null, onclose: null,
  })))
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

function ok(body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }))
}

describe('admin API (M20)', () => {
  it('fetchAdminUsers reads the overview', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    ok({ users: [{ user_id: 'user-a', display_name: 'Andy', is_instance_admin: true }] })

    const users = await orch.fetchAdminUsers()

    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/admin/users')
    expect(users).toHaveLength(1)
    expect(users[0]!.display_name).toBe('Andy')
  })

  it('lifecycle and moderation actions use the right method and path', async () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const calls: [string, string][] = []

    ok({ ok: true })
    await orch.deactivateUser('user-b')
    ok({ ok: true })
    await orch.reactivateUser('user-b')
    ok({ ok: true })
    await orch.adminResetAvatar('user-b')
    ok({ ok: true })
    await orch.adminResetDisplayName('user-b')

    for (const call of fetchMock.mock.calls) {
      calls.push([call[1].method, String(call[0])])
    }
    expect(calls[0]![0]).toBe('POST')
    expect(calls[0]![1]).toContain('/api/v1/admin/users/user-b/deactivate')
    expect(calls[1]![0]).toBe('POST')
    expect(calls[1]![1]).toContain('/api/v1/admin/users/user-b/reactivate')
    expect(calls[2]![0]).toBe('DELETE')
    expect(calls[2]![1]).toContain('/api/v1/admin/users/user-b/avatar')
    expect(calls[3]![0]).toBe('DELETE')
    expect(calls[3]![1]).toContain('/api/v1/admin/users/user-b/display-name')
  })
})
