import type { Page } from '@playwright/test'

/**
 * transport.opendata.ch stood in for (FR-29.18, ADR-086): the e2e legs have no
 * internet, and a timetable that answers differently each day is no
 * assertion. The shape is the service's own, cut to what the reader uses
 * (`planner/domain/__tests__/timetableFixture.ts` holds real answers).
 */

/** One run the stub offers between two stops, local times `HH:MM`. */
export interface StubRun {
  from: string
  to: string
  dep: string
  arr: string
  category: string
  number: string
  /** The stops called at on the way, by name — drawn on the connection's map. */
  via?: string[]
}

/** A stop and where it lies, `x` = latitude as the service says. */
export interface StubStop {
  id: string
  name: string
  lat: number
  lon: number
  /** Metres from the place a near-lookup asked about. */
  distance?: number
}

const SERVICE = 'https://transport.opendata.ch/v1/**'

function stamp(day: string, time: string): string {
  return `${day}T${time}:00+0200`
}

function station(stop: StubStop) {
  return {
    id: stop.id,
    name: stop.name,
    coordinate: { type: 'WGS84', x: stop.lat, y: stop.lon },
    distance: stop.distance ?? null,
  }
}

/** The requests the stub saw, for a case that asserts what the device asked. */
export interface TimetableStub {
  asked: URL[]
}

/**
 * Answers `locations` from `stops` (a near-lookup by position, a name lookup
 * by prefix) and `connections` from `runs`, matched on the two stop names —
 * and, with `byTime`, on the time asked.
 * An address — no id — leads every near-lookup, as the real service has it.
 */
export async function stubTimetable(
  page: Page,
  stops: readonly StubStop[],
  runs: readonly StubRun[],
  options: { byTime?: boolean } = {},
): Promise<TimetableStub> {
  const stub: TimetableStub = { asked: [] }
  await page.route(SERVICE, (route) => {
    const url = new URL(route.request().url())
    stub.asked.push(url)
    const params = url.searchParams
    if (url.pathname.endsWith('/locations')) {
      const query = params.get('query')?.toLowerCase()
      const found = query
        ? stops.filter((s) => s.name.toLowerCase().startsWith(query))
        : [{ id: null, name: 'Alpweg 1, Nirgendwo', lat: 0, lon: 0 }, ...stops]
      return route.fulfill({
        json: {
          stations: found.map((s) =>
            s.id === null
              ? { id: null, name: s.name, coordinate: { x: 0, y: 0 } }
              : station(s as StubStop),
          ),
        },
      })
    }
    const day = params.get('date') ?? ''
    const time = params.get('time') ?? '00:00'
    const arriving = params.get('isArrivalTime') === '1'
    // By time, as the service answers — what leaves from the time asked, or
    // arrives by it; otherwise every run, so a case can show one too early.
    const found = runs
      .filter(
        (r) =>
          r.from === params.get('from') &&
          r.to === params.get('to') &&
          (!options.byTime || (arriving ? r.arr <= time : r.dep >= time)),
      )
      .slice(0, options.byTime ? Number(params.get('limit') ?? runs.length) : runs.length)
    // A stop the stub knows by name carries its place, as the service's does.
    const at = (name: string) => {
      const known = stops.find((s) => s.name === name)
      return known ? station(known) : { name }
    }
    return route.fulfill({
      json: {
        connections: found.map((r) => ({
          sections: [
            {
              journey: {
                category: r.category,
                number: r.number,
                passList: [r.from, ...(r.via ?? []), r.to].map((name) => ({ station: at(name) })),
              },
              walk: null,
              departure: { station: at(r.from), departure: stamp(day, r.dep) },
              arrival: { station: at(r.to), arrival: stamp(day, r.arr) },
            },
          ],
        })),
      },
    })
  })
  return stub
}
