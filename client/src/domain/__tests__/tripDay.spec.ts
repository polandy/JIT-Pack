import { describe, expect, it } from 'vitest'

import { hasDeparted, tripDay, taskPhaseInFront } from '../tripDay'
import { TASK_PHASE_BEFORE, TASK_PHASE_DURING } from '@/types/domain'

const trip = { start_date: '2026-10-12', end_date: '2026-10-18' }
/** A local date at an hour, so the spec proves the counter counts days, not hours. */
const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`)

describe('tripDay — FR-7.10 the counter is calendar days', () => {
  it.each([
    ['three days ahead', '2026-10-09', { kind: 'before', daysUntil: 3 }],
    ['the day of departure', '2026-10-12', { kind: 'first' }],
    ['the second day', '2026-10-13', { kind: 'during', day: 2, total: 7, remaining: 5 }],
    ['the day before the last', '2026-10-17', { kind: 'during', day: 6, total: 7, remaining: 1 }],
    ['the last day', '2026-10-18', { kind: 'last' }],
    ['the day after', '2026-10-19', { kind: 'after' }],
  ])('%s', (_name, today, want) => {
    expect(tripDay(trip, at(today))).toEqual(want)
  })

  it('does not change between 23:59 and 00:01 of the same day', () => {
    expect(tripDay(trip, at('2026-10-09', 23))).toEqual(tripDay(trip, at('2026-10-09', 0)))
  })

  it('counts both ends: 12–18 October is seven days', () => {
    const day = tripDay(trip, at('2026-10-14'))
    expect(day).toMatchObject({ kind: 'during', total: 7 })
  })

  it('has nothing to count from without a start date', () => {
    expect(tripDay({ start_date: null, end_date: '2026-10-18' }, at('2026-10-14'))).toEqual({
      kind: 'none',
    })
  })

  it('has no total without an end date, and never ends', () => {
    const open = { start_date: '2026-10-12', end_date: null }
    expect(tripDay(open, at('2026-10-14'))).toEqual({
      kind: 'during',
      day: 3,
      total: null,
      remaining: null,
    })
    expect(tripDay(open, at('2027-01-01'))).toMatchObject({ kind: 'during' })
  })

  it('reads a one-day trip as its departure day, then as over', () => {
    const one = { start_date: '2026-10-12', end_date: '2026-10-12' }
    expect(tripDay(one, at('2026-10-12'))).toEqual({ kind: 'first' })
    expect(tripDay(one, at('2026-10-13'))).toEqual({ kind: 'after' })
  })
})

describe('taskPhaseInFront (FR-7.10): the phase of task the dashboard leads with', () => {
  it.each([
    ['before the start', { kind: 'before', daysUntil: 2 }, TASK_PHASE_BEFORE],
    ['the day of departure', { kind: 'first' }, TASK_PHASE_DURING],
    ['on the road', { kind: 'during', day: 2, total: 7, remaining: 5 }, TASK_PHASE_DURING],
    ['the last day', { kind: 'last' }, TASK_PHASE_DURING],
    ['after the trip', { kind: 'after' }, TASK_PHASE_DURING],
    ['a trip with no start date', { kind: 'none' }, TASK_PHASE_DURING],
  ] as const)('%s', (_name, day, want) => {
    expect(taskPhaseInFront(day)).toBe(want)
  })

  it('FR-7.12: a finished packing closes before, even ahead of the start', () => {
    expect(taskPhaseInFront({ kind: 'before', daysUntil: 2 }, true)).toBe(TASK_PHASE_DURING)
  })
})

describe('hasDeparted (FR-7.14): from the day of departure on, a new task is for the road', () => {
  it.each([
    ['the day before', '2026-10-11', false],
    ['the day of departure', '2026-10-12', true],
    ['on the road', '2026-10-14', true],
    ['after the trip', '2026-10-20', true],
  ] as const)('%s', (_name, today, want) => {
    expect(hasDeparted(trip, today)).toBe(want)
  })

  it('a trip with no start date has not departed: there is no day to have passed', () => {
    expect(hasDeparted({ start_date: null }, '2026-10-14')).toBe(false)
  })
})
