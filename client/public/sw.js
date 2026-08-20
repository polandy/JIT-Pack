/**
 * JIT-Pack service worker — Web Push (NFR-4.6) and the app shell
 * (NFR-4.13, ADR-019).
 *
 * The shell cache carries the *bundle*, never the data: trips and items
 * live in IndexedDB (Local Mode) or behind the sync protocol (Server
 * Mode), and caching either would hand the merge algorithm's job to an
 * HTTP cache. That is why `/api`, `/ws` and `/health` are never touched
 * here — not even network-first.
 *
 * Push message body (see Sync-API §8, POST /push/subscriptions):
 *   { notification_id, kind, payload: { trip_id, item_id, actor_name,
 *     item_name, preview, ... } }
 *
 * The wording mirrors src/notifications/format.ts — a service worker
 * cannot import app modules, keep both in sync.
 */

/*
 * Injected by the build (vite.config.ts, jitpack-sw-precache): the list of
 * every file in the built bundle and a content hash naming this version.
 * The dev server serves this file verbatim — the fallbacks keep it inert
 * there (an empty precache and a throwaway cache name).
 */
const PRECACHE = self.__JITPACK_PRECACHE || []
const VERSION = self.__JITPACK_VERSION || 'dev'

const CACHE_PREFIX = 'jitpack-shell-'
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`

/** The SPA document every offline navigation falls back to. */
const APP_SHELL_URL = '/index.html'

/**
 * Same-origin paths the worker must never answer or cache: the sync
 * protocol and the WebSocket upgrade own their consistency story
 * (NFR-4.2a), and /health must always tell the truth about the server.
 */
function bypassed(pathname) {
  return pathname.startsWith('/api/') || pathname === '/ws' || pathname === '/health'
}

self.addEventListener('install', (event) => {
  // No skipWaiting(): a new version installs in the background and takes
  // over on the next launch (ADR-019). The running app only announces it.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop every shell cache but this version's. Only our own prefix:
      // other caches on the origin are not this worker's to clean.
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      )
      // Control already-open pages so the very first visit gets offline
      // capability without a reload.
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (bypassed(url.pathname)) return

  /*
   * ignoreVary, deliberately: the shell files are content-hashed, so each
   * URL has exactly one representation and Vary can only cause false
   * misses. It did — static servers answer assets with `Vary: Origin`,
   * and the page requests them *with* an Origin header (Vite emits
   * `crossorigin` module scripts) while install-time addAll fetched them
   * without one, so every asset missed the cache and an offline reload
   * painted nothing.
   */
  const matchOpts = { ignoreVary: true }

  // Navigations: network first — a reachable server always wins, so a new
  // deploy is picked up — falling back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(APP_SHELL_URL, matchOpts)))
    return
  }

  // Everything else in the bundle is content-hashed, so a cache hit is
  // correct by construction: cache first, network for whatever is not ours.
  event.respondWith(
    caches.match(request, matchOpts).then((cached) => cached || fetch(request)),
  )
})

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
