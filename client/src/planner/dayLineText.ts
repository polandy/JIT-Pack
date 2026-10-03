/**
 * The day plan's lines in words (FR-29.15) — what a line's label, title and
 * second line say, and how a day reads on the strip. `lib/taskDueText.ts`'s
 * arrangement: the rule of what stands on a day is `domain/dayPlan.ts`'s, and
 * this file only names it, since naming reads the catalogue.
 */
import { formatDate, t } from '@/i18n'
import type { NameOf } from '@/lib/rowFacts'
import { localDay } from '@/lib/taskDueText'
import { EXCURSION_ROLE_BACK, EXCURSION_ROLE_OUT, type ConnectionLeg } from '@/types/domain'
import { connectionSummary } from './domain/connections'
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
  const role = line.entry?.excursion_role
  // FR-29.18: a connection of an excursion says which way it is.
  const kind =
    role === EXCURSION_ROLE_OUT
      ? t('journey.outTitle')
      : role === EXCURSION_ROLE_BACK
        ? t('journey.backTitle')
        : t(`dayPlan.kind.${line.kind}`)
  const span =
    line.span === 'start'
      ? t('dayPlan.spanStart')
      : line.span === 'return'
        ? t('dayPlan.spanReturn')
        : null
  return {
    kind: [kind, span, line.excursion?.title].filter((part) => !!part).join(' · '),
    title:
      line.kind === DAY_LINE.arrival
        ? t('dayPlan.arrival')
        : line.kind === DAY_LINE.departure
          ? t('dayPlan.departure')
          : line.title,
    // A task's second line is whose job it is, named the way every screen names a person.
    detail:
      line.kind === DAY_LINE.task
        ? nameOf(line.source?.assignee ?? null)
        : line.kind === DAY_LINE.connection && line.entry?.legs
          ? connectionDetail(line.entry.legs)
          : line.origin
            ? [t('dayPlan.fromIdea', { title: line.origin.title }), line.detail]
                .filter((part) => !!part)
                .join(' · ')
            : line.detail,
  }
}

/** A connection's second line: *„an 15:46 · RE 3, IC 3, IC 1 · 3× umsteigen"* (FR-29.18). */
export function connectionDetail(legs: readonly ConnectionLeg[]): string {
  const summary = connectionSummary(legs)
  const arrival =
    summary.arrivalDays > 0
      ? t('dayPlan.arrivesLater', { time: summary.arrival, n: summary.arrivalDays })
      : t('dayPlan.arrives', { time: summary.arrival })
  const changes =
    summary.transfers > 0 ? t('dayPlan.transfers', { n: summary.transfers }) : t('dayPlan.direct')
  return [arrival, summary.lines.join(', '), summary.lines.length > 0 ? changes : null]
    .filter((part) => !!part)
    .join(' · ')
}

/** A strip tile's two halves: „Mi." over „15". */
export function stripDay(day: string): { weekday: string; date: string } {
  const date = localDay(day)
  return {
    weekday: formatDate(date, { weekday: 'short' }),
    date: formatDate(date, { day: 'numeric' }),
  }
}
