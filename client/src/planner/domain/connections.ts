/**
 * A connection in the day plan (FR-29.18, ADR-086) — pure, so Local Mode keeps
 * every rule and a spec reaches them without a sheet.
 *
 * A connection is its legs. They come from a shared link where a reader knows
 * it — the SBB app's first — or from the hand fields as one leg. What the
 * timeline says about a connection (its ends, its arrival, its lines and how
 * often one changes) is derived here from the legs alone.
 */
import {
  LEG_MODE_BOAT,
  LEG_MODE_BUS,
  LEG_MODE_TRAIN,
  type ConnectionLeg,
  type LatLon,
  type LegMode,
} from '@/types/domain'
import { nextDay } from './dayPlan'

// --- what a leg travels by ---

/** Timetable categories of a boat — the lake steamers' `BAT` first. */
const BOAT_CATEGORIES = new Set(['BAT', 'BAV', 'FAE', 'SCH'])
/** Timetable categories of a bus, a replacement bus included. */
const BUS_CATEGORIES = new Set(['B', 'BUS', 'NFB', 'KB', 'EXB', 'NB', 'EV', 'BN'])

/**
 * What a ridden leg travels by, from its timetable category (*BAT*, *B*,
 * *IC*); anything on rails or a rope is drawn as a train. None for a walk,
 * which has no category.
 */
export function legMode(category: string): LegMode | undefined {
  const word = category.trim().toUpperCase()
  if (word === '') return undefined
  if (BOAT_CATEGORIES.has(word)) return LEG_MODE_BOAT
  if (BUS_CATEGORIES.has(word)) return LEG_MODE_BUS
  return LEG_MODE_TRAIN
}

// --- the SBB's shared link ---

/**
 * The address the SBB's own trip page lives at. Its `tripId` is the timetable
 * system's id of one connection: `<kind>.<context>.<search>`, the two last
 * parts zlib-compressed base64url, the context listing every leg.
 */
const SBB_HOST = /(^|\.)sbb\.ch$/i
/** The SBB app's short link, `a.sbbmobile.ch/s/…`, whose page links the trip. */
const SBB_SHORT_HOST = /(^|\.)sbbmobile\.ch$/i
const SBB_TRIP_PARAM = 'tripId'

function webUrl(link: string): URL | null {
  try {
    const url = new URL(link)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

/** The trip id an `sbb.ch` connection link carries, or null for any other link. */
export function sbbTripId(link: string): string | null {
  const url = webUrl(link)
  if (!url || !SBB_HOST.test(url.hostname)) return null
  return url.searchParams.get(SBB_TRIP_PARAM) || null
}

/** Whether a link is the SBB app's short link, which only its page resolves. */
export function isSbbShortLink(link: string): boolean {
  const url = webUrl(link)
  return !!url && SBB_SHORT_HOST.test(url.hostname)
}

/** The marks the context's text is laid out by. */
const SECTION = '¶'
const LEGS_SECTION = `${SECTION}HKI${SECTION}`
const LEG = '§'
const FIELD = '$'
/** A leg ridden in a vehicle; anything else (`W`, `G@F`) is on foot. */
const RIDDEN = 'T'
const STOP_NAME = /(?:^|@)O=([^@]*)/
/** A stop's place, in millionths of a degree: `X` the longitude, `Y` the latitude. */
const STOP_X = /(?:^|@)X=(-?\d+)/
const STOP_Y = /(?:^|@)Y=(-?\d+)/
const MICRO_DEGREES = 1_000_000
const STAMP = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/

function stopName(field: string): string | null {
  const name = STOP_NAME.exec(field)?.[1]?.trim()
  return name ? name : null
}

function stopAt(field: string): LatLon | undefined {
  const x = STOP_X.exec(field)?.[1]
  const y = STOP_Y.exec(field)?.[1]
  return x && y ? [Number(y) / MICRO_DEGREES, Number(x) / MICRO_DEGREES] : undefined
}

function localTime(stamp: string): string | null {
  const m = STAMP.exec(stamp)
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : null
}

/**
 * A vehicle as a traveller names it: *RE 3*, not *RE 3 1334* — the trailing
 * number is the run's, which no departure board shows.
 */
export function lineName(vehicle: string): string {
  const words = vehicle.trim().split(/\s+/).filter(Boolean)
  return (words.length >= 3 ? words.slice(0, -1) : words).join(' ')
}

/**
 * The legs listed in a connection's context text, or none where the text is
 * not one the reader knows — never a partial list, since a connection with a
 * leg missing would read as a different journey.
 */
export function legsFromContext(text: string): ConnectionLeg[] {
  const start = text.indexOf(LEGS_SECTION)
  if (start < 0) return []
  const body = text.slice(start + LEGS_SECTION.length)
  const end = body.indexOf(SECTION)
  const legs: ConnectionLeg[] = []
  for (const section of (end < 0 ? body : body.slice(0, end)).split(LEG)) {
    const [kind = '', from = '', to = '', dep = '', arr = '', vehicle = ''] = section.split(FIELD)
    const leg = {
      from: stopName(from),
      to: stopName(to),
      dep: localTime(dep),
      arr: localTime(arr),
      line: kind === RIDDEN ? lineName(vehicle) : '',
    }
    if (!leg.from || !leg.to || !leg.dep || !leg.arr) return []
    const read: ConnectionLeg = {
      from: leg.from,
      to: leg.to,
      dep: leg.dep,
      arr: leg.arr,
      line: leg.line,
    }
    const mode = leg.line ? legMode(leg.line.split(' ')[0]!) : undefined
    if (mode) read.mode = mode
    const fromAt = stopAt(from)
    const toAt = stopAt(to)
    if (fromAt) read.fromAt = fromAt
    if (toAt) read.toAt = toAt
    legs.push(read)
  }
  return legs
}

function base64UrlBytes(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * The legs an SBB trip id carries, or null where it carries none the reader
 * can find — a format the SBB changed reads as no legs, never as wrong ones.
 */
export async function legsFromSbbTripId(tripId: string): Promise<ConnectionLeg[] | null> {
  const context = tripId.split('.')[1]
  if (!context) return null
  try {
    // The context is a binary record around the legs' text; a lenient decode
    // turns its framing into replacement marks and leaves the text whole.
    const text = new TextDecoder().decode(await inflate(base64UrlBytes(context)))
    const legs = legsFromContext(text)
    return legs.length > 0 ? legs : null
  } catch {
    return null
  }
}

/** A page's web links, read by the server (FR-29.16); null where it could not be read. */
export type PageLinks = (url: string) => Promise<readonly string[] | null>

/**
 * The legs a pasted link brings, or null where no reader knows it. A full
 * `sbb.ch` link is read here; a short link needs its page's links, which only
 * the server can fetch — `pageLinks` is null where there is none to ask.
 */
export async function readConnectionLink(
  link: string,
  pageLinks: PageLinks | null,
): Promise<ConnectionLeg[] | null> {
  let tripId = sbbTripId(link)
  if (!tripId && pageLinks && isSbbShortLink(link)) {
    const links = (await pageLinks(link)) ?? []
    tripId = links.map(sbbTripId).find((id) => id !== null) ?? null
  }
  return tripId ? legsFromSbbTripId(tripId) : null
}

// --- by hand ---

/** What the sheet's hand fields hold: one leg, its times `HH:MM`. */
export interface HandFields {
  from: string
  to: string
  dep: string
  arr: string
  line: string
}

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * The one leg the hand fields describe on `day`, or null while one of the
 * stops or times is missing. An arrival before the departure is the next
 * morning's, as a night train's is.
 */
export function handLeg(day: string, fields: HandFields): ConnectionLeg | null {
  const from = fields.from.trim()
  const to = fields.to.trim()
  if (!from || !to || !HH_MM.test(fields.dep) || !HH_MM.test(fields.arr)) return null
  const arrDay = fields.arr < fields.dep ? nextDay(day) : day
  return {
    from,
    to,
    dep: `${day}T${fields.dep}`,
    arr: `${arrDay}T${fields.arr}`,
    line: fields.line.trim(),
  }
}

/**
 * The hand fields a connection fills, for changing it: its first stop and
 * departure, its last stop and arrival, and the lines it rides.
 */
export function handFieldsOf(legs: readonly ConnectionLeg[]): HandFields {
  const first = legs[0]!
  const last = legs[legs.length - 1]!
  return {
    from: first.from,
    to: last.to,
    dep: timeOf(first.dep),
    arr: timeOf(last.arr),
    line: connectionSummary(legs).lines.join(LINE_SEPARATOR),
  }
}

/** Between the lines of a connection held in one hand field. */
const LINE_SEPARATOR = ' · '

// --- what the timeline says ---

/** `HH:MM` of a leg's local time. */
export function timeOf(stamp: string): string {
  return stamp.slice(11, 16)
}

/** `YYYY-MM-DD` of a leg's local time. */
export function dayOf(stamp: string): string {
  return stamp.slice(0, 10)
}

/**
 * Where a connection takes one: the stop one gets off at — a walk at the end
 * left aside — or the walk's end where the whole way is walked.
 */
export function connectionDestination(legs: readonly ConnectionLeg[]): string {
  const ridden = legs.filter((leg) => leg.line !== '')
  return (ridden[ridden.length - 1] ?? legs[legs.length - 1]!).to
}

/** The day a connection stands on: its first departure's. */
export function connectionDay(legs: readonly ConnectionLeg[]): string {
  return dayOf(legs[0]!.dep)
}

/** A connection's name on the timeline: its first stop and its last. */
export function connectionTitle(legs: readonly ConnectionLeg[]): string {
  return `${legs[0]!.from} → ${legs[legs.length - 1]!.to}`
}

/** What a connection's second line says, before it is put in words. */
export interface ConnectionSummary {
  /** `HH:MM` of the last arrival. */
  arrival: string
  /** How many days after the first departure the last arrival is. */
  arrivalDays: number
  /** The lines ridden, in order, each once; walks name none. */
  lines: string[]
  /** How often one changes vehicle — walks between are part of a change. */
  transfers: number
}

export function connectionSummary(legs: readonly ConnectionLeg[]): ConnectionSummary {
  const last = legs[legs.length - 1]!
  const ridden = legs.filter((leg) => leg.line !== '')
  return {
    arrival: timeOf(last.arr),
    arrivalDays: daysBetween(connectionDay(legs), dayOf(last.arr)),
    lines: [...new Set(ridden.map((leg) => leg.line))],
    transfers: Math.max(0, ridden.length - 1),
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** How long a connection takes: from its first departure to its last arrival, in minutes. */
export function connectionMinutes(legs: readonly ConnectionLeg[]): number {
  return minutesOf(legs[legs.length - 1]!.arr) - minutesOf(legs[0]!.dep)
}

function minutesOf(stamp: string): number {
  const [day = '', time = ''] = stamp.split('T')
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  const [hour = 0, minute = 0] = time.split(':').map(Number)
  return Math.round(Date.UTC(year, month - 1, date, hour, minute) / MS_PER_MINUTE)
}

function daysBetween(from: string, to: string): number {
  const at = (day: string) => {
    const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
    return Date.UTC(year, month - 1, date)
  }
  return Math.round((at(to) - at(from)) / MS_PER_DAY)
}

// --- on a map ---

/** A leg's line on a map: its first stop, the stops passed, its last — none where it knows no place. */
export function legPath(leg: ConnectionLeg): LatLon[] {
  if (!leg.fromAt || !leg.toAt) return []
  return [leg.fromAt, ...(leg.via ?? []), leg.toAt]
}

/** Whether a connection can be drawn: a leg knows where its stops are. */
export function hasMap(legs: readonly ConnectionLeg[]): boolean {
  return legs.some((leg) => legPath(leg).length > 1)
}

// --- from where one is ---

/** Metres walked in a minute, on a straight line — a stroll, with luggage. */
const METRES_PER_MINUTE = 80

/** How long the walk to a stop takes, from its straight distance. */
export function walkMinutes(metres: number): number {
  return Math.ceil(metres / METRES_PER_MINUTE)
}

/** The walk that opens a connection taken from where one is. */
export interface WalkStart {
  /** What the start is called — the device's place has no stop name. */
  label: string
  at: LatLon
  stop: string
  stopAt: LatLon
  /** The first ride's departure, `YYYY-MM-DDTHH:MM`. */
  departure: string
  minutes: number
}

/** The walk from where one is to the first stop, ending as the ride leaves. */
export function walkLeg(start: WalkStart): ConnectionLeg {
  return {
    from: start.label,
    to: start.stop,
    dep: shiftStamp(start.departure, -start.minutes),
    arr: start.departure,
    line: '',
    fromAt: start.at,
    toAt: start.stopAt,
  }
}

const MS_PER_MINUTE = 60 * 1000

/** A local `YYYY-MM-DDTHH:MM` moved by some minutes, across midnight too. */
function shiftStamp(stamp: string, minutes: number): string {
  const [day = '', time = ''] = stamp.split('T')
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  const [hour = 0, minute = 0] = time.split(':').map(Number)
  const at = new Date(Date.UTC(year, month - 1, date, hour, minute) + minutes * MS_PER_MINUTE)
  return at.toISOString().slice(0, 16)
}
