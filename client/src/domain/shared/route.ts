/**
 * Editing a track's route (FR-29.20, ADR-088): a few handles on the map,
 * and between each two of them a leg — the original file's line, a path the
 * router found, or a straight line. Pure: every edit returns a new draft,
 * so the editor's undo is a list of drafts, and what is fetched for a leg
 * is handed in by its id.
 *
 * Kernel, beside `track.ts`, for the same reason: an excursion's track will
 * be edited by the same rules.
 */
import type { TrackKind } from '@/api/types'
import { figures, haversine, simplify, type TrackFigures, type TrackPoint } from './track'

/** A file's line becomes at most this many handles when it is opened for editing. */
export const MAX_HANDLES_FROM_FILE = 14
/** An end this close to the start already closes the loop, in metres. */
export const LOOP_CLOSED_M = 30
/** How near a tap must be to a line to touch it, in screen pixels. */
export const PASS_TOLERANCE_PX = 16
/** The spacing of the direction arrows along a line, in screen pixels. */
export const ARROW_SPACING_PX = 70

/** A place on the map. */
export interface LatLon {
  lat: number
  lon: number
}

/** One point of a route: where, and how high where that is known. */
export interface RoutePoint extends LatLon {
  ele: number | null
}

/**
 * How a leg was made. `kept` is a stretch of a line already there — the
 * file's, or a found path split by a new handle; `path` is asked of the
 * router; `line` is straight, its heights asked of swisstopo.
 */
export type LegMode = 'kept' | 'path' | 'line'

/** The stretch between two neighbouring handles. */
export interface Leg {
  /** Stable while the leg is unchanged: a fetched answer finds its leg by it. */
  id: number
  mode: LegMode
  /** Whether this is still the opened file's line, untouched. */
  original: boolean
  /** Null while a `path` or `line` leg is being fetched. */
  points: RoutePoint[] | null
}

/** A route being edited. `legs[i]` joins `handles[i]` and `handles[i + 1]`. */
export interface RouteDraft {
  handles: LatLon[]
  legs: Leg[]
  /** Whether the draft came from a file — what *changed* is measured against. */
  fromFile: boolean
  nextId: number
}

/** A new leg is found along paths or drawn straight. */
export type NewLegMode = Exclude<LegMode, 'kept'>

/** An empty draft, for a route drawn from nothing. */
export function emptyDraft(): RouteDraft {
  return { handles: [], legs: [], fromFile: false, nextId: 1 }
}

const at = (p: LatLon): LatLon => ({ lat: p.lat, lon: p.lon })

/**
 * A file's points as a draft: the points that best keep its shape become
 * handles (at most {@link MAX_HANDLES_FROM_FILE}), and every leg keeps the
 * file's own line between them until a handle beside it moves. A file's
 * segments are joined: the edited route is one line.
 */
export function draftFromPoints(points: readonly TrackPoint[]): RouteDraft {
  const indexed = points.map((point, index) => ({ lat: point.lat, lon: point.lon, index }))
  const kept = simplify(indexed, MAX_HANDLES_FROM_FILE).map((point) => point.index)
  const plain = points.map((p) => ({ lat: p.lat, lon: p.lon, ele: p.ele }))
  const legs: Leg[] = kept.slice(1).map((end, n) => ({
    id: n + 1,
    mode: 'kept',
    original: true,
    points: plain.slice(kept[n]!, end + 1),
  }))
  return {
    handles: kept.map((index) => at(points[index]!)),
    legs,
    fromFile: true,
    nextId: legs.length + 1,
  }
}

function newLeg(draft: RouteDraft, mode: NewLegMode): [Leg, RouteDraft] {
  return [
    { id: draft.nextId, mode, original: false, points: null },
    { ...draft, nextId: draft.nextId + 1 },
  ]
}

/** A handle added at the end, joined to the last one by a new leg. */
export function append(draft: RouteDraft, place: LatLon, mode: NewLegMode): RouteDraft {
  if (draft.handles.length === 0) return { ...draft, handles: [at(place)] }
  const [leg, next] = newLeg(draft, mode)
  return { ...next, handles: [...draft.handles, at(place)], legs: [...draft.legs, leg] }
}

/** A handle moved: the legs on both sides of it are made again. */
export function moveHandle(
  draft: RouteDraft,
  index: number,
  place: LatLon,
  mode: NewLegMode,
): RouteDraft {
  let next = { ...draft, handles: draft.handles.map((h, i) => (i === index ? at(place) : h)) }
  const legs = [...draft.legs]
  for (const side of [index - 1, index]) {
    if (side < 0 || side >= legs.length) continue
    const [leg, after] = newLeg(next, mode)
    legs[side] = leg
    next = after
  }
  return { ...next, legs }
}

/** A handle taken away: its neighbours are joined by a new leg, or an end is shortened. */
export function removeHandle(draft: RouteDraft, index: number, mode: NewLegMode): RouteDraft {
  const last = draft.handles.length - 1
  if (index < 0 || index > last) return draft
  const handles = draft.handles.filter((_, i) => i !== index)
  if (index === 0) return { ...draft, handles, legs: draft.legs.slice(1) }
  if (index === last) return { ...draft, handles, legs: draft.legs.slice(0, -1) }
  const [leg, next] = newLeg(draft, mode)
  const legs = [...draft.legs.slice(0, index - 1), leg, ...draft.legs.slice(index + 1)]
  return { ...next, handles, legs }
}

/** The route from this handle on — *Hier starten*. */
export function startAt(draft: RouteDraft, index: number): RouteDraft {
  return { ...draft, handles: draft.handles.slice(index), legs: draft.legs.slice(index) }
}

/** The route up to this handle — *Hier enden*. */
export function endAt(draft: RouteDraft, index: number): RouteDraft {
  return { ...draft, handles: draft.handles.slice(0, index + 1), legs: draft.legs.slice(0, index) }
}

/** Whether the route already ends where it starts. */
export function isLoop(draft: RouteDraft): boolean {
  const { handles } = draft
  return handles.length > 2 && haversine(handles[0]!, handles[handles.length - 1]!) < LOOP_CLOSED_M
}

/** *Zurück zum Start*: one more leg, back to the first handle. */
export function closeLoop(draft: RouteDraft, mode: NewLegMode): RouteDraft {
  if (draft.handles.length < 2 || isLoop(draft)) return draft
  return append(draft, draft.handles[0]!, mode)
}

/**
 * *Richtung umkehren*: the same way, walked the other way round. A leg
 * still being fetched is asked again in the new direction, since a path
 * found one way is not always the path the other.
 */
export function reverse(draft: RouteDraft): RouteDraft {
  let next = draft
  const legs = [...draft.legs].reverse().map((leg) => {
    if (leg.points) return { ...leg, points: [...leg.points].reverse() }
    const [fresh, after] = newLeg(next, leg.mode === 'kept' ? 'line' : leg.mode)
    next = after
    return fresh
  })
  return { ...next, handles: [...draft.handles].reverse(), legs }
}

/** An answer for a leg, applied where the leg still is. */
export function resolveLeg(draft: RouteDraft, id: number, points: RoutePoint[]): RouteDraft {
  if (!draft.legs.some((leg) => leg.id === id && leg.points === null)) return draft
  return {
    ...draft,
    legs: draft.legs.map((leg) =>
      leg.id === id && leg.points === null ? { ...leg, points } : leg,
    ),
  }
}

/** A leg still to be fetched: what to ask for, and how. */
export interface PendingLeg {
  id: number
  mode: NewLegMode
  from: LatLon
  to: LatLon
}

/** The legs still waiting for their line. */
export function pendingLegs(draft: RouteDraft): PendingLeg[] {
  return draft.legs.flatMap((leg, i) =>
    leg.points === null && leg.mode !== 'kept'
      ? [{ id: leg.id, mode: leg.mode, from: draft.handles[i]!, to: draft.handles[i + 1]! }]
      : [],
  )
}

/** A leg's points, its two handles joined straight while it is being fetched. */
export function legPoints(draft: RouteDraft, index: number): RoutePoint[] {
  const leg = draft.legs[index]!
  return (
    leg.points ?? [
      { ...at(draft.handles[index]!), ele: null },
      { ...at(draft.handles[index + 1]!), ele: null },
    ]
  )
}

/** Whether a leg is drawn as changed: a draft from a file, and this leg no longer the file's. */
export function isChanged(draft: RouteDraft, index: number): boolean {
  return draft.fromFile && !draft.legs[index]!.original
}

/** One point of the whole route, and whether it lies on a changed leg. */
export interface DrawnPoint extends RoutePoint {
  changed: boolean
}

/** The whole route as one line, each leg's first point dropped where the last leg ends. */
export function routeLine(draft: RouteDraft): DrawnPoint[] {
  if (draft.legs.length === 0)
    return draft.handles.map((h) => ({ ...at(h), ele: null, changed: false }))
  const out: DrawnPoint[] = []
  draft.legs.forEach((_, i) => {
    const changed = isChanged(draft, i)
    const points = legPoints(draft, i).map((p) => ({ ...p, changed }))
    out.push(...(out.length > 0 ? points.slice(1) : points))
  })
  return out
}

/** Whether every leg has its line — saving waits for that. */
export function isSettled(draft: RouteDraft): boolean {
  return draft.legs.every((leg) => leg.points !== null)
}

/**
 * Where a handle is drawn: where the router put the path's end beside it,
 * which is on a path, rather than where the finger let go, which may not be.
 */
export function handlePlace(draft: RouteDraft, index: number): LatLon {
  const before = draft.legs[index - 1]
  if (before?.mode === 'path' && before.points) return at(before.points[before.points.length - 1]!)
  const after = draft.legs[index]
  if (after?.mode === 'path' && after.points) return at(after.points[0]!)
  return draft.handles[index]!
}

/** The route's four figures, as a file's are counted. */
export function routeFigures(draft: RouteDraft): TrackFigures {
  return figures(routeLine(draft).map((p) => ({ ...p, time: null, segment: 0 })))
}

/** How far along the route a handle lies, in metres. */
export function handleDistance(draft: RouteDraft, index: number): number {
  let metres = 0
  for (let i = 0; i < index && i < draft.legs.length; i++) {
    const points = legPoints(draft, i)
    for (let k = 1; k < points.length; k++) metres += haversine(points[k - 1]!, points[k]!)
  }
  return metres
}

/** A point on the screen. */
export interface ScreenPoint {
  x: number
  y: number
}

/**
 * One pass of the route under a tap: the leg, the step within it and how
 * far along that step, how far along the route that is, and the direction
 * walked there — degrees on the screen, 0 pointing right.
 */
export interface Pass {
  leg: number
  step: number
  t: number
  distanceM: number
  degrees: number
}

/**
 * Every pass of the route within {@link PASS_TOLERANCE_PX} of a tap. A path
 * walked out and back is two passes at one spot: the editor asks which one
 * the new handle splits. `project` puts a place on the screen.
 */
export function passesAt(
  draft: RouteDraft,
  tap: ScreenPoint,
  project: (place: LatLon) => ScreenPoint,
  tolerance = PASS_TOLERANCE_PX,
): Pass[] {
  const passes: Pass[] = []
  let metres = 0
  draft.legs.forEach((_, leg) => {
    const points = legPoints(draft, leg)
    let best: (Pass & { off: number }) | null = null
    for (let step = 1; step < points.length; step++) {
      const a = project(points[step - 1]!)
      const b = project(points[step]!)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const squared = dx * dx + dy * dy
      const t = squared
        ? Math.max(0, Math.min(1, ((tap.x - a.x) * dx + (tap.y - a.y) * dy) / squared))
        : 0
      const off = Math.hypot(a.x + t * dx - tap.x, a.y + t * dy - tap.y)
      const length = haversine(points[step - 1]!, points[step]!)
      if (off <= tolerance) {
        if (!best || off < best.off) {
          best = {
            leg,
            step,
            t,
            distanceM: metres + length * t,
            degrees: (Math.atan2(dy, dx) * 180) / Math.PI,
            off,
          }
        }
      } else if (best) {
        const { off: _off, ...pass } = best
        passes.push(pass)
        best = null
      }
      metres += length
    }
    if (best) {
      const { off: _off, ...pass } = best
      passes.push(pass)
    }
  })
  return passes
}

/**
 * A handle set on a pass: the leg is split there, both halves keeping its
 * line — a split changes nothing yet. A leg still being fetched is split
 * into two that are fetched again.
 */
export function insertAt(draft: RouteDraft, pass: Pass): RouteDraft {
  const leg = draft.legs[pass.leg]!
  const points = legPoints(draft, pass.leg)
  const a = points[pass.step - 1]!
  const b = points[pass.step]!
  const split: RoutePoint = {
    lat: a.lat + (b.lat - a.lat) * pass.t,
    lon: a.lon + (b.lon - a.lon) * pass.t,
    ele: a.ele !== null && b.ele !== null ? a.ele + (b.ele - a.ele) * pass.t : null,
  }
  const handles = [
    ...draft.handles.slice(0, pass.leg + 1),
    at(split),
    ...draft.handles.slice(pass.leg + 1),
  ]
  let next = draft
  let halves: Leg[]
  if (leg.points) {
    halves = [
      { ...leg, id: next.nextId, mode: 'kept', points: [...points.slice(0, pass.step), split] },
      { ...leg, id: next.nextId + 1, mode: 'kept', points: [split, ...points.slice(pass.step)] },
    ]
    next = { ...next, nextId: next.nextId + 2 }
  } else {
    const mode = leg.mode === 'kept' ? 'line' : leg.mode
    const [first, after] = newLeg(next, mode)
    const [second, last] = newLeg(after, mode)
    halves = [first, second]
    next = last
  }
  return {
    ...next,
    handles,
    legs: [...draft.legs.slice(0, pass.leg), ...halves, ...draft.legs.slice(pass.leg + 1)],
  }
}

/** The stretch of the route from a pass onwards, `metres` long — what a choice between passes shows. */
export function stretchFrom(draft: RouteDraft, pass: Pass, metres: number): LatLon[] {
  const first = legPoints(draft, pass.leg)
  const a = first[pass.step - 1]!
  const b = first[pass.step]!
  const out: LatLon[] = [
    { lat: a.lat + (b.lat - a.lat) * pass.t, lon: a.lon + (b.lon - a.lon) * pass.t },
  ]
  let walked = 0
  for (let leg = pass.leg; leg < draft.legs.length && walked < metres; leg++) {
    const points = legPoints(draft, leg)
    for (let k = leg === pass.leg ? pass.step : 1; k < points.length && walked < metres; k++) {
      walked += haversine(out[out.length - 1]!, points[k]!)
      out.push(at(points[k]!))
    }
  }
  return out
}

/** A direction arrow: where on the screen, and which way, in degrees, 0 pointing right. */
export interface ArrowMark extends ScreenPoint {
  degrees: number
}

/**
 * Arrows along a line drawn on the screen, every `spacing` pixels, the first
 * half a spacing in — so a short line still shows its direction once.
 */
export function arrowMarks(line: readonly ScreenPoint[], spacing = ARROW_SPACING_PX): ArrowMark[] {
  const marks: ArrowMark[] = []
  let next = spacing / 2
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!
    const b = line[i]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length === 0) continue
    const degrees = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
    for (; next <= length; next += spacing) {
      const f = next / length
      marks.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, degrees })
    }
    next -= length
  }
  return marks
}

/**
 * WGS84 to the Swiss LV95 grid, swisstopo's approximate formula — good to
 * about a metre, which a height lookup does not notice. swisstopo's profile
 * service takes LV95 only.
 */
export function toLv95(place: LatLon): [number, number] {
  const p = (place.lat * 3600 - 169028.66) / 10000
  const l = (place.lon * 3600 - 26782.5) / 10000
  return [
    2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3,
    1200147.07 +
      308807.95 * p +
      3745.25 * l * l +
      76.63 * p * p -
      194.56 * l * l * p +
      119.79 * p ** 3,
  ]
}

/** What `<type>` an edited route's file names its kind with — what `guessKind` reads back. */
export const GPX_TYPE: Record<TrackKind, string> = { hike: 'hiking', bike: 'cycling' }

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * The GPX file an edited route is saved as (ADR-088): one track, one
 * segment, every point with its height where known. Coordinates at seven
 * decimals, a centimetre; heights at one.
 */
export function writeGpx(name: string, kind: TrackKind, points: readonly RoutePoint[]): string {
  const rows = points.map((p) => {
    const ele = p.ele === null ? '' : `<ele>${p.ele.toFixed(1)}</ele>`
    return `<trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${ele}</trkpt>`
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="JIT-Pack" xmlns="http://www.topografix.com/GPX/1/1">',
    `<trk><name>${escapeXml(name)}</name><type>${GPX_TYPE[kind]}</type><trkseg>`,
    ...rows,
    '</trkseg></trk>',
    '</gpx>',
    '',
  ].join('\n')
}

/** A file name for a route's name: lower case, words joined by dashes, `.gpx`. */
export function gpxFileName(name: string): string {
  const stem = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${stem || 'route'}.gpx`
}
