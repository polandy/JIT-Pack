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
   * Whether this device has no server (Local Mode) — there are no
   * notifications to fetch and no push to register.
   */
  localMode: boolean
  /**
   * Invoked for each incoming notification, live ones
   * (`notification.created`) and unread ones found on connect. The callee
   * surfaces it (toast) and marks it read via `markNotificationRead`.
   */
  onNotification?: (n: ServerNotification) => void
}

export interface NotificationActions {
  /** Fetch what is unread and hand each row to `onNotification` once. */
  surfaceUnread(): Promise<void>
  markNotificationRead(id: string): Promise<void>
  fetchNotificationPrefs(): Promise<NotificationPrefs | null>
  saveNotificationPrefs(prefs: NotificationPrefs): Promise<void>
  /** Server half of the Web Push dance (NFR-4.6) for `notifications/push.ts`. */
  pushApi: PushServerAPI
}

export function createNotificationActions(deps: NotificationDeps): NotificationActions {
  const { client, localMode, onNotification } = deps

  // Guards against surfacing the same notification twice when several
  // notification.created pings arrive before the first fetch settles.
  const surfaced = new Set<string>()

  return {
    async surfaceUnread() {
      if (localMode || !onNotification) return
      try {
        const resp = await client.get<NotificationListResponse>(API.notifications, {
          unread: '1',
        })
        for (const n of resp.notifications ?? []) {
          if (surfaced.has(n.id)) continue
          surfaced.add(n.id)
          onNotification(n)
        }
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
