import { describe, expect, it } from 'vitest'

import { addDays, dayNumber, daysBetween, daysOf } from '../calendar'

describe('addDays', () => {
  it.each([
    { from: '2026-07-08', n: 1, want: '2026-07-09' },
    { from: '2026-07-31', n: 1, want: '2026-08-01' },
    { from: '2026-03-01', n: -1, want: '2026-02-28' },
    { from: '2026-12-31', n: 1, want: '2027-01-01' },
    { from: '2028-02-28', n: 1, want: '2028-02-29' },
    // The DST switch in Europe: a day stays a day.
    { from: '2026-03-28', n: 2, want: '2026-03-30' },
  ])('moves $from by $n to $want', ({ from, n, want }) => {
    expect(addDays(from, n)).toBe(want)
  })
})

describe('dayNumber', () => {
  it('counts whole days, so neighbours are one apart across the clock change', () => {
    expect(dayNumber('2026-03-30')! - dayNumber('2026-03-29')!).toBe(1)
    expect(dayNumber('2026-10-26')! - dayNumber('2026-07-08')!).toBe(
      daysBetween('2026-07-08', '2026-10-26'),
    )
  })

  it('reads the day of a timestamp, not its hour', () => {
    expect(dayNumber('2026-07-08T23:30:00Z')).toBe(dayNumber('2026-07-08'))
  })

  it.each(['', 'not-a-date', '08.07.2026', '2026-7-8'])('reads no day from %j', (text) => {
    expect(dayNumber(text)).toBeNull()
  })
})

describe('daysBetween', () => {
  it.each([
    ['2026-07-08', 0],
    ['2026-07-09', 1],
    ['2026-07-01', -7],
    ['2026-08-01', 24],
    // Across the October clock change: still whole days.
    ['2026-10-26', 110],
  ])('%s is %d days from 2026-07-08', (day, want) => {
    expect(daysBetween('2026-07-08', day)).toBe(want)
  })
})

describe('daysOf', () => {
  it('lists every day from the first to the last, across a month and a year end', () => {
    expect(daysOf('2026-12-30', '2027-01-02', 10)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ])
  })

  it.each([
    ['no start', null, '2026-07-15'],
    ['no end', '2026-07-12', null],
    ['the end before the start', '2026-07-15', '2026-07-12'],
  ])('is empty with %s', (_name, start, end) => {
    expect(daysOf(start, end, 10)).toEqual([])
  })

  it('stops at the cap for a mistyped year', () => {
    expect(daysOf('2026-01-01', '2036-01-01', 120)).toHaveLength(120)
  })
})
