/**
 * Ordering trips in time when time is only partly known (FR-2.1b).
 *
 * A trip requires nothing but its year, so every chronological sort needs
 * a key that survives a missing date instead of comparing `undefined` —
 * which sorted "Samedan 2027" wherever the engine happened to put it.
 */
export interface TripWhen {
  year: number
  start_date: string | null
  end_date: string | null
}

/**
 * An ISO-shaped, lexically sortable key: the start date where there is
 * one, else the end date, else the year alone.
 *
 * A year-only trip lands at the *start* of its year, so in M2's
 * newest-first list it follows that year's dated trips. Any position
 * inside the year would be defensible; what matters is that it is
 * predictable rather than whatever order the engine happened to produce
 * when the key was `undefined`.
 */
export function tripOrderKey(trip: TripWhen): string {
  return trip.start_date ?? trip.end_date ?? `${trip.year}-00-00`
}
