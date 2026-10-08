/**
 * The Local Mode image hash (FR-22, FR-29.5). It marks a change of bytes on
 * this device; nothing compares it with a server's. `crypto.subtle` exists
 * only in a secure context, and a self-hosted instance reached over the LAN
 * (`http://192.168.1.35:3000`) is not one — E2E-NFR-SEC-01's reason — so the
 * hash must not need it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { hashBlob } from '@/sync/rows'

afterEach(() => vi.unstubAllGlobals())

const A = new Blob(['a picture of the lake'])
const B = new Blob(['a picture of the hut'])

describe('hashBlob', () => {
  it('is the first 8 bytes of the SHA-256, as the server stamps it, where it can be', async () => {
    // sha256("a picture of the lake"), first 8 bytes.
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode('a picture of the lake')),
    )
    const expected = Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')
    expect(await hashBlob(A)).toBe(expected)
  })

  it('still marks a change on a plain-HTTP origin, where crypto.subtle is missing', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })

    const a = await hashBlob(A)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(await hashBlob(new Blob(['a picture of the lake']))).toBe(a)
    expect(await hashBlob(B)).not.toBe(a)
  })
})
