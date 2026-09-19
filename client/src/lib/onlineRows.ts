import type { DirectoryUser, RosterMember } from '@/api/types'
import type { Trip } from '@/types/domain'

/** One line of the G-2 sheet's "packing right now" list (FR-4.9). */
export interface OnlineRow {
  /** Stable across roster frames, so a list re-render keeps its rows. */
  key: string
  name: string
  tripId: string
  tripName: string
}

/**
 * One row per person per trip they have open, named from the directory.
 *
 * A trip this device does not hold is left out — a row that names nothing to
 * open is no answer — and a person the directory has not listed falls back to
 * the account id rather than vanishing, because the roster says they are
 * there and a missing name is the smaller lie.
 */
export function onlineRows(
  roster: readonly RosterMember[],
  directory: readonly DirectoryUser[],
  getTrip: (tripId: string) => Trip | undefined,
): OnlineRow[] {
  return roster.flatMap((member) => {
    const name = directory.find((u) => u.user_id === member.user_id)?.display_name
    return member.trip_ids.flatMap((tripId) => {
      const trip = getTrip(tripId)
      return trip
        ? [
            {
              key: `${member.user_id}:${tripId}`,
              name: name ?? member.user_id,
              tripId,
              tripName: trip.name,
            },
          ]
        : []
    })
  })
}
