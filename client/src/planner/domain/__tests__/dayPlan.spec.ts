/** FR-29.14/FR-29.15: the day plan's days, its pool and one day's timeline. */
import { describe, expect, it } from 'vitest'

import type { DayPlanLine } from '@/domain/shared/dayPlanLine'
import type { Traveler } from '@/types/domain'
import type { DayEntry, DayEntryTraveler, Idea, IdeaState } from '../../types'
import { DAY_ENTRY_CONNECTION, DAY_ENTRY_NOTE } from '../../types'
import {
  DAY_LINE,
  MAX_PLAN_DAYS,
  concerns,
  dayCounts,
  openingFilter,
  dayLines,
  dayHoldsNothing,
  openingDayHoldsNothing,
  hasPlanDates,
  entriesOutsideTrip,
  ideasOutsideTrip,
  ideasWithExcursion,
  isPlanTime,
  linesAhead,
  openingDay,
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
  return {
    trip: TRIP,
    ideas: [],
    entries: [],
    lines: [],
    travelers: [],
    entryTravelers: [],
    ...over,
  }
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
  describe('the lines that concern some travellers', () => {
    const roster: Traveler[] = [
      { id: 'tr-andy', trip_id: 't1', name: 'Andy', linked_user_id: 'u-andy' },
      { id: 'tr-sia', trip_id: 't1', name: 'Sia', linked_user_id: 'u-sia' },
      { id: 'tr-leo', trip_id: 't1', name: 'Leonardo', linked_user_id: null },
    ]
    const forEntry = (entryId: string, travelerId: string): DayEntryTraveler => ({
      id: `${entryId}-${travelerId}`,
      trip_id: 't1',
      day_entry_id: entryId,
      traveler_id: travelerId,
    })
    const day = input({
      travelers: roster,
      entries: [
        entry('kids', '2026-07-13', '09:00'),
        entry('hair', '2026-07-13', '10:30'),
        entry('all', '2026-07-13', '12:00'),
        { ...entry('way', '2026-07-13', '13:10'), excursion_id: 'hut', excursion_role: 'out' },
      ],
      entryTravelers: [forEntry('kids', 'tr-leo'), forEntry('hair', 'tr-sia')],
      lines: [
        {
          ...line('excursion:hut', 'excursion', '2026-07-13'),
          refId: 'hut',
          travelerIds: ['tr-andy', 'tr-sia'],
        },
        { ...line('task:mine', 'task', '2026-07-13'), assignee: 'u-andy' },
        { ...line('task:open', 'task', '2026-07-13'), assignee: null },
        { ...line('meal:dinner', 'meal', '2026-07-13'), assignee: 'u-sia' },
      ],
      ideas: [idea('lake', 'shortlisted', '2026-07-13')],
    })
    const keys = (chosen: string[] | null) =>
      dayLines('2026-07-13', day)
        .filter((l) => concerns(l, chosen, roster))
        .map((l) => l.key)
        .sort()

    it('keeps every line while nobody is chosen', () => {
      expect(keys(null)).toHaveLength(9)
    })

    it('keeps what is for a chosen person or for everybody, and an excursion they go on with its way there', () => {
      expect(keys(['tr-sia'])).toEqual(
        [
          'entry:all',
          'entry:hair',
          'entry:way',
          'excursion:hut',
          'idea:lake',
          'meal:dinner',
          'task:open',
        ].sort(),
      )
    })

    it('keeps a task assigned to a chosen person’s account, and none assigned to another’s', () => {
      expect(keys(['tr-andy'])).toContain('task:mine')
      expect(keys(['tr-leo'])).not.toContain('task:mine')
      expect(keys(['tr-leo'])).toContain('task:open')
    })

    it('keeps what concerns any of several chosen', () => {
      const both = keys(['tr-sia', 'tr-leo'])
      expect(both).toContain('entry:kids')
      expect(both).toContain('entry:hair')
      expect(both).not.toContain('task:mine')
    })

    it('counts only the lines that concern the chosen on the strip', () => {
      expect(dayCounts(['2026-07-13'], day, ['tr-leo']).get('2026-07-13')).toBe(5)
      expect(dayCounts(['2026-07-13'], day).get('2026-07-13')).toBe(9)
    })
  })

  describe('the filter a day plan opens with', () => {
    const roster: Traveler[] = [
      { id: 'tr-andy', trip_id: 't1', name: 'Andy', linked_user_id: 'u-andy' },
      { id: 'tr-sia', trip_id: 't1', name: 'Sia', linked_user_id: null },
      { id: 'tr-leo', trip_id: 't1', name: 'Leonardo', linked_user_id: null },
    ]

    it('is the remembered choice, without anyone no longer on the trip', () => {
      expect(openingFilter(['tr-leo', 'tr-gone'], roster, 'u-andy')).toEqual(['tr-leo'])
      expect(openingFilter(null, roster, 'u-andy')).toBeNull()
    })

    it('is the traveller linked to me the first time, and everybody without one', () => {
      expect(openingFilter(undefined, roster, 'u-andy')).toEqual(['tr-andy'])
      expect(openingFilter(undefined, roster, null)).toBeNull()
      expect(openingFilter(undefined, roster, 'u-other')).toBeNull()
    })

    it('is everybody on a trip of one, and where nobody remembered is left', () => {
      expect(openingFilter(undefined, roster.slice(0, 1), 'u-andy')).toBeNull()
      expect(openingFilter(['tr-gone'], roster, 'u-andy')).toBeNull()
    })
  })

  describe('whom a line is for', () => {
    const roster: Traveler[] = ['Andy', 'Sia', 'Leonardo'].map((name) => ({
      id: `tr-${name}`,
      trip_id: 't1',
      name,
      linked_user_id: null,
    }))
    const named = (entryId: string, ...names: string[]): DayEntryTraveler[] =>
      names.map((name) => ({
        id: `${entryId}-${name}`,
        trip_id: 't1',
        day_entry_id: entryId,
        traveler_id: `tr-${name}`,
      }))
    const whom = (over: Partial<DayInput>) =>
      dayLines('2026-07-13', input({ travelers: roster, ...over })).map((l) => [l.key, l.who])

    it('names an entry’s people in roster order, and nobody for one that names none', () => {
      expect(
        whom({
          entries: [entry('a', '2026-07-13', '09:00'), entry('b', '2026-07-13', '10:00')],
          entryTravelers: named('a', 'Leonardo', 'Sia'),
        }),
      ).toEqual([
        ['entry:a', ['Sia', 'Leonardo']],
        ['entry:b', null],
      ])
    })

    it('says nobody where every traveller is named — that is everybody', () => {
      expect(
        whom({
          entries: [entry('a', '2026-07-13', '09:00')],
          entryTravelers: named('a', 'Andy', 'Sia', 'Leonardo'),
        }),
      ).toEqual([['entry:a', null]])
    })

    it('forgets a name no longer on the trip, and says nobody where none is left', () => {
      expect(
        whom({
          entries: [entry('a', '2026-07-13', '09:00'), entry('b', '2026-07-13', '10:00')],
          entryTravelers: [
            ...named('a', 'Sia'),
            { id: 'x', trip_id: 't1', day_entry_id: 'a', traveler_id: 'tr-gone' },
            { id: 'y', trip_id: 't1', day_entry_id: 'b', traveler_id: 'tr-gone' },
          ],
        }),
      ).toEqual([
        ['entry:a', ['Sia']],
        ['entry:b', null],
      ])
    })

    it('names who goes on an excursion narrowed to some (FR-31.3)', () => {
      expect(
        whom({
          lines: [{ ...line('excursion:e', 'excursion', '2026-07-13'), travelerIds: ['tr-Andy'] }],
        }),
      ).toEqual([['excursion:e', ['Andy']]])
    })
  })

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

describe('dayHoldsNothing — where a trip under way opens (FR-29.7)', () => {
  it('counts a day with only its arrival or departure as holding nothing', () => {
    expect(dayHoldsNothing('2026-07-12', input())).toBe(true)
    expect(dayHoldsNothing('2026-07-15', input())).toBe(true)
  })

  it('counts an idea, an entry or a dated line on the day, done or not', () => {
    const day = '2026-07-13'
    expect(dayHoldsNothing(day, input({ ideas: [idea('i1', 'done', day)] }))).toBe(false)
    expect(dayHoldsNothing(day, input({ entries: [entry('e1', day, null)] }))).toBe(false)
    expect(dayHoldsNothing(day, input({ lines: [line('task:1', 'task', day)] }))).toBe(false)
  })

  it('does not count what stands on another day', () => {
    const plan = input({ entries: [entry('e1', '2026-07-14', null)] })
    expect(dayHoldsNothing('2026-07-13', plan)).toBe(true)
  })

  it('asks about the first day of a trip started early, the day the plan opens on', () => {
    const plan = input({ entries: [entry('e1', '2026-07-12', null)] })
    expect(openingDayHoldsNothing('2026-07-10', plan)).toBe(false)
    expect(openingDayHoldsNothing('2026-07-10', input())).toBe(true)
    expect(openingDayHoldsNothing('2026-07-13', plan)).toBe(true)
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

  it('is told by its legs, not its kind — two devices merged field by field may disagree', () => {
    const merged: DayEntry = { ...connection, kind: DAY_ENTRY_NOTE }
    const taken: DayEntry = { ...connection, id: 'taken', legs: null }
    const kinds = dayLines('2026-07-13', input({ entries: [merged, taken] })).map((l) => l.kind)
    expect(kinds).toEqual([DAY_LINE.connection, DAY_LINE.entry])
  })

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

describe("linesAhead — the dashboard's Heute card (FR-29.7)", () => {
  const day = '2026-07-12'
  const leg = { from: 'Olbia', to: 'Nuoro', dep: `${day}T09:15`, arr: `${day}T11:05`, line: '9' }
  const train: DayEntry = {
    ...entry('train', day, '09:15'),
    kind: DAY_ENTRY_CONNECTION,
    legs: [leg],
  }
  const lines = dayLines(
    day,
    input({
      entries: [entry('breakfast', day, '08:00'), entry('table', day, '12:30'), train],
      ideas: [idea('beach', 'shortlisted', day)],
    }),
  )
  const titles = (now: string) => linesAhead(day, lines, now).map((l) => l.key)

  it('leaves out arrival and departure, which the hero says already', () => {
    expect(lines.some((l) => l.kind === DAY_LINE.arrival)).toBe(true)
    expect(linesAhead(day, lines, '00:00').some((l) => l.kind === DAY_LINE.arrival)).toBe(false)
  })

  it('drops a timed line once its time has passed, keeping the untimed all day', () => {
    expect(titles('07:59')).toEqual(['entry:breakfast', 'entry:train', 'entry:table', 'idea:beach'])
    expect(titles('08:01')).toEqual(['entry:train', 'entry:table', 'idea:beach'])
    expect(titles('23:59')).toEqual(['idea:beach'])
  })

  it('keeps a connection until its last leg has arrived', () => {
    expect(titles('10:00')).toContain('entry:train')
    expect(titles('11:05')).toContain('entry:train')
    expect(titles('11:06')).not.toContain('entry:train')
  })

  it('keeps a night train that arrives on the next day', () => {
    const night: DayEntry = { ...train, legs: [{ ...leg, arr: '2026-07-13T06:00' }] }
    const withNight = dayLines(day, input({ entries: [night] }))
    expect(linesAhead(day, withNight, '23:30').map((l) => l.key)).toEqual(['entry:train'])
  })
})

describe('an idea and the excursion made from it (FR-29.13, FR-29.15)', () => {
  const made = (): DayPlanLine => ({
    ...line('excursion:e1', 'excursion', '2026-07-13'),
    refId: 'e1',
    ideaId: 'i1',
  })

  it('stands as the excursion’s one line, at the idea’s time, the idea having none of its own', () => {
    const lines = dayLines(
      '2026-07-13',
      input({ ideas: [idea('i1', 'shortlisted', '2026-07-13', '09:30')], lines: [made()] }),
    )
    expect(lines.map((l) => l.kind)).toEqual([DAY_LINE.excursion])
    expect(lines[0]!.time).toBe('09:30')
    expect(lines[0]!.origin?.id).toBe('i1')
  })

  it('shows the idea’s line no more on a day the excursion is not on', () => {
    const lines = dayLines(
      '2026-07-14',
      input({ ideas: [idea('i1', 'shortlisted', '2026-07-14')], lines: [made()] }),
    )
    expect(lines).toEqual([])
  })

  it('leaves an idea without an excursion as it was', () => {
    const lines = dayLines(
      '2026-07-13',
      input({ ideas: [idea('i2', 'shortlisted', '2026-07-13')], lines: [made()] }),
    )
    expect(lines.map((l) => l.kind)).toEqual([DAY_LINE.excursion, DAY_LINE.idea])
  })

  it('keeps the idea out of the pool and out of the days outside the trip', () => {
    const lines = [made()]
    const withExcursion = ideasWithExcursion(lines)
    const ideas = [idea('i1', 'shortlisted', null), idea('i3', 'shortlisted', null)]
    expect(unplannedIdeas(ideas, withExcursion).map((i) => i.id)).toEqual(['i3'])
    const late = [idea('i1', 'shortlisted', '2026-08-01')]
    expect(ideasOutsideTrip(late, tripDays(TRIP), withExcursion)).toEqual([])
  })

  it('names the excursion on a connection that belongs to it', () => {
    const connection: DayEntry = {
      ...entry('c1', '2026-07-13', '08:00'),
      kind: DAY_ENTRY_CONNECTION,
      legs: [
        { from: 'A', to: 'B', dep: '2026-07-13T08:00', arr: '2026-07-13T09:00', line: 'IC 1' },
      ],
      excursion_id: 'e1',
    }
    const lines = dayLines('2026-07-13', input({ entries: [connection], lines: [made()] }))
    const row = lines.find((l) => l.kind === DAY_LINE.connection)
    expect(row?.excursion?.refId).toBe('e1')
  })
})

describe('an excursion between its ways there and back (FR-29.15, FR-29.18)', () => {
  const lej = (): DayPlanLine => ({
    ...line('excursion:e1', 'excursion', '2026-07-13'),
    refId: 'e1',
  })
  const way = (id: string, role: 'out' | 'back', dep: string, arr: string): DayEntry => ({
    ...entry(id, '2026-07-13', dep),
    kind: DAY_ENTRY_CONNECTION,
    legs: [
      { from: 'A', to: 'B', dep: `2026-07-13T${dep}`, arr: `2026-07-13T${arr}`, line: 'RE 3' },
    ],
    excursion_id: 'e1',
    excursion_role: role,
  })
  const lunch = entry('n1', '2026-07-13', '12:00')
  const keys = (entries: DayEntry[]) =>
    dayLines('2026-07-13', input({ entries, lines: [lej()] })).map((l) => l.key)

  it('stands between the way there and the way back, whatever else the day holds', () => {
    expect(
      keys([way('out', 'out', '08:06', '08:34'), lunch, way('back', 'back', '16:23', '17:02')]),
    ).toEqual(['entry:out', 'excursion:e1', 'entry:n1', 'entry:back'])
  })

  it('follows the way there where there is no way back', () => {
    expect(keys([lunch, way('out', 'out', '08:06', '08:34')])).toEqual([
      'entry:out',
      'excursion:e1',
      'entry:n1',
    ])
  })

  it('goes before the way back where there is no way there', () => {
    expect(keys([lunch, way('back', 'back', '16:23', '17:02')])).toEqual([
      'entry:n1',
      'excursion:e1',
      'entry:back',
    ])
  })

  it('keeps its place among the untimed where it has no way', () => {
    expect(keys([lunch])).toEqual(['entry:n1', 'excursion:e1'])
  })
})

describe('a meal on the plan (FR-33.5)', () => {
  const day = '2026-07-13'
  const meal = (key: string, time: string | null, placeAt: string): DayPlanLine => ({
    ...line(key, 'meal', day),
    time,
    placeAt,
    timeWord: 'dinner',
  })

  it('stands at its own time when it has one', () => {
    const lines = dayLines(day, input({ lines: [meal('meal:m1', '19:30', '18:30')] }))
    expect(lines[0]).toMatchObject({ kind: DAY_LINE.meal, time: '19:30' })
  })

  it('stands at its slot’s place without a time, among the timed lines, before the untimed', () => {
    const lines = dayLines(
      day,
      input({
        entries: [
          entry('late', day, '20:00'),
          entry('early', day, '10:00'),
          entry('loose', day, null),
        ],
        lines: [meal('meal:dinner', null, '18:30')],
      }),
    )
    expect(lines.map((l) => l.key)).toEqual([
      'entry:early',
      'meal:dinner',
      'entry:late',
      'entry:loose',
    ])
    expect(lines[1]).toMatchObject({ time: null, placeAt: '18:30' })
  })

  it('is left to the dashboard’s own meal block, not the Heute card (FR-33.7)', () => {
    const lines = dayLines(day, input({ lines: [meal('meal:m1', '19:30', '18:30')] }))
    expect(linesAhead(day, lines, '08:00')).toEqual([])
  })
})
