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
  NOTIFY_NOTE,
  NOTIFY_NOTE_REPLY,
  NOTIFY_SHOPPING_DUE,
  NOTIFY_TASK_DUE,
} from './messages'
import { tripItemPath, tripNotesPath, tripPath, tripSubPath } from '@/router/paths'

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
  // FR-7.11: a reminder is about the trip's tasks, which live on M25.
  if (n.kind === NOTIFY_TASK_DUE) return tripSubPath(tripId, 'tasks')
  // FR-30.10: a purchase's reminder opens the trip's shopping list (M6).
  if (n.kind === NOTIFY_SHOPPING_DUE) return tripSubPath(tripId, 'shopping')
  // FR-7.13: a note or a reply opens its thread on the trip's notes (M26).
  if (n.kind === NOTIFY_NOTE || n.kind === NOTIFY_NOTE_REPLY) {
    const thread = str(n.payload, 'thread_id') || str(n.payload, 'comment_id')
    return tripNotesPath(tripId, thread || undefined)
  }
  const itemId = str(n.payload, 'item_id')
  if (!itemId) return tripPath(tripId)
  return tripItemPath(tripId, itemId, str(n.payload, 'comment_id') || undefined)
}
