/**
 * FR-29.19 — what an edited route's new legs are asked of (ADR-087).
 *
 * A path between two points comes from BRouter, asked by the device: the
 * instance's config names the address, empty where the operator turned
 * routing off, and Local Mode asks the public one. A straight leg's heights
 * come from swisstopo's profile service where both ends lie in Switzerland
 * — under the tiles' switch, since editing is locked without a map.
 *
 * Reactive like the tiles' switch beside it: the address arrives from the
 * server after the first paint.
 */
import { computed, ref, type ComputedRef } from 'vue'

import type { TrackKind } from '@/api/types'
import { toLv95, type LatLon, type RoutePoint } from '@/domain/route'
import { inSwitzerland } from '@/domain/track'

/** The public BRouter — the server's default too (`cmd/jitpackd`). */
export const DEFAULT_ROUTER_URL = 'https://brouter.de/brouter'
/** swisstopo's height profile along a line, in LV95. */
export const HEIGHTS_URL = 'https://api3.geo.admin.ch/rest/services/profile.json'
/** Where the last known address is kept, so an offline start keeps it. */
export const ROUTING_STORAGE_KEY = 'jitpack_routing_url'
/** BRouter's profile per kind: mountain paths for a hike, tracks and quiet roads for a bike tour. */
export const ROUTER_PROFILE: Record<TrackKind, string> = {
  hike: 'hiking-mountain',
  bike: 'trekking',
}
/** How long a request may take before its leg is drawn straight. */
export const ROUTING_TIMEOUT_MS = 15_000
/** One height sample per this many metres of a straight leg, between 2 and {@link MAX_HEIGHT_SAMPLES}. */
const HEIGHT_SAMPLE_M = 25
const MAX_HEIGHT_SAMPLES = 200
/** Kept in storage for an instance that turned routing off. */
const OFF = 'off'

const address = ref(DEFAULT_ROUTER_URL)

/** Applies the instance's address for this session and persists it; empty is off. */
export function setRouting(url: string): void {
  address.value = url
  try {
    localStorage.setItem(ROUTING_STORAGE_KEY, url === '' ? OFF : url)
  } catch {
    // Storage unavailable (private mode) → still applied for this session.
  }
}

/** Reads the persisted address; called before mount. */
export function initRouting(): void {
  try {
    const kept = localStorage.getItem(ROUTING_STORAGE_KEY)
    if (kept !== null) address.value = kept === OFF ? '' : kept
  } catch {
    // Storage unavailable → the public router until the server says otherwise.
  }
}

const url = computed(() => address.value)

/** The router asked for paths, or empty where routing is off. */
export function useRoutingUrl(): ComputedRef<string> {
  return url
}

/** The router could not answer: no path, a refusal, or no network. */
export class RoutingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RoutingError'
  }
}

interface BRouterAnswer {
  features?: { geometry?: { coordinates?: number[][] } }[]
}

/** The path between two points along the ways a kind uses, each point with its height. */
export async function fetchPath(
  router: string,
  from: LatLon,
  to: LatLon,
  kind: TrackKind,
  signal?: AbortSignal,
): Promise<RoutePoint[]> {
  const query = new URLSearchParams({
    lonlats: `${from.lon},${from.lat}|${to.lon},${to.lat}`,
    profile: ROUTER_PROFILE[kind],
    alternativeidx: '0',
    format: 'geojson',
  })
  const response = await fetch(`${router}?${query}`, { signal: withTimeout(signal) })
  if (!response.ok) throw new RoutingError(`router answered ${response.status}`)
  const answer = (await response.json()) as BRouterAnswer
  const coordinates = answer.features?.[0]?.geometry?.coordinates ?? []
  if (coordinates.length < 2) throw new RoutingError('router found no path')
  return coordinates.map(([lon, lat, ele]) => ({
    lat: lat!,
    lon: lon!,
    ele: typeof ele === 'number' ? ele : null,
  }))
}

interface ProfileRow {
  dist: number
  alts: { COMB?: number; DTM2?: number }
}

/**
 * A straight line between two points, with swisstopo's heights along it
 * where both lie in Switzerland, and without heights elsewhere — or where
 * the service does not answer, since a line without heights is still the
 * line that was asked for.
 */
export async function fetchStraight(
  from: LatLon,
  to: LatLon,
  signal?: AbortSignal,
): Promise<RoutePoint[]> {
  const bare: RoutePoint[] = [
    { ...from, ele: null },
    { ...to, ele: null },
  ]
  if (
    !inSwitzerland([
      [
        [from.lat, from.lon],
        [to.lat, to.lon],
      ],
    ])
  )
    return bare
  const metres = Math.hypot(...toLv95(from).map((v, i) => v - toLv95(to)[i]!))
  const samples = Math.max(2, Math.min(MAX_HEIGHT_SAMPLES, Math.round(metres / HEIGHT_SAMPLE_M)))
  const geom = JSON.stringify({ type: 'LineString', coordinates: [toLv95(from), toLv95(to)] })
  const query = new URLSearchParams({ geom, sr: '2056', nb_points: String(samples) })
  try {
    const response = await fetch(`${HEIGHTS_URL}?${query}`, { signal: withTimeout(signal) })
    if (!response.ok) return bare
    const rows = (await response.json()) as ProfileRow[]
    const total = rows[rows.length - 1]?.dist ?? 0
    if (rows.length < 2 || total <= 0) return bare
    return rows.map((row) => {
      const f = row.dist / total
      const ele = row.alts.COMB ?? row.alts.DTM2
      return {
        lat: from.lat + (to.lat - from.lat) * f,
        lon: from.lon + (to.lon - from.lon) * f,
        ele: typeof ele === 'number' ? ele : null,
      }
    })
  } catch (error) {
    if (signal?.aborted) throw error
    return bare
  }
}

function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ROUTING_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}
