/**
 * The notification channel (FR-6.2) and the server half of Web Push
 * (NFR-4.6).
 *
 * Four requests and a de-duplication set: nothing here touches a sync
 * partition, a store or the outbox, which is why building the whole
 * orchestrator was never what a test of these needed.
 */
import { API } from '@/api/routes'

import type { NotificationListResponse, VAPIDKeyResponse } from '@/api/types'
import type { NotificationPrefs, ServerNotification } from '@/notifications/format'
import type { PushServerAPI } from '@/notifications/push'
import type { RestClient } from './restClient'

export interface NotificationDeps {
  client: RestClient
  /**
   * Invoked once per fetch with the notifications it found that were not
   * handed over before — live ones (`notification.created`) and unread ones
   * found on connect. A whole batch rather than one call each, because the
   * callee announces a burst differently from a single notice (G-23). It
   * marks each read via `markNotificationRead` once it has been seen.
   */
  onNotifications?: (batch: ServerNotification[]) => void
}

export interface NotificationActions {
  /** Fetch what is unread and hand the rows not seen before to `onNotifications`. */
  surfaceUnread(): Promise<void>
  markNotificationRead(id: string): Promise<void>
  fetchNotificationPrefs(): Promise<NotificationPrefs | null>
  saveNotificationPrefs(prefs: NotificationPrefs): Promise<void>
  /** Server half of the Web Push dance (NFR-4.6) for `notifications/push.ts`. */
  pushApi: PushServerAPI
}

/** Local Mode's answer: no notifications to fetch and no push to register. */
export const NO_NOTIFICATION_ACTIONS: NotificationActions = {
  surfaceUnread: async () => {},
  markNotificationRead: async () => {},
  fetchNotificationPrefs: async () => null,
  saveNotificationPrefs: async () => {},
  pushApi: {
    getVapidKey: async () => {
      throw new Error('Local Mode has no push service')
    },
    registerSubscription: async () => {},
    unregisterSubscription: async () => {},
  },
}

export function createNotificationActions(deps: NotificationDeps): NotificationActions {
  const { client, onNotifications } = deps

  // Guards against surfacing the same notification twice when several
  // notification.created pings arrive before the first fetch settles.
  const surfaced = new Set<string>()

  return {
    async surfaceUnread() {
      if (!onNotifications) return
      try {
        const resp = await client.get<NotificationListResponse>(API.notifications, {
          unread: '1',
        })
        const fresh = (resp.notifications ?? []).filter((n) => !surfaced.has(n.id))
        if (fresh.length === 0) return
        for (const n of fresh) surfaced.add(n.id)
        onNotifications(fresh)
      } catch {
        // Offline — unread notifications resurface on the next connect.
      }
    },

    async markNotificationRead(id) {
      try {
        await client.post(API.notificationRead(id))
      } catch {
        // Offline: stays unread server-side and resurfaces at most once.
      }
    },

    async fetchNotificationPrefs() {
      try {
        return await client.get<NotificationPrefs>(API.meNotificationPrefs)
      } catch {
        return null
      }
    },

    async saveNotificationPrefs(prefs) {
      await client.put(API.meNotificationPrefs, prefs)
    },

    pushApi: {
      async getVapidKey() {
        return (await client.get<VAPIDKeyResponse>(API.pushVAPIDKey)).key
      },
      async registerSubscription(sub) {
        await client.post(API.pushSubscriptions, sub)
      },
      async unregisterSubscription(endpoint) {
        await client.delete(API.pushSubscriptions, { endpoint })
      },
    },
  }
}
