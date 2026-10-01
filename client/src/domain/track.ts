/**
 * A GPX track (FR-29.17, ADR-085) — read on the device that chooses it, and
 * the one reader there is (invariant 4): Local Mode has no server, and the
 * server never parses a file.
 *
 * Kernel, not packing: the planner's ideas carry tracks and so do FR-31's
 * excursions (FR-31.15), so this module knows no idea and no excursion — only
 * a file, the figures read from it and the time they make.
 *
 * Deliberately no DOM: a GPX file is a flat list of points, read here by a
 * scanner that runs under Node as well as in a browser.
 */
import type { TrackUpload, TrackKind } from '@/api/types'
import { dbBool } from '@/sync/columns'
import type { TrackFields } from '@/types/domain'

/** How many tracks one idea or excursion carries — the server holds the same number. */
export const MAX_TRACKS = 5
/** The largest file taken, in bytes — the server holds the same number. */
export const MAX_GPX_BYTES = 5 * 1024 * 1024
/** The most points the drawn line keeps. */
export const MAX_LINE_POINTS = 800
/** A height change counts once it reaches this many metres: GPS noise is not climbing. */
export const CLIMB_HYSTERESIS_M = 5
/** The pauses' step and ceiling, in minutes. */
export const PAUSE_STEP_MIN = 15
export const PAUSE_MAX_MIN = 8 * 60
/** The longest name kept, as the schema's CHECK holds it. */
export const MAX_TRACK_NAME = 200
export const MAX_TRACK_FILE_NAME = 255

/** One point of a file, in the order the file gives them. */
export interface TrackPoint {
  lat: number
  lon: number
  /** Metres, or null where the point has no height. */
  ele: number | null
  /** Milliseconds since the epoch, or null. */
  time: number | null
  /** Which segment the point is in — distance is not walked across a gap. */
  segment: number
}

/** What a file says, before anything is computed from it. */
export interface ParsedGpx {
  points: TrackPoint[]
  /** The track's own name, else the file's. */
  name: string | null
  /** The activity the file declares (`<type>`), as written. */
  type: string | null
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function text(raw: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw)
  if (cdata) return cdata[1]!.trim()
  return raw
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code: string) => {
      if (code[0] === '#') {
        const n =
          code[1] === 'x' || code[1] === 'X'
            ? parseInt(code.slice(2), 16)
            : parseInt(code.slice(1), 10)
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole
      }
      return ENTITIES[code.toLowerCase()] ?? whole
    })
    .trim()
}

/** The first `<tag>` directly readable in `xml`, or null. */
function child(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}\\s*>`, 'i').exec(xml)
  if (!match) return null
  const value = text(match[1]!)
  return value === '' ? null : value
}

function attribute(attrs: string, name: string): number {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(attrs)
  return match ? Number(match[1]) : Number.NaN
}

/** The points of every `container` (a segment, a route), each its own segment. */
function pointsIn(xml: string, container: string, tag: string): TrackPoint[] {
  const points: TrackPoint[] = []
  const parts = xml.split(new RegExp(`<${container}\\b`, 'i')).slice(1)
  parts.forEach((part, segment) => {
    const point = new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}\\s*>)`, 'gi')
    for (const match of part.matchAll(point)) {
      const lat = attribute(match[1]!, 'lat')
      const lon = attribute(match[1]!, 'lon')
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      )
        continue
      const body = match[2] ?? ''
      const ele = Number(child(body, 'ele') ?? Number.NaN)
      const time = Date.parse(child(body, 'time') ?? '')
      points.push({
        lat,
        lon,
        ele: Number.isFinite(ele) ? ele : null,
        time: Number.isFinite(time) ? time : null,
        segment,
      })
    }
  })
  return points
}

/**
 * Reads a GPX file's points: its track points, or its route points where it
 * has no track. Waypoints are places, not a way, and are left out.
 */
export function parseGpx(xml: string): ParsedGpx {
  let points = pointsIn(xml, 'trkseg', 'trkpt')
  let owner = /<trk\b[\s\S]*?(?:<trkseg\b|<\/trk\s*>)/i.exec(xml)?.[0] ?? null
  if (points.length === 0) {
    points = pointsIn(xml, 'rte', 'rtept')
    owner = /<rte\b[\s\S]*?(?:<rtept\b|<\/rte\s*>)/i.exec(xml)?.[0] ?? null
  }
  const metadata = /<metadata\b[\s\S]*?<\/metadata\s*>/i.exec(xml)?.[0] ?? ''
  return {
    points,
    name: (owner && child(owner, 'name')) ?? child(metadata, 'name'),
    type: owner && child(owner, 'type'),
  }
}

const EARTH_RADIUS_M = 6_371_000
const RAD = Math.PI / 180

/** The great-circle distance between two points, in metres. */
export function haversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = (b.lat - a.lat) * RAD
  const dLon = (b.lon - a.lon) * RAD
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The four figures of a track; the heights are null for a file without any. */
export interface TrackFigures {
  distanceM: number
  ascentM: number | null
  descentM: number | null
  maxEleM: number | null
}

/**
 * The figures FR-29.17 names. Distance is summed within each segment, so
 * the gap between two is not walked. A climb counts once the height has
 * moved {@link CLIMB_HYSTERESIS_M} from where it last counted.
 */
export function figures(points: readonly TrackPoint[]): TrackFigures {
  let distance = 0
  let ascent = 0
  let descent = 0
  let max = Number.NEGATIVE_INFINITY
  let reference: number | null = null
  points.forEach((point, i) => {
    const previous = points[i - 1]
    if (previous && previous.segment === point.segment) distance += haversine(previous, point)
    if (point.ele === null) return
    max = Math.max(max, point.ele)
    if (reference === null) reference = point.ele
    else if (point.ele - reference >= CLIMB_HYSTERESIS_M) {
      ascent += point.ele - reference
      reference = point.ele
    } else if (reference - point.ele >= CLIMB_HYSTERESIS_M) {
      descent += reference - point.ele
      reference = point.ele
    }
  })
  const heights = Number.isFinite(max)
  return {
    distanceM: Math.round(distance),
    ascentM: heights ? Math.round(ascent) : null,
    descentM: heights ? Math.round(descent) : null,
    maxEleM: heights ? Math.round(max) : null,
  }
}

/** Above this average speed a recorded track is a bike tour, km/h. */
const BIKE_PACE_KMH = 9

/**
 * What a file suggests a track is: the activity it declares, else the pace
 * its timestamps show, else a hike. Only a suggestion — the travellers
 * change it with one tap.
 */
export function guessKind(
  type: string | null,
  points: readonly TrackPoint[],
  distanceM: number,
): TrackKind {
  if (type && /cycl|bik|ride|velo|rad|mtb|gravel/i.test(type)) return 'bike'
  if (type && /hik|walk|wander|trek|run/i.test(type)) return 'hike'
  const timed = points.filter((point) => point.time !== null)
  if (timed.length > 1) {
    const hours = (timed[timed.length - 1]!.time! - timed[0]!.time!) / 3_600_000
    if (hours > 0 && distanceM / 1000 / hours > BIKE_PACE_KMH) return 'bike'
  }
  return 'hike'
}

/**
 * Thins a line to at most `max` points, keeping its shape: Douglas–Peucker,
 * with the tolerance chosen so exactly the most telling points stay. Every
 * point is given the largest tolerance under which it would survive, and the
 * `max` points with the largest are kept — the same set Douglas–Peucker
 * keeps for some tolerance, found in one pass rather than by searching.
 */
export function simplify<P extends { lat: number; lon: number }>(
  points: readonly P[],
  max: number,
): P[] {
  if (points.length <= max) return [...points]
  const cos = Math.cos((points[0]!.lat ?? 0) * RAD)
  const x = points.map((p) => p.lon * cos)
  const y = points.map((p) => p.lat)
  const keep = new Float64Array(points.length)
  const last = points.length - 1
  keep[0] = keep[last] = Number.POSITIVE_INFINITY
  const stack: [number, number, number][] = [[0, last, Number.POSITIVE_INFINITY]]
  while (stack.length > 0) {
    const [from, to, ceiling] = stack.pop()!
    let worst = -1
    let index = -1
    const dx = x[to]! - x[from]!
    const dy = y[to]! - y[from]!
    const length = Math.hypot(dx, dy)
    for (let i = from + 1; i < to; i++) {
      const d =
        length === 0
          ? Math.hypot(x[i]! - x[from]!, y[i]! - y[from]!)
          : Math.abs(dy * x[i]! - dx * y[i]! + x[to]! * y[from]! - y[to]! * x[from]!) / length
      if (d > worst) {
        worst = d
        index = i
      }
    }
    if (index < 0) continue
    const tolerance = Math.min(worst, ceiling)
    keep[index] = tolerance
    stack.push([from, index, tolerance], [index, to, tolerance])
  }
  const threshold = [...keep].sort((a, b) => b - a)[max - 1]!
  const kept: P[] = []
  let ties = max - [...keep].filter((t) => t > threshold).length
  points.forEach((point, i) => {
    if (keep[i]! > threshold) kept.push(point)
    else if (keep[i] === threshold && ties > 0) {
      kept.push(point)
      ties -= 1
    }
  })
  return kept
}

/** Precision of the encoded line: 5 decimals, about a metre. */
const LINE_FACTOR = 1e5

function encodeNumber(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1
  let out = ''
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
    v >>>= 5
  }
  return out + String.fromCharCode(v + 63)
}

/** A line as a polyline string (precision 5) — what the row carries. */
export function encodeLine(points: readonly { lat: number; lon: number }[]): string {
  let lat = 0
  let lon = 0
  let out = ''
  for (const point of points) {
    const nextLat = Math.round(point.lat * LINE_FACTOR)
    const nextLon = Math.round(point.lon * LINE_FACTOR)
    out += encodeNumber(nextLat - lat) + encodeNumber(nextLon - lon)
    lat = nextLat
    lon = nextLon
  }
  return out
}

/** A drawn line's points, `[lat, lon]`, read back from its string. */
export function decodeLine(line: string): [number, number][] {
  const out: [number, number][] = []
  let index = 0
  let lat = 0
  let lon = 0
  const next = (): number | null => {
    let shift = 0
    let result = 0
    let byte: number
    do {
      if (index >= line.length) return null
      byte = line.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (index < line.length) {
    const dLat = next()
    const dLon = next()
    if (dLat === null || dLon === null) break
    lat += dLat
    lon += dLon
    out.push([lat / LINE_FACTOR, lon / LINE_FACTOR])
  }
  return out
}

/** Why a file was not taken. */
export type TrackRefusal = 'too_large' | 'no_track'

/** A file read: the upload's fields, or why there is none. */
export type ReadTrack = { ok: true; upload: TrackUpload } | { ok: false; reason: TrackRefusal }

/** A file's name without its `.gpx`, or the name it has. */
function baseName(fileName: string): string {
  return fileName.replace(/\.gpx$/i, '').trim() || fileName
}

/**
 * Reads a chosen file into what its upload carries (ADR-085): its name, the
 * kind it suggests, the four figures, its number of points and its drawn
 * line. `bytes` is the file's size as chosen, which the 5 MB limit is about.
 */
export function readTrack(xml: string, fileName: string, bytes: number): ReadTrack {
  if (bytes > MAX_GPX_BYTES) return { ok: false, reason: 'too_large' }
  const parsed = parseGpx(xml)
  if (parsed.points.length < 2) return { ok: false, reason: 'no_track' }
  const figs = figures(parsed.points)
  return {
    ok: true,
    upload: {
      name: (parsed.name ?? baseName(fileName)).slice(0, MAX_TRACK_NAME),
      file_name: fileName.slice(0, MAX_TRACK_FILE_NAME),
      kind: guessKind(parsed.type, parsed.points, figs.distanceM),
      distance_m: figs.distanceM,
      ascent_m: figs.ascentM,
      descent_m: figs.descentM,
      max_ele_m: figs.maxEleM,
      point_count: parsed.points.length,
      line: encodeLine(simplify(parsed.points, MAX_LINE_POINTS)),
      gpx: xml,
    },
  }
}

/** A pace: km/h on the flat, metres of ascent and descent an hour. */
interface Pace {
  flatKmh: number
  upMh: number
  downMh: number | null
}

/**
 * FR-29.17's paces. A hike is the Swiss hiking trails' formula; a bike tour
 * counts no descent. *Mit Kind* slows both to fixed values — estimates, not
 * a norm, and the screen says so.
 */
export const PACE: Record<TrackKind, { adult: Pace; kid: Pace }> = {
  hike: {
    adult: { flatKmh: 4.2, upMh: 300, downMh: 500 },
    kid: { flatKmh: 3, upMh: 200, downMh: 350 },
  },
  bike: {
    adult: { flatKmh: 18, upMh: 600, downMh: null },
    kid: { flatKmh: 12, upMh: 350, downMh: null },
  },
}

/** The pace a track is timed with. */
export function paceOf(kind: TrackKind, withKid: boolean): Pace {
  return PACE[kind][withKid ? 'kid' : 'adult']
}

/** Rounded to five minutes, as every time on the card is. */
export function roundToFive(minutes: number): number {
  return Math.round(minutes / 5) * 5
}

/**
 * The time under way without pauses, in minutes, rounded to five. A hike
 * takes the longer of its flat and its vertical time plus half the shorter;
 * a bike tour adds its climbing to its distance. A file without heights is
 * timed on its distance alone.
 */
export function movingMinutes(
  track: Pick<TrackFields, 'kind' | 'with_kid' | 'distance_m' | 'ascent_m' | 'descent_m'>,
): number {
  const pace = paceOf(track.kind, track.with_kid)
  const flat = track.distance_m / 1000 / pace.flatKmh
  const up = (track.ascent_m ?? 0) / pace.upMh
  if (pace.downMh === null) return roundToFive((flat + up) * 60)
  const vertical = up + (track.descent_m ?? 0) / pace.downMh
  return roundToFive((Math.max(flat, vertical) + Math.min(flat, vertical) / 2) * 60)
}

/** The pauses after one step of the stepper, within 0 and {@link PAUSE_MAX_MIN}. */
export function stepPause(pauseMin: number, direction: 1 | -1): number {
  return Math.min(PAUSE_MAX_MIN, Math.max(0, pauseMin + direction * PAUSE_STEP_MIN))
}

/** The bounds swisstopo's Landeskarte is drawn for: Switzerland, with a margin. */
const SWITZERLAND = { south: 45.8, north: 47.9, west: 5.9, east: 10.6 }

/** Whether every point of every line lies within Switzerland's bounds. */
export function inSwitzerland(lines: readonly (readonly [number, number])[][]): boolean {
  return lines.every((line) =>
    line.every(
      ([lat, lon]) =>
        lat >= SWITZERLAND.south &&
        lat <= SWITZERLAND.north &&
        lon >= SWITZERLAND.west &&
        lon <= SWITZERLAND.east,
    ),
  )
}

/** Where a map's tiles come from. */
export type MapSource = 'swisstopo' | 'osm'

/** The Landeskarte where every track lies in Switzerland, OpenStreetMap otherwise. */
export function defaultSource(lines: readonly (readonly [number, number])[][]): MapSource {
  return lines.length > 0 && inSwitzerland(lines) ? 'swisstopo' : 'osm'
}

/** A set of tracks in their order: by place, the id deciding a tie, as for pictures. */
export function orderTracks<T extends Pick<TrackFields, 'id' | 'position'>>(
  tracks: readonly T[],
): T[] {
  return [...tracks].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}

/** Where a new track goes: behind the last one, never into a gap. */
export function nextTrackPosition(tracks: readonly Pick<TrackFields, 'position'>[]): number {
  return tracks.reduce((last, track) => Math.max(last, track.position + 1), 0)
}

/** What the travellers set on a track (FR-29.17) — everything else is the file's. */
export type TrackSettings = Partial<Pick<TrackFields, 'name' | 'kind' | 'with_kid' | 'pause_min'>>

/**
 * The settings that changed, as the row's columns — empty when none did.
 * A blank name is not a change: a track always has one.
 */
export function trackSettingsPatch(
  track: TrackFields,
  settings: TrackSettings,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const name = settings.name?.trim()
  if (name && name !== track.name) patch['name'] = name
  if (settings.kind !== undefined && settings.kind !== track.kind) patch['kind'] = settings.kind
  if (settings.with_kid !== undefined && settings.with_kid !== track.with_kid) {
    patch['with_kid'] = dbBool(settings.with_kid)
  }
  if (settings.pause_min !== undefined && settings.pause_min !== track.pause_min) {
    patch['pause_min'] = settings.pause_min
  }
  return patch
}
