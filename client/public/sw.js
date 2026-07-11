/**
 * JIT-Pack service worker — Web Push only (NFR-4.6). No caching: the
 * offline story is IndexedDB/state sync, not an HTTP cache.
 *
 * Message body (see Sync-API §8, POST /push/subscriptions):
 *   { notification_id, kind, payload: { trip_id, item_id, actor_name,
 *     item_name, preview, ... } }
 *
 * The wording mirrors src/notifications/format.ts — a service worker
 * cannot import app modules, keep both in sync.
 */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    /* non-JSON push — show the generic fallback */
  }
  const payload = data.payload || {}
  const actor = payload.actor_name || 'Someone'
  const item = payload.item_name || ''

  let body
  switch (data.kind) {
    case 'delegation':
      body = item ? `${actor} delegated “${item}” to you` : `${actor} delegated an item to you`
      break
    case 'mention':
      body = payload.preview
        ? `${actor} mentioned you: ${payload.preview}`
        : `${actor} mentioned you`
      break
    case 'task':
      body = item ? `${actor} opened a task on “${item}”` : `${actor} opened a task for you`
      break
    default:
      body = `${actor} sent you a notification`
  }

  // Mirrors notificationRoute() (G-4): item context, plus the comment id
  // as ?comment= so M5 scrolls to and flashes the message.
  let url = '/'
  if (payload.trip_id) {
    if (payload.item_id) {
      url = `/trips/${payload.trip_id}/items/${payload.item_id}`
      if (payload.comment_id) url += `?comment=${payload.comment_id}`
    } else {
      url = `/trips/${payload.trip_id}`
    }
  }

  event.waitUntil(
    self.registration.showNotification('JIT-Pack', {
      body,
      tag: data.notification_id,
      data: { url },
    }),
  )
})

// FR-6.3: tapping the notification deep-links into the item context.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if ('focus' in win) {
          win.navigate(url)
          return win.focus()
        }
      }
      return clients.openWindow(url)
    }),
  )
})
