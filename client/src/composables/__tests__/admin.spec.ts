/**
 * M20 wiring (Addendum 3.23): the orchestrator's admin API hits the
 * /api/v1/admin/ endpoints with the right methods.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { installHarness } from '@/__tests__/harness'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  ;({ fetch: fetchMock } = installHarness())
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

    // Two extra answers per refreshing action: the directory and `me`.
    ok({ ok: true })
    ok({ users: [] })
    ok({ user_id: 'user-a', display_name: 'Andy', is_instance_admin: true })
    await orch.deactivateUser('user-b')
    ok({ ok: true })
    ok({ users: [] })
    ok({ user_id: 'user-a', display_name: 'Andy', is_instance_admin: true })
    await orch.reactivateUser('user-b')
    ok({ ok: true })
    await orch.adminResetAvatar('user-b')
    ok({ ok: true })
    ok({ users: [] })
    ok({ user_id: 'user-a', display_name: 'Andy', is_instance_admin: true })
    await orch.adminResetDisplayName('user-b')

    // Scoped to the admin endpoints: three of these four also re-read the
    // directory afterwards (ADR-047), and those GETs are the next case's
    // subject rather than this one's.
    for (const call of fetchMock.mock.calls) {
      const url = String(call[0])
      if (url.includes('/admin/users/')) calls.push([call[1].method, url])
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

  /*
   * ADR-047: the writers refresh the session-wide directory, because the
   * screen that triggered them is not the screen that shows the name.
   *
   * Table-driven over *every* writer rather than one of them: the rule is
   * written at four call sites, so one case proves one call site. Dropping
   * the refresh from `deactivateUser` alone left an earlier version of this
   * case green, which is the whole reason it looks like this.
   *
   * The avatar writers are the deliberate exception — the bytes are fetched
   * by URL with a cache-busting version and the directory carries no image —
   * and they are in the table too, expecting zero, or the exception would be
   * indistinguishable from a forgotten call.
   */
  describe('a write that changes who the instance knows about re-reads the directory', () => {
    // The directory endpoint, not the admin overview under it: the client
    // appends the empty query string, so the `?` is what separates
    // `/api/v1/users?` from `/api/v1/admin/users/<id>/…`.
    const DIRECTORY_URL = '/api/v1/users?'

    const cases: [string, (o: ReturnType<typeof useSyncOrchestrator>) => Promise<void>, number][] =
      [
        ['deactivateUser', (o) => o.deactivateUser('user-b'), 1],
        ['reactivateUser', (o) => o.reactivateUser('user-b'), 1],
        ['adminResetDisplayName', (o) => o.adminResetDisplayName('user-b'), 1],
        ['saveDisplayName', (o) => o.saveDisplayName('user-b', 'Béatrice'), 1],
        ['adminResetAvatar', (o) => o.adminResetAvatar('user-b'), 0],
        ['uploadAvatar', (o) => o.uploadAvatar('user-b', new Blob()), 0],
      ]

    for (const [name, act, expected] of cases) {
      it(`${name} re-reads it ${expected} time(s)`, async () => {
        const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
        ok({ ok: true })
        ok({ users: [] })
        ok({ user_id: 'user-a', display_name: 'Andy', is_instance_admin: true })

        await act(orch)

        const reads = fetchMock.mock.calls.filter(([url]) =>
          String(url).includes(DIRECTORY_URL),
        ).length
        expect(reads).toBe(expected)
      })
    }
  })
})
