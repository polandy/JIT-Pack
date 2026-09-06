/**
 * FR-6.2 / NFR-4.6 at the seam: each unread notification surfaces exactly
 * once, an offline fetch surfaces nothing, and the prefs / mark-read / push
 * calls reach the right endpoints.
 */
import { describe, it, expect } from 'vitest'

import { API } from '@/api/routes'
import { createNotificationActions } from '../notifications'
import { stubClient } from './restClientStub'
import type { ServerNotification } from '@/notifications/format'

function actions(opts: { localMode?: boolean; silent?: boolean } = {}) {
  const client = stubClient()
  const surfaced: ServerNotification[] = []
  const notifications = createNotificationActions({
    client,
    localMode: opts.localMode ?? false,
    onNotification: opts.silent ? undefined : (n) => void surfaced.push(n),
  })
  return { client, surfaced, notifications }
}

function notif(id: string): ServerNotification {
  return {
    id,
    kind: 'delegation',
    payload: { trip_id: 't1', item_id: 'i1', actor_name: 'Andy', item_name: 'Zelt' },
    created_at: '2026-07-09T12:00:00Z',
  }
}

describe('surfaceUnread', () => {
  it('asks only for what is unread', async () => {
    const { client, notifications } = actions()
    client.answer({ notifications: [notif('n1')] })

    await notifications.surfaceUnread()

    expect(client.calls[0]).toMatchObject({
      verb: 'get',
      path: API.notifications,
      payload: { unread: '1' },
    })
  })

  it('surfaces each notification once, however often it is asked for', async () => {
    // A second ping arrives while the row is still unread, so the same id
    // comes back — a toast per ping would be a toast per ping, not per event.
    const { client, surfaced, notifications } = actions()
    client.answer({ notifications: [notif('n1')] })
    await notifications.surfaceUnread()
    client.answer({ notifications: [notif('n1'), notif('n2')] })
    await notifications.surfaceUnread()

    expect(surfaced.map((n) => n.id)).toEqual(['n1', 'n2'])
  })

  it('without an onNotification callback nothing is fetched', async () => {
    const { client, notifications } = actions({ silent: true })

    await notifications.surfaceUnread()

    expect(client.calls).toEqual([])
  })

  it('fetches nothing in Local Mode, which has no notifications', async () => {
    const { client, surfaced, notifications } = actions({ localMode: true })

    await notifications.surfaceUnread()

    expect(client.calls).toEqual([])
    expect(surfaced).toEqual([])
  })

  it('an offline fetch surfaces nothing and does not throw', async () => {
    const { client, surfaced, notifications } = actions()
    client.fail(new TypeError('network down'))

    await notifications.surfaceUnread()

    expect(surfaced).toEqual([])
  })

  it('an id that failed to arrive is not remembered as surfaced', async () => {
    // The de-duplication set is what makes the offline case above safe to
    // retry: it must record what was handed over, not what was asked for.
    const { client, surfaced, notifications } = actions()
    client.fail(new TypeError('network down'))
    await notifications.surfaceUnread()
    client.answer({ notifications: [notif('n1')] })

    await notifications.surfaceUnread()

    expect(surfaced.map((n) => n.id)).toEqual(['n1'])
  })
})

describe('notification endpoints', () => {
  it('markNotificationRead posts to the read endpoint', async () => {
    const { client, notifications } = actions()
    client.answer({ ok: true })

    await notifications.markNotificationRead('n1')

    expect(client.calls[0]).toMatchObject({ verb: 'post', path: API.notificationRead('n1') })
  })

  it('a mark-read that could not be sent is swallowed, not thrown', async () => {
    // It stays unread server-side and resurfaces at most once; a rejection
    // here would reach the toast the user just dismissed.
    const { client, notifications } = actions()
    client.fail(new TypeError('network down'))

    await expect(notifications.markNotificationRead('n1')).resolves.toBeUndefined()
  })

  it('saveNotificationPrefs puts the toggles', async () => {
    const { client, notifications } = actions()
    client.answer({ ok: true })

    await notifications.saveNotificationPrefs({
      delegation: false,
      mention: true,
      task: true,
      lock_taken: false,
    })

    expect(client.calls[0]).toMatchObject({
      verb: 'put',
      path: API.meNotificationPrefs,
      payload: { delegation: false, mention: true, task: true, lock_taken: false },
    })
  })

  it('fetchNotificationPrefs answers null offline rather than throwing', async () => {
    const { client, notifications } = actions()
    client.fail(new TypeError('network down'))

    expect(await notifications.fetchNotificationPrefs()).toBeNull()
  })
})

describe('pushApi (NFR-4.6)', () => {
  it('wires vapid key, register, and unregister', async () => {
    const { client, notifications } = actions()

    client.answer({ key: 'BPub' })
    expect(await notifications.pushApi.getVapidKey()).toBe('BPub')

    client.answer({ ok: true })
    await notifications.pushApi.registerSubscription({
      endpoint: 'e',
      keys: { p256dh: 'p', auth: 'a' },
    })

    client.answer({ ok: true })
    await notifications.pushApi.unregisterSubscription('e')

    expect(client.calls).toMatchObject([
      { verb: 'get', path: API.pushVAPIDKey },
      { verb: 'post', path: API.pushSubscriptions },
      { verb: 'delete', path: API.pushSubscriptions, payload: { endpoint: 'e' } },
    ])
  })
})
