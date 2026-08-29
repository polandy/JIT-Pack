/**
 * Packing actions (M4/M5/M6): the pack-out itself (FR-25.2), FR-5.5's skip
 * with its FR-20.2 companions, M6's shopping check-off (FR-25.11j), the
 * per-row assignments (FR-25.19/25.20) and FR-9.1's review flags — every
 * write a row takes while a trip is being packed.
 *
 * G-3's claim is **not** here, though M4 renders it on the same row:
 * `packingNow`, `takeOverClaim` and `releaseClaim` write the device's own
 * lock bookkeeping, and `takeOverClaim` goes through the server rather than
 * the outbox (FR-5.7, ADR-028). They belong to the lock group, whose state
 * this group never touches.
 */
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import { itemRow } from '../rows'
import { coSkipTargets, resolveDependencies } from '@/domain/dependencies'
import { planMembership, type MembershipTarget } from '@/domain/membership'
import type { ItemMode, ReviewFlag, ShoppingMode, TripItem } from '@/types/domain'
import type { SyncContext } from '../context'

/** createPackingActions binds the packing group to one sync context. */
export function createPackingActions(ctx: SyncContext) {
  const { mutations, enqueueAndDrain, tripStore, masterStore } = ctx

  /** Pack: increment packed count on a trip item. */
  function packIncrement(tripId: string, item: TripItem) {
    const mut = mutations.incrementPacked(item.id, item.packed_count, item.quantity)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function packDecrement(tripId: string, item: TripItem) {
    const mut = mutations.decrementPacked(item.id, item.packed_count)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function packComplete(tripId: string, item: TripItem) {
    const mut = mutations.completePacked(item.id, item.quantity)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function packZero(tripId: string, item: TripItem) {
    const mut = mutations.zeroPacked(item.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  /**
   * Put a row back the way FR-25.2's undo found it.
   *
   * Takes the id rather than the row, and re-reads the current one: by the
   * time undo fires, the row on screen is the *packed* one, and building an
   * optimistic patch from the caller's stale snapshot would also revert
   * anything that landed in between — a packer avatar, a sync from another
   * device. Only `packed_count` and `state` are restored, which is exactly
   * what the pack changed.
   */
  function restorePack(tripId: string, itemId: string, packedCount: number, state: string) {
    const current = tripStore.getItems(tripId).find((row) => row.id === itemId)
    // Gone between the pack and the undo — deleted here or on another
    // device. Doing nothing is the correct outcome rather than a swallowed
    // one: re-upserting would resurrect a row somebody removed on purpose.
    if (!current) return
    const mut = mutations.packItem(itemId, packedCount, state)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(current)),
    })
  }

  function packToggle(tripId: string, item: TripItem) {
    const mut = mutations.togglePacked(item.id, item.packed_count)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  /**
   * Mark a row deliberately not packed (FR-5.5), taking its companions with
   * it (FR-20.2).
   *
   * Returns every row it skipped, main first, snapshotted *before* the
   * write: FR-5.5's snackbar names the companions that went along, and its
   * undo has to put back exactly those rows and no others.
   */
  function skipItem(tripId: string, item: TripItem): TripItem[] {
    const skipOne = (target: TripItem) => {
      const mut = mutations.skipItem(target.id)
      return {
        mutation: mut,
        optimistic: optimisticUpdate(mut, itemRow(target)),
      }
    }
    // FR-20.2: skipping a main item co-skips its (transitive) companions —
    // they stay skipped alongside it instead of vanishing.
    const affected = [
      item,
      ...coSkipTargets(item, tripStore.getItems(tripId), masterStore.dependencyList),
    ]
    enqueueAndDrain('trip', tripId, ...affected.map(skipOne))
    return affected
  }

  /**
   * Undo a skip: put each row back where {@link skipItem} found it.
   *
   * Re-read against the current row for the same reason {@link restorePack}
   * is — by the time the undo fires, a sync or another device may have
   * touched the row, and only the three fields the skip wrote may be
   * reverted. A row that has since been deleted is left deleted.
   */
  function restoreSkip(
    tripId: string,
    records: { itemId: string; quantity: number; packedCount: number; state: string }[],
  ) {
    const current = tripStore.getItems(tripId)
    const muts = []
    for (const record of records) {
      const row = current.find((candidate) => candidate.id === record.itemId)
      if (!row) continue
      const mut = mutations.restoreSkipped(
        record.itemId,
        record.quantity,
        record.packedCount,
        record.state,
      )
      muts.push({
        mutation: mut,
        optimistic: optimisticUpdate(mut, itemRow(row)),
      })
    }
    if (muts.length > 0) enqueueAndDrain('trip', tripId, ...muts)
  }

  function unskipItem(tripId: string, item: TripItem) {
    const mut = mutations.unskipItem(item.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  /**
   * Check a row off one of M6's shopping lists, or put it back (FR-25.11j).
   * One mutation each way, so the record of the list and the change it
   * explains can never land apart — see `useMutations.buyItem`.
   */
  function buyItem(tripId: string, item: TripItem, from: ShoppingMode) {
    const mut = mutations.buyItem(item.id, from, item.quantity)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function unbuyItem(tripId: string, item: TripItem, from: ShoppingMode) {
    const mut = mutations.unbuyItem(item.id, from)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function setMode(tripId: string, item: TripItem, mode: ItemMode) {
    const mut = mutations.setItemMode(item.id, mode)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function assignTraveler(tripId: string, item: TripItem, travelerId: string | null) {
    const mut = mutations.assignTraveler(item.id, travelerId)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  /**
   * FR-25.21: who needs this item, and how many each. The decision is
   * `planMembership`'s (ADR-036); this only turns its plan into mutations, in
   * one enqueue so a conversion reaches the outbox as a single unit.
   *
   * The inserted rows carry the plan's *derived* ids, which is the whole point
   * of the derivation: two devices converting the same row offline converge on
   * one row per traveler, and FR-27.4 later adopts the row instead of adding a
   * second beside it. Deliberately not copied onto a new row: the container —
   * a bag is a physical decision about one person's things, not a property of
   * the item somebody else also needs.
   */
  function setMembership(
    tripId: string,
    rows: TripItem[],
    target: MembershipTarget,
    rowsWithContent: string[],
  ) {
    const plan = planMembership({
      tripId,
      rows,
      travelers: tripStore.getTravelers(tripId),
      rowsWithContent,
      target,
    })
    if (plan.empty) return plan

    const byId = new Map(rows.map((r) => [r.id, r]))
    const muts = []

    for (const u of plan.update) {
      const row = byId.get(u.id)
      if (!row) continue
      const mut = mutations.setMembershipFields(u.id, u.fields)
      muts.push({ mutation: mut, optimistic: optimisticUpdate(mut, itemRow(row)) })
    }
    for (const ins of plan.insert) {
      const { mutation } = mutations.addGeneratedTripItem(
        tripId,
        {
          source_item_id: ins.from.source_item_id,
          source_template_id: ins.from.source_template_id,
          name: ins.from.name,
          category_name: ins.from.category_name,
          weight_grams: ins.from.weight_grams,
          value_cents: ins.from.value_cents,
          quantity: ins.quantity,
          mode: ins.from.mode,
          late_packer: ins.from.late_packer,
        },
        ins.traveler_id,
        ins.id,
      )
      muts.push({ mutation, optimistic: optimisticInsert(mutation) })
    }
    for (const id of plan.delete) {
      const mut = mutations.deleteTripItem(id)
      muts.push({ mutation: mut, optimistic: optimisticDelete(mut) })
    }

    enqueueAndDrain('trip', tripId, ...muts)
    return plan
  }

  function assignContainer(tripId: string, item: TripItem, containerId: string | null) {
    const mut = mutations.assignContainer(item.id, containerId)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function setLatePacker(tripId: string, item: TripItem, latePacker: boolean) {
    const mut = mutations.setLatePacker(item.id, latePacker)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  /**
   * FR-9.1: the M5 control's write. Same shape as setLatePacker — one
   * field, the rest of the row preserved, so flagging never touches the
   * packing record it is a judgement about.
   */
  /**
   * setPacker hands a row to somebody (FR-25.19), or takes it back with
   * `null`. The FR-6.2 notification is the server's half: it fires on any
   * push carrying `packer_user_id` and skips a self-assignment, so the
   * client owes nothing beyond the ordinary mutation.
   */
  function setPacker(tripId: string, item: TripItem, userId: string | null) {
    const mut = mutations.setPacker(item.id, userId)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function setReviewFlag(tripId: string, item: TripItem, flag: ReviewFlag, value: boolean) {
    const mut = mutations.setReviewFlag(item.id, flag, value)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function quickAddItem(
    tripId: string,
    name: string,
    opts: {
      sourceItemId?: string | null
      weightGrams?: number | null
      valueCents?: number | null
      categoryName?: string | null
      mode?: ItemMode
    },
    isActive: boolean,
  ): string {
    const { mutation, id } = mutations.addTripItem(tripId, name, {
      ...opts,
      flagMissing: isActive,
    })
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    if (opts.sourceItemId) {
      addRequiredCompanions(tripId)
    }
    // The id is returned so FR-25.8's per-person add can open the membership
    // editor on the row it just wrote; the row is what the editor edits.
    return id
  }

  /**
   * addRequiredCompanions pulls the list's missing required companions in
   * (FR-20.4: without prompting, FR-20.3: never duplicating) — called
   * after a quick-add that matched a master item.
   */
  function addRequiredCompanions(tripId: string) {
    const onList = tripStore.getItems(tripId)
    const resolution = resolveDependencies({
      onList,
      dependencies: masterStore.dependencyList,
      masterItems: masterStore.itemList,
    })
    for (const companion of resolution.required) {
      const { mutation } = mutations.addGeneratedTripItem(
        tripId,
        {
          source_item_id: companion.item_id,
          source_template_id: null,
          name: companion.name,
          category_name: companion.category_name,
          weight_grams: companion.weight_grams,
          value_cents: companion.value_cents,
          quantity: companion.quantity,
          mode: 'pack',
          late_packer: false,
        },
        null,
      )
      enqueueAndDrain('trip', tripId, {
        mutation,
        optimistic: optimisticInsert(mutation),
      })
    }
  }

  return {
    setMembership,
    packIncrement,
    packDecrement,
    packComplete,
    packZero,
    restorePack,
    packToggle,
    skipItem,
    restoreSkip,
    unskipItem,
    buyItem,
    unbuyItem,
    setMode,
    assignTraveler,
    assignContainer,
    setLatePacker,
    setPacker,
    setReviewFlag,
    quickAddItem,
    addRequiredCompanions,
  }
}
