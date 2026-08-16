/**
 * The client's id source — one place, because every id it makes is a primary
 * key another device will merge against (NFR-4.2a).
 *
 * `crypto.randomUUID` is only defined in a **secure context**: HTTPS, or
 * localhost. A self-hosted instance reached over plain HTTP on the LAN
 * (`http://192.168.1.35:3000`) is neither, so the function is `undefined`
 * there and *every* write threw "crypto.randomUUID is not a function". The
 * dev machine and the Playwright suite both run on localhost, which is a
 * secure context — which is precisely why nothing caught it before an iPad on
 * the LAN did (2026-08-16).
 *
 * `crypto.getRandomValues` carries no such restriction, so the fallback builds
 * the same RFC 4122 v4 value from it rather than degrading the id.
 */

/** Bytes 6 and 8 carry the version and variant of an RFC 4122 v4 UUID. */
const VERSION_BYTE = 6
const VARIANT_BYTE = 8

export function newId(): string {
  const source = globalThis.crypto
  if (typeof source?.randomUUID === 'function') return source.randomUUID()

  if (typeof source?.getRandomValues !== 'function') {
    // Never Math.random: these ids are merged across devices, and a collision
    // there is silent data loss rather than a visible failure. Refusing is the
    // lesser evil, and this branch is unreachable on any browser that runs the
    // app at all — getRandomValues is not gated on the secure context.
    throw new Error('No source of randomness: neither crypto.randomUUID nor crypto.getRandomValues')
  }

  const bytes = source.getRandomValues(new Uint8Array(16))
  bytes[VERSION_BYTE] = (bytes[VERSION_BYTE]! & 0x0f) | 0x40
  bytes[VARIANT_BYTE] = (bytes[VARIANT_BYTE]! & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
