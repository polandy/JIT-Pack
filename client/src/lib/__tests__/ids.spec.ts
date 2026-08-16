/**
 * Ids for every mutation the client makes (NFR-4.2a: they travel to other
 * devices, so they must be unique across them).
 *
 * `crypto.randomUUID` exists only in a **secure context**. Self-hosting over
 * plain HTTP on a LAN — `http://192.168.1.35:3000`, which is exactly how the
 * owner reaches the app from an iPad — is not one, so the function is
 * `undefined` there and every write in the app threw
 * "crypto.randomUUID is not a function". Found 2026-08-16; localhost is a
 * secure context, which is why neither the dev machine nor the Playwright
 * suite ever saw it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

import { newId } from '../ids'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A crypto without randomUUID — what an insecure context actually offers. */
function insecureContext() {
  vi.stubGlobal('crypto', {
    getRandomValues: (array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) array[i] = (i * 37 + 11) % 256
      return array
    },
  })
}

describe('newId', () => {
  it('returns a v4 UUID where the platform offers randomUUID', () => {
    expect(newId()).toMatch(UUID_V4)
  })

  it('still returns a v4 UUID without randomUUID — the insecure-context path', () => {
    insecureContext()

    // This is the case the app shipped broken: over plain HTTP the id source
    // simply was not there.
    expect(newId()).toMatch(UUID_V4)
  })

  it('sets the version and variant bits itself on the fallback path', () => {
    insecureContext()

    const id = newId()
    expect(id[14]).toBe('4')
    expect(['8', '9', 'a', 'b']).toContain(id[19])
  })

  it('does not repeat itself', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId()))
    expect(ids.size).toBe(500)
  })

  it('does not repeat itself on the fallback path either', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) array[i] = Math.floor(Math.random() * 256)
        return array
      },
    })

    const ids = new Set(Array.from({ length: 500 }, () => newId()))
    expect(ids.size).toBe(500)
  })

  it('refuses to invent a weak id when the platform offers no randomness', () => {
    vi.stubGlobal('crypto', {})

    // Falling back to Math.random would produce ids that collide across
    // devices, and these ids are primary keys other devices merge against —
    // a loud failure is the lesser evil.
    expect(() => newId()).toThrow(/randomness/i)
  })
})

/**
 * The guard. A single new `crypto.randomUUID()` anywhere in the client brings
 * the whole defect back for every plain-HTTP instance, and it will not show up
 * on localhost — so nothing in the normal loop would catch it. Same idea as
 * the no-raw-colour rule the theme is held to.
 */
describe('the id source stays single', () => {
  it('is the only place in src that calls crypto.randomUUID', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')

    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) {
          walk(path)
          continue
        }
        if (!/\.(ts|vue)$/.test(entry)) continue
        if (path.endsWith(join('lib', 'ids.ts')) || path.includes('__tests__')) continue
        if (readFileSync(path, 'utf8').includes('crypto.randomUUID')) offenders.push(path)
      }
    }
    walk('src')

    expect(offenders).toEqual([])
  })
})
