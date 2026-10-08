/**
 * The day plan's rules (FR-29.14, FR-29.15) — pure, so Local Mode keeps
 * every one and a spec needs no component to reach them.
 *
 * The plan stores two tables of its own (`day_entries` and whom each is for)
 * and reads the planned ideas, the packing side's dated lines (excursions,
 * tasks — see `domain/dayPlanLine.ts`), the trip's travellers and its dates
 * for arrival and departure.
 * Which day is shown, what stands on it and in which order is derived here.
 */
import type { DayPlanLine } from '@/domain/dayPlanLine'
import { DAY_PLAN_EXCURSION, DAY_PLAN_MEAL, DAY_PLAN_TASK } from '@/domain/dayPlanLine'
import type { DayEntry, DayEntryTraveler, Idea, Traveler } from '@/types/domain'
import {
  EXCURSION_ROLE_BACK,
  EXCURSION_ROLE_OUT,
  IDEA_STATE_DONE,
  IDEA_STATE_SHORTLISTED,
  type ExcursionRole,
} from '@/types/domain'

/** What one line of the timeline is. */
export const DAY_LINE = {
  arrival: 'arrival',
  departure: 'departure',
  excursion: 'excursion',
  idea: 'idea',
  task: 'task',
  entry: 'entry',
  connection: 'connection',
  meal: 'meal',
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
  /** An untimed line's place among the timed ones (a meal's slot, FR-33.5); absent for after them. */
  placeAt?: string
  title: string
  /** The words under the title, where there are any. */
  detail: string | null
  span: DaySpan
  /** Done or not — struck through, and a task's checkbox (FR-29.15); null for a line never done. */
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
  /** Whom it is for, by name in roster order — null for everybody (FR-29.15). */
  who: string[] | null
  /**
   * Whom it concerns, by traveller id — null for everybody (FR-29.15): its own
   * people, or for an excursion's way the excursion's.
   */
  forIds: string[] | null
}

/** A source's kind of line as the timeline's. */
const KIND_OF_SOURCE = {
  [DAY_PLAN_EXCURSION]: DAY_LINE.excursion,
  [DAY_PLAN_TASK]: DAY_LINE.task,
  [DAY_PLAN_MEAL]: DAY_LINE.meal,
} as const satisfies Record<DayPlanLine['kind'], DayLineKind>

/** The trip's dates, as the plan reads them. */
export interface TripDates {
  start_date: string | null
  end_date: string | null
}

/** An idea's line is keyed by the idea — M29 finds the one it just planned by it. */
export const IDEA_LINE_PREFIX = 'idea:'

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
  /** The trip's travellers in roster order (FR-29.15). */
  travelers: readonly Traveler[]
  /** Whom the entries are for — none of an entry's for everybody (FR-29.15). */
  entryTravelers: readonly DayEntryTraveler[]
}

/**
 * FR-29.15: the names of the travellers among `ids`, in roster order — null
 * for everybody, which is also what naming nobody still on the trip, or every
 * traveller, comes to.
 */
export function whoOf(ids: readonly string[], travelers: readonly Traveler[]): string[] | null {
  const named = forOf(ids, travelers)
  return named && travelers.filter((traveler) => named.includes(traveler.id)).map((t) => t.name)
}

/**
 * FR-29.15: the travellers among `ids` still on the trip, in roster order —
 * null for everybody, which naming nobody, or every traveller, comes to.
 */
export function forOf(ids: readonly string[], travelers: readonly Traveler[]): string[] | null {
  const named = travelers.filter((traveler) => ids.includes(traveler.id))
  return named.length === 0 || named.length === travelers.length
    ? null
    : named.map((traveler) => traveler.id)
}

/**
 * FR-29.15: whether a line concerns any of the `chosen` travellers — null for
 * everybody, which every line concerns. A line for everybody concerns
 * anyone; one naming people concerns them; a task concerns the one whose
 * account it is assigned to, or anyone while it is nobody's. A meal's cook is
 * no reason to leave it out: everybody eats it.
 */
export function concerns(
  line: DayLine,
  chosen: readonly string[] | null,
  travelers: readonly Traveler[],
): boolean {
  if (chosen === null) return true
  if (line.kind === DAY_LINE.task) {
    const assignee = line.source?.assignee ?? null
    if (assignee === null) return true
    return travelers.some(
      (traveler) => chosen.includes(traveler.id) && traveler.linked_user_id === assignee,
    )
  }
  return line.forIds === null || line.forIds.some((id) => chosen.includes(id))
}

/**
 * FR-29.15: whom the day plan is narrowed to when it opens — the choice this
 * device remembered (`null` for everybody, `undefined` for none yet), without
 * anyone gone from the trip; the first time, the traveller linked to me. A
 * trip of one is never narrowed.
 */
export function openingFilter(
  remembered: readonly string[] | null | undefined,
  travelers: readonly Traveler[],
  myUserId: string | null,
): string[] | null {
  if (travelers.length < 2) return null
  if (remembered !== undefined) return remembered === null ? null : forOf(remembered, travelers)
  const me = myUserId
    ? travelers.find((traveler) => traveler.linked_user_id === myUserId)
    : undefined
  return me ? [me.id] : null
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
    const time = isPlanTime(source.time)
      ? source.time
      : origin?.planned_on === day && isPlanTime(origin.planned_at)
        ? origin.planned_at
        : null
    lines.push({
      key: source.key,
      kind: KIND_OF_SOURCE[source.kind],
      time,
      ...(isPlanTime(source.placeAt) ? { placeAt: source.placeAt } : {}),
      title: source.title,
      detail: source.detail,
      span: !multiDay ? null : day === source.from ? 'start' : day === source.to ? 'return' : null,
      done: source.done,
      progress: source.progress,
      source,
      origin,
      who: whoOf(source.travelerIds ?? [], input.travelers),
      forIds: forOf(source.travelerIds ?? [], input.travelers),
    })
  }

  for (const idea of input.ideas) {
    if (!onThePlan(idea) || idea.planned_on !== day || withExcursion.has(idea.id)) continue
    lines.push({
      key: `${IDEA_LINE_PREFIX}${idea.id}`,
      kind: DAY_LINE.idea,
      time: isPlanTime(idea.planned_at) ? idea.planned_at : null,
      title: idea.title,
      detail: idea.note,
      span: null,
      done: idea.state === IDEA_STATE_DONE,
      progress: null,
      idea,
      who: null,
      forIds: null,
    })
  }

  for (const entry of input.entries) {
    if (entry.on_date !== day) continue
    const named = input.entryTravelers
      .filter((row) => row.day_entry_id === entry.id)
      .map((row) => row.traveler_id)
    const way = entry.excursion_id ? excursionOf.get(entry.excursion_id) : undefined
    lines.push({
      key: `entry:${entry.id}`,
      // By its legs, never its kind: two devices merged field by field may leave them apart (FR-29.18).
      kind: entry.legs && entry.legs.length > 0 ? DAY_LINE.connection : DAY_LINE.entry,
      time: isPlanTime(entry.at_time) ? entry.at_time : null,
      title: entry.title,
      detail: entry.note,
      span: null,
      done: null,
      progress: null,
      entry,
      excursion: way,
      who: whoOf(named, input.travelers),
      // An excursion's way goes with the excursion's people.
      forIds: forOf(way ? (way.travelerIds ?? []) : named, input.travelers),
    })
  }

  // Stable: equal times keep the kinds' order above. A meal without a time
  // stands at its slot's place (FR-33.5).
  const orderTime = (line: DayLine) => line.time ?? line.placeAt ?? null
  const ordered = lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => compareTime(orderTime(a.line), orderTime(b.line)) || a.index - b.index)
    .map(({ line }) => line)
  return betweenItsWays(ordered)
}

/**
 * FR-29.18: an excursion stands where it happens — right after its way
 * there on the day, or, with only a way back, right before it — whatever
 * time it has of its own.
 */
function betweenItsWays(lines: DayLine[]): DayLine[] {
  const placed = [...lines]
  for (const excursion of lines.filter((line) => line.kind === DAY_LINE.excursion)) {
    const refId = excursion.source?.refId
    if (!refId) continue
    const way = (role: ExcursionRole) =>
      placed.find(
        (line) => line.entry?.excursion_id === refId && line.entry.excursion_role === role,
      )
    const out = way(EXCURSION_ROLE_OUT)
    const back = way(EXCURSION_ROLE_BACK)
    if (!out && !back) continue
    placed.splice(placed.indexOf(excursion), 1)
    const at = out ? placed.indexOf(out) + 1 : placed.indexOf(back!)
    placed.splice(at, 0, excursion)
  }
  return placed
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
    who: null,
    forIds: null,
  }
}

/** How many lines each day holds — of those that concern the `chosen`, while some are (FR-29.15). */
export function dayCounts(
  days: readonly string[],
  input: DayInput,
  chosen: readonly string[] | null = null,
): Map<string, number> {
  return new Map(
    days.map((day) => [
      day,
      dayLines(day, input).filter((line) => concerns(line, chosen, input.travelers)).length,
    ]),
  )
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
    // FR-33.7: today's meals have a block of their own on the dashboard.
    if (line.kind === DAY_LINE.meal) return false
    if (line.time === null) return true
    const legs = line.entry?.legs
    const until = legs?.length ? legs[legs.length - 1]!.arr.slice(0, 16) : `${day}T${line.time}`
    return until >= at
  })
}
