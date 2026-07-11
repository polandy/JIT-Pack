/**
 * Smart quantity suggestions (Addendum FR-14.2): the duration-normalized
 * median of the last three trips in a series. M3 step 4 offers the result
 * as a one-tap default per item.
 *
 * Computed client-side from synced series trips — like generation,
 * analytics and review — so it works in Local Mode with no server call
 * (this supersedes the planned GET /suggestions/trips/{id} endpoint).
 */

export interface HistoryTrip {
  id: string
  /** ISO end date — used to order trips and label the history hint. */
  endDate: string
  /** Trip length in days, at least 1. */
  durationDays: number
  items: { sourceItemId: string; quantity: number }[]
}

export interface QuantitySuggestion {
  /** The proposed default quantity (>= 1). */
  suggested: number
  /** Per-trip context for the "2024: 5 · 2025: 6" hint, oldest first. */
  history: { year: string; quantity: number }[]
}

const HISTORY_TRIPS = 3

/** suggestQuantities maps each master item id seen in the last three
 * series trips to a suggestion. Each historical quantity is normalized to
 * a per-day rate, the median is taken, and it is rescaled to the target
 * duration — so a longer trip proposes proportionally more of the things
 * that scale, while fixed one-offs stay put (never below 1). */
export function suggestQuantities(
  seriesTrips: HistoryTrip[],
  targetDurationDays: number,
): Map<string, QuantitySuggestion> {
  const recent = [...seriesTrips]
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
    .slice(0, HISTORY_TRIPS)

  const target = Math.max(1, targetDurationDays)
  const perItem = new Map<string, { year: string; quantity: number; perDay: number }[]>()

  // Walk oldest-first so the history hint reads chronologically.
  for (const trip of [...recent].reverse()) {
    const days = Math.max(1, trip.durationDays)
    const year = trip.endDate.slice(0, 4)
    for (const { sourceItemId, quantity } of trip.items) {
      if (quantity <= 0) continue
      const entries = perItem.get(sourceItemId) ?? []
      entries.push({ year, quantity, perDay: quantity / days })
      perItem.set(sourceItemId, entries)
    }
  }

  const out = new Map<string, QuantitySuggestion>()
  for (const [itemId, entries] of perItem) {
    const medianPerDay = median(entries.map((e) => e.perDay))
    const suggested = Math.max(1, Math.round(medianPerDay * target))
    out.set(itemId, {
      suggested,
      history: entries.map((e) => ({ year: e.year, quantity: e.quantity })),
    })
  }
  return out
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}
