/**
 * The day plan's lines in words (FR-29.15) — what a line's label, title and
 * second line say, and how a day reads on the strip. `lib/taskDueText.ts`'s
 * arrangement: the rule of what stands on a day is `domain/dayPlan.ts`'s, and
 * this file only names it, since naming reads the catalogue.
 */
import { formatDate, t } from '@/i18n'
import type { NameOf } from '@/lib/rowFacts'
import { localDay } from '@/lib/taskDueText'
import { DAY_LINE, type DayLine } from './domain/dayPlan'

/** What one line says. */
export interface DayLineWords {
  /** The kind, and for a multi-day excursion where on it the day stands. */
  kind: string
  title: string
  /** The line under the title, or null for none. */
  detail: string | null
}

export function dayLineWords(line: DayLine, nameOf: NameOf): DayLineWords {
  const kind = t(`dayPlan.kind.${line.kind}`)
  const span =
    line.span === 'start'
      ? t('dayPlan.spanStart')
      : line.span === 'return'
        ? t('dayPlan.spanReturn')
        : null
  return {
    kind: span ? `${kind} · ${span}` : kind,
    title:
      line.kind === DAY_LINE.arrival
        ? t('dayPlan.arrival')
        : line.kind === DAY_LINE.departure
          ? t('dayPlan.departure')
          : line.title,
    // A task's second line is whose job it is, named the way every screen names a person.
    detail: line.kind === DAY_LINE.task ? nameOf(line.source?.assignee ?? null) : line.detail,
  }
}

/** A strip tile's two halves: „Mi." over „15". */
export function stripDay(day: string): { weekday: string; date: string } {
  const date = localDay(day)
  return {
    weekday: formatDate(date, { weekday: 'short' }),
    date: formatDate(date, { day: 'numeric' }),
  }
}
