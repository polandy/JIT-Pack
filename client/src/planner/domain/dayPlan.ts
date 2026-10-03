/**
 * The day plan's rules (FR-29.14, FR-29.15) — pure, so Local Mode keeps
 * every one and a spec needs no component to reach them.
 *
 * The plan stores one table of its own (`day_entries`) and reads four others:
 * the planned ideas, the packing side's dated lines (excursions, tasks — see
 * `lib/dayPlanSources.ts`) and the trip's dates for arrival and departure.
 * Which day is shown, what stands on it and in which order is derived here.
 */
import type { DayPlanLine } from '@/lib/dayPlanSources'
import { DAY_PLAN_EXCURSION } from '@/lib/dayPlanSources'
import type { DayEntry, Idea } from '@/types/domain'
import { DAY_ENTRY_CONNECTION, IDEA_STATE_DONE, IDEA_STATE_SHORTLISTED } from '@/types/domain'

/** What one line of the timeline is. */
export const DAY_LINE = {
  arrival: 'arrival',
  departure: 'departure',
  excursion: 'excursion',
  idea: 'idea',
  task: 'task',
  entry: 'entry',
  connection: 'connection',
} as const
export type DayLineKind = (typeof DAY_LINE)[keyof typeof DAY_LINE]

/** Where on a multi-day excursion a day stands. */
export type DaySpan = 'start' | 'return' | null

/** One line of a day's timeline. */
export interface DayLine {
  key: string
  kind: DayLineKind
  /** `HH:MM`, or null for a line without a time. */
  time: string | null
  title: string
  /** The words under the title, where there are any. */
  detail: string | null
  span: DaySpan
  /** Ticked or not; null for a line without a tick. */
  done: boolean | null
  /** An excursion's packed share, 0…1. */
  progress: number | null
  /** What the line stands for — exactly one is set, or none for arrival and departure. */
  idea?: Idea
  entry?: DayEntry
  source?: DayPlanLine
  /** An excursion's line: the idea it was made from, shown as this one line (FR-29.13). */
  origin?: Idea
  /** A connection's line: the excursion it belongs to (FR-29.18). */
  excursion?: DayPlanLine
}

/** The trip's dates, as the plan reads them. */
export interface TripDates {
  start_date: string | null
  end_date: string | null
}

/** The longest trip whose days are listed — a typo'd year must not draw ten thousand tiles. */
export const MAX_PLAN_DAYS = 120

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Whether a stored time is one the plan can order by. */
export function isPlanTime(value: string | null | undefined): value is string {
  return typeof value === 'string' && HH_MM.test(value)
}

/** Whether the trip has the two dates the day plan needs (FR-29.7, FR-29.14). */
export function hasPlanDates(trip: TripDates | null | undefined): boolean {
  return (
    !!trip?.start_date &&
    !!trip.end_date &&
    ISO_DAY.test(trip.start_date) &&
    ISO_DAY.test(trip.end_date) &&
    trip.start_date <= trip.end_date
  )
}

/** The calendar day after `day`, both `YYYY-MM-DD` — by date parts, never UTC midnight. */
export function nextDay(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  const next = new Date(year, month - 1, date + 1)
  const mm = String(next.getMonth() + 1).padStart(2, '0')
  const dd = String(next.getDate()).padStart(2, '0')
  return `${next.getFullYear()}-${mm}-${dd}`
}

/** Every day of the trip, first to last; empty without both dates. */
export function tripDays(trip: TripDates | null | undefined): string[] {
  if (!hasPlanDates(trip)) return []
  const days: string[] = []
  for (let day = trip!.start_date!; day <= trip!.end_date!; day = nextDay(day)) {
    days.push(day)
    if (days.length === MAX_PLAN_DAYS) break
  }
  return days
}

/** The day shown on arrival: today during the trip, the first day otherwise. */
export function openingDay(days: readonly string[], today: string): string | null {
  if (days.length === 0) return null
  return days.includes(today) ? today : days[0]!
}

/** Whether an idea stands on the plan at all: only *Shortlist* and *Gemacht* do (FR-29.14). */
function onThePlan(idea: Idea): boolean {
  return idea.state === IDEA_STATE_SHORTLISTED || idea.state === IDEA_STATE_DONE
}

/**
 * The ideas an excursion was made from. The plan shows such a pair as the
 * excursion's one line, so the idea has no line, no pool chip and no place
 * under *außerhalb der Reise* of its own (FR-29.13, FR-29.15).
 */
export function ideasWithExcursion(lines: readonly DayPlanLine[]): Set<string> {
  const ids = new Set<string>()
  for (const line of lines) {
    if (line.kind === DAY_PLAN_EXCURSION && line.ideaId) ids.add(line.ideaId)
  }
  return ids
}

/** The shortlisted ideas nobody has given a day yet — the pool bar's (FR-29.15). */
export function unplannedIdeas(
  ideas: readonly Idea[],
  without: ReadonlySet<string> = new Set(),
): Idea[] {
  return ideas.filter(
    (idea) => idea.state === IDEA_STATE_SHORTLISTED && !idea.planned_on && !without.has(idea.id),
  )
}

/**
 * Ideas planned on a day the trip no longer has — the dates moved after the
 * idea was planned. Listed *außerhalb der Reise* rather than lost (FR-29.14).
 */
export function ideasOutsideTrip(
  ideas: readonly Idea[],
  days: readonly string[],
  without: ReadonlySet<string> = new Set(),
): Idea[] {
  const inTrip = new Set(days)
  return ideas.filter(
    (idea) =>
      onThePlan(idea) && !!idea.planned_on && !inTrip.has(idea.planned_on) && !without.has(idea.id),
  )
}

/**
 * The plan's own entries on a day the trip does not have — a connection whose
 * link named another day, or the trip's dates moved. Listed beside the ideas
 * outside the trip, by day, rather than lost (FR-29.15, FR-29.18).
 */
export function entriesOutsideTrip(
  entries: readonly DayEntry[],
  days: readonly string[],
): DayEntry[] {
  const inTrip = new Set(days)
  return entries
    .filter((entry) => !inTrip.has(entry.on_date))
    .sort((a, b) => a.on_date.localeCompare(b.on_date) || compareTime(a.at_time, b.at_time))
}

/** What one day of the plan is built from. */
export interface DayInput {
  trip: TripDates
  ideas: readonly Idea[]
  entries: readonly DayEntry[]
  lines: readonly DayPlanLine[]
}

/**
 * dayLines is one day's timeline: arrival and departure from the trip's
 * dates, the ideas planned on it, the packing side's lines that stand on it
 * and the plan's own entries — the timed ones first by their time, the
 * untimed after, each group in the order the kinds are listed here.
 */
export function dayLines(day: string, input: DayInput): DayLine[] {
  const lines: DayLine[] = []
  const withExcursion = ideasWithExcursion(input.lines)
  const ideaOf = new Map(input.ideas.map((idea) => [idea.id, idea]))
  const excursionOf = new Map(
    input.lines.filter((line) => line.refId).map((line) => [line.refId!, line]),
  )
  if (day === input.trip.start_date) lines.push(fixed(DAY_LINE.arrival, day))
  if (day === input.trip.end_date) lines.push(fixed(DAY_LINE.departure, day))

  for (const source of input.lines) {
    if (day < source.from || day > source.to) continue
    const multiDay = source.from !== source.to
    const origin = source.ideaId ? ideaOf.get(source.ideaId) : undefined
    // The idea's time stands on the day the idea was planned for.
    const time =
      origin?.planned_on === day && isPlanTime(origin.planned_at) ? origin.planned_at : null
    lines.push({
      key: source.key,
      kind: source.kind === DAY_PLAN_EXCURSION ? DAY_LINE.excursion : DAY_LINE.task,
      time,
      title: source.title,
      detail: source.detail,
      span: !multiDay ? null : day === source.from ? 'start' : day === source.to ? 'return' : null,
      done: source.done,
      progress: source.progress,
      source,
      origin,
    })
  }

  for (const idea of input.ideas) {
    if (!onThePlan(idea) || idea.planned_on !== day || withExcursion.has(idea.id)) continue
    lines.push({
      key: `idea:${idea.id}`,
      kind: DAY_LINE.idea,
      time: isPlanTime(idea.planned_at) ? idea.planned_at : null,
      title: idea.title,
      detail: idea.note,
      span: null,
      done: idea.state === IDEA_STATE_DONE,
      progress: null,
      idea,
    })
  }

  for (const entry of input.entries) {
    if (entry.on_date !== day) continue
    lines.push({
      key: `entry:${entry.id}`,
      kind:
        entry.kind === DAY_ENTRY_CONNECTION && entry.legs ? DAY_LINE.connection : DAY_LINE.entry,
      time: isPlanTime(entry.at_time) ? entry.at_time : null,
      title: entry.title,
      detail: entry.note,
      span: null,
      done: null,
      progress: null,
      entry,
      excursion: entry.excursion_id ? excursionOf.get(entry.excursion_id) : undefined,
    })
  }

  // Stable: equal times keep the kinds' order above.
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => compareTime(a.line.time, b.line.time) || a.index - b.index)
    .map(({ line }) => line)
}

/**
 * Whether a day holds nothing of the travellers' own (FR-29.7): arrival and
 * departure stand on a trip's first and last day whether anyone planned
 * anything or not, so they do not count. A trip under way opens elsewhere on
 * such a day.
 */
export function dayHoldsNothing(day: string, input: DayInput): boolean {
  return dayLines(day, input).every(
    (line) => line.kind === DAY_LINE.arrival || line.kind === DAY_LINE.departure,
  )
}

/**
 * Whether the day the plan opens on holds nothing (FR-29.7): today during
 * the trip, its first day when it was started early.
 */
export function openingDayHoldsNothing(today: string, input: DayInput): boolean {
  return dayHoldsNothing(openingDay(tripDays(input.trip), today) ?? today, input)
}

/** Timed before untimed, then by the time itself. */
function compareTime(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a < b ? -1 : 1
}

function fixed(kind: typeof DAY_LINE.arrival | typeof DAY_LINE.departure, day: string): DayLine {
  return {
    key: `${kind}:${day}`,
    kind,
    time: null,
    title: '',
    detail: null,
    span: null,
    done: null,
    progress: null,
  }
}

/**
 * The state a tick on an idea's line moves it to: a ticked idea is done, and
 * unticking puts it back on the shortlist it was planned from (FR-29.15).
 */
export function stateAfterTick(
  done: boolean,
): typeof IDEA_STATE_DONE | typeof IDEA_STATE_SHORTLISTED {
  return done ? IDEA_STATE_SHORTLISTED : IDEA_STATE_DONE
}

/** How many lines stand on each day — the strip's dots. */
export function dayCounts(days: readonly string[], input: DayInput): Map<string, number> {
  return new Map(days.map((day) => [day, dayLines(day, input).length]))
}

/**
 * linesAhead is what is still to come on a day at `now` (`HH:MM`) — what the
 * dashboard's *Heute* card lists (FR-29.7). Arrival and departure are left
 * out, the hero's day counter says them already; a timed line drops once its
 * time has passed, a connection once its last leg has arrived; an untimed
 * line stays all day, ticked or not.
 */
export function linesAhead(day: string, lines: readonly DayLine[], now: string): DayLine[] {
  const at = `${day}T${now}`
  return lines.filter((line) => {
    if (line.kind === DAY_LINE.arrival || line.kind === DAY_LINE.departure) return false
    if (line.time === null) return true
    const legs = line.entry?.legs
    const until = legs?.length ? legs[legs.length - 1]!.arr.slice(0, 16) : `${day}T${line.time}`
    return until >= at
  })
}
