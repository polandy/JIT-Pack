/**
 * FR-29.18: an excursion's way there and back — which of its connections fills
 * which slot, and the time the two leave on the spot. Pure, so the excursion's
 * card and M27's list read one rule.
 */
import {
  DAY_ENTRY_CONNECTION,
  EXCURSION_ROLE_BACK,
  EXCURSION_ROLE_OUT,
  type DayEntry,
} from '@/types/domain'
import { dayOf, timeOf } from './connections'

/** An excursion's connections, by the slot they fill. */
export interface ExcursionJourney {
  /** The way there; the earliest where two devices filled the slot apart. */
  out: DayEntry | null
  /** The way back; the latest where two devices filled the slot apart. */
  back: DayEntry | null
  /** Every other connection of the excursion, by departure — none is lost. */
  others: DayEntry[]
}

function departure(entry: DayEntry): string {
  return entry.legs?.[0]?.dep ?? `${entry.on_date}T${entry.at_time ?? ''}`
}

function arrival(entry: DayEntry): string | null {
  const legs = entry.legs ?? []
  return legs.length > 0 ? legs[legs.length - 1]!.arr : null
}

function byDeparture(a: DayEntry, b: DayEntry): number {
  return departure(a).localeCompare(departure(b))
}

export function excursionJourney(
  entries: readonly DayEntry[],
  excursionId: string,
): ExcursionJourney {
  const own = entries
    .filter((e) => e.kind === DAY_ENTRY_CONNECTION && e.excursion_id === excursionId)
    .sort(byDeparture)
  const outs = own.filter((e) => e.excursion_role === EXCURSION_ROLE_OUT)
  const backs = own.filter((e) => e.excursion_role === EXCURSION_ROLE_BACK)
  const out = outs[0] ?? null
  const back = backs[backs.length - 1] ?? null
  return { out, back, others: own.filter((e) => e !== out && e !== back) }
}

/** `HH:MM` of a way's first departure and, where its legs know it, its last arrival. */
export function journeyTimes(entry: DayEntry): { dep: string; arr: string | null } {
  const last = arrival(entry)
  return { dep: timeOf(departure(entry)), arr: last ? timeOf(last) : null }
}

/** What the time between the two ways says. */
export type JourneyBudget =
  | {
      kind: 'onSite'
      /** From arriving to leaving. */
      onSiteMinutes: number
      /** The first track's time with its pauses; null without a track. */
      routeMinutes: number | null
      /** What the route leaves of the time on the spot, negative where it does not fit; null without a track. */
      slackMinutes: number | null
      /** Minutes from the first departure: the whole span, arriving, the route's end, leaving. */
      bar: { total: number; arrive: number; routeEnd: number; leave: number }
    }
  | {
      kind: 'earliestBack'
      /** `HH:MM` of arriving. */
      arrival: string
      routeMinutes: number
      /** `HH:MM` of arriving plus the route. */
      earliestBack: string
    }

const MINUTES_PER_DAY = 24 * 60

function minuteOfDay(stamp: string): number {
  const [h = 0, m = 0] = timeOf(stamp).split(':').map(Number)
  return h * 60 + m
}

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/**
 * The time budget of a day out: only for a way there that arrives on the day
 * the way back leaves, since a hut night's budget is not a day's.
 */
export function journeyBudget(input: {
  out: DayEntry | null
  back: DayEntry | null
  routeMinutes: number | null
}): JourneyBudget | null {
  const { out, back, routeMinutes } = input
  const arrived = out ? arrival(out) : null
  if (!out || !arrived) return null
  const arriveAt = minuteOfDay(arrived)

  if (!back) {
    if (routeMinutes === null) return null
    const earliest = arriveAt + routeMinutes
    if (earliest >= MINUTES_PER_DAY) return null
    return {
      kind: 'earliestBack',
      arrival: timeOf(arrived),
      routeMinutes,
      earliestBack: clock(earliest),
    }
  }

  const leaves = departure(back)
  const backArrives = arrival(back) ?? leaves
  if (dayOf(leaves) !== dayOf(arrived)) return null
  const onSite = minuteOfDay(leaves) - arriveAt
  if (onSite < 0) return null
  const start = minuteOfDay(departure(out))
  const arrive = arriveAt - start
  return {
    kind: 'onSite',
    onSiteMinutes: onSite,
    routeMinutes,
    slackMinutes: routeMinutes === null ? null : onSite - routeMinutes,
    bar: {
      total: minuteOfDay(backArrives) - start,
      arrive,
      routeEnd: arrive + (routeMinutes ?? 0),
      leave: minuteOfDay(leaves) - start,
    },
  }
}
