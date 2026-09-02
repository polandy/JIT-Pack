/**
 * The trip after it exists (M2/M4/M22): its own fields (FR-2.7), its status,
 * its roster, and a whole group added to it after the fact (FR-27.10). What
 * a trip *is*, as opposed to what is being packed on it — the packing group
 * owns the rows, this group owns the trip they hang off.
 *
 * Creation is not here. `createTripFromWizard` and `cloneTrip` write across
 * both partitions in an order the server's foreign keys dictate and drain
 * between them; they belong to the transport, not to the trip, and stay on
 * the orchestrator until that is cut.
 *
 * It is the group with the most edges to other groups — the roster reaches
 * FR-27.4 through the refresh, a group addition writes FR-27.7 tasks through
 * the comments and FR-20.4 companions through the packing group. They arrive
 * as one named `deps` object rather than four spine fields, for the reason
 * the refresh established: an edge between two groups is a fact about those
 * two, and the wiring is where it should be readable.
 */
import { TABLE } from '@/types/tables'
import { travelerRow, tripRow } from '../rows'
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import { cascadeChanges } from '@/sync/cascade'
import { planGroupAddition, type GroupAdditionReport } from '@/domain/groupAdd'
import { followsGroups } from '@/domain/trips'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/composables/useMutations'
import type { TripEdit } from '@/composables/useMutations'
import {
  TRIP_STATUS_ACTIVE,
  TRIP_STATUS_ARCHIVED,
  TRIP_STATUS_PLANNING,
  type Trip,
  type TripStatus,
  type TravelerChangeReport,
} from '@/types/domain'
import type { SyncContext } from '../context'
import type { createCommentActions } from './comments'
import type { createPackingActions } from './packing'
import type { createGroupRefreshActions } from './groupRefresh'

/** The other groups this one writes through. */
export interface TripLifecycleDeps {
  comments: ReturnType<typeof createCommentActions>
  packing: ReturnType<typeof createPackingActions>
  groupRefresh: ReturnType<typeof createGroupRefreshActions>
}

/** createTripLifecycleActions binds the trip's own life to one sync context. */
export function createTripLifecycleActions(ctx: SyncContext, deps: TripLifecycleDeps) {
  const { mutations, enqueueAndDrain, tripStore, masterStore, today, tripDataLoaded } = ctx
  const {
    comments: commentActions,
    packing: packingActions,
    groupRefresh: groupRefreshActions,
  } = deps

  /**
   * addGroupToTrip adds a whole group to a trip that already exists
   * (FR-27.10) — the M4 quick-add's second half.
   *
   * Three decisions are visible in what it writes:
   *
   * - **No FR-9.1 *Missing* flag**, unlike a single ad-hoc add on an active
   *   trip. The item was never missing from the plan; the plan grew. Flagging
   *   it would feed the M14 review assistant a lie and produce "add it to the
   *   template" proposals for items that came *from* a template.
   * - **The rows carry the group's provenance**, which is what keeps the
   *   round trip intact: FR-27.5 recognises them a year later instead of
   *   reporting them as ad-hoc additions.
   * - **The group is registered as one of the trip's sources** unless the trip
   *   is already past, so later group edits are offered to it per FR-27.4.
   *
   * Returns the report the caller shows, or null when the trip's rows are not
   * on the device: "not pulled yet" must never be read as "empty trip", which
   * is the one way this could duplicate the list it just resolved against.
   */
  function addGroupToTrip(tripId: string, templateId: string): GroupAdditionReport | null {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return null
    if (!tripDataLoaded(tripId)) return null
    const template = masterStore.getTemplate(templateId)
    if (!template) return null

    const plan = planGroupAddition({
      templateId,
      templates: masterStore.templateList,
      includes: masterStore.includeList,
      templateItems: [...masterStore.templateList].flatMap((t) =>
        masterStore.getTemplateItems(t.id),
      ),
      templateItemTasks: masterStore.templateItemTaskList,
      masterItems: masterStore.itemList,
      attributes: trip.attributes,
      duration_days: trip.duration_days,
      travelers: tripStore.getTravelers(tripId),
      items: tripStore.getItems(tripId),
    })

    for (const add of plan.add) {
      const { mutation, id } = mutations.addGeneratedTripItem(
        tripId,
        add.generated,
        add.traveler_id,
      )
      enqueueAndDrain('trip', tripId, {
        mutation,
        optimistic: optimisticInsert(mutation),
      })
      // FR-27.7 tasks become ordinary FR-7.3 todos, enqueued after the row
      // they hang off — pushed ahead of it, the server rejects the key.
      for (const body of add.generated.tasks) {
        commentActions.addPrepTodo(tripId, id, CLIENT_ACTOR_PLACEHOLDER, body)
      }
    }

    // FR-20.4, the same rule the single-item quick-add applies: what the group
    // placed brings its required companions. Adding twelve positions at once
    // must not be the one path that skips it. Once for the whole group rather
    // than per row — the resolution reads the settled list either way.
    if (plan.add.length > 0) packingActions.addRequiredCompanions(tripId)

    // Registered even when the group placed nothing: following it is about
    // what it does from here on, not about what it happened to contribute.
    const registered = tripStore
      .getTemplateSources(tripId)
      .some((s) => s.template_id === templateId)
    if (!registered && followsGroups(trip, today())) {
      const { mutation } = mutations.registerTripSource(tripId, templateId)
      enqueueAndDrain('master', null, {
        mutation,
        optimistic: optimisticInsert(mutation),
      })
    }

    return {
      groupName: template.name,
      added: plan.add.length,
      alreadyPresent: plan.alreadyPresent,
    }
  }

  /**
   * updateTrip writes an FR-2.7 edit of the trip's own fields. Master
   * partition: `trips` lives there, beside the templates.
   */
  function updateTrip(tripId: string, fields: TripEdit): void {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return
    const mutation = mutations.updateTrip(tripId, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, tripRow(trip)),
    })
  }

  /**
   * renameTraveler changes a traveler's name (FR-2.7). Deliberately *not* a
   * removal plus an addition: every row assigned to them points at this row,
   * and re-creating it would detach all of them at the moment the user meant
   * the least by the change.
   */
  function renameTraveler(tripId: string, travelerId: string, name: string): void {
    const traveler = tripStore.getTravelers(tripId).find((t) => t.id === travelerId)
    if (!traveler) return
    const mutation = mutations.renameTraveler(travelerId, name)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticUpdate(mutation, travelerRow(traveler)),
    })
  }

  /**
   * addTravelerToTrip adds a person to a trip that already exists (FR-2.7)
   * and lets the trip's plan follow **immediately** — the FR-27.4 amendment
   * of 2026-08-21. It performs no resolution of its own: the travelers were
   * always part of what a trip follows, so the work is `acceptTripRefresh`,
   * the same path the "yes" on M4's card takes. That is the whole point of
   * routing it here rather than expanding per-person rows a second way.
   *
   * Returns what happened, so the screen can report it (FR-27.10's pattern)
   * rather than leave the user guessing which rows appeared. Null when the
   * trip cannot be seen or its data is not loaded.
   *
   * `linkedUserId` is the account the person is (FR-2.5). M22 has no control
   * for it and passes nothing; `jitpack traveler --user` does, and reaches
   * this rather than the bare mutation so the plan follows there too.
   */
  function addTravelerToTrip(
    tripId: string,
    name: string,
    linkedUserId: string | null = null,
  ): TravelerChangeReport | null {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return null
    if (!tripDataLoaded(tripId)) return null

    const { mutation, id } = mutations.addTraveler(tripId, name, linkedUserId)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })

    return { travelerId: id, ...applyTravelerConsequences(tripId, trip) }
  }

  /**
   * packedRowsOf counts what a traveller's removal would have to decide about:
   * their rows that packing has begun on. The editor asks its FR-2.7 question
   * only when this is non-zero — a choice offered over nothing is a dialogue
   * the user learns to dismiss.
   */
  function packedRowsOf(tripId: string, travelerId: string): number {
    return tripStore
      .getItems(tripId)
      .filter((i) => i.assigned_traveler_id === travelerId && i.packed_count > 0).length
  }

  /**
   * removeTraveler takes a person off a trip that has **not started** — the
   * owner's rule (FR-2.7). On a started trip it refuses and returns null;
   * the control is disabled there, so this is the second line rather than
   * the first, and it exists because a store is reachable from more than one
   * screen.
   *
   * Their **unpacked** rows go with them through FR-27.4, whose protection is
   * what keeps a packed one out of it. What happens to *those* is the user's
   * call, taken at the confirmation (owner, 2026-08-21): `includePacked`
   * deletes them outright — the person is not coming, so the thing comes back
   * out of the bag — while the default leaves them on the list without an
   * assignment, as the reminder that something in the bag now belongs to
   * nobody. Neither is right in general, which is why it is asked.
   */
  function removeTraveler(
    tripId: string,
    travelerId: string,
    opts: { includePacked?: boolean } = {},
  ): TravelerChangeReport | null {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return null
    if (!tripDataLoaded(tripId)) return null
    if (trip.status !== TRIP_STATUS_PLANNING) return null

    let takenPacked = 0
    for (const item of tripStore.getItems(tripId)) {
      if (item.assigned_traveler_id !== travelerId) continue
      if (opts.includePacked && item.packed_count > 0) {
        // Deleted here rather than left to the refresh: FR-27.4 protects a row
        // packing has begun on, and that protection is exactly what the user
        // just overruled for this person.
        const deletion = mutations.deleteTripItem(item.id)
        enqueueAndDrain('trip', tripId, {
          mutation: deletion,
          optimistic: optimisticDelete(deletion),
        })
        takenPacked += 1
        continue
      }
      // Detach first, then delete the traveler: a row still pointing at a
      // traveler row that is gone is a dangling reference the refresh would
      // have to guess about.
      packingActions.assignTraveler(tripId, item, null)
    }

    const mutation = mutations.removeTravelerRow(travelerId)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })

    const report = applyTravelerConsequences(tripId, trip)
    return {
      travelerId,
      ...report,
      removed: report.removed + takenPacked,
      kept: Math.max(0, report.kept - takenPacked),
    }
  }

  /**
   * applyTravelerConsequences runs FR-27.4 for a roster change the user just
   * made, and reports what it did. A trip that no longer follows its groups
   * (archived, or past) changes nothing but its roster — the same boundary
   * every other refresh respects.
   */
  function applyTravelerConsequences(
    tripId: string,
    trip: Trip,
  ): Omit<TravelerChangeReport, 'travelerId'> {
    if (!followsGroups(trip, today())) return { added: 0, removed: 0, kept: 0 }
    const before = tripStore.getItems(tripId).length
    const plan = groupRefreshActions.acceptTripRefresh(tripId)
    if (!plan) return { added: 0, removed: 0, kept: 0 }
    const after = tripStore.getItems(tripId).length
    return {
      added: plan.add.length,
      removed: plan.remove.length,
      // Rows the refresh deliberately left alone. Reported rather than
      // inferred: a row that stays behind after its person left is exactly
      // the thing a user finds later and does not understand.
      kept: Math.max(0, before - after - plan.remove.length) + plan.update.length,
    }
  }

  function setTripStatus(tripId: string, status: TripStatus) {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return
    const mutation = mutations.updateTripStatus(tripId, status)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, tripRow(trip)),
    })
  }

  /**
   * activateTrip moves a planning trip into packing. The wizard only ever
   * creates planning trips, so without this a trip could reach *active*
   * nowhere in the app — the state that decides FR-9.1's Missing flagging
   * and M4's archive action.
   */
  function activateTrip(tripId: string) {
    setTripStatus(tripId, TRIP_STATUS_ACTIVE)
  }

  /** archiveTrip completes the trip; archiving is the M14 review trigger. */
  function archiveTrip(tripId: string) {
    setTripStatus(tripId, TRIP_STATUS_ARCHIVED)
  }

  /**
   * deleteTrip removes a trip entirely (M2, Owner/Admin only — the server
   * enforces the role, this is the optimistic tombstone).
   *
   * One mutation, many changes: the delete cascades in the schema, and the
   * server can announce only the three child tables that travel the master
   * partition — `change_log.trip_id` cascades too, so the trip partition's
   * own feed dies with the row it describes. Everything else has to be
   * tombstoned here, because the change list is what Local Mode persists
   * (C-3a): a delete naming only the trip left every child row on the device,
   * where the next start read them back.
   */
  function deleteTrip(tripId: string) {
    const mutation = mutations.deleteTrip(tripId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: [
        ...cascadeChanges(TABLE.trips, tripId, { tripStore, masterStore }),
        optimisticDelete(mutation),
      ],
    })
  }

  return {
    addGroupToTrip,
    updateTrip,
    renameTraveler,
    addTravelerToTrip,
    packedRowsOf,
    removeTraveler,
    setTripStatus,
    activateTrip,
    archiveTrip,
    deleteTrip,
  }
}
