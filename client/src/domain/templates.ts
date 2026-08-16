/**
 * Template composition (§3.27) — pure, no I/O.
 *
 * A Ferien-Vorlage includes Gruppen by reference (FR-27.1); resolving it
 * expands those includes and merges the result by master item under the
 * FR-2.3a rule. Living here rather than on the server keeps Local Mode at
 * feature parity (invariant 4), and keeps *one* expansion rule for the M7
 * row count, the M8 resolution footer and trip generation alike.
 */

import type {
  MasterItem,
  Template,
  TemplateDedup,
  TemplateInclude,
  TemplateItem,
  TemplateKind,
  Trip,
  TripItem,
} from '@/types/domain'

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
 * resolveTemplate expands one template's includes and merges the positions by
 * master item. Trip-independent on purpose: conditions and per-person fan-out
 * need a trip, so they belong to generation (`instantiate.ts`) — this answers
 * "what does this composition amount to", which M7 and M8 ask without one.
 *
 * Expansion is deliberately **one level** and not transitive: FR-27.1 fixes
 * the hierarchy at two levels, which is what makes include cycles structurally
 * impossible. Following a group's own includes would quietly reintroduce the
 * depth the FR rejected — and with it the cycle it cannot have.
 */
/**
 * includedTemplatesOf lists the Gruppen a template includes, in an order that
 * is the same on every device.
 *
 * `template_includes` carries no sort order, and the rows arrive in whatever
 * order the sync pulled or IndexedDB handed back — which is not the same twice.
 * That order is *not* cosmetic: it decides which group is a merged item's first
 * contributor, and therefore which group's attributes and provenance the
 * generated row carries (FR-27.5/27.11 read that provenance back a year later).
 * Sorting by name makes it stable and gives the FR-27.2 merge report the order
 * a reader expects; the id breaks ties so two groups of one name still order
 * deterministically. Found by an e2e run that reported „in Wildlife & Makro" on
 * WebKit and „in Makro & Wildlife" on Chromium, from identical data.
 */
export function includedTemplatesOf(
  templateId: string,
  templates: Template[],
  includes: TemplateInclude[],
): Template[] {
  const byId = new Map(templates.map((t) => [t.id, t]))
  return includes
    .filter((inc) => inc.template_id === templateId)
    .map((inc) => ({ inc, group: byId.get(inc.included_template_id) }))
    .filter((e): e is { inc: TemplateInclude; group: Template } => e.group !== undefined)
    .sort((a, b) => a.group.name.localeCompare(b.group.name) || a.inc.id.localeCompare(b.inc.id))
    .map((e) => e.group)
}

export function resolveTemplate(templateId: string, input: CompositionInput): Resolution {
  const byId = new Map(input.templates.map((t) => [t.id, t]))
  const root = byId.get(templateId)
  if (!root) return { positions: [], merges: [], includedTemplates: [] }

  const includedTemplates = includedTemplatesOf(templateId, input.templates, input.includes)

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

/** Why a scope switch is refused (FR-27.6) — the editor turns it into words. */
export type ScopeSwitchBlock = 'has-includes' | 'included-by'

/**
 * scopeSwitchBlock guards the M8 scope switch (FR-27.6). A Vorlage that still
 * includes groups cannot become a Gruppe (a Gruppe holds only positions), and
 * an included Gruppe cannot be promoted (it would vanish from its consumers).
 * The two guards are directional on purpose: being included does not block
 * demotion, and holding includes does not block promotion.
 */
export function scopeSwitchBlock(
  target: TemplateKind,
  includes: TemplateInclude[],
  includedBy: Template[],
): ScopeSwitchBlock | null {
  if (target === 'group' && includes.length > 0) return 'has-includes'
  if (target === 'template' && includedBy.length > 0) return 'included-by'
  return null
}

/** What the blast-radius question needs — plain arrays, the stores shape them. */
export interface BlastRadiusInput {
  trips: Trip[]
  /** Rows across all trips on this device; only provenance is read. */
  items: Pick<TripItem, 'trip_id' | 'source_template_id'>[]
  includes: TemplateInclude[]
}

/**
 * planningTripsUsing answers FR-27.4's warning surface: which *planning* trips
 * does an edit to this template reach? Active and archived trips are frozen
 * and never in the radius. A trip counts when one of its rows carries the
 * template as provenance, or carries a Vorlage that includes it — editing a
 * group lands on trips generated from the composed Vorlage once the refresh
 * re-resolves it. Computed over the trips synced to this device (the M12
 * honesty rule), so it works identically in Local Mode.
 */
export function planningTripsUsing(templateId: string, input: BlastRadiusInput): Trip[] {
  // The template itself, plus every Vorlage whose composition contains it.
  const reachable = new Set([templateId])
  for (const inc of input.includes) {
    if (inc.included_template_id === templateId) reachable.add(inc.template_id)
  }

  const touched = new Set<string>()
  for (const item of input.items) {
    if (item.source_template_id && reachable.has(item.source_template_id)) {
      touched.add(item.trip_id)
    }
  }

  return input.trips.filter((t) => t.status === 'planning' && touched.has(t.id))
}

/** One line of a group's content, as a reader sees it (FR-27.12). */
export interface ResolvedLine {
  name: string
  quantity: number
}

/**
 * resolvedLines turns a resolution into the list a human reads: master-item
 * names with their resolved quantities, **ordered by name**.
 *
 * The order is derived rather than inherited for the same reason
 * includedTemplatesOf derives its own: the positions arrive in whatever order
 * the sync produced, and a list somebody scans for "ist das Stativ dabei?"
 * must not answer differently on two devices. A position whose master item has
 * not synced yet is dropped — an unnamed line answers nothing.
 */
export function resolvedLines(resolution: Resolution, items: MasterItem[]): ResolvedLine[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  return resolution.positions
    .map((p) => ({ item: byId.get(p.item_id), quantity: p.quantity }))
    .filter((e): e is { item: MasterItem; quantity: number } => e.item !== undefined)
    .map((e) => ({ name: e.item.name, quantity: e.quantity }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * How many names a row shows before it counts the rest.
 *
 * Two, not three: at 390 px three German item names wrap onto a second line,
 * which turns a scannable row into a four-line block — and the third name buys
 * little, since the row is the *hint* and the sheet is the answer. Rendered
 * both ways before choosing.
 */
export const PREVIEW_ROW_NAMES = 2

/** What a row can say about a group without being opened (FR-27.12). */
export interface LinePreview {
  names: string[]
  /** How many lines the row could not show — 0 when everything fits. */
  rest: number
}

/**
 * previewLines cuts the list down to what fits on a row. The remainder is a
 * count rather than an ellipsis: "+2" at least says how much is hidden, which
 * is the honest half of a summary that cannot answer the precise question.
 */
export function previewLines(lines: ResolvedLine[], max: number): LinePreview {
  return {
    names: lines.slice(0, max).map((l) => l.name),
    rest: Math.max(0, lines.length - max),
  }
}
