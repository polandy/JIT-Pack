/**
 * An excursion's days in words (FR-31.10) — „Di., 14.7." for a day hike,
 * „Do., 16.7. – Fr., 17.7." for a hut night. With the weekday, because an
 * excursion is planned by the day of the week the weather allows, and short,
 * because the words sit on one line beside its name.
 */
import { shortDueDay } from './taskDueText'

/** The day or days, or null for an excursion with none yet. */
export function excursionDays(span: { from: string; to: string } | null): string | null {
  if (span === null) return null
  if (span.from === span.to) return shortDueDay(span.from)
  return `${shortDueDay(span.from)} – ${shortDueDay(span.to)}`
}
