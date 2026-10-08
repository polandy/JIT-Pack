/**
 * When an excursion is (FR-31.10) — pure, no I/O, no Vue: ahead, undated or
 * past, its span of days, the order the switcher lists them in, and what is
 * still due — the pill's count and the dashboard's rows. „Today" is the
 * caller's.
 */

import { sumUnits } from './excursionLines'
import { addDays } from './shared/calendar'
import { unitsOf, type PackUnits } from './packState'
import type { Excursion, ExcursionItem } from '@/types/domain'

// --- Time (FR-31.10) ---

/** Where an excursion stands against today. */
export type ExcursionWhen = 'upcoming' | 'undated' | 'past'

/**
 * whenOf places an excursion: past once its last day is before today, upcoming
 * while it is today or ahead, undated while it has no day. A reversed pair is
 * read as its min and max — field-level LWW can leave one (FR-31.1).
 */
export function whenOf(
  excursion: Pick<Excursion, 'starts_on' | 'ends_on'>,
  today: string,
): ExcursionWhen {
  const days = [excursion.starts_on, excursion.ends_on].filter((d): d is string => d !== null)
  if (days.length === 0) return 'undated'
  const last = days.reduce((a, b) => (a > b ? a : b))
  return last < today ? 'past' : 'upcoming'
}

/** The first and last day, ordered, or null for an undated excursion. */
export function spanOf(
  excursion: Pick<Excursion, 'starts_on' | 'ends_on'>,
): { from: string; to: string } | null {
  const days = [excursion.starts_on, excursion.ends_on].filter((d): d is string => d !== null)
  if (days.length === 0) return null
  const sorted = [...days].sort()
  return { from: sorted[0]!, to: sorted[sorted.length - 1]! }
}

/** The list M27 shows: upcoming by first day, then undated by name, then past, latest first. */
export function arrangeExcursions<T extends Pick<Excursion, 'starts_on' | 'ends_on' | 'name'>>(
  excursions: readonly T[],
  today: string,
): { upcoming: T[]; undated: T[]; past: T[] } {
  const upcoming: T[] = []
  const undated: T[] = []
  const past: T[] = []
  for (const e of excursions) {
    const when = whenOf(e, today)
    if (when === 'upcoming') upcoming.push(e)
    else if (when === 'undated') undated.push(e)
    else past.push(e)
  }
  upcoming.sort(
    (a, b) => spanOf(a)!.from.localeCompare(spanOf(b)!.from) || a.name.localeCompare(b.name),
  )
  undated.sort((a, b) => a.name.localeCompare(b.name))
  past.sort((a, b) => spanOf(b)!.to.localeCompare(spanOf(a)!.to) || a.name.localeCompare(b.name))
  return { upcoming, undated, past }
}

/**
 * Whether the dashboard shows an excursion (FR-31.10): the day before it and
 * the day it starts, while it still has something open — the daypack is
 * packed the evening before as often as the morning of.
 */
export function isDueSoon(
  excursion: Pick<Excursion, 'starts_on' | 'ends_on'>,
  lines: readonly ExcursionItem[],
  today: string,
  tomorrow: string,
): boolean {
  const span = spanOf(excursion)
  if (!span || (span.from !== today && span.from !== tomorrow)) return false
  return lines.some((l) => unitsOf(l).done < unitsOf(l).total)
}

/**
 * The count the switcher's pill wears (FR-31.10): excursions still ahead,
 * today's included, with something on their list still to pack or buy. A
 * finished list, a past excursion and one without a day ask for nothing.
 */
export function pendingExcursionCount(
  excursions: readonly Excursion[],
  lines: readonly ExcursionItem[],
  today: string,
): number {
  return excursions.filter(
    (e) =>
      whenOf(e, today) === 'upcoming' &&
      lines.some((l) => l.excursion_id === e.id && unitsOf(l).done < unitsOf(l).total),
  ).length
}

/** One excursion the dashboard shows (FR-31.10). */
export interface DueExcursionRow {
  tripId: string
  tripName: string
  excursion: Excursion
  /** Whether it starts today — else tomorrow. */
  today: boolean
  units: PackUnits
}

/**
 * dueExcursions lists what M1 shows: every trip's excursions starting today or
 * tomorrow that still have something open, today's first.
 */
export function dueExcursions(
  trips: ReadonlyArray<{
    id: string
    name: string
    excursions: readonly Excursion[]
    lines: readonly ExcursionItem[]
  }>,
  today: string,
): DueExcursionRow[] {
  const tomorrow = addDays(today, 1)
  const rows: DueExcursionRow[] = []
  for (const trip of trips) {
    for (const excursion of trip.excursions) {
      const lines = trip.lines.filter((l) => l.excursion_id === excursion.id)
      if (!isDueSoon(excursion, lines, today, tomorrow)) continue
      rows.push({
        tripId: trip.id,
        tripName: trip.name,
        excursion,
        today: spanOf(excursion)!.from === today,
        units: sumUnits(lines),
      })
    }
  }
  return rows.sort(
    (a, b) => Number(b.today) - Number(a.today) || a.excursion.name.localeCompare(b.excursion.name),
  )
}
