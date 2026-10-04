/**
 * FR-29.18 — what the device asks transport.opendata.ch, and that a refusal
 * or a missing network is an answer of "none", never a thrown error.
 */
import { describe, expect, it } from 'vitest'

import {
  CONNECTIONS_FIXTURE,
  LOCATIONS_FIXTURE,
  NEAR_FIXTURE,
  NEAR_LUZERN_FIXTURE,
} from '../domain/__tests__/timetableFixture'
import { TIMETABLE_URL, createTimetableApi } from '../timetableClient'

function fake(body: unknown, ok = true) {
  const asked: string[] = []
  const fetchFn = (async (url: string) => {
    asked.push(url)
    return { ok, json: async () => body }
  }) as unknown as typeof fetch
  return { asked, api: createTimetableApi(fetchFn) }
}

describe('createTimetableApi (FR-29.18)', () => {
  it('asks for stops by the typed name and reads them', async () => {
    const { asked, api } = fake(LOCATIONS_FIXTURE)
    const stops = await api.stops('Bern')
    expect(asked[0]).toBe(`${TIMETABLE_URL}/locations?query=Bern&type=station`)
    expect(stops!.length).toBeGreaterThan(0)
  })

  it('asks for the stop nearest a place — x is the latitude', async () => {
    const { asked, api } = fake(NEAR_FIXTURE)
    const stop = await api.stopNear(46.6, 7.9)
    expect(asked[0]).toBe(`${TIMETABLE_URL}/locations?x=46.6&y=7.9`)
    expect(stop).not.toBeNull()
  })

  it('asks for the stops near the device, the nearest first, with their distance', async () => {
    const { asked, api } = fake(NEAR_LUZERN_FIXTURE)
    const stops = await api.stopsNear(47.0505, 8.3093)
    expect(asked[0]).toBe(`${TIMETABLE_URL}/locations?x=47.0505&y=8.3093`)
    expect(stops!.map((s) => [s.name, s.distance])).toEqual([
      ['Luzern', 66],
      ['Luzern, Bahnhof', 94],
      ['Luzern Bahnhofquai', 126],
    ])
  })

  it('asks for connections on a day and time, departing or arriving', async () => {
    const { asked, api } = fake(CONNECTIONS_FIXTURE)
    const found = await api.connections({
      from: 'Bern',
      to: 'Lauterbrunnen',
      day: '2026-10-10',
      time: '08:00',
      arrive: false,
    })
    const url = new URL(asked[0]!)
    expect(url.pathname).toBe('/v1/connections')
    expect(url.searchParams.get('from')).toBe('Bern')
    expect(url.searchParams.get('to')).toBe('Lauterbrunnen')
    expect(url.searchParams.get('date')).toBe('2026-10-10')
    expect(url.searchParams.get('time')).toBe('08:00')
    expect(url.searchParams.get('isArrivalTime')).toBe('0')
    expect(found!.length).toBe(5)

    await api.connections({ from: 'a', to: 'b', day: '2026-10-10', time: '18:00', arrive: true })
    expect(new URL(asked[1]!).searchParams.get('isArrivalTime')).toBe('1')
  })

  it('answers none where the service refuses', async () => {
    const { api } = fake({}, false)
    expect(await api.stops('Bern')).toBeNull()
    expect(await api.stopNear(1, 2)).toBeNull()
    expect(await api.stopsNear(1, 2)).toBeNull()
    expect(
      await api.connections({ from: 'a', to: 'b', day: 'd', time: 't', arrive: false }),
    ).toBeNull()
  })

  it('answers none where the network is gone', async () => {
    const api = createTimetableApi((async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch)
    expect(await api.stops('Bern')).toBeNull()
    expect(
      await api.connections({ from: 'a', to: 'b', day: 'd', time: 't', arrive: false }),
    ).toBeNull()
  })

  it('answers an empty list, not none, for a name the service does not know', async () => {
    const { api } = fake({ stations: [] })
    expect(await api.stops('Nowhere')).toEqual([])
  })
})
