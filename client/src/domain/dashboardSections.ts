/**
 * M1's two cross-trip sections: what was delegated to me, and who is packing
 * late today (FR-6.1/6.3, FR-5.1).
 *
 * Pure over rows the device already holds, like every other rule in this
 * directory — the dashboard renders what these return and decides nothing.
 */

/** A trip row, reduced to what the two sections need. */
export interface DashboardRow {
  id: string
  name: string
  state: string
  packer_user_id: string | null
  late_packer: boolean
}

/** One trip's contribution to a section. */
export interface DashboardTrip {
  tripId: string
  tripName: string
  /** FR-2.1b: null where the trip named no departure. */
  startDate: string | null
  rows: readonly DashboardRow[]
}

/** A row on one of the two sections, with the trip it belongs to. */
export interface SectionRow {
  tripId: string
  tripName: string
  itemId: string
  itemName: string
  /** Delegation only: this device has not shown the row as mine before. */
  isNew: boolean
}

/**
 * A row is *open* when it is neither packed nor deliberately skipped — the
 * same reading M1's counts and previews already use, named once because three
 * places now ask it.
 */
const OPEN_STATES_EXCLUDED = ['packed', 'skipped']

export function isOpenRow(row: { state: string }): boolean {
  return !OPEN_STATES_EXCLUDED.includes(row.state)
}

/**
 * Every open row assigned to me, across active trips (FR-6.1/6.3).
 *
 * **`seen` is a set of row ids, not a timestamp.** FR-6.1 asks for what
 * arrived *since the last visit*, and a row carries no assignment time — the
 * HLC that ordered the write is the server's and never reaches the client as
 * a date. A set answers the question the requirement actually asks (has this
 * device shown me this yet?) and answers it identically after a clock change,
 * a timezone move or a device that was off for a week.
 *
 * The dashboard is **not** filtered by person (FR-6.1's own filter clause was
 * struck 2026-08-31): this is a section beside the full aggregation, not a
 * lens over it, so the screen still says something in the two modes that have
 * no accounts.
 */
export function delegatedToMe(
  trips: readonly DashboardTrip[],
  myUserId: string | null,
  seen: ReadonlySet<string>,
): SectionRow[] {
  if (!myUserId) return []
  const out: SectionRow[] = []
  for (const trip of trips) {
    for (const row of trip.rows) {
      if (row.packer_user_id !== myUserId || !isOpenRow(row)) continue
      out.push({
        tripId: trip.tripId,
        tripName: trip.tripName,
        itemId: row.id,
        itemName: row.name,
        isNew: !seen.has(row.id),
      })
    }
  }
  // New first: the section exists to surface what arrived, and a long list
  // whose new rows are scattered through it is a list nobody rereads.
  return out.sort(
    (a, b) => Number(b.isNew) - Number(a.isNew) || a.itemName.localeCompare(b.itemName),
  )
}

/**
 * Every open Late-Packer row of a trip that departs **today** (FR-5.1).
 *
 * `today` is a parameter — an ISO date, not a clock — so the rule is testable
 * without one, and the caller decides which day it means. A trip with no
 * departure date has no departure day: FR-2.1b makes the date optional, and a
 * trip that never said when it leaves cannot be leaving now.
 */
export function latePackersDepartingToday(
  trips: readonly DashboardTrip[],
  today: string,
): SectionRow[] {
  const out: SectionRow[] = []
  for (const trip of trips) {
    if (trip.startDate !== today) continue
    for (const row of trip.rows) {
      if (!row.late_packer || !isOpenRow(row)) continue
      out.push({
        tripId: trip.tripId,
        tripName: trip.tripName,
        itemId: row.id,
        itemName: row.name,
        isNew: false,
      })
    }
  }
  return out.sort((a, b) => a.itemName.localeCompare(b.itemName))
}
