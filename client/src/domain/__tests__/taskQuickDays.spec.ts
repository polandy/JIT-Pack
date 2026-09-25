import { describe, expect, it } from 'vitest'

import {
  QUICK_DAY_BEFORE_DEPARTURE,
  QUICK_DAY_TODAY,
  QUICK_DAY_TOMORROW,
  addDays,
  quickDueDays,
} from '../taskQuickDays'
import { TASK_PHASE_BEFORE, TASK_PHASE_DURING, type TaskPhase } from '@/types/domain'

const TODAY = '2026-07-08'

describe('addDays', () => {
  it.each([
    { from: '2026-07-08', n: 1, want: '2026-07-09' },
    { from: '2026-07-31', n: 1, want: '2026-08-01' },
    { from: '2026-03-01', n: -1, want: '2026-02-28' },
    { from: '2026-12-31', n: 1, want: '2027-01-01' },
    // The DST switch in Europe: a day stays a day.
    { from: '2026-03-28', n: 2, want: '2026-03-30' },
  ])('moves $from by $n to $want', ({ from, n, want }) => {
    expect(addDays(from, n)).toBe(want)
  })
})

describe('quickDueDays (FR-7.14)', () => {
  const keys = (days: { key: string }[]) => days.map((d) => d.key)

  it('offers today, tomorrow and the eve of departure for a task before the trip', () => {
    const days = quickDueDays(TODAY, { phase: TASK_PHASE_BEFORE, tripStart: '2026-07-20' })
    expect(days).toEqual([
      { key: QUICK_DAY_TODAY, day: TODAY },
      { key: QUICK_DAY_TOMORROW, day: '2026-07-09' },
      { key: QUICK_DAY_BEFORE_DEPARTURE, day: '2026-07-19' },
    ])
  })

  it.each([
    { name: 'a task for the road', phase: TASK_PHASE_DURING, start: '2026-07-20' },
    { name: 'a mixed selection', phase: null, start: '2026-07-20' },
    { name: 'a trip without a start', phase: TASK_PHASE_BEFORE, start: null },
    { name: 'a departure whose eve is tomorrow', phase: TASK_PHASE_BEFORE, start: '2026-07-10' },
    { name: 'a trip already under way', phase: TASK_PHASE_BEFORE, start: '2026-07-01' },
  ])('offers no eve of departure for $name', ({ phase, start }) => {
    expect(
      keys(quickDueDays(TODAY, { phase: phase as TaskPhase | null, tripStart: start })),
    ).toEqual([QUICK_DAY_TODAY, QUICK_DAY_TOMORROW])
  })
})
