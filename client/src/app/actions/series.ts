/**
 * Series and destination-profile actions (FR-13.1/13.2, M16) — master
 * partition. Moved out of the orchestrator closure under R-4; moves only, so
 * `useSyncOrchestrator`'s return shape is untouched.
 */
import { isTakenRename } from '../names'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import type {
  ChecklistItemEdit,
  DestinationProfileEdit,
  DestinationTaskEdit,
  SeriesEdit,
} from '@/sync/mutations'
import {
  type DestinationChecklistItem,
  type DestinationProfile,
  type DestinationTask,
  type ItemMode,
  TASK_PHASE_BEFORE,
  TRIP_STATUS_ARCHIVED,
  type TripSeries,
} from '@/types/domain'
import {
  materializeSeriesTasks,
  type SeriesTaskDraft,
  type SeriesTaskMaterialization,
} from '@/domain/shared/seriesTask'
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

  /**
   * FR-13.4: a series task, written on the series' profile (lazily created,
   * as a note or a checklist entry is) rather than on any one trip — it is
   * materialised onto a trip only when one is generated or joins.
   */
  function addDestinationTask(
    seriesId: string,
    task: string,
    leadDays: number | null = null,
    assigneeUserId: string | null = null,
  ): string {
    const profileId = ensureDestinationProfile(seriesId)
    const { mutation, id } = mutations.addDestinationTask(profileId, task, leadDays, assigneeUserId)
    write(mutation)
    return id
  }

  function updateDestinationTask(task: DestinationTask, fields: DestinationTaskEdit) {
    write(mutations.updateDestinationTask(task.id, fields))
  }

  function deleteDestinationTask(taskId: string) {
    write(mutations.deleteDestinationTask(taskId))
  }

  /**
   * FR-13.4: a later-joining trip's offer sheet — the series tasks it does
   * not yet carry, by the wizard's own dedup (`materializeSeriesTasks`).
   * `null` is "nothing to offer", for any of the reasons the spec names: no
   * series, no series tasks, an archived trip (a trip that is over gains no
   * new preparation), or every one of them is already on the trip.
   */
  function offerSeriesTasks(tripId: string): SeriesTaskMaterialization | null {
    const trip = tripStore.getTrip(tripId)
    if (!trip || trip.status === TRIP_STATUS_ARCHIVED || !trip.series_id) return null
    const profile = masterStore.getDestinationProfile(trip.series_id)
    if (!profile) return null
    const seriesTasks = masterStore.getDestinationTasks(profile.id)
    if (seriesTasks.length === 0) return null
    const result = materializeSeriesTasks(
      seriesTasks,
      tripStore.getOwnTasks(tripId).map((task) => task.body),
      tripStore.getMembers(tripId).map((member) => member.user_id),
    )
    return result.toCreate.length === 0 ? null : result
  }

  /**
   * applySeriesTaskOffer writes the sheet's ticked drafts onto the trip —
   * each an ordinary FR-7.4 trip task naming its series origin and lead
   * (ADR-106), assigned when the draft still names one (`offerSeriesTasks`
   * already dropped any that is not a trip member).
   */
  function applySeriesTaskOffer(tripId: string, drafts: readonly SeriesTaskDraft[]): void {
    for (const draft of drafts) {
      const { mutation, id } = mutations.addTask(
        tripId,
        null,
        CLIENT_ACTOR_PLACEHOLDER,
        draft.body,
        TASK_PHASE_BEFORE,
        { destinationTaskId: draft.destination_task_id, startLeadDays: draft.start_lead_days },
      )
      write(mutation)
      if (draft.assignee_user_id) {
        write(mutations.setTaskAssignee(id, draft.assignee_user_id))
      }
    }
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
    addDestinationTask,
    updateDestinationTask,
    deleteDestinationTask,
    offerSeriesTasks,
    applySeriesTaskOffer,
  }
}
