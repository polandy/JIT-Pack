/**
 * M17/M20 (Addendum 3.23): the profile, the directory and the admin surface
 * that changes both — which verb reaches which endpoint, and which writers
 * re-read the session-wide identity afterwards (ADR-047).
 */
import { describe, it, expect, vi } from 'vitest'

import { API } from '@/api/routes'
import { createIdentityActions, type IdentityActions } from '../identity'
import type { IdentitySource } from '@/stores/identityStore'
import { stubClient } from './restClientStub'

function actions(localMode = false) {
  const client = stubClient()
  const refresh = vi.fn((_source: IdentitySource) => Promise.resolve())
  return {
    client,
    refresh,
    identity: createIdentityActions({
      client,
      localMode,
      identityCache: () => ({ refresh }),
    }),
  }
}

describe('reads', () => {
  it('fetchAdminUsers reads the M20 overview', async () => {
    const { client, identity } = actions()
    client.answer({ users: [{ user_id: 'user-a', display_name: 'Andy', is_instance_admin: true }] })

    const users = await identity.fetchAdminUsers()

    expect(client.paths()).toEqual([API.adminUsers])
    expect(users).toHaveLength(1)
    expect(users[0]!.display_name).toBe('Andy')
  })

  it('fetchMe and fetchUsers answer for a device with no server', async () => {
    const { client, identity } = actions(true)

    expect(await identity.fetchMe()).toBeNull()
    expect(await identity.fetchUsers()).toEqual([])
    expect(client.calls).toEqual([])
  })

  it('an offline read is an empty directory, not a rejection', async () => {
    // M3's sharing picker asks for it while the device may be offline; a
    // throw would take the sheet down with it.
    const { client, identity } = actions()
    client.fail(new TypeError('network down'))
    client.fail(new TypeError('network down'))

    expect(await identity.fetchUsers()).toEqual([])
    expect(await identity.fetchMe()).toBeNull()
  })
})

describe('admin writes use the right verb and path', () => {
  const cases: [string, (i: IdentityActions) => Promise<unknown>, string, string][] = [
    [
      'deactivateUser',
      (i) => i.deactivateUser('user-b'),
      'post',
      API.adminDeactivateUser('user-b'),
    ],
    [
      'reactivateUser',
      (i) => i.reactivateUser('user-b'),
      'post',
      API.adminReactivateUser('user-b'),
    ],
    [
      'adminResetAvatar',
      (i) => i.adminResetAvatar('user-b'),
      'delete',
      API.adminResetAvatar('user-b'),
    ],
    [
      'adminResetDisplayName',
      (i) => i.adminResetDisplayName('user-b'),
      'delete',
      API.adminResetDisplayName('user-b'),
    ],
  ]

  for (const [name, act, verb, path] of cases) {
    it(`${name} is a ${verb.toUpperCase()}`, async () => {
      const { client, identity } = actions()
      client.answer({ ok: true })

      await act(identity)

      expect(client.calls[0]).toMatchObject({ verb, path })
    })
  }
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
describe('a write that changes who the instance knows about re-reads the identity', () => {
  const cases: [string, (i: IdentityActions) => Promise<unknown>, number][] = [
    ['deactivateUser', (i) => i.deactivateUser('user-b'), 1],
    ['reactivateUser', (i) => i.reactivateUser('user-b'), 1],
    ['adminResetDisplayName', (i) => i.adminResetDisplayName('user-b'), 1],
    ['saveDisplayName', (i) => i.saveDisplayName('user-b', 'Béatrice'), 1],
    ['adminResetAvatar', (i) => i.adminResetAvatar('user-b'), 0],
    ['uploadAvatar', (i) => i.uploadAvatar('user-b', new Blob()), 0],
  ]

  for (const [name, act, expected] of cases) {
    it(`${name} re-reads it ${expected} time(s)`, async () => {
      const { client, refresh, identity } = actions()
      client.answer({ ok: true })

      await act(identity)

      expect(refresh).toHaveBeenCalledTimes(expected)
    })
  }

  it('the refresh reads both halves through this group, not the caller', async () => {
    // The cache is handed the two fetchers rather than a finished answer:
    // whoever refreshes gets the directory *and* `me`, and gets them from
    // the one place that knows the Local Mode answers.
    const { client, refresh, identity } = actions()
    client.answer({ ok: true })

    await identity.deactivateUser('user-b')

    const source = refresh.mock.calls[0]![0]
    client.answer({ users: [{ user_id: 'user-a', display_name: 'Andy' }] })
    client.answer({ user_id: 'user-a', display_name: 'Andy', is_instance_admin: true })
    expect(await source.fetchUsers()).toHaveLength(1)
    expect(await source.fetchMe()).toMatchObject({ user_id: 'user-a' })
    expect(client.paths().slice(1)).toEqual([API.users, API.me])
  })
})

describe('Local Mode has no accounts to administer', () => {
  const cases: [string, (i: IdentityActions) => Promise<unknown>][] = [
    ['createAPIToken', (i) => i.createAPIToken('cli', '90d')],
    ['saveDisplayName', (i) => i.saveDisplayName('user-b', 'Béatrice')],
    ['uploadAvatar', (i) => i.uploadAvatar('user-b', new Blob())],
    ['downloadExport', (i) => i.downloadExport(API.meExport)],
  ]

  for (const [name, act] of cases) {
    it(`${name} sends nothing`, async () => {
      const { client, refresh, identity } = actions(true)

      await act(identity)

      expect(client.calls).toEqual([])
      expect(refresh).not.toHaveBeenCalled()
    })
  }
})

describe('createAPIToken (FR-23.7)', () => {
  it('hands the minted token straight back and keeps it nowhere', async () => {
    const { client, identity } = actions()
    client.answer({ token: 'jitpack_pat_secret', expires_at: '2026-12-01T00:00:00Z' })

    const minted = await identity.createAPIToken('cli', '90d')

    expect(client.calls[0]).toMatchObject({
      verb: 'post',
      path: API.meTokens,
      payload: { name: 'cli', expiry: '90d' },
    })
    expect(minted).toMatchObject({ token: 'jitpack_pat_secret' })
  })
})
