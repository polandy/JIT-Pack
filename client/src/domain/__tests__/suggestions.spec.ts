import { describe, it, expect } from 'vitest'
import { suggestQuantities, type HistoryTrip } from '../suggestions'

// FR-14.2: duration-normalized median of the last three series trips, so
// M3 step 4 can offer a one-tap default per item.

function trip(
  id: string,
  endDate: string,
  durationDays: number,
  items: [string, number][],
): HistoryTrip {
  return {
    id,
    endDate,
    durationDays,
    items: items.map(([sourceItemId, quantity]) => ({ sourceItemId, quantity })),
  }
}

describe('suggestQuantities', () => {
  it('takes the median of raw quantities when durations match the target', () => {
    const trips = [
      trip('a', '2024-07-10', 7, [['socks', 5]]),
      trip('b', '2025-07-10', 7, [['socks', 6]]),
    ]
    const s = suggestQuantities(trips, 7).get('socks')!
    // median(5,6) = 5.5 → 6, matching the UI-spec example.
    expect(s.suggested).toBe(6)
    expect(s.history).toEqual([
      { year: '2024', quantity: 5 },
      { year: '2025', quantity: 6 },
    ])
  })

  it('normalizes by duration and rescales to the target', () => {
    // 10 pairs over 5 days = 2/day; the 10-day trip should suggest ~20.
    const trips = [trip('a', '2025-01-10', 5, [['underwear', 10]])]
    expect(suggestQuantities(trips, 10).get('underwear')!.suggested).toBe(20)
  })

  it('keeps only the three most recent trips', () => {
    const trips = [
      trip('old', '2021-07-10', 7, [['x', 1]]),
      trip('a', '2023-07-10', 7, [['x', 6]]),
      trip('b', '2024-07-10', 7, [['x', 6]]),
      trip('c', '2025-07-10', 7, [['x', 6]]),
    ]
    const s = suggestQuantities(trips, 7).get('x')!
    // The lone '1' from 2021 is dropped, so the median stays 6.
    expect(s.suggested).toBe(6)
    expect(s.history).toHaveLength(3)
  })

  it('never suggests below 1 for an item that was on past lists', () => {
    // A single fixed item across a much longer target still stays 1.
    const trips = [trip('a', '2025-01-10', 30, [['passport', 1]])]
    expect(suggestQuantities(trips, 3).get('passport')!.suggested).toBe(1)
  })

  it('has no entry for an item without history', () => {
    const trips = [trip('a', '2025-01-10', 7, [['socks', 5]])]
    expect(suggestQuantities(trips, 7).has('boots')).toBe(false)
  })
})
