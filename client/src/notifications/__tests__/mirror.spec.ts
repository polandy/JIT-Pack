// @vitest-environment jsdom
/**
 * NFR-4.12 / ADR-037: the vocabulary the service worker reads.
 *
 * jsdom because the subject writes IndexedDB and reads the catalogue, and
 * `setLocale` touches `document`.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { DEFAULT_LOCALE, setLocale } from '@/i18n'
import {
  currentMirror,
  MIRROR_DB,
  MIRROR_KEY,
  MIRROR_STORE,
  writeNotificationMirror,
  type NotificationMirror,
} from '../mirror'
import { NOTIFICATION_BODY_NAMES } from '../messages'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

afterEach(() => setLocale(DEFAULT_LOCALE))

/** Read it back the way the worker does, not through the writer. */
function readBack(): Promise<NotificationMirror | undefined> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(MIRROR_DB, 1)
    open.onsuccess = () => {
      const get = open.result
        .transaction(MIRROR_STORE, 'readonly')
        .objectStore(MIRROR_STORE)
        .get(MIRROR_KEY)
      get.onsuccess = () => resolve(get.result)
      get.onerror = () => reject(get.error)
    }
    open.onerror = () => reject(open.error)
  })
}

describe('the notification mirror', () => {
  it('carries every body the worker can ask for, and the actor fallback', () => {
    const mirror = currentMirror()

    // Exhaustive against the list rather than a hand-written set: a new kind
    // adds a name there, and this fails until the catalogue has its text.
    // The missing ones are collected so the failure names them.
    const missing = NOTIFICATION_BODY_NAMES.filter((name) => !mirror.bodies[name])

    expect(missing).toEqual([])
    expect(mirror.bodies.actorUnknown).toBeTruthy()
  })

  it('leaves no key untranslated — a missing one renders as its own name', () => {
    setLocale('de')

    const untranslated = Object.entries(currentMirror().bodies)
      .filter(([, template]) => template.includes('notify.body.'))
      .map(([name]) => name)

    expect(untranslated).toEqual([])
  })

  it('writes what the worker will read', async () => {
    expect(await writeNotificationMirror()).toBe(true)

    const stored = await readBack()
    expect(stored?.locale).toBe(DEFAULT_LOCALE)
    expect(stored?.bodies.delegation).toBe(currentMirror().bodies.delegation)
  })

  it('is rewritten in the new language when the language changes', async () => {
    await writeNotificationMirror()
    setLocale('de')
    await writeNotificationMirror()

    const stored = await readBack()
    expect(stored?.locale).toBe('de')
    expect(stored?.bodies.mentionPlain).toContain('erwähnt')
  })

  /*
   * A browser that refuses storage still has to get its notifications: the
   * worker's own fallback answers, and a language mirror is not worth
   * failing a language switch over. The refusal is asserted as a *returned*
   * false rather than an absent throw, so the case cannot pass by accident.
   */
  it('reports a refusal instead of throwing', async () => {
    globalThis.indexedDB = {
      open() {
        throw new Error('storage denied')
      },
    } as unknown as IDBFactory

    await expect(writeNotificationMirror()).resolves.toBe(false)
  })
})
