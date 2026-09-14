/**
 * What a per-person cluster's head (FR-25.1) may do to every instance under
 * it at once, and which of those instances a write reaches (FR-25.26).
 *
 * The head exists because an item is one thing that several people carry, and
 * `late_packer` and `packer_user_id` are the two fields that are usually a
 * statement about the *item* — everybody brushes their teeth on the morning
 * they leave. Setting them instance by instance made the list say it four
 * times, and cost four trips through M5 to say it once.
 *
 * No new structure: a fan-out writes each instance's own field, exactly as the
 * row-level control does, so field-level LWW (NFR-4.2a) merges the result
 * without a rule of its own and an instance set differently afterwards stays
 * different. The two decisions that are *not* obvious live here rather than in
 * the view, because both are invisible on a running screen: a cluster held
 * through by other people offers no menu at all, and a fan-out that meets one
 * held instance writes the rest and reports the skip (G-3).
 */

/** One instance under a cluster head, as far as these rules are concerned. */
export interface ClusterInstance {
  id: string
  latePacker: boolean
  /**
   * The display name of whoever is packing this instance right now, or `null`
   * when it is nobody's. A name rather than a boolean: the report owes the
   * reader who to go and ask.
   */
  lockedBy: string | null
}

/** What a cluster head can offer. Wording and glyphs belong to the screen. */
export type ClusterMenuAction = 'latePackerOn' | 'latePackerOff' | 'assignAll'

/** Everything outside the cluster that decides what its head may offer. */
export interface ClusterMenuContext {
  /** FR-9.3: in the review posture the head goes inert, like every row menu. */
  closingPass: boolean
  /**
   * FR-25.19 needs somebody to hand a row to. Local and Single-User Mode have
   * nobody, so the entry is absent rather than shown inert (G-8).
   */
  canAssign: boolean
}

/**
 * The entries the head offers, in order; an empty list means **no menu**, the
 * same answer `rowMenuEntries` gives for a row nothing can be done to.
 *
 * The late-packer flag is read over *every* instance, held ones included: the
 * head shows the flag when any instance carries it (FR-25.23), so a rule that
 * looked only at the writable ones would offer to switch on what the head is
 * already showing as on.
 */
export function clusterMenuEntries(
  instances: readonly ClusterInstance[],
  ctx: ClusterMenuContext,
): ClusterMenuAction[] {
  if (ctx.closingPass) return []
  if (instances.length === 0) return []
  // Nothing here is a takeover: a head stands over several rows, and breaking
  // somebody's claim is a decision about one row, named and confirmed (FR-5.7).
  if (instances.every((instance) => instance.lockedBy !== null)) return []

  const entries: ClusterMenuAction[] = [
    instances.every((instance) => instance.latePacker) ? 'latePackerOff' : 'latePackerOn',
  ]
  if (ctx.canAssign) entries.push('assignAll')
  return entries
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
