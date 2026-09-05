// @vitest-environment jsdom
/**
 * The OS notification says the same sentence as the in-app one (NFR-4.12).
 *
 * `public/sw.js` cannot import the app, so its half of the rendering is
 * written twice by necessity — but only the *choice* is, never the text
 * (ADR-037). This spec is what holds the two choices together: it loads the
 * worker source, drives its renderer against the mirror the app itself
 * produces, and compares every result with `describeNotification`.
 *
 * That is the whole point of it. The previous arrangement kept a second copy
 * of the English sentences in the worker with a comment asking the next
 * person to keep them in sync, and the i18n migration walked past it.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'

import { DEFAULT_LOCALE, setLocale } from '@/i18n'
import { describeNotification, notificationRoute, type ServerNotification } from '../format'
import { currentMirror, writeNotificationMirror } from '../mirror'

/**
 * The worker's renderer, evaluated with a stub `self` so its top-level
 * listener registrations are inert. Read from disk rather than imported:
 * the file is a classic worker script and has no exports — and reading it
 * is also what makes this spec fail when somebody puts a sentence back.
 */
function loadWorker(): {
  notificationBody: (data: unknown, mirror: unknown) => string
  notificationUrl: (payload: Record<string, unknown>) => string
  readMirror: () => Promise<unknown>
  FALLBACK_BODY: string
  source: string
} {
  // From the vitest root (client/), not from `import.meta.url`: under jsdom
  // the module URL is an http one and `readFileSync` refuses it.
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
  const build = new Function(
    'self',
    'indexedDB',
    'caches',
    'clients',
    `${source}\n;return { notificationBody, notificationUrl, readMirror, FALLBACK_BODY }`,
  )
  const stub = { addEventListener: () => {}, location: { origin: 'http://localhost' } }
  // The worker's own `indexedDB`, so its read path is exercised rather than
  // stubbed: the three store names are contract between two files, and a
  // typo in either is exactly what this can catch.
  return { ...build(stub, globalThis.indexedDB, undefined, undefined), source }
}

function notif(kind: string, payload: Record<string, unknown> | null): ServerNotification {
  return { id: 'n1', kind, payload, created_at: '2026-07-09T12:00:00Z' }
}

const CASES: ServerNotification[] = [
  notif('delegation', { actor_name: 'Andy', item_name: 'Zelt' }),
  notif('delegation', { actor_name: 'Andy' }),
  notif('mention', { actor_name: 'Sarah', preview: 'schau mal bitte' }),
  notif('mention', { actor_name: 'Sarah' }),
  notif('task', { actor_name: 'Sarah', item_name: 'Kocher' }),
  notif('task', { actor_name: 'Sarah' }),
  notif('lock_taken', { actor_name: 'Sarah', item_name: 'Zelt' }),
  notif('lock_taken', { actor_name: 'Sarah' }),
  notif('shiny_new_kind', { actor_name: 'Andy' }),
  notif('mention', {}),
  notif('delegation', null),
]

describe('the worker renders the same body as the app', () => {
  afterEach(() => setLocale(DEFAULT_LOCALE))

  it.each(['en', 'de'] as const)('in %s', (locale) => {
    setLocale(locale)
    const { notificationBody } = loadWorker()
    const mirror = currentMirror()

    // Compared as one table rather than assertion by assertion, so a
    // divergence shows which kind said what instead of only the first.
    const worker = CASES.map((n) => notificationBody({ kind: n.kind, payload: n.payload }, mirror))

    expect(worker).toEqual(CASES.map(describeNotification))
  })

  /*
   * G-4, ADR-046: the link a tapped OS notification opens is the same one
   * the in-app list opens. The worker cannot import `router/paths.ts`, so
   * its copy of the shape is held here against `notificationRoute()` for
   * every payload shape — trip only, trip and item, and the comment.
   */
  it('lands a tapped notification where the app would', () => {
    const { notificationUrl } = loadWorker()
    const payloads: Record<string, unknown>[] = [
      { trip_id: 't1' },
      { trip_id: 't1', item_id: 'i1' },
      { trip_id: 't1', item_id: 'i1', comment_id: 'c9' },
    ]

    expect(payloads.map(notificationUrl)).toEqual(
      payloads.map((payload) => notificationRoute(notif('mention', payload))),
    )
    expect(notificationUrl({})).toBe('/')
  })

  it('falls back to one sentence when the mirror is not there', () => {
    const { notificationBody, FALLBACK_BODY } = loadWorker()

    // A device that has never run the app cannot be told what happened in a
    // language nobody chose — so it is told that something did.
    expect(notificationBody({ kind: 'delegation', payload: {} }, null)).toBe(FALLBACK_BODY)
  })

  /*
   * The rule the previous arrangement broke, stated as a check rather than
   * as a comment: the worker may hold exactly one sentence, the fallback.
   * A second English body reappearing here fails this.
   */
  it('holds no notification wording of its own beyond that fallback', () => {
    const { source } = loadWorker()
    const withoutFallback = source.replace(/const FALLBACK_BODY = '[^']*'/, '')

    const leaked = ['delegated', 'mentioned you', 'opened a task', 'took ', 'sent you'].filter(
      (phrase) => withoutFallback.includes(phrase),
    )

    expect(leaked).toEqual([])
  })
})

/**
 * The other half of ADR-037's contract: the app writes, the worker reads,
 * and the database, store and key names are the only thing binding them. A
 * typo in either file is silent in production — the worker just falls back —
 * so it is asserted across the real writer and the real reader.
 */
describe('the worker reads what the app wrote', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
  })

  afterEach(() => setLocale(DEFAULT_LOCALE))

  it('finds the mirror at the names the app writes it to', async () => {
    setLocale('de')
    expect(await writeNotificationMirror()).toBe(true)

    const { notificationBody, readMirror } = loadWorker()
    const stored = await readMirror()

    expect(stored).not.toBeNull()
    expect(notificationBody({ kind: 'delegation', payload: { actor_name: 'Alice' } }, stored)).toBe(
      describeNotification(notif('delegation', { actor_name: 'Alice' })),
    )
  })

  it('falls back rather than throwing when nothing has been written', async () => {
    const { readMirror } = loadWorker()

    expect(await readMirror()).toBeNull()
  })

  /*
   * And that read must not poison the store for the write that follows it,
   * which is the *ordinary* sequence in production: a push can reach a
   * device before the app has ever run. The worker opens the database at
   * version 1 and aborts the upgrade rather than creating a schema it does
   * not own — this asserts the abort rolls back cleanly.
   */
  it('leaves the store creatable after reading an absent one', async () => {
    expect(await loadWorker().readMirror()).toBeNull()

    expect(await writeNotificationMirror()).toBe(true)

    expect(await loadWorker().readMirror()).not.toBeNull()
  })
})
