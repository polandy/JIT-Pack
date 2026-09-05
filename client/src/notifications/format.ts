/**
 * FR-6.2 notification rendering — pure, no I/O. Turns a server
 * notification row into toast text and its FR-6.3 deep-link route.
 *
 * The wording itself lives in the catalogue (NFR-4.12) and is chosen in
 * `messages.ts`, which the service worker is held to as well: it renders the
 * *same* sentence for the OS notification out of the mirror it can read
 * (ADR-037), rather than carrying a second English copy of this file.
 */

import { t } from '@/i18n'
import type { NotificationEntry, NotificationPrefs } from '@/api/types'
import {
  bodyMessageKey,
  notificationBodyName,
  notificationDetail,
  notificationParams,
} from './messages'
import { tripItemPath, tripPath } from '@/router/paths'

/**
 * The server's notification row. Generated from internal/api/wire.go — this
 * name is the one the client has always used; the generated type is called
 * NotificationEntry because `Notification` is a DOM global.
 */
export type ServerNotification = NotificationEntry

export type { NotificationPrefs }

/** Human-readable one-liner for a notification (toast/OS body). */
export function describeNotification(n: ServerNotification): string {
  const name = notificationBodyName(n.kind, notificationDetail(n.payload))
  return t(bodyMessageKey(name), notificationParams(n, t('notify.actorUnknown')))
}

function str(payload: Record<string, unknown> | null, key: string): string {
  const v = payload?.[key]
  return typeof v === 'string' ? v : ''
}

/**
 * Deep-link route for a notification (G-4): item context when the
 * payload carries one, otherwise the trip, otherwise nowhere. A
 * mention/task notification also carries the comment id as `?comment=`,
 * so M5 can scroll to and flash that specific message in the thread.
 */
export function notificationRoute(n: ServerNotification): string | null {
  const tripId = str(n.payload, 'trip_id')
  if (!tripId) return null
  const itemId = str(n.payload, 'item_id')
  if (!itemId) return tripPath(tripId)
  return tripItemPath(tripId, itemId, str(n.payload, 'comment_id') || undefined)
}
