// @vitest-environment jsdom
/** FR-29.7: the path a tap on a trip leads to. */
import { beforeEach, describe, expect, it } from 'vitest'

import { writeLastView, type OpeningTrip } from '@/lib/tripOpening'
import { openingTarget, type TripOpeningSource } from '../tripOpening'

const PLANNED: OpeningTrip = {
  status: 'planning',
  start_date: '2026-07-20',
  end_date: '2026-07-27',
}

function source(over: Partial<TripOpeningSource> = {}): TripOpeningSource {
  return {
    getTrip: () => PLANNED,
    itemCount: () => 0,
    tripDataLoaded: () => true,
    today: () => '2026-07-14',
    dayPlanEmpty: () => false,
    shoppingOpen: () => 0,
    tasksOpen: () => 0,
    ...over,
  }
}

describe('openingTarget', () => {
  beforeEach(() => localStorage.clear())

  it('leads a first visit to an empty trip to its ideas', () => {
    expect(openingTarget('t1', source())).toBe('/trips/t1/ideas')
  })

  it('counts a partition not yet on the device as not empty', () => {
    expect(openingTarget('t1', source({ tripDataLoaded: () => false }))).toBe('/trips/t1')
  })

  it('leads to the view last visited', () => {
    writeLastView('t1', 'tasks')
    expect(openingTarget('t1', source())).toBe('/trips/t1/tasks')
  })

  it('leads to the day plan during the trip', () => {
    expect(openingTarget('t1', source({ today: () => '2026-07-21' }))).toBe('/trips/t1/dayplan')
  })

  it('asks the day plan about today, and leads past an empty one to the tasks it counts', () => {
    const asked: string[] = []
    const target = openingTarget(
      't1',
      source({
        today: () => '2026-07-21',
        dayPlanEmpty: (tripId, _trip, day) => (asked.push(`${tripId}:${day}`), true),
        tasksOpen: () => 2,
      }),
    )
    expect(asked).toEqual(['t1:2026-07-21'])
    expect(target).toBe('/trips/t1/tasks')
  })

  it('does not ask the day plan while the partition is not on the device', () => {
    const target = openingTarget(
      't1',
      source({
        today: () => '2026-07-21',
        tripDataLoaded: () => false,
        dayPlanEmpty: () => {
          throw new Error('asked')
        },
      }),
    )
    expect(target).toBe('/trips/t1/dayplan')
  })

  it('leads a trip not on the device yet to the packing list, which waits for it', () => {
    expect(openingTarget('t1', source({ getTrip: () => undefined }))).toBe('/trips/t1')
  })
})
