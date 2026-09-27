import { describe, expect, it } from 'vitest'

import {
  calendarMonths,
  dayRole,
  monthDays,
  outOfBounds,
  tapDay,
  MONTHS_AFTER,
  MONTHS_BEFORE,
} from '../dateRange'

const EMPTY = { start: '', end: '' }
const from = (start: string, end: string, side: 'start' | 'end') => ({
  range: { start, end },
  side,
})

describe('tapDay — a range picked in two taps (G-17, FR-2.1d)', () => {
  it('the first tap sets the start and moves on to the end', () => {
    expect(tapDay({ range: EMPTY, side: 'start' }, '2026-10-09')).toEqual(
      from('2026-10-09', '', 'end'),
    )
  })

  it('a later day closes the range and the next tap is a start again', () => {
    expect(tapDay(from('2026-10-09', '', 'end'), '2026-10-18')).toEqual(
      from('2026-10-09', '2026-10-18', 'start'),
    )
  })

  it('the start tapped again is a one-day range', () => {
    expect(tapDay(from('2026-10-09', '', 'end'), '2026-10-09').range).toEqual({
      start: '2026-10-09',
      end: '2026-10-09',
    })
  })

  it('an end before the start becomes the start, with the end still to come', () => {
    expect(tapDay(from('2026-10-09', '', 'end'), '2026-10-01')).toEqual(
      from('2026-10-01', '', 'end'),
    )
  })

  it('a new start keeps an end it does not pass, so one side can be moved alone', () => {
    expect(tapDay(from('2026-10-09', '2026-10-18', 'start'), '2026-10-11')).toEqual(
      from('2026-10-11', '2026-10-18', 'end'),
    )
  })

  it('a new start past the end drops the end', () => {
    expect(tapDay(from('2026-10-09', '2026-10-18', 'start'), '2026-10-20')).toEqual(
      from('2026-10-20', '', 'end'),
    )
  })

  it('the end side chosen first sets an end alone (FR-2.1b)', () => {
    expect(tapDay({ range: EMPTY, side: 'end' }, '2026-12-31')).toEqual(
      from('', '2026-12-31', 'start'),
    )
  })

  it('the end side moves the end alone', () => {
    expect(tapDay(from('2026-10-09', '2026-10-18', 'end'), '2026-10-19').range).toEqual({
      start: '2026-10-09',
      end: '2026-10-19',
    })
  })
})

describe('dayRole', () => {
  const range = { start: '2026-10-09', end: '2026-10-12' }
  it.each([
    ['2026-10-08', null],
    ['2026-10-09', 'start'],
    ['2026-10-10', 'inside'],
    ['2026-10-12', 'end'],
    ['2026-10-13', null],
  ])('%s is %s', (day, role) => {
    expect(dayRole(range, day)).toBe(role)
  })

  it('a start alone and a one-day range are single', () => {
    expect(dayRole({ start: '2026-10-09', end: '' }, '2026-10-09')).toBe('single')
    expect(dayRole({ start: '2026-10-09', end: '2026-10-09' }, '2026-10-09')).toBe('single')
  })

  it('an end alone, as an older row may hold it, is still marked', () => {
    expect(dayRole({ start: '', end: '2026-10-12' }, '2026-10-12')).toBe('end')
    expect(dayRole({ start: '', end: '2026-10-12' }, '2026-10-11')).toBeNull()
  })
})

describe('outOfBounds', () => {
  it('an empty bound is no bound', () => {
    expect(outOfBounds('1999-01-01', '', '')).toBe(false)
  })
  it('both sides are inclusive', () => {
    expect(outOfBounds('2026-10-09', '2026-10-09', '2026-10-18')).toBe(false)
    expect(outOfBounds('2026-10-18', '2026-10-09', '2026-10-18')).toBe(false)
    expect(outOfBounds('2026-10-08', '2026-10-09', '2026-10-18')).toBe(true)
    expect(outOfBounds('2026-10-19', '2026-10-09', '2026-10-18')).toBe(true)
  })
})

describe('calendarMonths', () => {
  it('two bounds list exactly their months', () => {
    expect(calendarMonths('2026-10-09', '2026-10-09', '2026-11-02')).toEqual([
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
    ])
  })

  it('an open side reaches around the anchor, across a year boundary', () => {
    const months = calendarMonths('2026-02-15', '', '')
    expect(months).toHaveLength(MONTHS_BEFORE + MONTHS_AFTER + 1)
    expect(months[0]).toEqual({ year: 2025, month: 2 })
    expect(months.at(-1)).toEqual({ year: 2028, month: 2 })
  })

  it('one bound replaces only its own side', () => {
    const months = calendarMonths('2026-10-01', '2026-09-20', '')
    expect(months[0]).toEqual({ year: 2026, month: 9 })
    expect(months.at(-1)).toEqual({ year: 2028, month: 10 })
  })

  it('an open side reaches as far as it is asked to', () => {
    const months = calendarMonths('2026-09-27', '', '', { before: 24, after: 0 })
    expect(months[0]).toEqual({ year: 2024, month: 9 })
    expect(months.at(-1)).toEqual({ year: 2026, month: 9 })
  })

  it('bounds the wrong way round still list the months between them', () => {
    expect(calendarMonths('2026-10-01', '2026-11-05', '2026-10-01')).toHaveLength(2)
  })
})

describe('monthDays — Monday first', () => {
  it('October 2026 starts on a Thursday, three empty cells in', () => {
    const { lead, days } = monthDays({ year: 2026, month: 10 })
    expect(lead).toBe(3)
    expect(days).toHaveLength(31)
    expect(days[0]).toBe('2026-10-01')
  })

  it('a month starting on a Sunday has six empty cells, and February counts leap years', () => {
    expect(monthDays({ year: 2026, month: 2 }).lead).toBe(6)
    expect(monthDays({ year: 2028, month: 2 }).days).toHaveLength(29)
  })
})
