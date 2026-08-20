/**
 * M14 Post-Trip Review Assistant — proposal generation (FR-9.2,
 * group-aware per FR-27.11).
 *
 * Pure, no I/O. Proposals are derived from the *current* state of trip
 * flags (FR-9.1) and groups, so applying one makes it disappear on the
 * next computation — that is the whole resumability story (UI-Spec M14
 * "resumable if interrupted"), no session state to persist.
 *
 * FR-27.11 (concept round 2026-08-08): every proposal targets a
 * **Gruppe**, never the composed Ferien-Vorlage — the group is where the
 * knowledge belongs, because writing „Reiseadapter aufnehmen" into the
 * vacation template would teach exactly one trip shape and leave every
 * other trip using the same group none the wiser (the FR-27.5 stance).
 * A row whose provenance is a Vorlage's *own* position therefore yields
 * no proposal: that structure feedback is M21's job.
 *
 * Runs client-side like trip generation (Addendum 3.19): write-backs are
 * ordinary master-partition mutations, so Local Mode gets the assistant
 * for free.
 */

import type { MasterItem, Template, TemplateItem, TripItem } from '@/types/domain'

export type ReviewProposalKind = 'unused' | 'missing'

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
  /** Trips (including this one) on which the item carried the flag. */
  flagCount: number
}

/**
 * "Never ask again" scope: the specific item–group pair (UI-Spec M14
 * decision), not the item globally — the same item can still surface a
 * proposal for a different group.
 */
export function dismissalKey(itemRef: string, groupId: string): string {
  return `${itemRef}::${groupId}`
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
  flaggedTripCount?: (itemName: string, flag: ReviewProposalKind) => number
}

export function buildReviewProposals(args: ReviewArgs): ReviewProposal[] {
  const dismissed = args.isDismissed ?? (() => false)
  const groupsByID = new Map(args.templates.filter((t) => t.kind === 'group').map((t) => [t.id, t]))
  const proposals: ReviewProposal[] = []

  const push = (p: Omit<ReviewProposal, 'itemRef' | 'flagCount'>) => {
    const itemRef = p.itemId ?? `name:${p.itemName.toLowerCase()}`
    const key = dismissalKey(itemRef, p.groupId)
    if (dismissed(key)) return
    if (proposals.some((x) => dismissalKey(x.itemRef, x.groupId) === key)) return
    proposals.push({
      ...p,
      itemRef,
      flagCount: Math.max(1, args.flaggedTripCount?.(p.itemName, p.kind) ?? 1),
    })
  }

  // Unused → zero the position in the group the row came from.
  for (const item of args.items) {
    if (!item.flag_unused || !item.source_template_id) continue
    const group = groupsByID.get(item.source_template_id)
    if (!group) continue
    const position = args.templateItems(group.id).find((ti) => ti.item_id === item.source_item_id)
    if (!position || position.quantity === 0) continue
    push({
      kind: 'unused',
      itemName: item.name,
      itemId: item.source_item_id,
      groupId: group.id,
      groupName: group.name,
    })
  }

  // Missing → an ad-hoc row with no provenance; default to the group that
  // contributed most of the trip, which is what the user thinks of as
  // "the list" (FR-27.11).
  const dominant = dominantGroup(args.items, groupsByID)
  if (dominant) {
    const containedItemIDs = new Set(args.templateItems(dominant.id).map((ti) => ti.item_id))
    for (const item of args.items) {
      if (!item.flag_missing) continue
      const itemId =
        item.source_item_id ??
        args.masterItems.find((m) => m.name.toLowerCase() === item.name.toLowerCase())?.id ??
        null
      if (itemId && containedItemIDs.has(itemId)) continue
      push({
        kind: 'missing',
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
 * would apply silently as nothing.
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
    .filter((t) => t.kind === 'group')
    .sort((a, b) => a.name.localeCompare(b.name))
  if (proposal.kind === 'missing') return groups
  return groups.filter((g) => templateItems(g.id).some((ti) => ti.item_id === proposal.itemId))
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
    if (count > bestCount) {
      best = groupsByID.get(id)!
      bestCount = count
    }
  }
  return best
}
