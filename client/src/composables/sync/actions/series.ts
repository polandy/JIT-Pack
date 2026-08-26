/**
 * Series and destination-profile actions (FR-13.1/13.2, M16) — master
 * partition. Moved out of the orchestrator closure under R-4; moves only, so
 * `useSyncOrchestrator`'s return shape is untouched.
 */
import { checklistItemRow, profileRow, seriesRow, tripRow } from '../rows'
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import { isTakenRename } from '../names'
import type {
  DestinationChecklistItem,
  DestinationProfile,
  ItemMode,
  TripSeries,
} from '@/types/domain'
import type { SyncContext } from '../context'

/** createSeriesActions binds the series/destination group to one sync context. */
export function createSeriesActions(ctx: SyncContext) {
  const { mutations, enqueueAndDrain, tripStore, masterStore, names } = ctx

  function createSeries(
    name: string,
    defaultAttributes: Record<string, unknown> | null = null,
  ): string | null {
    if (names.seriesNameCollision(name)) return null
    const { mutation, id } = mutations.createSeries(name, defaultAttributes)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateSeries(series: TripSeries, fields: Record<string, unknown>): boolean {
    if (isTakenRename(fields, series.id, names.seriesNameCollision)) return false
    const mutation = mutations.updateSeries(series.id, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, seriesRow(series)),
    })
    return true
  }

  /** setTripSeries attaches (or, with null, detaches) a trip to a series. */
  function setTripSeries(tripId: string, seriesId: string | null) {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return
    const mutation = mutations.setTripSeries(tripId, seriesId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, tripRow(trip)),
    })
  }

  /**
   * ensureDestinationProfile returns the series' profile id, creating
   * the (unique, FR-13.2) profile on first use.
   */
  function ensureDestinationProfile(seriesId: string): string {
    const existing = masterStore.getDestinationProfile(seriesId)
    if (existing) return existing.id
    const { mutation, id } = mutations.createDestinationProfile(seriesId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateDestinationProfile(profile: DestinationProfile, fields: Record<string, unknown>) {
    const mutation = mutations.updateDestinationProfile(profile.id, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, profileRow(profile)),
    })
  }

  function addChecklistItem(profileId: string, label: string, mode: ItemMode): string {
    const { mutation, id } = mutations.addChecklistItem(profileId, label, mode)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateChecklistItem(item: DestinationChecklistItem, fields: Record<string, unknown>) {
    const mutation = mutations.updateChecklistItem(item.id, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, checklistItemRow(item)),
    })
  }

  function deleteChecklistItem(itemId: string) {
    const mutation = mutations.deleteChecklistItem(itemId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  return {
    createSeries,
    updateSeries,
    setTripSeries,
    ensureDestinationProfile,
    updateDestinationProfile,
    addChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
  }
}
