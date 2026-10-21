/**
 * FR-9.5 — the forgotten radar: what the most similar earlier trip recorded
 * as missing, read on the trip being planned.
 */
import type { Template, Trip, TripItem, TripTemplateSource } from '@/types/domain'
import { STATE_SKIPPED, TEMPLATE_KIND_TEMPLATE, TRIP_STATUS_ARCHIVED } from '@/types/domain'

import { commentsOnRows, type ItemComment, type TripComments } from './itemHistory'

/** The reference trip was chosen because it belongs to the same series. */
export const RADAR_REASON_SERIES = 'series' as const
/** The reference trip was chosen because it shares a Ferien-Vorlage. */
export const RADAR_REASON_TEMPLATE = 'template' as const

/** Why the reference trip is the one the card names. */
export type RadarReason =
  | { kind: typeof RADAR_REASON_SERIES; seriesId: string }
  | { kind: typeof RADAR_REASON_TEMPLATE; templateId: string }

/** The one earlier trip the radar reads, and why it was chosen. */
export interface RadarReference {
  trip: Trip
  reason: RadarReason
}

/** A template reduced to what similarity asks of it. */
export type RadarTemplateRef = Pick<Template, 'id' | 'kind'>

/** Most recent first: by year, then start date, an undated trip last within its year. */
function newestFirst(a: Trip, b: Trip): number {
  if (a.year !== b.year) return b.year - a.year
  if (a.start_date !== b.start_date) {
    if (a.start_date === null) return 1
    if (b.start_date === null) return -1
    return b.start_date.localeCompare(a.start_date)
  }
  return a.id.localeCompare(b.id)
}

/**
 * The trip whose record the radar shows (FR-9.5): the newest archived trip of
 * the same series, else the newest archived trip sharing a Ferien-Vorlage.
 * A shared group does not count — a group travels to unrelated trips alike.
 */
export function radarReference(
  trip: Trip,
  trips: readonly Trip[],
  sources: readonly TripTemplateSource[],
  templates: readonly RadarTemplateRef[],
): RadarReference | null {
  const finished = trips.filter((t) => t.id !== trip.id && t.status === TRIP_STATUS_ARCHIVED)

  const seriesId = trip.series_id
  if (seriesId !== null) {
    const [newest] = finished.filter((t) => t.series_id === seriesId).sort(newestFirst)
    if (newest) return { trip: newest, reason: { kind: RADAR_REASON_SERIES, seriesId } }
  }

  const vacations = new Set(
    templates.filter((t) => t.kind === TEMPLATE_KIND_TEMPLATE).map((t) => t.id),
  )
  const own = sources
    .filter((s) => s.trip_id === trip.id && vacations.has(s.template_id))
    .map((s) => s.template_id)
  if (own.length === 0) return null
  const sharedBy = new Map<string, string>()
  for (const s of sources) {
    if (own.includes(s.template_id) && !sharedBy.has(s.trip_id)) {
      sharedBy.set(s.trip_id, s.template_id)
    }
  }
  const [newest] = finished.filter((t) => sharedBy.has(t.id)).sort(newestFirst)
  if (!newest) return null
  return {
    trip: newest,
    reason: { kind: RADAR_REASON_TEMPLATE, templateId: sharedBy.get(newest.id) as string },
  }
}

/** Bought or added on the way: the list forgot it (FR-9.1). */
export const RADAR_ENTRY_NOT_ON_LIST = 'notOnList' as const
/** Skipped and flagged: it stayed home by accident (FR-5.11). */
export const RADAR_ENTRY_STAYED_HOME = 'stayedHome' as const

/** One missing item on the radar card. */
export interface RadarEntry {
  name: string
  sourceItemId: string | null
  kind: typeof RADAR_ENTRY_NOT_ON_LIST | typeof RADAR_ENTRY_STAYED_HOME
  comments: ItemComment[]
}

/** A planning trip's row, reduced to what "already on the list" asks of it. */
export type RadarRowRef = Pick<TripItem, 'source_item_id' | 'name'>

function nameKey(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * What the reference trip recorded as missing and the planning trip does not
 * hold yet (FR-9.5), one entry per item, by name.
 *
 * "Already on the list" matches the inventory item, and the name as well:
 * a missed match here shows an item that is already packed, which is the
 * failure worth avoiding — the opposite of FR-27.9's join, where a wrong
 * match would put a stranger's remark on an item.
 */
export function radarEntries(
  reference: TripComments & { items: readonly TripItem[] },
  current: readonly RadarRowRef[],
): RadarEntry[] {
  const heldItems = new Set(current.map((r) => r.source_item_id).filter((id) => id !== null))
  const heldNames = new Set(current.map((r) => nameKey(r.name)))

  const groups = new Map<string, [TripItem, ...TripItem[]]>()
  for (const item of reference.items) {
    if (!item.flag_missing) continue
    if (item.source_item_id !== null && heldItems.has(item.source_item_id)) continue
    if (heldNames.has(nameKey(item.name))) continue
    const key = item.source_item_id ?? `name:${nameKey(item.name)}`
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }

  return [...groups.values()]
    .map((rows) => ({
      name: rows[0].name,
      sourceItemId: rows[0].source_item_id,
      kind: rows.every((r) => r.state === STATE_SKIPPED)
        ? RADAR_ENTRY_STAYED_HOME
        : RADAR_ENTRY_NOT_ON_LIST,
      comments: commentsOnRows(new Set(rows.map((r) => r.id)), reference),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}
