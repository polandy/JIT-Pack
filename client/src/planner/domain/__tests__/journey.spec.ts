/** FR-29.18: an excursion's way there and back, and the time it leaves on the spot. */
import { describe, expect, it } from 'vitest'

import {
  DAY_ENTRY_CONNECTION,
  DAY_ENTRY_NOTE,
  EXCURSION_ROLE_BACK,
  EXCURSION_ROLE_OUT,
  type ConnectionLeg,
  type DayEntry,
  type ExcursionRole,
} from '../../types'
import { excursionJourney, journeyBudget, journeyTimes } from '../journey'

function leg(from: string, to: string, dep: string, arr: string, line = 'RE'): ConnectionLeg {
  return { from, to, dep, arr, line }
}

function connection(
  id: string,
  legs: ConnectionLeg[],
  role: ExcursionRole | null,
  excursionId: string | null = 'x1',
): DayEntry {
  return {
    id,
    trip_id: 't1',
    author_id: 'u1',
    kind: DAY_ENTRY_CONNECTION,
    on_date: legs[0]!.dep.slice(0, 10),
    at_time: legs[0]!.dep.slice(11, 16),
    title: `${legs[0]!.from} → ${legs[legs.length - 1]!.to}`,
    note: null,
    link: null,
    legs,
    excursion_id: excursionId,
    excursion_role: role,
  }
}

const OUT = connection(
  'out',
  [leg('Spiez', 'Kandersteg', '2026-10-10T08:06', '2026-10-10T08:34')],
  EXCURSION_ROLE_OUT,
)
const BACK = connection(
  'back',
  [leg('Kandersteg', 'Spiez', '2026-10-10T16:23', '2026-10-10T16:52')],
  EXCURSION_ROLE_BACK,
)

describe('excursionJourney (FR-29.18)', () => {
  it('puts the connection written as the way there in the out slot and the way back in the back slot', () => {
    const journey = excursionJourney([BACK, OUT], 'x1')
    expect(journey.out?.id).toBe('out')
    expect(journey.back?.id).toBe('back')
    expect(journey.others).toEqual([])
  })

  it('takes a way by its legs, not its kind — two devices merged field by field may disagree', () => {
    const merged: DayEntry = { ...OUT, kind: 'note' }
    const taken: DayEntry = { ...BACK, legs: null }
    const journey = excursionJourney([merged, taken], 'x1')
    expect(journey.out?.id).toBe('out')
    expect(journey.back).toBeNull()
  })

  it('ignores another excursion’s connections, free entries and connections of no excursion', () => {
    const note: DayEntry = { ...OUT, id: 'note', kind: DAY_ENTRY_NOTE, legs: null }
    const elsewhere = connection('else', OUT.legs!, EXCURSION_ROLE_OUT, 'x2')
    const loose = connection('loose', OUT.legs!, null, null)
    expect(excursionJourney([note, elsewhere, loose], 'x1')).toEqual({
      out: null,
      back: null,
      others: [],
    })
  })

  it('lists a connection of the excursion with no role among the others, by departure', () => {
    const late = connection('late', [leg('A', 'B', '2026-10-10T18:00', '2026-10-10T18:30')], null)
    const early = connection('early', [leg('C', 'D', '2026-10-10T07:00', '2026-10-10T07:30')], null)
    const journey = excursionJourney([late, early, OUT], 'x1')
    expect(journey.out?.id).toBe('out')
    expect(journey.others.map((e) => e.id)).toEqual(['early', 'late'])
  })

  it('keeps the earliest of two ways there and the latest of two ways back, the rest among the others', () => {
    // Two devices filling the same slot while apart: neither is lost.
    const laterOut = connection(
      'out2',
      [leg('Spiez', 'Kandersteg', '2026-10-10T09:06', '2026-10-10T09:34')],
      EXCURSION_ROLE_OUT,
    )
    const earlierBack = connection(
      'back2',
      [leg('Kandersteg', 'Spiez', '2026-10-10T15:23', '2026-10-10T15:52')],
      EXCURSION_ROLE_BACK,
    )
    const journey = excursionJourney([laterOut, BACK, OUT, earlierBack], 'x1')
    expect(journey.out?.id).toBe('out')
    expect(journey.back?.id).toBe('back')
    expect(journey.others.map((e) => e.id)).toEqual(['out2', 'back2'])
  })
})

describe('journeyTimes (FR-29.18)', () => {
  it('names each way’s first departure and last arrival', () => {
    expect(journeyTimes(OUT)).toEqual({ dep: '08:06', arr: '08:34' })
  })

  it('falls back on the entry’s own time for a connection without legs', () => {
    expect(journeyTimes({ ...OUT, legs: null })).toEqual({ dep: '08:06', arr: null })
  })
})

describe('journeyBudget (FR-29.18)', () => {
  it('has nothing to say without a way there', () => {
    expect(journeyBudget({ out: null, back: BACK, routeMinutes: 205 })).toBeNull()
  })

  it('says how long one is on the spot between arriving and leaving, and with a route how much is left', () => {
    expect(journeyBudget({ out: OUT, back: BACK, routeMinutes: 205 })).toEqual({
      kind: 'onSite',
      onSiteMinutes: 469,
      routeMinutes: 205,
      slackMinutes: 264,
      // On the bar from the first departure to the last arrival: travel, route, slack, travel.
      bar: { total: 526, arrive: 28, routeEnd: 233, leave: 497 },
    })
  })

  it('counts the slack negative when the route is longer than the time on the spot', () => {
    const budget = journeyBudget({ out: OUT, back: BACK, routeMinutes: 500 })
    expect(budget?.kind === 'onSite' && budget.slackMinutes).toBe(-31)
  })

  it('says only the time on the spot without a route', () => {
    expect(journeyBudget({ out: OUT, back: BACK, routeMinutes: null })).toMatchObject({
      kind: 'onSite',
      onSiteMinutes: 469,
      routeMinutes: null,
      slackMinutes: null,
    })
  })

  it('says when one can leave at the earliest from a way there and a route alone', () => {
    expect(journeyBudget({ out: OUT, back: null, routeMinutes: 205 })).toEqual({
      kind: 'earliestBack',
      arrival: '08:34',
      routeMinutes: 205,
      earliestBack: '11:59',
    })
  })

  it('has nothing to say from a way there without a route', () => {
    expect(journeyBudget({ out: OUT, back: null, routeMinutes: null })).toBeNull()
  })

  it('has nothing to say when the way back leaves on another day than the way there arrives', () => {
    // A hut night: the budget is a day's, a two-day excursion has none.
    const nextDay = connection(
      'back',
      [leg('Kandersteg', 'Spiez', '2026-10-11T16:23', '2026-10-11T16:52')],
      EXCURSION_ROLE_BACK,
    )
    expect(journeyBudget({ out: OUT, back: nextDay, routeMinutes: 205 })).toBeNull()
  })

  it('has nothing to say when the way back leaves before the way there arrives', () => {
    const before = connection(
      'back',
      [leg('Kandersteg', 'Spiez', '2026-10-10T07:00', '2026-10-10T07:30')],
      EXCURSION_ROLE_BACK,
    )
    expect(journeyBudget({ out: OUT, back: before, routeMinutes: 205 })).toBeNull()
  })

  it('has no earliest way back when the route ends after midnight', () => {
    const evening = connection(
      'out',
      [leg('Spiez', 'Kandersteg', '2026-10-10T21:00', '2026-10-10T21:30')],
      EXCURSION_ROLE_OUT,
    )
    expect(journeyBudget({ out: evening, back: null, routeMinutes: 205 })).toBeNull()
  })
})
