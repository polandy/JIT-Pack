/**
 * M14 Post-Trip Review Assistant — proposal generation (FR-9.2,
 * group-aware per FR-27.11).
 *
 * Pure, no I/O. Proposals are derived from the *current* state of the
 * rows' verdicts (FR-9.1 flags, FR-9.6's `needed_quantity`) and groups, so applying one makes it disappear on the
 * next computation — that is the whole resumability story (UI-Spec M14
 * "resumable if interrupted"), no session state to persist.
 *
 * FR-27.11: every proposal targets a **Gruppe**, never the composed
 * Ferien-Vorlage — the group is where the knowledge belongs, because
 * writing „Reiseadapter aufnehmen" into the vacation template would
 * teach exactly one trip shape and leave every other trip using the
 * same group none the wiser (the FR-27.5 stance). A row whose
 * provenance is a Vorlage's *own* position therefore yields
 * no proposal: that structure feedback is M21's job.
 *
 * Runs client-side like trip generation (Addendum 3.19): write-backs are
 * ordinary master-partition mutations, so Local Mode gets the assistant
 * for free.
 */

import { TEMPLATE_KIND_GROUP } from '@/types/domain'
import type { MasterItem, ReviewFlag, Template, TemplateItem, TripItem } from '@/types/domain'
import { MIN_NEEDED_QUANTITY, VERDICT_FEWER, VERDICT_MISSING, VERDICT_UNUSED } from './verdict'

/** A proposal per verdict: FR-9.1's two flags, and FR-9.6's *zu viel* as `fewer`. */
export type ReviewProposalKind = ReviewFlag | typeof VERDICT_FEWER

export interface ReviewProposal {
  /**
   * Stable item reference for dismissal keys: the master item id, or
   * `name:<lowercased>` for an ad-hoc row that has none.
   */
  itemRef: string
  kind: ReviewProposalKind
  itemName: string
  /** Master item id; null for an ad-hoc item — apply must create it first. */
  itemId: string | null
  /**
   * FR-27.11 default target: for `unused` the group the row came from,
   * for `missing` the group that contributed most of the trip. The row's
   * picker may retarget within retargetGroups().
   */
  groupId: string
  groupName: string
  /**
   * Trips (including this one) on which the item carried the flag; 1 for
   * `fewer`, whose number no history keeps yet (ADR-103).
   */
  flagCount: number
  /**
   * The trip rows the proposal was built from, so the page can quote their
   * comments under its why line (FR-9.6, `commentsOnRows`).
   */
  rowIds: string[]
  /**
   * `fewer` only: the smallest surplus (`packed_count − needed_quantity`)
   * across its rows — the highest result, so nobody is cut below what they
   * used. Kept so a retarget can recompute against another line
   * ({@link fewerQuantities}).
   */
  surplus?: number
  /** `fewer` only: the default group's line quantity now. */
  fromQuantity?: number
  /** `fewer` only: what the default group's line is proposed to become. */
  toQuantity?: number
}

/**
 * "Never ask again" scope: the specific item–group pair (UI-Spec M14
 * decision), not the item globally — the same item can still surface a
 * proposal for a different group.
 *
 * A `fewer` proposal is keyed apart (FR-9.6): it can stand beside an
 * `unused` one for the same pair, and dismissing one must not hide the
 * other. The two flag kinds keep the stored key shape, which they never
 * shared a pair under anyway (missing skips a group that holds the item,
 * unused needs one).
 */
export function dismissalKey(itemRef: string, groupId: string, kind?: ReviewProposalKind): string {
  const pair = `${itemRef}::${groupId}`
  return kind === VERDICT_FEWER ? `${pair}::${VERDICT_FEWER}` : pair
}

export interface ReviewArgs {
  items: TripItem[]
  /** All templates; only `kind === 'group'` rows can become targets. */
  templates: Template[]
  templateItems: (templateId: string) => TemplateItem[]
  masterItems: MasterItem[]
  /** "Never ask again" filter, keyed by dismissalKey(). */
  isDismissed?: (key: string) => boolean
  /** Historical flag occurrences across archived series trips (M12-style). */
  flaggedTripCount?: (itemName: string, flag: ReviewFlag) => number
}

export function buildReviewProposals(args: ReviewArgs): ReviewProposal[] {
  const dismissed = args.isDismissed ?? (() => false)
  const groupsByID = new Map(
    args.templates.filter((t) => t.kind === TEMPLATE_KIND_GROUP).map((t) => [t.id, t]),
  )
  const proposals: ReviewProposal[] = []

  const keyOf = (p: Pick<ReviewProposal, 'itemRef' | 'groupId' | 'kind'>) =>
    dismissalKey(p.itemRef, p.groupId, p.kind)

  /** Several rows of one item for one pair (per-person fan-out) are one proposal. */
  const push = (
    rowId: string,
    p: Omit<ReviewProposal, 'itemRef' | 'flagCount' | 'rowIds'>,
  ): ReviewProposal | null => {
    const itemRef = p.itemId ?? `name:${p.itemName.toLowerCase()}`
    const key = keyOf({ itemRef, groupId: p.groupId, kind: p.kind })
    if (dismissed(key)) return null
    const known = proposals.find((x) => keyOf(x) === key)
    if (known) {
      known.rowIds.push(rowId)
      return known
    }
    const proposal: ReviewProposal = {
      ...p,
      itemRef,
      rowIds: [rowId],
      flagCount:
        p.kind === VERDICT_FEWER
          ? 1
          : Math.max(1, args.flaggedTripCount?.(p.itemName, p.kind) ?? 1),
    }
    proposals.push(proposal)
    return proposal
  }

  const sourcePosition = (item: TripItem) => {
    const group = item.source_template_id ? groupsByID.get(item.source_template_id) : undefined
    if (!group) return null
    const position = args.templateItems(group.id).find((ti) => ti.item_id === item.source_item_id)
    return position ? { group, position } : null
  }

  // Unused → zero the position in the group the row came from.
  for (const item of args.items) {
    if (!item.flag_unused) continue
    const source = sourcePosition(item)
    if (!source || source.position.quantity === 0) continue
    push(item.id, {
      kind: VERDICT_UNUSED,
      itemName: item.name,
      itemId: item.source_item_id,
      groupId: source.group.id,
      groupName: source.group.name,
    })
  }

  // Fewer → lower the line the row came from by what went along unused
  // (FR-9.6, ADR-103). Each row's surplus is collected first and the result
  // computed once, from the smallest: the highest proposal of the rows.
  for (const item of args.items) {
    const needed = item.needed_quantity
    if (needed == null || item.packed_count <= needed) continue
    const source = sourcePosition(item)
    if (!source) continue
    const surplus = item.packed_count - needed
    if (lowered(source.position.quantity, surplus) === null) continue
    const proposal = push(item.id, {
      kind: VERDICT_FEWER,
      itemName: item.name,
      itemId: item.source_item_id,
      groupId: source.group.id,
      groupName: source.group.name,
      surplus,
    })
    if (!proposal) continue
    proposal.surplus = Math.min(proposal.surplus ?? surplus, surplus)
    proposal.fromQuantity = source.position.quantity
    proposal.toQuantity = lowered(source.position.quantity, proposal.surplus) ?? undefined
  }

  // Missing → an ad-hoc row with no provenance; default to the group that
  // contributed most of the trip, which is what the user thinks of as
  // "the list" (FR-27.11).
  const dominant = dominantGroup(args.items, groupsByID)
  if (dominant) {
    const containedItemIDs = new Set(args.templateItems(dominant.id).map((ti) => ti.item_id))
    for (const item of args.items) {
      if (!item.flag_missing) continue
      // FR-9.6: a skipped row whose own group still holds the item — the
      // group already brings it, and the radar (FR-9.5) carries it forward.
      if (sourcePosition(item)) continue
      const itemId =
        item.source_item_id ??
        args.masterItems.find((m) => m.name.toLowerCase() === item.name.toLowerCase())?.id ??
        null
      if (itemId && containedItemIDs.has(itemId)) continue
      push(item.id, {
        kind: VERDICT_MISSING,
        itemName: item.name,
        itemId,
        groupId: dominant.id,
        groupName: dominant.name,
      })
    }
  }

  return proposals
}

/**
 * retargetGroups answers what the row's picker may offer (FR-27.11:
 * groups only, never a Ferien-Vorlage). A `missing` proposal can land in
 * any group; an `unused` proposal can only move between groups that
 * actually carry the item — zeroing a position that does not exist
 * would apply silently as nothing. A `fewer` proposal likewise, and only
 * to a group whose line it would still lower ({@link fewerQuantities}).
 *
 * Ordered by name, because the caller's list arrives in storage order and
 * a picker is read by a human (the FR-27.2 lesson).
 */
export function retargetGroups(
  proposal: ReviewProposal,
  templates: Template[],
  templateItems: (templateId: string) => TemplateItem[],
): Template[] {
  const groups = templates
    .filter((t) => t.kind === TEMPLATE_KIND_GROUP)
    .sort((a, b) => a.name.localeCompare(b.name))
  if (proposal.kind === VERDICT_MISSING) return groups
  if (proposal.kind === VERDICT_FEWER)
    return groups.filter((g) => fewerQuantities(proposal, g.id, templateItems) !== null)
  return groups.filter((g) => templateItems(g.id).some((ti) => ti.item_id === proposal.itemId))
}

/**
 * fewerQuantities is what a `fewer` proposal does to `groupId`'s line for
 * its item — the line's quantity now and after — or null where that group
 * has no such line or the line is already at or below the result (FR-9.6).
 * The picker's retarget and the apply read it, so both see the line as it
 * is, not as it was when the proposal was built.
 */
export function fewerQuantities(
  proposal: Pick<ReviewProposal, 'itemId' | 'surplus'>,
  groupId: string,
  templateItems: (templateId: string) => TemplateItem[],
): { fromQuantity: number; toQuantity: number } | null {
  if (proposal.surplus === undefined || proposal.itemId === null) return null
  const line = templateItems(groupId).find((ti) => ti.item_id === proposal.itemId)
  if (!line) return null
  const toQuantity = lowered(line.quantity, proposal.surplus)
  return toQuantity === null ? null : { fromQuantity: line.quantity, toQuantity }
}

/** A line lowered by `surplus`, at least 1 — or null when that lowers nothing. */
function lowered(lineQuantity: number, surplus: number): number | null {
  const result = Math.max(MIN_NEEDED_QUANTITY, lineQuantity - surplus)
  return result < lineQuantity ? result : null
}

function dominantGroup(items: TripItem[], groupsByID: Map<string, Template>): Template | null {
  const counts = new Map<string, number>()
  for (const item of items) {
    if (item.source_template_id && groupsByID.has(item.source_template_id)) {
      counts.set(item.source_template_id, (counts.get(item.source_template_id) ?? 0) + 1)
    }
  }
  let best: Template | null = null
  let bestCount = 0
  for (const [id, count] of counts) {
    const candidate = groupsByID.get(id)!
    // On a tie the name decides, for the same reason the M21 group list is
    // sorted by it: the rows arrive in whatever order sync produced, so
    // "the first one seen" would make two devices propose two groups.
    if (
      count > bestCount ||
      (count === bestCount && best !== null && candidate.name.localeCompare(best.name) < 0)
    ) {
      best = candidate
      bestCount = count
    }
  }
  return best
}
