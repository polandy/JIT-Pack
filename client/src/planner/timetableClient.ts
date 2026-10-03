/**
 * FR-29.18, ADR-086: the device asks transport.opendata.ch itself — in Local
 * Mode too — and reads the answer with the pure rules in `domain/timetable`.
 * A refusal or a missing network is `null`, which the sheet says in words and
 * answers with the hand fields.
 */
import {
  nearestStop,
  optionsFrom,
  stopsFrom,
  type TimetableOption,
  type TimetableStop,
} from './domain/timetable'

/** The public timetable service. */
export const TIMETABLE_URL = 'https://transport.opendata.ch/v1'
/** How many connections a search lists. */
export const CONNECTION_LIMIT = 6

/** What a search asks for. */
export interface ConnectionQuery {
  /** A stop's name or id. */
  from: string
  to: string
  /** `YYYY-MM-DD`. */
  day: string
  /** `HH:MM`. */
  time: string
  /** The time is the arrival's, not the departure's. */
  arrive: boolean
}

export interface TimetableApi {
  stops(query: string): Promise<TimetableStop[] | null>
  stopNear(lat: number, lon: number): Promise<TimetableStop | null>
  connections(query: ConnectionQuery): Promise<TimetableOption[] | null>
}

export function createTimetableApi(fetchFn: typeof fetch = (...a) => fetch(...a)): TimetableApi {
  async function ask(path: string, params: Record<string, string>): Promise<unknown> {
    try {
      const response = await fetchFn(`${TIMETABLE_URL}/${path}?${new URLSearchParams(params)}`)
      return response.ok ? await response.json() : null
    } catch {
      return null
    }
  }
  return {
    async stops(query) {
      const body = await ask('locations', { query, type: 'station' })
      return body === null ? null : stopsFrom(body)
    },
    async stopNear(lat, lon) {
      const body = await ask('locations', { x: String(lat), y: String(lon) })
      return body === null ? null : nearestStop(stopsFrom(body))
    },
    async connections({ from, to, day, time, arrive }) {
      const body = await ask('connections', {
        from,
        to,
        date: day,
        time,
        isArrivalTime: arrive ? '1' : '0',
        limit: String(CONNECTION_LIMIT),
      })
      return body === null ? null : optionsFrom(body)
    },
  }
}
