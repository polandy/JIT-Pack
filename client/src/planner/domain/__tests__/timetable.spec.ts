/**
 * FR-29.18, ADR-086: a connection searched for in the Swiss timetable —
 * what transport.opendata.ch answers becomes the legs of an ordinary
 * connection, and what an excursion already knows seeds the search.
 */
import { describe, expect, it } from 'vitest'

import { DAY_ENTRY_CONNECTION, EXCURSION_ROLE_BACK, EXCURSION_ROLE_OUT } from '@/types/domain'
import type { ConnectionLeg, DayEntry, ExcursionRole } from '@/types/domain'
import {
  nearestStop,
  optionsFrom,
  searchSeed,
  slackMinutes,
  stopsFrom,
  type TimetableOption,
} from '../timetable'
import { CONNECTIONS_FIXTURE, LOCATIONS_FIXTURE, NEAR_FIXTURE } from './timetableFixture'

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
    expect(options[0]!.legs).toEqual([
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
