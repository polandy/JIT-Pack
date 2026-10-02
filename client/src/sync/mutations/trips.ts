/**
 * Trips, their travelers, containers and members, imported trips, series and destination profiles
 * (FR-2, FR-4.5/4.7, FR-10.1, FR-13.1–13.3, FR-16.2). Spread into `createMutations`
 * (`../mutations.ts`).
 */

import { TABLE } from '@/types/tables'
import { jsonColumn, rowFrom } from '@/sync/columns'
import { newId } from '@/lib/ids'
import type { Mutation } from '@/api/types'
import {
  type Container,
  type DestinationChecklistItem,
  type DestinationProfile,
  type ItemMode,
  type Trip,
  TRIP_STATUS_ARCHIVED,
  TRIP_STATUS_PLANNING,
  type TripSeries,
  type TripStatus,
} from '@/types/domain'
import type { MutationContext } from './context'

/** The trip fields FR-2.7's editor may change. Status and the series have
 * their own actions, and the rest of the row is not the user's to set. */
export type TripEdit = Partial<
  Pick<Trip, 'name' | 'year' | 'start_date' | 'end_date' | 'attributes'>
>

/** M11's container sheet. The pairing has its own two actions, which write
 * both sides — `paired_container_id` is here for them, not for the sheet. */
export type ContainerEdit = Partial<
  Pick<Container, 'name' | 'carrier_traveler_id' | 'max_weight_grams' | 'paired_container_id'>
>

/** FR-13.1's series. `owner_id` is stamped server-side and never edited. */
export type SeriesEdit = Partial<Pick<TripSeries, 'name' | 'default_attributes'>>

/** FR-13.2's destination profile carries one editable field. */
export type DestinationProfileEdit = Partial<Pick<DestinationProfile, 'notes'>>

/** FR-13.3's checklist entry. */
export type ChecklistItemEdit = Partial<Pick<DestinationChecklistItem, 'label' | 'mode'>>

export function createTripsMutations({ make }: MutationContext) {
  function addTraveler(
    tripId: string,
    name: string,
    linkedUserId: string | null = null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.travelers, id, {
      trip_id: tripId,
      name,
      linked_user_id: linkedUserId,
    })
    return { mutation, id }
  }

  // --- Container mutations (FR-10.1) ---

  function addContainer(
    tripId: string,
    name: string,
    opts: { carrierTravelerId?: string | null; maxWeightGrams?: number | null } = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.containers, id, {
      trip_id: tripId,
      name,
      carrier_traveler_id: opts.carrierTravelerId ?? null,
      max_weight_grams: opts.maxWeightGrams ?? null,
      paired_container_id: null,
    })
    return { mutation, id }
  }

  function updateContainer(containerId: string, fields: ContainerEdit): Mutation {
    return make('upsert', TABLE.containers, containerId, rowFrom(fields))
  }

  function deleteContainer(containerId: string): Mutation {
    return make('delete', TABLE.containers, containerId)
  }

  // --- Trip mutations ---

  function createTrip(
    name: string,
    year: number,
    startDate: string | null,
    endDate: string | null,
    opts: {
      seriesId?: string | null
      attributes?: Record<string, unknown> | null
      /** FR-2.2: a restore gives back the status it saved (ADR-024). */
      status?: TripStatus
    } = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.trips, id, {
      name,
      // FR-2.1b: the year is the required fact; both dates may be absent.
      year,
      start_date: startDate,
      end_date: endDate,
      status: opts.status ?? TRIP_STATUS_PLANNING,
      series_id: opts.seriesId ?? null,
      attributes: jsonColumn(opts.attributes),
    })
    return { mutation, id }
  }

  function updateTripStatus(tripId: string, status: string): Mutation {
    return make('upsert', TABLE.trips, tripId, { status })
  }

  /**
   * FR-5.10: the moment the packing was declared finished, or `null` to
   * reopen it.
   *
   * One field, alone: NFR-4.2a merges it on its own, so a status another
   * device set meanwhile survives the stamp — and the lifecycle is not what
   * this decides. Closing the packing neither starts nor archives the trip.
   */
  function setPackingClosed(tripId: string, at: string | null): Mutation {
    return make('upsert', TABLE.trips, tripId, { packing_closed_at: at })
  }

  /**
   * updateTrip writes the fields an FR-2.7 edit changed and only those: an
   * upsert of the whole row would hand back a value another device changed
   * meanwhile, which the field-level merge (NFR-4.2a) exists to avoid.
   */
  function updateTrip(tripId: string, fields: TripEdit): Mutation {
    return make('upsert', TABLE.trips, tripId, rowFrom(fields, { attributes: jsonColumn }))
  }

  /** renameTraveler changes the name and nothing else — FR-2.7 forbids
   * modelling a rename as a removal plus an addition, which would detach
   * every row pointing at the traveler. */
  function renameTraveler(travelerId: string, name: string): Mutation {
    return make('upsert', TABLE.travelers, travelerId, { name })
  }

  /**
   * linkTraveler records which account a traveler *is* (FR-2.5, ADR-058), or
   * clears that record with `null`. The server refuses a link naming anybody
   * who is not a current member of the same trip (`not_a_trip_member`), which
   * is why M22 offers only members.
   */
  function linkTraveler(travelerId: string, userId: string | null): Mutation {
    return make('upsert', TABLE.travelers, travelerId, { linked_user_id: userId })
  }

  /** removeTraveler tombstones the traveler row. What happens to the rows
   * assigned to them is FR-27.4's rule, applied by the orchestrator. */
  function removeTravelerRow(travelerId: string): Mutation {
    return make('delete', TABLE.travelers, travelerId)
  }

  /** deleteTrip tombstones the trip on the master partition. The server
   * authorizes this for Owner/Admin only (FR-4.5) and cascades every child
   * row, announcing the three that travel this partition; the client mirrors
   * the rest itself (see `tripLifecycle.deleteTrip`). */
  function deleteTrip(tripId: string): Mutation {
    return make('delete', TABLE.trips, tripId)
  }

  // --- Import mutations (FR-16.2, M15) ---

  /** createImportedTrip inserts a historical trip: archived, marked imported. */
  function createImportedTrip(
    name: string,
    year: number,
    // Null when the sheet named only a year — nothing is fabricated (UX-5).
    endDate: string | null,
    seriesId: string | null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.trips, id, {
      name,
      // FR-2.1b: the one required temporal fact. Omitting it made every
      // imported trip a NOT NULL violation the server refuses.
      year,
      start_date: null,
      end_date: endDate,
      status: TRIP_STATUS_ARCHIVED,
      series_id: seriesId,
      imported: 1,
    })
    return { mutation, id }
  }

  // --- Series & destination mutations (FR-13.1/13.2) ---

  function setTripSeries(tripId: string, seriesId: string | null): Mutation {
    return make('upsert', TABLE.trips, tripId, { series_id: seriesId })
  }

  function createSeries(
    name: string,
    defaultAttributes: Record<string, unknown> | null = null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    // owner_id is stamped server-side on push (FR-13.1 ownership).
    const mutation = make('insert', TABLE.tripSeries, id, {
      owner_id: '',
      name,
      default_attributes: jsonColumn(defaultAttributes),
    })
    return { mutation, id }
  }

  function updateSeries(seriesId: string, fields: SeriesEdit): Mutation {
    return make(
      'upsert',
      TABLE.tripSeries,
      seriesId,
      rowFrom(fields, { default_attributes: jsonColumn }),
    )
  }

  function createDestinationProfile(seriesId: string): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.destinationProfiles, id, {
      series_id: seriesId,
      notes: null,
    })
    return { mutation, id }
  }

  function updateDestinationProfile(profileId: string, fields: DestinationProfileEdit): Mutation {
    return make('upsert', TABLE.destinationProfiles, profileId, rowFrom(fields))
  }

  function addChecklistItem(
    profileId: string,
    label: string,
    mode: ItemMode,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.destinationChecklistItems, id, {
      profile_id: profileId,
      label,
      mode,
    })
    return { mutation, id }
  }

  function updateChecklistItem(itemId: string, fields: ChecklistItemEdit): Mutation {
    return make('upsert', TABLE.destinationChecklistItems, itemId, rowFrom(fields))
  }

  function deleteChecklistItem(itemId: string): Mutation {
    return make('delete', TABLE.destinationChecklistItems, itemId)
  }

  // --- Trip membership mutations (FR-4.5/4.7, master partition) ---

  function addTripMember(
    tripId: string,
    userId: string,
    role: 'admin' | 'editor' = 'editor',
  ): { mutation: Mutation; id: string } {
    const id = newId()
    // 'owner' is never client-assignable — the server creates the
    // creator's owner row itself (FR-4.5).
    const mutation = make('insert', TABLE.tripMembers, id, {
      trip_id: tripId,
      user_id: userId,
      role,
    })
    return { mutation, id }
  }

  function setTripMemberRole(memberId: string, role: 'admin' | 'editor'): Mutation {
    return make('upsert', TABLE.tripMembers, memberId, { role })
  }

  function removeTripMember(memberId: string): Mutation {
    return make('delete', TABLE.tripMembers, memberId)
  }

  return {
    addTraveler,
    addContainer,
    updateContainer,
    deleteContainer,
    createTrip,
    updateTripStatus,
    setPackingClosed,
    updateTrip,
    renameTraveler,
    linkTraveler,
    removeTravelerRow,
    deleteTrip,
    createImportedTrip,
    setTripSeries,
    createSeries,
    updateSeries,
    createDestinationProfile,
    updateDestinationProfile,
    addChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
    addTripMember,
    setTripMemberRole,
    removeTripMember,
  }
}
