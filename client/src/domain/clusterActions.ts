/**
 * What a per-person cluster's head (FR-25.1) may do to every instance under
 * it at once, and which of those instances a write reaches (FR-25.26).
 *
 * The head exists because an item is one thing that several people carry, and
 * `late_packer` and `packer_user_id` are the two fields that are usually a
 * statement about the *item* — everybody brushes their teeth on the morning
 * they leave. Setting them instance by instance made the list say it four
 * times, and cost four trips through M5 to say it once. Since 2026-09-19 the
 * head offers everything a row's own menu does as well (owner request): a
 * shut cluster is one line on the screen, and a press on it that could do
 * less than a press on a row taught the reader to open it first.
 *
 * No new structure: a fan-out writes each instance's own field, exactly as the
 * row-level control does, so field-level LWW (NFR-4.2a) merges the result
 * without a rule of its own and an instance set differently afterwards stays
 * different. The two decisions that are *not* obvious live here rather than in
 * the view, because both are invisible on a running screen: a cluster held
 * through by other people offers no menu at all, and a fan-out that meets one
 * held instance writes the rest and reports the skip (G-3).
 */
import { rowMenuEntries, type RowMenuAction, type RowMenuItem } from './rowMenu'

/** One instance under a cluster head, as far as these rules are concerned. */
export interface ClusterInstance {
  id: string
  /** The row fields a row's own menu reads (`rowMenuEntries`). */
  row: RowMenuItem
  /**
   * The display name of whoever is packing this instance right now, or `null`
   * when it is nobody's. A name rather than a boolean: the report owes the
   * reader who to go and ask.
   */
  lockedBy: string | null
  /** The claim on this instance is mine (G-3) — only its release is offered. */
  mine: boolean
}

/**
 * What a cluster head can offer: every entry of a row's own menu except the
 * takeover, and the assignment. Wording and glyphs belong to the screen.
 */
export type ClusterMenuAction = Exclude<RowMenuAction, 'takeover'> | 'assignAll'

/** Everything outside the cluster that decides what its head may offer. */
export interface ClusterMenuContext {
  /** FR-9.3: in the review posture the head goes inert, like every row menu. */
  closingPass: boolean
  /**
   * FR-25.19 needs somebody to hand a row to. Local and Single-User Mode have
   * nobody, so the entry is absent rather than shown inert (G-8).
   */
  canAssign: boolean
  /** FR-9.3's window, exactly as a row's menu reads it. */
  judgeable: boolean
}

/**
 * The order the head offers its entries in — a row's own order, with the
 * assignment beside the other statement about the item rather than after the
 * destructive entry.
 */
const CLUSTER_ORDER: readonly ClusterMenuAction[] = [
  'release',
  'unskip',
  'quantity',
  'packingNow',
  'skip',
  'latePackerOn',
  'latePackerOff',
  'assignAll',
  'flagUnused',
  'unflagUnused',
  'remove',
]

/** The two entries that are one switch, each naming the other. */
const TOGGLE_PAIRS: Partial<Record<ClusterMenuAction, RowMenuAction>> = {
  latePackerOn: 'latePackerOff',
  latePackerOff: 'latePackerOn',
  flagUnused: 'unflagUnused',
  unflagUnused: 'flagUnused',
}

/**
 * What this instance's own row menu would offer if nobody else held it. A
 * held instance is asked too: it is not written, but the report names its
 * holder only where the action would otherwise have reached it.
 */
function rowOffers(instance: ClusterInstance, ctx: ClusterMenuContext): RowMenuAction[] {
  return rowMenuEntries(instance.row, {
    closingPass: false,
    locked: false,
    canTakeOver: false,
    mine: instance.lockedBy === null && instance.mine,
    judgeable: ctx.judgeable,
  })
}

/**
 * Whether `action` on the head concerns this instance — the rule every entry
 * follows is *the instances whose own row menu offers it*, so a head over
 * two open rows and a skipped one skips the two and un-skips the third.
 *
 * The late-packer flag and the assignment keep FR-25.26's first rule and
 * reach every instance: both were built as statements about the item, and
 * narrowing them now would change what the existing entries write.
 */
function concerns(
  action: ClusterMenuAction,
  instance: ClusterInstance,
  ctx: ClusterMenuContext,
): boolean {
  if (action === 'assignAll' || action === 'latePackerOn' || action === 'latePackerOff') {
    return true
  }
  const offers = rowOffers(instance, ctx)
  const sibling = TOGGLE_PAIRS[action]
  return offers.includes(action) || (sibling !== undefined && offers.includes(sibling))
}

/** Whether every instance an on/off pair concerns already carries it. */
function allCarry(
  action: ClusterMenuAction,
  instances: readonly ClusterInstance[],
  ctx: ClusterMenuContext,
): boolean {
  const concerned = instances.filter((instance) => concerns(action, instance, ctx))
  if (action === 'latePackerOn' || action === 'latePackerOff') {
    return concerned.every((instance) => instance.row.late_packer)
  }
  return concerned.every((instance) => instance.row.flag_unused)
}

/**
 * The entries the head offers, in order; an empty list means **no menu**, the
 * same answer `rowMenuEntries` gives for a row nothing can be done to.
 *
 * An entry is offered when at least one instance nobody else is holding would
 * offer it on its own row. The on/off pairs are read over *every* instance
 * they concern, held ones included: the head shows the ⏰ when any instance
 * carries the flag (FR-25.23), so a rule that looked only at the writable ones
 * would offer to switch on what the head is already showing as on — and *off*
 * is offered only when all of them carry it, the way a half-done job is
 * finished rather than undone.
 */
export function clusterMenuEntries(
  instances: readonly ClusterInstance[],
  ctx: ClusterMenuContext,
): ClusterMenuAction[] {
  if (ctx.closingPass) return []
  const writable = instances.filter((instance) => instance.lockedBy === null)
  // Nothing here is a takeover: a head stands over several rows, and breaking
  // somebody's claim is a decision about one row, named and confirmed (FR-5.7).
  if (writable.length === 0) return []

  return CLUSTER_ORDER.filter((action) => {
    if (action === 'assignAll') return ctx.canAssign
    if (!writable.some((instance) => concerns(action, instance, ctx))) return false
    const sibling = TOGGLE_PAIRS[action]
    if (sibling === undefined) return true
    const off = action === 'latePackerOff' || action === 'unflagUnused'
    return allCarry(action, instances, ctx) === off
  })
}

/**
 * The plan for one entry: the instances it concerns, less those somebody
 * else is holding — whose holders the report names.
 */
export function clusterTargets(
  action: ClusterMenuAction,
  instances: readonly ClusterInstance[],
  ctx: ClusterMenuContext,
): ClusterFanOut {
  return clusterFanOut(instances.filter((instance) => concerns(action, instance, ctx)))
}

/** Which instances a fan-out writes, and whose claims kept it off the rest. */
export interface ClusterFanOut {
  targetIds: string[]
  /** Each holder once, in the order their instances stand under the head. */
  blockedBy: string[]
}

/**
 * The plan for one fan-out: every instance nobody else is holding.
 *
 * A held instance is skipped rather than refusing the whole action — the G-3
 * lock is advisory by decision (2026-08-30), and a group action that failed
 * because one of four rows was busy would be a lock with teeth it deliberately
 * does not have. The caller owes the report: `blockedBy` is what names the
 * people whose rows were left alone.
 */
export function clusterFanOut(instances: readonly ClusterInstance[]): ClusterFanOut {
  const targetIds: string[] = []
  const blockedBy: string[] = []
  for (const instance of instances) {
    if (instance.lockedBy === null) {
      targetIds.push(instance.id)
      continue
    }
    if (!blockedBy.includes(instance.lockedBy)) blockedBy.push(instance.lockedBy)
  }
  return { targetIds, blockedBy }
}
