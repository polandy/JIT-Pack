/**
 * M14 Post-Trip Review Assistant — proposal generation (FR-9.2).
 *
 * Pure, no I/O. Proposals are derived from the *current* state of trip
 * flags (FR-9.1) and templates, so applying one makes it disappear on
 * the next computation — that is the whole resumability story (UI-Spec
 * M14 "resumable if interrupted"), no session state to persist.
 *
 * Runs client-side like trip generation and repack (Addendum 3.19):
 * write-backs are ordinary master-partition mutations, so Local Mode
 * gets the assistant for free.
 */

import type { MasterItem, Template, TemplateItem, TripItem } from '@/types/domain'

export type ReviewProposalKind = 'reduce_quantity' | 'add_item'

export interface ReviewProposal {
  /**
   * Dismissal scope for "Never ask again": the specific item–template
   * pair (UI-Spec M14 decision), not the item globally.
   */
  key: string
  kind: ReviewProposalKind
  itemName: string
  /** Master item id; null for an ad-hoc item — apply must create it first. */
  itemId: string | null
  templateId: string
  templateName: string
  /** The template_items row to zero; only set for reduce_quantity. */
  templateItemId: string | null
  /** Trips (including this one) on which the item carried the flag. */
  flagCount: number
  /** FR-1.6: the target template is published and not the user's own. */
  requiresFork: boolean
}

export interface ReviewArgs {
  items: TripItem[]
  templates: Template[]
  templateItems: (templateId: string) => TemplateItem[]
  masterItems: MasterItem[]
  /** "Never ask again" filter, keyed by ReviewProposal.key. */
  isDismissed?: (key: string) => boolean
  /** Own users.id when known; null pre-OIDC (fork conservatively). */
  ownUserId?: string | null
  /** Historical flag occurrences across archived series trips (M12-style). */
  flaggedTripCount?: (itemName: string, flag: 'unused' | 'missing') => number
}

export function buildReviewProposals(args: ReviewArgs): ReviewProposal[] {
  const dismissed = args.isDismissed ?? (() => false)
  const templatesByID = new Map(args.templates.map((t) => [t.id, t]))
  const proposals: ReviewProposal[] = []

  const push = (p: Omit<ReviewProposal, 'key' | 'requiresFork' | 'flagCount'>, flag: 'unused' | 'missing') => {
    const itemRef = p.itemId ?? `name:${p.itemName.toLowerCase()}`
    const key = `${itemRef}::${p.templateId}`
    if (dismissed(key) || proposals.some((existing) => existing.key === key)) return
    const template = templatesByID.get(p.templateId)!
    proposals.push({
      ...p,
      key,
      flagCount: Math.max(1, args.flaggedTripCount?.(p.itemName, flag) ?? 1),
      requiresFork:
        template.is_published && (args.ownUserId == null || template.owner_id !== args.ownUserId),
    })
  }

  // Unused → set quantity to 0 in the template the item came from.
  for (const item of args.items) {
    if (!item.flag_unused || !item.source_template_id) continue
    if (!templatesByID.has(item.source_template_id)) continue
    const templateItem = args
      .templateItems(item.source_template_id)
      .find((ti) => ti.item_id === item.source_item_id)
    if (!templateItem || templateItem.quantity_formula === '0') continue
    push(
      {
        kind: 'reduce_quantity',
        itemName: item.name,
        itemId: item.source_item_id,
        templateId: item.source_template_id,
        templateName: templatesByID.get(item.source_template_id)!.name,
        templateItemId: templateItem.id,
      },
      'unused',
    )
  }

  // Missing → add to the trip's dominant template (the one that
  // contributed the most items — there is no better signal for where
  // a spontaneously added item belongs).
  const dominant = dominantTemplate(args.items, templatesByID)
  if (dominant) {
    const containedItemIDs = new Set(args.templateItems(dominant.id).map((ti) => ti.item_id))
    for (const item of args.items) {
      if (!item.flag_missing) continue
      const itemId =
        item.source_item_id ??
        args.masterItems.find((m) => m.name.toLowerCase() === item.name.toLowerCase())?.id ??
        null
      if (itemId && containedItemIDs.has(itemId)) continue
      push(
        {
          kind: 'add_item',
          itemName: item.name,
          itemId,
          templateId: dominant.id,
          templateName: dominant.name,
          templateItemId: null,
        },
        'missing',
      )
    }
  }

  return proposals
}

function dominantTemplate(
  items: TripItem[],
  templatesByID: Map<string, Template>,
): Template | null {
  const counts = new Map<string, number>()
  for (const item of items) {
    if (item.source_template_id && templatesByID.has(item.source_template_id)) {
      counts.set(item.source_template_id, (counts.get(item.source_template_id) ?? 0) + 1)
    }
  }
  let best: Template | null = null
  let bestCount = 0
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = templatesByID.get(id)!
      bestCount = count
    }
  }
  return best
}
