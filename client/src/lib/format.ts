/**
 * Shared display formatting. Lives in lib rather than domain: these are
 * presentation choices (units, precision), not packing rules.
 */

import { formatDay, formatDayRange, formatNumber, t } from '@/i18n'

/** formatWeight renders grams as "850 g" below a kilo and "1.2 kg" from there. */
export function formatWeight(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${grams} g`
}

/**
 * formatValue renders `value_cents` as a two-decimal amount in the active
 * locale (UX-11). The instance has no configured currency, so the number
 * stays unit-less on purpose — naming one is an owner decision.
 */
export function formatValue(cents: number): string {
  return formatNumber(cents / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * formatTripPeriod is the one temporal line under a trip's name (UX-5),
 * wherever it appears: a locale-formatted range when both dates are known,
 * "until"/"from" for one, and the bare year when that is all there is
 * (FR-2.1b) — never a fabricated date.
 */
export function formatTripPeriod(trip: {
  year: number
  start_date?: string | null
  end_date?: string | null
}): string {
  if (trip.start_date && trip.end_date) return formatDayRange(trip.start_date, trip.end_date)
  if (trip.end_date) return t('trip.until', { date: formatDay(trip.end_date) })
  if (trip.start_date) return t('trip.from', { date: formatDay(trip.start_date) })
  return String(trip.year)
}
