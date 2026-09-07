/**
 * FR-6.1/6.3 and FR-5.1 — M1's two cross-trip sections.
 *
 * Both were specified in July and existed on no screen until 2026-08-31;
 * `DashboardPage.vue` read neither the assignment nor the flag.
 */
import { describe, it, expect } from 'vitest'

import {
  delegatedToMe,
  latePackersDepartingToday,
  plannedTripsByDeparture,
  type DashboardTrip,
} from '../dashboardSections'

const ME = 'u-andy'

function row(over: Partial<DashboardTrip['rows'][number]> = {}) {
  return {
    id: 'ti-1',
    name: 'Zelt',
    state: 'open',
    packer_user_id: null,
    late_packer: false,
    ...over,
  }
}

describe('delegatedToMe (FR-6.1/6.3)', () => {
  const trips: DashboardTrip[] = [
    {
      tripId: 'trip-a',
      tripName: 'Laos',
      startDate: '2026-09-01',
      rows: [
        row({ id: 'mine-1', name: 'Zelt', packer_user_id: ME }),
        row({ id: 'hers', name: 'Helm', packer_user_id: 'u-mia' }),
        row({ id: 'nobody', name: 'Seil', packer_user_id: null }),
      ],
    },
    {
      tripId: 'trip-b',
      tripName: 'Moskau',
      startDate: null,
      rows: [row({ id: 'mine-2', name: 'Anorak', packer_user_id: ME })],
    },
  ]

  it('gathers my rows across trips and names the trip each is on', () => {
    const result = delegatedToMe(trips, ME, new Set())
    expect(result.map((r) => r.itemId)).toEqual(['mine-2', 'mine-1'])
    expect(result[0]).toMatchObject({ tripName: 'Moskau', itemName: 'Anorak' })
  })

  it('leaves somebody else’s row and an unassigned one alone', () => {
    const ids = delegatedToMe(trips, ME, new Set()).map((r) => r.itemId)
    expect(ids).not.toContain('hers')
    expect(ids).not.toContain('nobody')
  })

  /**
   * The two modes with no account. A filter would empty the *screen* there,
   * which is why FR-6.1's filter clause was struck; this section is simply
   * absent instead, and G-8 hides it.
   */
  it('is empty where there is no account to be assigned anything', () => {
    expect(delegatedToMe(trips, null, new Set())).toEqual([])
  })

  it('marks a row this device has not shown before, and only that one', () => {
    const result = delegatedToMe(trips, ME, new Set(['mine-1']))
    expect(result.find((r) => r.itemId === 'mine-1')!.isNew).toBe(false)
    expect(result.find((r) => r.itemId === 'mine-2')!.isNew).toBe(true)
  })

  it('sorts what is new to the top', () => {
    const result = delegatedToMe(trips, ME, new Set(['mine-2']))
    expect(result.map((r) => r.itemId)).toEqual(['mine-1', 'mine-2'])
  })

  it('drops a row that is already packed or deliberately skipped', () => {
    const settled: DashboardTrip[] = [
      {
        tripId: 't',
        tripName: 'T',
        startDate: null,
        rows: [
          row({ id: 'a', state: 'packed', packer_user_id: ME }),
          row({ id: 'b', state: 'skipped', packer_user_id: ME }),
          row({ id: 'c', state: 'partial', packer_user_id: ME }),
        ],
      },
    ]
    expect(delegatedToMe(settled, ME, new Set()).map((r) => r.itemId)).toEqual(['c'])
  })
})

describe('latePackersDepartingToday (FR-5.1)', () => {
  const trips: DashboardTrip[] = [
    {
      tripId: 'today',
      tripName: 'Heute',
      startDate: '2026-08-31',
      rows: [
        row({ id: 'late', name: 'Zahnbürste', late_packer: true }),
        row({ id: 'plain', name: 'Zelt' }),
        row({ id: 'late-packed', name: 'Ladegerät', late_packer: true, state: 'packed' }),
      ],
    },
    {
      tripId: 'later',
      tripName: 'Später',
      startDate: '2026-09-15',
      rows: [row({ id: 'late-later', name: 'Kamm', late_packer: true })],
    },
  ]

  it('lists only the flagged, open rows of a trip departing today', () => {
    expect(latePackersDepartingToday(trips, '2026-08-31').map((r) => r.itemId)).toEqual(['late'])
  })

  it('says nothing on any other day', () => {
    expect(latePackersDepartingToday(trips, '2026-08-30')).toEqual([])
    expect(latePackersDepartingToday(trips, '2026-09-01')).toEqual([])
  })

  /**
   * FR-2.1b makes the date optional, so a trip that never said when it leaves
   * cannot be leaving now — an undated trip must not match every day.
   */
  it('never matches a trip with no departure date', () => {
    const undated: DashboardTrip[] = [
      {
        tripId: 'u',
        tripName: 'U',
        startDate: null,
        rows: [row({ id: 'x', late_packer: true })],
      },
    ]
    expect(latePackersDepartingToday(undated, '2026-08-31')).toEqual([])
  })
})

describe('plannedTripsByDeparture (FR-6.1, M1 lookahead)', () => {
  interface T {
    id: string
    name: string
    status: string
    start_date: string | null
  }
  const trips: T[] = [
    { id: 'a', name: 'Laos', status: 'planning', start_date: '2026-11-02' },
    { id: 'b', name: 'Elba', status: 'planning', start_date: '2026-09-20' },
    { id: 'c', name: 'Samedan', status: 'active', start_date: '2026-09-01' },
    { id: 'd', name: 'Wien', status: 'archived', start_date: '2026-01-01' },
  ]

  it('keeps only the planned trips, soonest departure first', () => {
    expect(plannedTripsByDeparture(trips).map((t) => t.id)).toEqual(['b', 'a'])
  })

  /**
   * FR-2.1b: a trip is planned long before its dates exist, so an undated
   * trip is the normal early state — it sorts *after* everything dated
   * (nothing is known about when it happens) and by name among its own kind,
   * never off the screen.
   */
  it('sorts undated trips last, by name, and never drops them', () => {
    const undated: T[] = [
      { id: 'z', name: 'Zermatt', status: 'planning', start_date: null },
      { id: 'm', name: 'Mailand', status: 'planning', start_date: null },
      { id: 'd', name: 'Dover', status: 'planning', start_date: '2026-12-24' },
    ]
    expect(plannedTripsByDeparture(undated).map((t) => t.id)).toEqual(['d', 'm', 'z'])
  })

  it('answers with nothing when no trip is planned', () => {
    expect(plannedTripsByDeparture(trips.filter((t) => t.status !== 'planning'))).toEqual([])
  })
})
