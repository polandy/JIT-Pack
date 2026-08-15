/**
 * Template composition (§3.27) — pure, no I/O.
 *
 * A Ferien-Vorlage includes Gruppen by reference (FR-27.1); resolving it
 * expands those includes and merges the result by master item under the
 * FR-2.3a rule. Living here rather than on the server keeps Local Mode at
 * feature parity (invariant 4), and keeps *one* expansion rule for the M7
 * row count, the M8 resolution footer and trip generation alike.
 */

import type { Template, TemplateDedup, TemplateInclude, TemplateItem } from '@/types/domain'

/** Everything resolution needs, as plain arrays — the store shapes them. */
export interface CompositionInput {
  templates: Template[]
  includes: TemplateInclude[]
  positions: TemplateItem[]
}

/** One master item after the merge, with the templates that contributed it. */
export interface ResolvedPosition {
  item_id: string
  /** The winning amount: max across contributions, or their sum (FR-2.3a). */
  quantity: number
  strategy: TemplateDedup
  /** Contributing templates, in resolution order — the Vorlage before its groups. */
  sources: Template[]
  /** The first contributing position, which carries the non-quantity attributes. */
  position: TemplateItem
}

export interface Resolution {
  /** The deduped set — what a trip generated from this template would carry. */
  positions: ResolvedPosition[]
  /** Only the positions more than one template contributed (FR-27.2). */
  merges: ResolvedPosition[]
  /** The groups this template includes, resolvable and in include order. */
  includedTemplates: Template[]
}

/**
 * expandIncludes returns the selected templates plus the groups they include.
 *
 * Deliberately **one level** and not transitive: FR-27.1 fixes the hierarchy
 * at two levels, which is what makes include cycles structurally impossible.
 * Following a group's own includes here would quietly reintroduce the depth
 * the FR rejected — and with it the cycle it cannot have.
 */
export function expandIncludes(
  templateIds: readonly string[],
  includes: readonly TemplateInclude[],
): Set<string> {
  const selected = new Set(templateIds)
  const expanded = new Set(selected)
  for (const inc of includes) {
    if (selected.has(inc.template_id)) expanded.add(inc.included_template_id)
  }
  return expanded
}

/**
 * resolveTemplate expands one template's includes and merges the positions by
 * master item. Trip-independent on purpose: conditions and per-person fan-out
 * need a trip, so they belong to generation (`instantiate.ts`) — this answers
 * "what does this composition amount to", which M7 and M8 ask without one.
 */
export function resolveTemplate(templateId: string, input: CompositionInput): Resolution {
  const byId = new Map(input.templates.map((t) => [t.id, t]))
  const root = byId.get(templateId)
  if (!root) return { positions: [], merges: [], includedTemplates: [] }

  const includedTemplates: Template[] = []
  for (const inc of input.includes) {
    if (inc.template_id !== templateId) continue
    const group = byId.get(inc.included_template_id)
    if (group) includedTemplates.push(group)
  }

  // The root first, so its own positions win the "first contributor" slot and
  // the merge report reads Vorlage-before-Gruppen.
  const order = [root, ...includedTemplates]
  const rank = new Map(order.map((t, idx) => [t.id, idx]))

  const byItem = new Map<
    string,
    { position: TemplateItem; quantities: number[]; dedups: TemplateDedup[]; sources: Template[] }
  >()
  for (const source of order) {
    for (const pos of input.positions) {
      if (pos.template_id !== source.id) continue
      const entry = byItem.get(pos.item_id)
      if (entry) {
        entry.quantities.push(pos.quantity)
        entry.dedups.push(pos.dedup)
        entry.sources.push(source)
      } else {
        byItem.set(pos.item_id, {
          position: pos,
          quantities: [pos.quantity],
          dedups: [pos.dedup],
          sources: [source],
        })
      }
    }
  }

  const positions: ResolvedPosition[] = []
  const merges: ResolvedPosition[] = []
  for (const [itemId, entry] of byItem) {
    // FR-2.3a: max is the default; any contributor asking for sum switches the
    // whole overlap to sum — the same rule generation applies (instantiate.ts).
    const strategy: TemplateDedup = entry.dedups.includes('sum') ? 'sum' : 'max'
    const resolved: ResolvedPosition = {
      item_id: itemId,
      quantity:
        strategy === 'sum'
          ? entry.quantities.reduce((a, b) => a + b, 0)
          : Math.max(...entry.quantities),
      strategy,
      sources: entry.sources,
      position: entry.position,
    }
    positions.push(resolved)
    if (entry.sources.length > 1) merges.push(resolved)
  }

  // Stable across pull order: by contributing template, then by position id.
  positions.sort(
    (a, b) =>
      (rank.get(a.sources[0]!.id) ?? 0) - (rank.get(b.sources[0]!.id) ?? 0) ||
      a.position.id.localeCompare(b.position.id),
  )

  return { positions, merges, includedTemplates }
}
