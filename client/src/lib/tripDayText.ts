/**
 * The words of the dashboard's phase and day counter (FR-7.10).
 *
 * The rule is `domain/tripDay.ts`; what lives here is the sentence, because a
 * sentence is a presentation choice and needs the active locale.
 */
import type { TripDay } from '@/domain/tripDay'
import { t } from '@/i18n'

/** The counter's two lines; `sub` is the quieter one under it, when there is one. */
export interface DayText {
  headline: string
  sub: string | null
}

/** dayText words a `TripDay`; null where the counter says nothing. */
export function dayText(day: TripDay): DayText | null {
  switch (day.kind) {
    case 'before':
      return { headline: t('dashboard.dayBefore', { n: day.daysUntil }), sub: null }
    case 'first':
      return { headline: t('dashboard.dayFirst'), sub: null }
    case 'last':
      return { headline: t('dashboard.dayLast'), sub: null }
    case 'during':
      return day.total === null
        ? { headline: t('dashboard.dayOpenEnded', { day: day.day }), sub: null }
        : {
            headline: t('dashboard.dayOf', { day: day.day, total: day.total }),
            sub: t('dashboard.dayRemaining', { n: day.remaining ?? 0 }),
          }
    default:
      return null
  }
}

/** The phase word after the dates: the bag is either still being packed or shut. */
export function phaseWord(packingClosed: boolean): string {
  return t(packingClosed ? 'dashboard.phaseOnSite' : 'dashboard.phasePacking')
}
