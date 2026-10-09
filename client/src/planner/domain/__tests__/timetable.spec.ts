/**
 * FR-29.18, ADR-086: a connection searched for in the Swiss timetable —
 * what transport.opendata.ch answers becomes the legs of an ordinary
 * connection, and what an excursion already knows seeds the search.
 */
import { describe, expect, it } from 'vitest'

import { DAY_ENTRY_CONNECTION, EXCURSION_ROLE_BACK, EXCURSION_ROLE_OUT } from '../../types'
import type { ConnectionLeg, DayEntry, ExcursionRole } from '../../types'
import {
  changeSeed,
  nearStops,
  nearestStop,
  optionsFrom,
  startFromHere,
  searchSeed,
  slackMinutes,
  stopsFrom,
  type TimetableOption,
} from '../timetable'
import {
  BOAT_FIXTURE,
  CONNECTIONS_FIXTURE,
  LOCATIONS_FIXTURE,
  NEAR_FIXTURE,
  NEAR_LUZERN_FIXTURE,
} from './timetableFixture'

describe('stopsFrom', () => {
  it('reads a stop with its name, id and place — x being the latitude', () => {
    const stops = stopsFrom(LOCATIONS_FIXTURE)
    expect(stops.length).toBeGreaterThan(0)
    const first = stops[0]!
    expect(first.id).not.toBe('')
    expect(first.name).not.toBe('')
    expect(first.lat).toBeGreaterThan(45)
    expect(first.lat).toBeLessThan(48)
    expect(first.lon).toBeGreaterThan(5)
    expect(first.lon).toBeLessThan(11)
  })

  it('answers none for anything that is not a list of stations', () => {
    expect(stopsFrom(null)).toEqual([])
    expect(stopsFrom({})).toEqual([])
    expect(stopsFrom({ stations: 'Bern' })).toEqual([])
  })

  it('leaves out an address — an entry without an id is no stop', () => {
    const names = stopsFrom(NEAR_FIXTURE).map((s) => s.name)
    expect(names).not.toContain('Alpweg 76b, Lauterbrunnen')
    expect(names.length).toBeGreaterThan(0)
  })
})

describe('nearStops (FR-29.18, from where one is)', () => {
  it('offers the three stops nearest a place, each with its distance', () => {
    expect(nearStops(stopsFrom(NEAR_LUZERN_FIXTURE))).toEqual([
      { id: '8505000', name: 'Luzern', lat: 47.050165, lon: 8.310172, distance: 66 },
      { id: '8508450', name: 'Luzern, Bahnhof', lat: 47.05074, lon: 8.310247, distance: 94 },
      { id: '8508492', name: 'Luzern Bahnhofquai', lat: 47.051182, lon: 8.310136, distance: 126 },
    ])
  })

  it('reads a stop found by its name without a distance', () => {
    expect(stopsFrom(LOCATIONS_FIXTURE)[0]!.distance).toBeNull()
  })
})

describe('nearestStop', () => {
  it('is the first stop the service names — it sorts by distance', () => {
    const stops = stopsFrom(NEAR_FIXTURE)
    expect(nearestStop(stops)).toBe(stops[0])
  })

  it('is none without stops — abroad, the service finds nothing', () => {
    expect(nearestStop([])).toBeNull()
  })
})

describe('optionsFrom', () => {
  const options = optionsFrom(CONNECTIONS_FIXTURE)

  it('reads every connection with its legs, each in the stop’s own local time', () => {
    expect(options).toHaveLength(5)
    expect(options[0]!.legs).toMatchObject([
      {
        from: 'Interlaken Ost',
        to: 'Lauterbrunnen',
        dep: '2026-10-10T08:04',
        arr: '2026-10-10T08:26',
        line: 'R 62',
      },
      {
        from: 'Lauterbrunnen',
        to: 'Kleine Scheidegg',
        dep: '2026-10-10T08:30',
        arr: '2026-10-10T09:08',
        line: 'CC 63',
      },
    ])
  })

  it('counts the minutes from the first departure to the last arrival', () => {
    expect(options[0]!.minutes).toBe(64)
    expect(options[2]!.minutes).toBe(82)
  })

  it('names a line as a traveller does: the run’s leading zeros are not part of it', () => {
    expect(options[4]!.legs[0]!.line).toBe('ICE 271')
  })

  it('reads a walk as a leg without a line', () => {
    const walk = {
      connections: [
        {
          sections: [
            {
              journey: null,
              walk: { duration: '00d00:05:00' },
              departure: {
                station: { name: 'Bern' },
                departure: '2026-10-10T08:00:00+0200',
              },
              arrival: {
                station: { name: 'Bern, Bahnhof' },
                arrival: '2026-10-10T08:05:00+0200',
              },
            },
            {
              journey: { category: 'B', number: '10' },
              walk: null,
              departure: {
                station: { name: 'Bern, Bahnhof' },
                departure: '2026-10-10T08:10:00+0200',
              },
              arrival: {
                station: { name: 'Bern, Zytglogge' },
                arrival: '2026-10-10T08:15:00+0200',
              },
            },
          ],
        },
      ],
    }
    const [only] = optionsFrom(walk)
    expect(only!.legs.map((l) => l.line)).toEqual(['', 'B 10'])
  })

  it('drops a connection with a time it cannot read — never a partial journey', () => {
    const broken = {
      connections: [
        {
          sections: [
            {
              journey: { category: 'IC', number: '1' },
              walk: null,
              departure: { station: { name: 'A' }, departure: null },
              arrival: { station: { name: 'B' }, arrival: '2026-10-10T09:00:00+0200' },
            },
          ],
        },
      ],
    }
    expect(optionsFrom(broken)).toEqual([])
  })

  it('answers none for anything that is not a list of connections', () => {
    expect(optionsFrom(null)).toEqual([])
    expect(optionsFrom({ connections: 3 })).toEqual([])
  })

  it('reads where each stop lies and the stations passed, for the map (FR-29.18)', () => {
    const [walk, boat] = optionsFrom(BOAT_FIXTURE)[0]!.legs
    expect(walk).toEqual({
      from: 'Luzern',
      to: 'Luzern Bahnhofquai',
      dep: '2026-10-10T08:05',
      arr: '2026-10-10T08:12',
      line: '',
      fromAt: [47.050165, 8.310172],
      toAt: [47.051182, 8.310136],
    })
    expect(boat).toEqual({
      from: 'Luzern Bahnhofquai',
      to: 'Vitznau',
      dep: '2026-10-10T08:12',
      arr: '2026-10-10T09:09',
      line: 'BAT 3600',
      mode: 'boat',
      fromAt: [47.051182, 8.310136],
      toAt: [47.009345, 8.482383],
      via: [
        [47.0511, 8.334865],
        [47.026876, 8.403448],
        [47.031408, 8.433211],
      ],
    })
  })
})

describe('startFromHere (FR-29.18, from where one is)', () => {
  const [option] = optionsFrom(BOAT_FIXTURE)
  const here = { label: 'Mein Standort', lat: 47.0505, lon: 8.3093 }
  const stop = { id: '8505000', name: 'Luzern', lat: 47.050165, lon: 8.310172, distance: 66 }

  it('opens the connection with the walk to its first stop, as long as the distance takes', () => {
    const started = startFromHere(option!, here, stop)
    expect(started.walk).toBe(1)
    expect(started.option.legs[0]).toEqual({
      from: 'Mein Standort',
      to: 'Luzern',
      dep: '2026-10-10T08:04',
      arr: '2026-10-10T08:05',
      line: '',
      fromAt: [47.0505, 8.3093],
      toAt: [47.050165, 8.310172],
    })
    expect(started.option.legs.slice(1)).toEqual(option!.legs)
    expect(started.option.minutes).toBe(option!.minutes + 1)
  })

  it('takes a stop without a distance as one at the door', () => {
    expect(startFromHere(option!, here, { ...stop, distance: null }).walk).toBe(0)
  })
})

describe('slackMinutes', () => {
  const option = (dep: string): TimetableOption => ({
    legs: [{ from: 'A', to: 'B', dep: `2026-10-10T${dep}`, arr: '2026-10-10T20:00', line: 'IC 1' }],
    minutes: 60,
  })

  it('is what a departure leaves after the earliest one can leave', () => {
    expect(slackMinutes(option('16:23'), '15:59')).toBe(24)
  })

  it('is negative where the connection leaves before one could', () => {
    expect(slackMinutes(option('15:30'), '15:59')).toBe(-29)
  })

  it('is none without an earliest time', () => {
    expect(slackMinutes(option('16:23'), null)).toBeNull()
  })
})

describe('searchSeed', () => {
  function way(id: string, role: ExcursionRole, legs: ConnectionLeg[]): DayEntry {
    return {
      id,
      trip_id: 't1',
      author_id: 'u1',
      kind: DAY_ENTRY_CONNECTION,
      on_date: legs[0]!.dep.slice(0, 10),
      at_time: legs[0]!.dep.slice(11, 16),
      title: 'x',
      note: null,
      link: null,
      legs,
      excursion_id: 'x1',
      excursion_role: role,
    }
  }
  const out = way('o', EXCURSION_ROLE_OUT, [
    {
      from: 'Bern',
      to: 'Lauterbrunnen',
      dep: '2026-10-10T08:06',
      arr: '2026-10-10T09:34',
      line: 'IC 1',
    },
  ])

  it('seeds the way there with the day and a morning, asking for a departure', () => {
    expect(searchSeed({ role: EXCURSION_ROLE_OUT, out: null, routeMinutes: null })).toEqual({
      from: '',
      to: '',
      time: '08:00',
      earliest: null,
    })
  })

  it('seeds the way back reversed, leaving once the route is walked', () => {
    // Arriving 09:34, a route of 3 h 25 ends at 12:59.
    expect(searchSeed({ role: EXCURSION_ROLE_BACK, out, routeMinutes: 205 })).toEqual({
      from: 'Lauterbrunnen',
      to: 'Bern',
      time: '12:59',
      earliest: '12:59',
    })
  })

  it('seeds the way back from the arrival alone where the excursion has no route', () => {
    expect(searchSeed({ role: EXCURSION_ROLE_BACK, out, routeMinutes: null })).toEqual({
      from: 'Lauterbrunnen',
      to: 'Bern',
      time: '09:34',
      earliest: '09:34',
    })
  })

  it('seeds the way back with a time and no stops where there is no way there', () => {
    expect(searchSeed({ role: EXCURSION_ROLE_BACK, out: null, routeMinutes: 205 })).toEqual({
      from: '',
      to: '',
      time: '16:00',
      earliest: null,
    })
  })

  it('seeds a connection without a role with the day’s morning', () => {
    expect(searchSeed({ role: null, out: null, routeMinutes: null }).time).toBe('08:00')
  })
})

describe('changeSeed', () => {
  const walkThenRide: ConnectionLeg[] = [
    {
      from: 'Mein Standort',
      to: 'Spiez',
      dep: '2026-10-10T07:58',
      arr: '2026-10-10T08:06',
      line: '',
    },
    {
      from: 'Spiez',
      to: 'Frutigen',
      dep: '2026-10-10T08:06',
      arr: '2026-10-10T08:20',
      line: 'RE',
    },
    {
      from: 'Frutigen',
      to: 'Kandersteg',
      dep: '2026-10-10T08:22',
      arr: '2026-10-10T08:34',
      line: 'S 1',
    },
  ]

  it("FR-29.18: a change searches from the connection's own stops at its departure", () => {
    expect(changeSeed(walkThenRide, null)).toEqual({
      from: 'Spiez',
      to: 'Kandersteg',
      time: '08:06',
      earliest: null,
    })
  })

  it("keeps what bounds the slot's departure", () => {
    expect(changeSeed(walkThenRide, '12:59').earliest).toBe('12:59')
  })

  it("searches between a walk's own ends where the connection rides nothing", () => {
    expect(changeSeed([walkThenRide[0]!], null)).toEqual({
      from: 'Mein Standort',
      to: 'Spiez',
      time: '07:58',
      earliest: null,
    })
  })
})
