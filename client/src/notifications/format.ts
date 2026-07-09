/**
 * FR-6.2 notification rendering — pure, no I/O. Turns a server
 * notification row into toast text and its FR-6.3 deep-link route.
 * The service worker (public/sw.js) mirrors this wording for OS
 * notifications; it cannot import modules, so keep both in sync.
 */

export interface ServerNotification {
  id: string
  kind: string
  payload: Record<string, unknown>
  created_at: string
  read_at?: string | null
}

export interface NotificationPrefs {
  delegation: boolean
  mention: boolean
  task: boolean
}

function str(payload: Record<string, unknown>, key: string): string {
  const v = payload[key]
  return typeof v === 'string' ? v : ''
}

/** Human-readable one-liner for a notification (toast/OS body). */
export function describeNotification(n: ServerNotification): string {
  const actor = str(n.payload, 'actor_name') || 'Someone'
  const item = str(n.payload, 'item_name')
  const preview = str(n.payload, 'preview')
  switch (n.kind) {
    case 'delegation':
      return item ? `${actor} delegated “${item}” to you` : `${actor} delegated an item to you`
    case 'mention':
      return preview ? `${actor} mentioned you: ${preview}` : `${actor} mentioned you`
    case 'task':
      return item ? `${actor} opened a task on “${item}”` : `${actor} opened a task for you`
    default:
      return `${actor} sent you a notification`
  }
}

/**
 * Deep-link route for a notification (G-4): item context when the
 * payload carries one, otherwise the trip, otherwise nowhere.
 */
export function notificationRoute(n: ServerNotification): string | null {
  const tripId = str(n.payload, 'trip_id')
  if (!tripId) return null
  const itemId = str(n.payload, 'item_id')
  return itemId ? `/trips/${tripId}/items/${itemId}` : `/trips/${tripId}`
}
