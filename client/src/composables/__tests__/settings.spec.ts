/**
 * M17 profile & data actions: /me identity, display-name PUT with the
 * FR-17.13 payload, binary avatar upload, and Local-Mode no-ops (no
 * server identity, no server exports).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'
import 'fake-indexeddb/auto'

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

describe('M17 profile & data actions', () => {
  it('fetchMe returns the identity from GET /api/v1/me', async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ user_id: 'u1', display_name: 'Andy' }), { status: 200 },
    ))
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => 'tok' })

    const me = await orch.fetchMe()

    expect(me).toEqual({ user_id: 'u1', display_name: 'Andy' })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/api/v1/me')
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it('saveDisplayName PUTs the FR-17.13 payload, tolerating an empty 200', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }))
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })

    await orch.saveDisplayName('u1', 'Andy_2')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/api/v1/users/u1/display-name')
    expect((init as RequestInit).method).toBe('PUT')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ display_name: 'Andy_2' })
  })

  it('uploadAvatar PUTs the JPEG blob with its content type', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }))
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })

    await orch.uploadAvatar('u1', new Blob(['jpeg-bytes'], { type: 'image/jpeg' }))

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/api/v1/users/u1/avatar')
    expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'image/jpeg' })
  })

  it('is inert in Local Mode — no identity, no exports, no requests', async () => {
    const orch = useSyncOrchestrator({
      baseUrl: 'http://localhost',
      getToken: () => null,
      local: new IndexedDBPersistence(),
    })

    expect(await orch.fetchMe()).toBeNull()
    await orch.saveDisplayName('u1', 'x')
    expect(await orch.downloadExport('/api/v1/export/full')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
