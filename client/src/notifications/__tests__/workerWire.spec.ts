/**
 * `public/sw.js` reads the push body (NFR-4.6) by name, and a classic worker
 * cannot import the generated contract. This spec is what ties its names to
 * `WebPushMessage` and the notification vocabulary of `api/types.ts`: a key
 * renamed in internal/api/wire.go regenerates that file, and the worker's
 * stale spelling fails here instead of in an OS notification nobody tests.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

import {
  NOTIFICATION_DUE,
  NOTIFICATION_KIND,
  NOTIFICATION_PAYLOAD_KEY,
  type WebPushMessage,
} from '@/api/types'

/** Every field of the push body — a record, so a field Go adds fails the type check here. */
const PUSH_FIELDS: Record<keyof WebPushMessage, true> = {
  notification_id: true,
  kind: true,
  payload: true,
}

// From the vitest root (client/), as workerBody.spec.ts reads it.
const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

function matches(pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((m) => m[1]!)
}

describe('the service worker reads the push body by the contract’s names (NFR-4.6, NFR-4.14)', () => {
  it('reads every WebPushMessage field and no other off the body', () => {
    // `data.x` not preceded by another member access: `event.data.json()`
    // and `notification.data.url` are the browser's, not the body's.
    const read = new Set(matches(/(?<![.\w])data\.([a-z_]+)/g))
    expect([...read].sort()).toEqual(Object.keys(PUSH_FIELDS).sort())
  })

  it('reads only payload keys the server sends', () => {
    const keys = matches(/\bpayload\.([a-z_]+)/g)
    expect(keys.length).toBeGreaterThan(0)
    const known: readonly string[] = Object.values(NOTIFICATION_PAYLOAD_KEY)
    expect(keys.filter((k) => !known.includes(k))).toEqual([])
  })

  it('compares kinds and due words only with values the server sends', () => {
    const kinds = matches(/kind === '([a-z_]+)'/g)
    expect(kinds.length).toBeGreaterThan(0)
    const knownKinds: readonly string[] = Object.values(NOTIFICATION_KIND)
    expect(kinds.filter((k) => !knownKinds.includes(k))).toEqual([])
    const dues = matches(/payload\.due === '([a-z]+)'/g)
    expect(dues).toEqual([NOTIFICATION_DUE.tomorrow])
  })

  it('knows exactly the kinds the server sends', () => {
    const list = /const known = \[([^\]]*)\]/.exec(source)
    expect(list).not.toBeNull()
    const known = [...list![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
    expect(known.sort()).toEqual(Object.values(NOTIFICATION_KIND).sort())
  })
})
