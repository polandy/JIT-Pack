/**
 * The trip after it exists (M2/M4/M22): its own fields (FR-2.7), its status,
 * its roster, and a whole group added to it after the fact (FR-27.10). What
 * a trip *is*, as opposed to what is being packed on it — the packing group
 * owns the rows, this group owns the trip they hang off.
 *
 * Creation is not here. `createTripFromWizard` and `cloneTrip` write across
 * both partitions in an order the server's foreign keys dictate and push
 * once at the end; that order is a group of its own, `tripCreation`.
 *
 * It is the group with the most edges to other groups — the roster reaches
 * FR-27.4 through the refresh, a group addition writes FR-27.7 tasks through
 * the comments and FR-20.4 companions through the packing group. They arrive
 * as one named `deps` object rather than four spine fields, for the reason
 * the refresh established: an edge between two groups is a fact about those
 * two, and the wiring is where it should be readable.
 */
import { TABLE } from '@/types/tables'
import { itemRow, travelerRow, tripRow } from '../rows'
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import { cascadeChanges } from '@/sync/cascade'
import { planGroupAddition, type GroupAdditionReport } from '@/domain/groupAdd'
import { planPackingClose, type ClosingTask } from '@/domain/closePacking'
import { TASK_PHASE_DURING, type TaskPhase } from '@/types/domain'

/**
 * FR-7.7: one task the close moved, with the phase it had before.
 *
 * The phase is snapshotted rather than assumed: a task written before FR-7.7
 * carries none at all, and an undo that wrote *before* onto it would be an
 * undo that changed something.
 */
export interface TaskPhaseRecord {
  task: ClosingTask
  phase: TaskPhase | null
}

/** What closing the packing touched, for the one snackbar that takes it back. */
export interface ClosePackingEffect {
  rows: TripItem[]
  tasks: TaskPhaseRecord[]
}
import { followsGroups } from '@/domain/trips'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import type { TripEdit } from '@/sync/mutations'
import {
  TRIP_STATUS_ACTIVE,
  TRIP_STATUS_ARCHIVED,
  TRIP_STATUS_PLANNING,
  type Trip,
  type TripItem,
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
  const {
    mutations,
    enqueueAndDrain,
    tripStore,
    masterStore,
    features,
    today,
    nowIso,
    tripDataLoaded,
  } = ctx
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
      masterItems: masterStore.categorisedItemList,
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
      unassignable: plan.unassignable,
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
   * linkTraveler records which account a traveler is, or clears that record
   * (FR-2.5, ADR-058). Like `renameTraveler` it touches the roster row and
   * nothing else: the link feeds notifications, and no position on the list
   * depends on it, so FR-27.4's consequences have nothing to follow here.
   *
   * The caller is responsible for offering only members of this trip — the
   * server refuses anything else with `not_a_trip_member`, and an outbox
   * that has to be un-rejected is a worse answer than a picker that never
   * offered the name.
   */
  function linkTraveler(tripId: string, travelerId: string, userId: string | null): void {
    const traveler = tripStore.getTravelers(tripId).find((t) => t.id === travelerId)
    if (!traveler || (traveler.linked_user_id ?? null) === userId) return
    const mutation = mutations.linkTraveler(travelerId, userId)
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
   * `linkedUserId` is the account the person *is* (FR-2.5), set in the same
   * act by M22's add row and by `jitpack traveler --user`. It is written
   * **after** the consequences and as its own mutation rather than on the
   * insert, and that ordering is the whole reason this parameter is handled
   * here instead of being passed to `mutations.addTraveler`:
   * `planRosterAssignment` notifies a linked account for every push that
   * points an `assigned_traveler_id` at their traveller, so a row that
   * arrived already linked would earn that account one delegation
   * notification per per-person row FR-27.4 generates for them. Inserted
   * unlinked, those rows find no account to tell, and the link that follows
   * moves no assignment of its own.
   */
  function addTravelerToTrip(
    tripId: string,
    name: string,
    linkedUserId: string | null = null,
  ): TravelerChangeReport | null {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return null
    if (!tripDataLoaded(tripId)) return null

    const { mutation, id } = mutations.addTraveler(tripId, name, null)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })

    const consequences = applyTravelerConsequences(tripId, trip)
    if (linkedUserId !== null) linkTraveler(tripId, id, linkedUserId)

    return { travelerId: id, ...consequences }
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

  /** FR-5.10's stamp, and the way back out of it. */
  function stampPackingClosed(tripId: string, at: string | null) {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return
    const mutation = mutations.setPackingClosed(tripId, at)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, tripRow(trip)),
    })
  }

  /**
   * closePacking finishes the packing (FR-5.10): everything still open
   * becomes a decision — *bewusst nicht mitgenommen* where nothing was
   * packed, and the amount of what is in the bag where some of it was
   * (`domain/closePacking`, variant P1).
   *
   * Two partitions, deliberately in this order: the rows first, then the
   * trip's stamp. The stamp is what every screen reads afterwards, so it
   * must not be visible before what it claims about the rows is.
   *
   * It writes the stamp even where no row changed — a list that is already
   * fully packed is exactly the one somebody declares finished — and it does
   * **not** touch the lifecycle: starting and archiving stay their own steps.
   *
   * **FR-7.7 amends what it leaves alone.** The tasks used to be outside this
   * entirely (*„todos are not packing"*); since the owner's request of
   * 2026-09-20 every task still open and still meant for before the trip
   * crosses to *during* here, because the packing being finished is the
   * moment „before" ends. The rule is `tasksCrossing`, in the same plan the
   * question was read from.
   *
   * Returns the rows and the tasks it changed, snapshotted before the write,
   * for the snackbar's one undo (FR-25.31) — the same contract `skipItem`
   * has, widened by exactly what this action now also touches.
   */
  function closePacking(
    tripId: string,
    opts: { isClaimed?: (item: TripItem) => boolean } = {},
  ): ClosePackingEffect {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return { rows: [], tasks: [] }
    const plan = planPackingClose(tripStore.getItems(tripId), {
      ...opts,
      tasks: tasksOf(tripId),
    })
    const writes = [
      ...plan.skip.map((row) => ({ row, mutation: mutations.closeRowUnpacked(row.id) })),
      ...plan.trim.map((row) => ({
        row,
        mutation: mutations.closeRowPartlyPacked(row.id, row.packed_count),
      })),
    ].map(({ row, mutation }) => ({
      mutation,
      optimistic: optimisticUpdate(mutation, itemRow(row)),
    }))
    if (writes.length > 0) enqueueAndDrain('trip', tripId, ...writes)

    // The crossing, in the same partition and before the stamp for the same
    // reason the rows are: the stamp is what every screen reads afterwards,
    // so nothing it claims may still be in flight when it lands.
    const moved = plan.tasks.map((task) => ({ task, phase: task.phase }))
    for (const { task } of moved) commentActions.setTaskPhase(tripId, task, TASK_PHASE_DURING)

    stampPackingClosed(tripId, nowIso())
    return { rows: plan.rows, tasks: moved }
  }

  /** Every task of the trip, both kinds, as the close reads them (FR-7.7). */
  function tasksOf(tripId: string): ClosingTask[] {
    return [...tripStore.getTripTodos(tripId), ...tripStore.getTodos(tripId)]
  }

  /**
   * FR-5.10's way back: the packing is open again, and the rows it decided
   * stay decided.
   *
   * Reopening is not an undo — the undo is the snackbar's, for the seconds
   * in which it means the tap just made. A row left behind an hour ago comes
   * back one at a time through FR-5.5's reveal, because that is what the
   * decision was; and with variant P1 the amount a half-packed row wanted is
   * no longer recorded anywhere, so a wholesale restore would have to invent
   * it.
   */
  function reopenPacking(tripId: string) {
    stampPackingClosed(tripId, null)
  }

  /**
   * The snackbar's undo of {@link closePacking}: the rows go back where the
   * close found them, the tasks go back to the phase they were in, and the
   * trip is not closed after all.
   *
   * The rows are restored through the skip's own undo, which writes the three
   * fields both closing writes touched — and only those, which is why the
   * tasks are passed in separately and put back here rather than riding along
   * in `records`. A claim the close released is *not* restored: it was
   * somebody else's hold on a row, and it has been given up in the meantime —
   * a few seconds of a snackbar is not a reason to hand it back.
   *
   * An undo is not a reopen. *Wieder öffnen* lifts the stamp and nothing else
   * (FR-5.10): the rows it decided stay decided, and so do the tasks it
   * moved. This is the other case — the tap just made, taken back whole.
   */
  function restorePackingClose(
    tripId: string,
    records: { itemId: string; quantity: number; packedCount: number; state: string }[],
    tasks: readonly TaskPhaseRecord[] = [],
  ) {
    packingActions.restoreSkip(tripId, records)
    // The phase each task actually had, not a hard-coded *before*: a task
    // written before FR-7.7 carries none at all, and inventing one would be
    // an undo that changed something.
    for (const { task, phase } of tasks) commentActions.setTaskPhase(tripId, task, phase)
    stampPackingClosed(tripId, null)
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
        ...cascadeChanges(TABLE.trips, tripId, { tripStore, masterStore, features }),
        optimisticDelete(mutation),
      ],
    })
  }

  return {
    addGroupToTrip,
    updateTrip,
    renameTraveler,
    linkTraveler,
    addTravelerToTrip,
    packedRowsOf,
    removeTraveler,
    setTripStatus,
    activateTrip,
    archiveTrip,
    closePacking,
    reopenPacking,
    restorePackingClose,
    deleteTrip,
  }
}
