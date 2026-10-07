import { describe, expect, it } from 'vitest'

import {
  addTallies,
  dueTally,
  isDueByTomorrow,
  isPressingDay,
  pressingGroupsFirst,
  sortByDue,
} from '../dueDay'

// The day arithmetic tasks (FR-7.11) and purchases (FR-30.10) share; the
// four states themselves are pinned through the task wrappers in
// domain/__tests__/taskDue.spec.ts.

const TODAY = '2026-07-08'

describe('the shared due-day rules', () => {
  it('sortByDue leads with the dated, earliest first, and keeps the rest in order', () => {
    const items = [
      { name: 'a', day: null },
      { name: 'b', day: '2026-07-10' },
      { name: 'c', day: null },
      { name: 'd', day: '2026-07-01' },
      { name: 'e', day: '2026-07-10' },
    ]
    expect(sortByDue(items, TODAY, (item) => item.day).map((item) => item.name)).toEqual([
      'd',
      'b',
      'e',
      'a',
      'c',
    ])
  })

  it('pressingGroupsFirst keeps the order inside both halves', () => {
    const groups = ['x', 'Y', 'z', 'W']
    expect(pressingGroupsFirst(groups, (g) => g === g.toUpperCase())).toEqual(['Y', 'W', 'x', 'z'])
  })

  it.each([
    ['2026-07-01', true, true],
    ['2026-07-08', true, true],
    ['2026-07-09', true, true],
    ['2026-07-10', true, false],
    ['2026-07-11', false, false],
    [null, false, false],
  ] as const)('%s: pressing %s, due by tomorrow %s', (day, pressing, byTomorrow) => {
    expect(isPressingDay(day, TODAY)).toBe(pressing)
    expect(isDueByTomorrow(day, TODAY)).toBe(byTomorrow)
  })
})

// M1's due line (FR-7.11, FR-30.10): what is due by tomorrow, and how much of it is late.
describe('dueTally', () => {
  it('counts the days due by tomorrow and, among them, the overdue ones', () => {
    const days = ['2026-07-01', '2026-07-08', '2026-07-09', '2026-07-10', null]
    expect(dueTally(days, TODAY)).toEqual({ due: 3, overdue: 1 })
  })

  it('counts nothing where nothing has a day', () => {
    expect(dueTally([null, null], TODAY)).toEqual({ due: 0, overdue: 0 })
  })

  it('addTallies sums every trip into one', () => {
    expect(
      addTallies([
        { due: 2, overdue: 1 },
        { due: 3, overdue: 0 },
      ]),
    ).toEqual({
      due: 5,
      overdue: 1,
    })
    expect(addTallies([])).toEqual({ due: 0, overdue: 0 })
  })
})
