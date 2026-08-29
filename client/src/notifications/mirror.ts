/**
 * The notification vocabulary, put where a service worker can read it
 * (NFR-4.12, ADR-037).
 *
 * A worker woken by a push has no page, no `localStorage` and no way to
 * import the catalogue, so the app writes the finished templates for the
 * active language into IndexedDB and the worker reads them there. What
 * crosses is *data* — one row per body, in the user's language — never a
 * second copy of the sentences.
 *
 * Its own database rather than Local Mode's: this is needed in Server Mode
 * too, where `IndexedDBPersistence` does not exist.
 */
import { watchEffect } from 'vue'

import { currentLocale, t } from '@/i18n'
import { bodyMessageKey, NOTIFICATION_BODY_NAMES } from './messages'

/** The database, store and row the worker reads. All three are contract. */
export const MIRROR_DB = 'jitpack-sw'
export const MIRROR_STORE = 'meta'
export const MIRROR_KEY = 'notifications'

/** What the worker finds under `MIRROR_KEY`. */
export interface NotificationMirror {
  locale: string
  /** Body name → the template in that language, with `{slot}` placeholders. */
  bodies: Record<string, string>
}

/** The mirror as it should be right now, rendered from the catalogue. */
export function currentMirror(): NotificationMirror {
  const bodies: Record<string, string> = {}
  for (const name of NOTIFICATION_BODY_NAMES) bodies[name] = t(bodyMessageKey(name))
  bodies.actorUnknown = t('notify.actorUnknown')
  return { locale: currentLocale(), bodies }
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MIRROR_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(MIRROR_STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Writes the mirror for the active language.
 *
 * Never throws: a browser that refuses IndexedDB (private mode, storage
 * denied) still gets its notifications — the worker's own fallback answers
 * — and a language mirror is not worth failing a language switch over.
 */
export async function writeNotificationMirror(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false
  try {
    const db = await open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MIRROR_STORE, 'readwrite')
      tx.objectStore(MIRROR_STORE).put(currentMirror(), MIRROR_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    db.close()
    return true
  } catch {
    return false
  }
}

/**
 * Keeps the mirror current for as long as the app is running: once at start
 * and again on every language change.
 *
 * A composable rather than a `watchEffect` in `App.vue` so the *wiring* is
 * testable and not only the write — and one effect rather than a call beside
 * each `setLocale`, which is how the last two mirrors of this shape went
 * stale (NFR-4.12's own history).
 */
export function startNotificationMirror(write: () => unknown = writeNotificationMirror): void {
  watchEffect(() => {
    // Read the locale so the effect re-runs when it changes; the write
    // itself reads it again through `currentMirror`. The writer is a
    // parameter so a test can assert *that the effect ran* without racing
    // IndexedDB for the answer — what the write itself does is covered
    // against the real store above.
    currentLocale()
    void write()
  })
}
