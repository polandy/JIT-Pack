/**
 * Live location's rules (FR-29.19, ADR-087) — pure: when this device sends its
 * position, how the positions others send are kept, and when one is too old
 * to draw. The socket and the device's geolocation are the composable's
 * (`composables/shared/useLiveLocation.ts`); what they decide is here.
 */
import type { LiveLocation } from '@/api/types'

/** A position as the device reports it, or as somebody else's arrived. */
export interface Fix {
  lat: number
  lon: number
  /** Radius of the device's uncertainty, in metres. */
  accuracyM: number
  /** When it was taken (own) or received (others'), in ms since the epoch. */
  at: number
}

/** Sent at least this often while standing still, so the others see it is live. */
export const SHARE_EVERY_MS = 30_000
/** Never more often than this, however far the device moved. */
export const SHARE_AT_MOST_MS = 5_000
/** A move this far is worth telling before SHARE_EVERY_MS has passed. */
export const SHARE_MOVED_M = 25
/** A position older than this is not drawn: the person stopped sharing without a word. */
export const STALE_AFTER_MS = 5 * 60_000

const EARTH_RADIUS_M = 6_371_000
const RAD = Math.PI / 180

/** The great-circle distance between two positions, in metres. */
export function distanceM(a: Pick<Fix, 'lat' | 'lon'>, b: Pick<Fix, 'lat' | 'lon'>): number {
  const dLat = (b.lat - a.lat) * RAD
  const dLon = (b.lon - a.lon) * RAD
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Whether a new position is sent, given the last one sent: the first always,
 * then a move worth telling once SHARE_AT_MOST_MS has passed, and anything
 * once SHARE_EVERY_MS has.
 */
export function shouldShare(last: Fix | null, next: Fix): boolean {
  if (!last) return true
  const elapsed = next.at - last.at
  if (elapsed >= SHARE_EVERY_MS) return true
  return elapsed >= SHARE_AT_MOST_MS && distanceM(last, next) >= SHARE_MOVED_M
}

/** The positions others share on one trip, by person. */
export type PeopleFixes = ReadonlyMap<string, Fix>

/**
 * A received frame applied to a trip's positions: a fix replaces the person's
 * last one, *gone* takes it away. Kept by the time this device received it,
 * so a device whose clock is wrong still ages it correctly.
 */
export function applyLocation(
  people: PeopleFixes,
  frame: LiveLocation,
  receivedAt: number,
): Map<string, Fix> {
  const next = new Map(people)
  if (frame.gone) next.delete(frame.user_id)
  else
    next.set(frame.user_id, {
      lat: frame.lat,
      lon: frame.lon,
      accuracyM: frame.accuracy_m,
      at: receivedAt,
    })
  return next
}

/** The people worth drawing now — not stale — in a stable order. */
export function freshPeople(people: PeopleFixes, now: number): { userId: string; fix: Fix }[] {
  return [...people]
    .filter(([, fix]) => now - fix.at < STALE_AFTER_MS)
    .map(([userId, fix]) => ({ userId, fix }))
    .sort((a, b) => a.userId.localeCompare(b.userId))
}

/** Minutes since a fix, whole and never negative — the map's „vor 2 min". */
export function minutesAgo(fix: Fix, now: number): number {
  return Math.max(0, Math.floor((now - fix.at) / 60_000))
}
