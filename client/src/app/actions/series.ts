/**
 * Series and destination-profile actions (FR-13.1/13.2, M16) — master
 * partition. Moved out of the orchestrator closure under R-4; moves only, so
 * `useSyncOrchestrator`'s return shape is untouched.
 */
import { isTakenRename } from '../names'
import type { ChecklistItemEdit, DestinationProfileEdit, SeriesEdit } from '@/sync/mutations'
import type {
  DestinationChecklistItem,
  DestinationProfile,
  ItemMode,
  TripSeries,
} from '@/types/domain'
import type { SyncContext } from '../context'

/** createSeriesActions binds the series/destination group to one sync context. */
export function createSeriesActions(ctx: SyncContext) {
  const { mutations, write, tripStore, masterStore, names } = ctx

  function createSeries(
    name: string,
    defaultAttributes: Record<string, unknown> | null = null,
  ): string | null {
    if (names.seriesNameCollision(name)) return null
    const { mutation, id } = mutations.createSeries(name, defaultAttributes)
    write(mutation)
    return id
  }

  function updateSeries(series: TripSeries, fields: SeriesEdit): boolean {
    if (isTakenRename(fields, series.id, names.seriesNameCollision)) return false
    write(mutations.updateSeries(series.id, fields))
    return true
  }

  /** setTripSeries attaches (or, with null, detaches) a trip to a series. */
  function setTripSeries(tripId: string, seriesId: string | null) {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return
    write(mutations.setTripSeries(tripId, seriesId))
  }

  /**
   * ensureDestinationProfile returns the series' profile id, creating
   * the (unique, FR-13.2) profile on first use.
   */
  function ensureDestinationProfile(seriesId: string): string {
    const existing = masterStore.getDestinationProfile(seriesId)
    if (existing) return existing.id
    const { mutation, id } = mutations.createDestinationProfile(seriesId)
    write(mutation)
    return id
  }

  function updateDestinationProfile(profile: DestinationProfile, fields: DestinationProfileEdit) {
    write(mutations.updateDestinationProfile(profile.id, fields))
  }

  function addChecklistItem(profileId: string, label: string, mode: ItemMode): string {
    const { mutation, id } = mutations.addChecklistItem(profileId, label, mode)
    write(mutation)
    return id
  }

  function updateChecklistItem(item: DestinationChecklistItem, fields: ChecklistItemEdit) {
    write(mutations.updateChecklistItem(item.id, fields))
  }

  function deleteChecklistItem(itemId: string) {
    write(mutations.deleteChecklistItem(itemId))
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
