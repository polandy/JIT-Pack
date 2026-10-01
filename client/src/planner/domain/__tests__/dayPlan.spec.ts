/** FR-29.14/FR-29.15: the day plan's days, its pool and one day's timeline. */
import { describe, expect, it } from 'vitest'

import type { DayPlanLine } from '@/lib/dayPlanSources'
import type { DayEntry, Idea, IdeaState } from '@/types/domain'
import { DAY_ENTRY_CONNECTION, DAY_ENTRY_NOTE } from '@/types/domain'
import {
  DAY_LINE,
  MAX_PLAN_DAYS,
  dayCounts,
  dayLines,
  hasPlanDates,
  entriesOutsideTrip,
  ideasOutsideTrip,
  isPlanTime,
  nextDay,
  openingDay,
  stateAfterTick,
  tripDays,
  unplannedIdeas,
  type DayInput,
} from '../dayPlan'

const TRIP = { start_date: '2026-07-12', end_date: '2026-07-15' }

function idea(
  id: string,
  state: IdeaState,
  plannedOn: string | null,
  plannedAt: string | null = null,
): Idea {
  return {
    id,
    trip_id: 't1',
    author_id: 'u1',
    title: `Idee ${id}`,
    note: null,
    link: null,
    tag: null,
    rain_proof: false,
    state,
    created_at: null,
    planned_on: plannedOn,
    planned_at: plannedAt,
  }
}

function entry(id: string, onDate: string, atTime: string | null): DayEntry {
  return {
    id,
    trip_id: 't1',
    author_id: 'u1',
    on_date: onDate,
    at_time: atTime,
    kind: DAY_ENTRY_NOTE,
    title: `Eintrag ${id}`,
    note: null,
    link: null,
    legs: null,
  }
}

function line(key: string, kind: DayPlanLine['kind'], from: string, to = from): DayPlanLine {
  return { key, kind, title: key, from, to, detail: null, progress: null, done: null, path: '/x' }
}

function input(over: Partial<DayInput> = {}): DayInput {
  return { trip: TRIP, ideas: [], entries: [], lines: [], ...over }
}

describe('tripDays', () => {
  it('lists every day from the first to the last', () => {
    expect(tripDays(TRIP)).toEqual(['2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15'])
  })

  it('crosses a month and a year end by the calendar', () => {
    expect(tripDays({ start_date: '2026-12-30', end_date: '2027-01-02' })).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ])
    expect(nextDay('2028-02-28')).toBe('2028-02-29')
  })

  it.each([
    ['no start', { start_date: null, end_date: '2026-07-15' }],
    ['no end', { start_date: '2026-07-12', end_date: null }],
    ['the end before the start', { start_date: '2026-07-15', end_date: '2026-07-12' }],
  ])('is empty with %s — the plan needs both dates (FR-29.7)', (_name, trip) => {
    expect(hasPlanDates(trip)).toBe(false)
    expect(tripDays(trip)).toEqual([])
  })

  it('stops at MAX_PLAN_DAYS for a mistyped year', () => {
    expect(tripDays({ start_date: '2026-01-01', end_date: '2036-01-01' })).toHaveLength(
      MAX_PLAN_DAYS,
    )
  })
})

describe('openingDay', () => {
  const days = tripDays(TRIP)

  it('is today during the trip', () => {
    expect(openingDay(days, '2026-07-14')).toBe('2026-07-14')
  })

  it('is the first day before and after it', () => {
    expect(openingDay(days, '2026-06-01')).toBe('2026-07-12')
    expect(openingDay(days, '2026-08-01')).toBe('2026-07-12')
  })

  it('is none without days', () => {
    expect(openingDay([], '2026-07-14')).toBeNull()
  })
})

describe('the pool and the ideas outside the trip (FR-29.14)', () => {
  const ideas = [
    idea('pool', 'shortlisted', null),
    idea('planned', 'shortlisted', '2026-07-13'),
    idea('fresh', 'idea', null),
    idea('moved', 'shortlisted', '2026-08-01'),
    idea('doneOutside', 'done', '2026-06-01'),
    idea('droppedOutside', 'dropped', '2026-06-01'),
  ]

  it('pools the shortlisted ideas without a day, never an undecided one', () => {
    expect(unplannedIdeas(ideas).map((i) => i.id)).toEqual(['pool'])
  })

  it('keeps an idea whose day left the trip, unless it was dropped', () => {
    expect(ideasOutsideTrip(ideas, tripDays(TRIP)).map((i) => i.id)).toEqual([
      'moved',
      'doneOutside',
    ])
  })
})

describe('dayLines (FR-29.15)', () => {
  it('puts arrival on the first day and departure on the last', () => {
    expect(dayLines('2026-07-12', input()).map((l) => l.kind)).toEqual([DAY_LINE.arrival])
    expect(dayLines('2026-07-15', input()).map((l) => l.kind)).toEqual([DAY_LINE.departure])
    expect(dayLines('2026-07-13', input())).toEqual([])
  })

  it('orders timed lines by time, then the untimed in the kinds’ order', () => {
    const lines = dayLines(
      '2026-07-13',
      input({
        ideas: [
          idea('late', 'shortlisted', '2026-07-13', '10:00'),
          idea('free', 'shortlisted', '2026-07-13'),
        ],
        entries: [entry('dinner', '2026-07-13', '19:30'), entry('early', '2026-07-13', '07:05')],
        lines: [line('task', 'task', '2026-07-13'), line('walk', 'excursion', '2026-07-13')],
      }),
    )
    expect(lines.map((l) => l.key)).toEqual([
      'entry:early',
      'idea:late',
      'entry:dinner',
      'task',
      'walk',
      'idea:free',
    ])
    expect(lines.find((l) => l.key === 'walk')?.kind).toBe(DAY_LINE.excursion)
  })

  it('shows only shortlisted and done ideas, a done one ticked', () => {
    const ideas = [
      idea('short', 'shortlisted', '2026-07-13'),
      idea('done', 'done', '2026-07-13'),
      idea('dropped', 'dropped', '2026-07-13'),
      idea('undecided', 'idea', '2026-07-13'),
    ]
    const lines = dayLines('2026-07-13', input({ ideas }))
    expect(lines.map((l) => [l.key, l.done])).toEqual([
      ['idea:short', false],
      ['idea:done', true],
    ])
  })

  it('reads a time without a usable form as none', () => {
    const lines = dayLines('2026-07-13', input({ entries: [entry('odd', '2026-07-13', '25:00')] }))
    expect(lines[0]?.time).toBeNull()
    expect(isPlanTime('09:30')).toBe(true)
    expect(isPlanTime('9:30')).toBe(false)
  })

  it('stands a multi-day excursion on each of its days, naming start and return', () => {
    const tour = line('tour', 'excursion', '2026-07-12', '2026-07-14')
    const spans = ['2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15'].map(
      (day) => dayLines(day, input({ lines: [tour] })).find((l) => l.key === 'tour')?.span,
    )
    expect(spans).toEqual(['start', null, 'return', undefined])
  })

  it('counts each day’s lines for the strip', () => {
    const counts = dayCounts(tripDays(TRIP), input({ entries: [entry('e', '2026-07-13', null)] }))
    expect([...counts.values()]).toEqual([1, 1, 0, 1])
  })
})

describe('stateAfterTick', () => {
  it('ticks an idea done and unticks it back onto the shortlist', () => {
    expect(stateAfterTick(false)).toBe('done')
    expect(stateAfterTick(true)).toBe('shortlisted')
  })
})

describe('a connection on the plan (FR-29.18)', () => {
  const leg = {
    from: 'Olbia',
    to: 'Nuoro',
    dep: '2026-07-13T09:15',
    arr: '2026-07-13T11:05',
    line: '9',
  }
  const connection: DayEntry = {
    ...entry('c', '2026-07-13', '09:15'),
    kind: DAY_ENTRY_CONNECTION,
    legs: [leg],
  }

  it('stands at its first departure as a line of its own kind', () => {
    const lines = dayLines(
      '2026-07-13',
      input({ entries: [entry('e', '2026-07-13', '10:00'), connection] }),
    )
    expect(lines.map((l) => [l.kind, l.time])).toEqual([
      [DAY_LINE.connection, '09:15'],
      [DAY_LINE.entry, '10:00'],
    ])
  })

  it('reads as a free entry where its legs could not be read', () => {
    const broken = { ...connection, legs: null }
    expect(dayLines('2026-07-13', input({ entries: [broken] }))[0]?.kind).toBe(DAY_LINE.entry)
  })

  it('lists entries on a day the trip does not have, by day and time', () => {
    const entries = [
      entry('later', '2026-07-20', null),
      entry('in', '2026-07-13', null),
      { ...connection, id: 'before', on_date: '2026-07-11', at_time: '18:00' },
      entry('beforeEarly', '2026-07-11', '07:00'),
    ]
    expect(entriesOutsideTrip(entries, tripDays(TRIP)).map((e) => e.id)).toEqual([
      'beforeEarly',
      'before',
      'later',
    ])
  })
})
