/**
 * FR-29.18, ADR-086: the Swiss timetable search. What transport.opendata.ch
 * answers becomes the legs of an ordinary connection, and what an excursion
 * already knows seeds the search. Pure, so Local Mode keeps it and the screen
 * only renders.
 */
import {
  EXCURSION_ROLE_BACK,
  type ConnectionLeg,
  type DayEntry,
  type ExcursionRole,
} from '@/types/domain'
import { timeOf } from './connections'

/** A stop the timetable knows. */
export interface TimetableStop {
  id: string
  name: string
  lat: number
  lon: number
}

/** One connection the search found. */
export interface TimetableOption {
  legs: ConnectionLeg[]
  /** From the first departure to the last arrival. */
  minutes: number
}

/** What the search starts with. */
export interface SearchSeed {
  from: string
  to: string
  /** `HH:MM`. */
  time: string
  /** `HH:MM` nothing can leave before; null where nothing bounds it. */
  earliest: string | null
}

const DEFAULT_OUT_TIME = '08:00'
const DEFAULT_BACK_TIME = '16:00'
const MINUTES_PER_DAY = 24 * 60
const STAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/

type Json = Record<string, unknown>

function record(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** The stops of a `locations` answer; an entry without an id is an address. */
export function stopsFrom(body: unknown): TimetableStop[] {
  const list = record(body)?.stations
  if (!Array.isArray(list)) return []
  const stops: TimetableStop[] = []
  for (const entry of list) {
    const e = record(entry)
    const id = text(e?.id)
    const name = text(e?.name)
    // The service sends x as the latitude and y as the longitude.
    const at = record(e?.coordinate)
    const lat = at?.x
    const lon = at?.y
    if (!id || !name || typeof lat !== 'number' || typeof lon !== 'number') continue
    stops.push({ id, name, lat, lon })
  }
  return stops
}

/** The stop nearest a place — the service sorts by distance. */
export function nearestStop(stops: readonly TimetableStop[]): TimetableStop | null {
  return stops[0] ?? null
}

function localStamp(value: unknown): string | null {
  const m = typeof value === 'string' ? STAMP.exec(value) : null
  return m ? `${m[1]}T${m[2]}` : null
}

function minutesOf(stamp: string): number {
  const [d = '', t = ''] = stamp.split('T')
  const [y = 0, mo = 0, da = 0] = d.split('-').map(Number)
  const [h = 0, mi = 0] = t.split(':').map(Number)
  return Math.round(Date.UTC(y, mo - 1, da, h, mi) / 60000)
}

/** A run's number as a traveller says it: *ICE000271* is *ICE 271*. */
function lineOf(journey: Json | null): string {
  if (!journey) return ''
  const category = text(journey.category)
  const number = text(journey.number).replace(/^0+(?=\d)/, '')
  return [category, number].filter(Boolean).join(' ')
}

function legOf(section: unknown): ConnectionLeg | null {
  const s = record(section)
  const dep = record(s?.departure)
  const arr = record(s?.arrival)
  const from = text(record(dep?.station)?.name)
  const to = text(record(arr?.station)?.name)
  const depAt = localStamp(dep?.departure)
  const arrAt = localStamp(arr?.arrival)
  if (!from || !to || !depAt || !arrAt) return null
  return { from, to, dep: depAt, arr: arrAt, line: lineOf(record(s?.journey)) }
}

/** The connections of a `connections` answer; one with a leg unread is left out whole. */
export function optionsFrom(body: unknown): TimetableOption[] {
  const list = record(body)?.connections
  if (!Array.isArray(list)) return []
  const options: TimetableOption[] = []
  for (const connection of list) {
    const sections = record(connection)?.sections
    if (!Array.isArray(sections) || sections.length === 0) continue
    const legs = sections.map(legOf)
    if (legs.some((l) => l === null)) continue
    const read = legs as ConnectionLeg[]
    options.push({
      legs: read,
      minutes: minutesOf(read[read.length - 1]!.arr) - minutesOf(read[0]!.dep),
    })
  }
  return options
}

/** What a departure leaves after the earliest time one could leave; null without one. */
export function slackMinutes(option: TimetableOption, earliest: string | null): number | null {
  if (earliest === null) return null
  const dep = option.legs[0]!.dep
  return minutesOf(dep) - minutesOf(`${dep.slice(0, 10)}T${earliest}`)
}

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/**
 * Where the search for a slot starts: the way back runs the way there in
 * reverse and leaves once the route is walked; the way there asks for a
 * morning, with the stops left to the traveller.
 */
export function searchSeed(input: {
  role: ExcursionRole | null
  out: DayEntry | null
  routeMinutes: number | null
}): SearchSeed {
  const { role, out, routeMinutes } = input
  if (role !== EXCURSION_ROLE_BACK) {
    return { from: '', to: '', time: DEFAULT_OUT_TIME, earliest: null }
  }
  const legs = out?.legs ?? []
  if (legs.length === 0) return { from: '', to: '', time: DEFAULT_BACK_TIME, earliest: null }
  const first = legs[0]!
  const last = legs[legs.length - 1]!
  const [h = 0, m = 0] = timeOf(last.arr).split(':').map(Number)
  const at = h * 60 + m + (routeMinutes ?? 0)
  const time = at < MINUTES_PER_DAY ? clock(at) : timeOf(last.arr)
  return { from: last.to, to: first.from, time, earliest: time }
}
