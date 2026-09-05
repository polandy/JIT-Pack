/**
 * The FR-27.4 group refresh (M2/M4): a trip that follows a Vorlage is *asked*
 * about what moved in it rather than being rewritten behind the user's back
 * (ADR-016, and the owner's 2026-08-18 revision that moved the question to
 * the trip). The whole group is one question asked three ways — derive, then
 * yes, no, or nothing to ask.
 *
 * The proposals are the one piece of orchestrator state that moved with its
 * group, because nothing else reads it: a plan is a diff between rows that
 * are already synced, so every device derives the same one and none of them
 * has to agree with the others about a pending decision.
 *
 * It is the first group that depends on another one. FR-27.7's preparation
 * tasks arrive as ordinary FR-7.3 prep todos, so the comment group's writer
 * is passed in beside the context — a group edge is an argument, deliberately
 * visible at the wiring, rather than another field on the spine. The argument
 * is a named object because the next group along needed three of them.
 */
import { computed, shallowRef } from 'vue'
import { itemRow } from '../rows'
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import {
  declinePlan,
  isEmptyPlan,
  planRefresh,
  proposedChangeCount,
  type RefreshPlan,
} from '@/domain/refresh'
import { followsGroups } from '@/domain/trips'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import type { SyncContext } from '../context'
import type { createCommentActions } from './comments'

/**
 * createGroupRefreshActions binds the refresh to one sync context and the
 * comment group it writes FR-27.7's tasks through.
 */
export function createGroupRefreshActions(
  ctx: SyncContext,
  deps: { comments: ReturnType<typeof createCommentActions> },
) {
  const { mutations, enqueueAndDrain, tripStore, masterStore, today, tripDataLoaded } = ctx
  const { comments: commentActions } = deps

  /**
   * The open questions, by trip id (FR-27.4). Derived state, deliberately
   * not synced: a proposal is a diff between rows that are already synced,
   * so every device computes the same one and none of them has to agree
   * with the others about a pending decision.
   */
  // shallowRef, not ref: a plan is replaced wholesale and never edited in
  // place, and deep reactivity over a diff of every changed row would be paid
  // for on every trip open.
  const proposals = shallowRef<Record<string, RefreshPlan>>({})
  const refreshProposals = computed(() => proposals.value)

  /**
   * proposeTripRefresh re-resolves one trip against the groups it follows
   * and *offers* what moved (FR-27.4). It runs on every trip open and after
   * every master pull, so the empty plan is the normal case and must cost
   * nothing.
   *
   * Nothing on the trip is written here — that is the whole point of the
   * split: the owner's rule (2026-08-18) is that a group change reaches a
   * trip by being asked about, and the question is asked at the trip. What
   * this *does* write, immediately and silently, is the bookkeeping half of
   * a plan that proposes nothing: adopting a hand-added row into the ledger
   * changes nothing the user could answer a question about, and leaving it
   * unwritten would re-derive it on every open forever.
   *
   * Returns the plan, so a caller (and a test) can read what is on offer
   * rather than infer it from the resulting rows.
   */
  function proposeTripRefresh(tripId: string): RefreshPlan | null {
    const plan = deriveTripRefresh(tripId)
    if (!plan) return null
    if (proposedChangeCount(plan) === 0) {
      applyRefreshPlan(tripId, plan)
      clearProposal(tripId)
      return plan
    }
    proposals.value = { ...proposals.value, [tripId]: plan }
    return plan
  }

  /**
   * acceptTripRefresh is the answer "yes": the trip takes the changes over
   * and M2's log records them.
   *
   * It re-derives rather than applying the plan it was shown. The group may
   * have moved again between the question and the answer — on this device or
   * another one — and applying the fresher diff is both simpler to reason
   * about than reconciling two plans and closer to what the user meant.
   */
  function acceptTripRefresh(tripId: string): RefreshPlan | null {
    const plan = deriveTripRefresh(tripId)
    if (!plan) return null
    applyRefreshPlan(tripId, plan)
    clearProposal(tripId)
    return plan
  }

  /**
   * declineTripRefresh is the answer "no": the trip keeps what it has and
   * the refused positions stop following the group (see declinePlan).
   */
  function declineTripRefresh(tripId: string): RefreshPlan | null {
    const plan = deriveTripRefresh(tripId)
    if (!plan) return null
    const declined = declinePlan(plan)
    applyRefreshPlan(tripId, declined)
    clearProposal(tripId)
    return declined
  }

  function clearProposal(tripId: string): void {
    if (!(tripId in proposals.value)) return
    const next = { ...proposals.value }
    delete next[tripId]
    proposals.value = next
  }

  /** The diff, derived and never applied. Null when the trip cannot be seen. */
  function deriveTripRefresh(tripId: string): RefreshPlan | null {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return null
    if (!tripDataLoaded(tripId)) return null

    return planRefresh({
      trip,
      sources: tripStore.getTemplateSources(tripId),
      templates: masterStore.templateList,
      includes: masterStore.includeList,
      templateItems: [...masterStore.templateList].flatMap((t) =>
        masterStore.getTemplateItems(t.id),
      ),
      templateItemTasks: masterStore.templateItemTaskList,
      masterItems: masterStore.itemList,
      travelers: tripStore.getTravelers(tripId),
      items: tripStore.getItems(tripId),
      todos: tripStore.getTodos(tripId),
      ledger: tripStore.getGeneratedPositions(tripId),
      today: today(),
    })
  }

  /** Writes a plan out — every half of it, in dependency order. */
  function applyRefreshPlan(tripId: string, plan: RefreshPlan): void {
    if (isEmptyPlan(plan)) return

    for (const add of plan.add) {
      const travelerId = add.traveler_id
      const { mutation, id } = mutations.addGeneratedTripItem(
        tripId,
        add.generated,
        travelerId,
        add.trip_item_id,
      )
      enqueueAndDrain('trip', tripId, {
        mutation,
        optimistic: optimisticInsert(mutation),
      })
      // FR-27.7: the position's tasks arrive as ordinary prep todos, the
      // same shape generation writes — enqueued after the row they hang
      // off, or the server rejects the foreign key.
      for (const body of add.generated.tasks) {
        commentActions.addPrepTodo(tripId, id, CLIENT_ACTOR_PLACEHOLDER, body)
      }
    }

    for (const update of plan.update) {
      if (Object.keys(update.fields).length > 0) {
        const mutation = mutations.updateGeneratedTripItem(update.item.id, update.fields)
        enqueueAndDrain('trip', tripId, {
          mutation,
          optimistic: optimisticUpdate(mutation, itemRow(update.item)),
        })
      }
      for (const body of update.addTasks) {
        commentActions.addPrepTodo(tripId, update.item.id, CLIENT_ACTOR_PLACEHOLDER, body)
      }
      for (const todo of update.removeTodos) {
        const todoDeletion = mutations.deleteTodo(todo.id)
        enqueueAndDrain('trip', tripId, {
          mutation: todoDeletion,
          optimistic: optimisticDelete(todoDeletion),
        })
      }
    }

    for (const removal of plan.remove) {
      const removalMutation = mutations.deleteTripItem(removal.item.id)
      enqueueAndDrain('trip', tripId, {
        mutation: removalMutation,
        optimistic: optimisticDelete(removalMutation),
      })
    }

    for (const entry of plan.ledgerUpsert) {
      const mutation = mutations.writeGeneratedPosition(entry)
      enqueueAndDrain('trip', tripId, {
        mutation,
        optimistic: optimisticInsert(mutation),
      })
    }

    for (const entryId of plan.ledgerDelete) {
      const ledgerDeletion = mutations.deleteGeneratedPosition(entryId)
      enqueueAndDrain('trip', tripId, {
        mutation: ledgerDeletion,
        optimistic: optimisticDelete(ledgerDeletion),
      })
    }

    // The log travels the master partition so M2 can render the chip
    // without this trip's partition being loaded (P-3, migration 023).
    for (const entry of plan.log) {
      const { mutation } = mutations.logAppliedChange(entry)
      enqueueAndDrain('master', null, {
        mutation,
        optimistic: optimisticInsert(mutation),
      })
    }
  }

  /**
   * proposeRefreshForLoadedTrips derives a proposal for every trip this
   * device actually holds. Called after a master pull: a group edited on
   * another device arrives there, and M2 must be able to say which trips it
   * concerns before any of them is opened.
   */
  function proposeRefreshForLoadedTrips(): void {
    const now = today()
    for (const trip of tripStore.tripList) {
      // A short-circuit, not a rule: `planRefresh` asks the same question and
      // returns an empty plan for a past trip, so this changes no outcome and
      // no test can hold it. What it saves is a full re-resolution of every
      // archived trip on the device, on every master pull.
      if (!followsGroups(trip, now)) continue
      proposeTripRefresh(trip.id)
    }
  }

  return {
    refreshProposals,
    proposeTripRefresh,
    acceptTripRefresh,
    declineTripRefresh,
    deriveTripRefresh,
    applyRefreshPlan,
    clearProposal,
    proposeRefreshForLoadedTrips,
  }
}
