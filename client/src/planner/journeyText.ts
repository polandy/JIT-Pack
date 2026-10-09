/**
 * An excursion's way there and back in words (FR-29.18) — `dayLineText.ts`'s
 * arrangement: the rule is `domain/journey.ts`'s, this file only names it.
 */
import { t } from '@/i18n'
import type { DayEntry } from './types'
import { connectionSummary } from './domain/connections'
import { journeyTimes, type ExcursionJourney, type JourneyBudget } from './domain/journey'

/** Slack below this reads as tight. */
const TIGHT_SLACK_MIN = 60

/** „7 h 49", or „25 min" under an hour — timetable minutes, not rounded. */
export function journeyDuration(minutes: number): string {
  if (minutes < 60) return t('journey.minutes', { m: minutes })
  return t('journey.hours', {
    h: Math.floor(minutes / 60),
    m: String(minutes % 60).padStart(2, '0'),
  })
}

/** A way in *Der Tag*: *„08:06 Spiez → 08:34 Kandersteg"* over *„RE · direkt"*. */
export function wayWords(entry: DayEntry): { title: string; detail: string | null } {
  const legs = entry.legs ?? []
  const times = journeyTimes(entry)
  if (legs.length === 0) return { title: `${times.dep} ${entry.title}`, detail: null }
  const first = legs[0]!
  const last = legs[legs.length - 1]!
  const summary = connectionSummary(legs)
  const changes =
    summary.transfers > 0 ? t('dayPlan.transfers', { n: summary.transfers }) : t('dayPlan.direct')
  return {
    title: `${times.dep} ${first.from} → ${times.arr} ${last.to}`,
    detail: summary.lines.length > 0 ? `${summary.lines.join(', ')} · ${changes}` : null,
  }
}

/** What the route leaves, alone: *„4 h 24 Luft"* / *„20 min zu wenig"*; null where nothing is known. */
function slackWords(budget: JourneyBudget | null): string | null {
  if (!budget || budget.kind !== 'onSite' || budget.slackMinutes === null) return null
  return budget.slackMinutes < 0
    ? t('journey.shortAlone', { missing: journeyDuration(-budget.slackMinutes) })
    : t('journey.slackAlone', { slack: journeyDuration(budget.slackMinutes) })
}

/**
 * *Der Tag* folded to one line: *„08:06 → 3.3 km · ↑ 300 m → 16:23 · 4 h 24
 * Luft"* — the departures around the route, and what the route leaves.
 */
export function daySummary(
  journey: ExcursionJourney,
  route: string | null,
  budget: JourneyBudget | null,
): string {
  const sequence = [
    journey.out ? journeyTimes(journey.out).dep : null,
    route,
    journey.back ? journeyTimes(journey.back).dep : null,
  ].filter((part): part is string => !!part)
  return [sequence.join(' → '), slackWords(budget)].filter((part) => !!part).join(' · ')
}

/** How the budget's verdict is toned. */
export type BudgetTone = 'ok' | 'tight' | 'short' | null

/** The budget's line, and the tone of its verdict. */
export function budgetWords(budget: JourneyBudget): { text: string; tone: BudgetTone } {
  if (budget.kind === 'earliestBack') {
    return {
      text: t('journey.earliestBack', {
        arrival: budget.arrival,
        route: journeyDuration(budget.routeMinutes),
        time: budget.earliestBack,
      }),
      tone: null,
    }
  }
  const onSite = t('journey.onSite', { time: journeyDuration(budget.onSiteMinutes) })
  if (budget.routeMinutes === null || budget.slackMinutes === null)
    return { text: onSite, tone: null }
  const route = journeyDuration(budget.routeMinutes)
  const verdict =
    budget.slackMinutes < 0
      ? t('journey.short', { route, missing: journeyDuration(-budget.slackMinutes) })
      : t('journey.slack', { route, slack: journeyDuration(budget.slackMinutes) })
  return {
    text: `${onSite} · ${verdict}`,
    tone:
      budget.slackMinutes < 0 ? 'short' : budget.slackMinutes < TIGHT_SLACK_MIN ? 'tight' : 'ok',
  }
}

/** M27's line under an excursion: *„08:06 hin · 16:23 zurück"*; null with neither way. */
export function journeyLine(journey: ExcursionJourney): string | null {
  const parts = [
    journey.out ? t('journey.listOut', { time: journeyTimes(journey.out).dep }) : null,
    journey.back ? t('journey.listBack', { time: journeyTimes(journey.back).dep }) : null,
  ].filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join(' · ') : null
}
