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
  ItemMode,
  MasterItem,
  Template,
  TemplateDedup,
  TemplateInclude,
  TemplateItem,
  TemplateKind,
  Trip,
  TripItem,
} from '@/types/domain'
import { followsGroups } from './trips'

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
 * tripsReachedBy answers FR-27.4's warning surface: which trips does an edit
 * to this template reach? Since the 2026-08-18 revision that is every trip
 * that still **follows** its groups (`followsGroups`) — a running one
 * included — and never a past one. It is a *reach*, not an application: each
 * of those trips will be asked on its next open.
 *
 * A trip counts when one of its rows carries the template as provenance, or
 * carries a Vorlage that includes it — editing a group lands on trips
 * generated from the composed Vorlage once the refresh re-resolves it.
 * Computed over the trips synced to this device (the M12 honesty rule), so it
 * works identically in Local Mode.
 *
 * `today` is passed in for the same reason `followsGroups` takes it: the
 * boundary must be a value a test can stand on either side of.
 */
export function tripsReachedBy(templateId: string, input: BlastRadiusInput, today: string): Trip[] {
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

  return input.trips.filter((t) => followsGroups(t, today) && touched.has(t.id))
}

/**
 * One line of a template's content, as a reader sees it (FR-27.12/27.14).
 *
 * Beyond the name and the amount it carries what a count cannot say: which
 * templates contributed it, whether a merge collapsed it, and the two places
 * where the quantity is not the whole story — a per-person position, whose
 * real number belongs to the trip (FR-25.8), and a position the trip may yet
 * exclude or buy rather than pack (FR-15.2). The view decides the wording; the
 * domain decides what is true.
 */
export interface ResolvedLine {
  name: string
  quantity: number
  /** Contributing template names, in resolution order — the Vorlage first. */
  sources: string[]
  /** More than one template asked for this item (FR-27.2). */
  merged: boolean
  /** One row per traveler at generation, so the amount here is per head. */
  perPerson: boolean
  mode: ItemMode
  /** Null unless the position only applies to some trips (FR-15.2). */
  conditions: Record<string, unknown> | null
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
    .map((p) => ({ item: byId.get(p.item_id), resolved: p }))
    .filter((e): e is { item: MasterItem; resolved: ResolvedPosition } => e.item !== undefined)
    .map(({ item, resolved }) => ({
      name: item.name,
      quantity: resolved.quantity,
      sources: resolved.sources.map((t) => t.name),
      merged: resolved.sources.length > 1,
      perPerson: resolved.position.assignment === 'per_person',
      mode: resolved.position.default_mode,
      conditions: resolved.position.conditions,
    }))
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

/** What M7's scope segment is showing: one scope, or both. */
export type ScopeTab = TemplateKind | 'all'

/**
 * scopeForNewTemplate answers what the M7 ＋ should create, or `null` when the
 * question is still open (FR-27.6, amended 2026-08-17).
 *
 * Standing on a single-scope tab, the chooser had one possible answer, and a
 * question with one answer is a tap that carries no information. `null` rather
 * than a default because the two scopes are not interchangeable (FR-27.1):
 * guessing would create the wrong kind silently, and a Gruppe promoted later
 * is blocked the moment something includes it.
 */
export function scopeForNewTemplate(tab: ScopeTab): TemplateKind | null {
  return tab === 'all' ? null : tab
}

// --- FR-27.13: searching the group picker -----------------------------------

/**
 * The picker shows its search field only above this many searchable groups:
 * below that, scanning the chips is faster than typing, and a field that is
 * never useful is one more thing on screen (FR-27.13).
 */
export const PICKER_SEARCH_MIN_GROUPS = 6

/** One group the picker search can look at, resolution already done. */
export interface GroupSearchCandidate {
  id: string
  name: string
  /**
   * The group's resolved item names (FR-27.2), so an item reached through the
   * composition matches — "Kamera" must find *Makro Fotografie*.
   */
  itemNames: string[]
  /**
   * Included groups are hidden while browsing and *shown* while searching: a
   * search that silently drops them implies the group does not exist
   * (FR-27.13, the FR-25.13 duplicate-report rule).
   */
  included: boolean
}

/** One search result, in the order the picker renders. */
export interface GroupSearchHit {
  id: string
  /**
   * The item name the match came from, `null` when the group's own name
   * matched — a hit that matches nothing visible reads as a bug, so the row
   * says "über Kamera".
   */
  via: string | null
  included: boolean
}

/**
 * The app's one matching rule (FR-27.13, same stance as the M4 quick-add and
 * G-12): case- and diacritics-insensitive substring, no fuzzy matching — a
 * wrong-but-confident hit costs more than a missed one when accepting it
 * writes a composition.
 */
function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * searchGroups answers the picker's search (FR-27.13). Ordering is derived,
 * never incidental: name matches first, item matches after, alphabetical by
 * group name within each — two devices must not offer the same search two
 * different orders. A group matching on both its name and an item counts as a
 * name match. The `via` of an item match is the alphabetically first matching
 * item name, for the same determinism.
 */
export function searchGroups(query: string, candidates: GroupSearchCandidate[]): GroupSearchHit[] {
  const needle = foldForSearch(query.trim())
  if (!needle) return []
  const nameHits: GroupSearchHit[] = []
  const itemHits: GroupSearchHit[] = []
  for (const group of [...candidates].sort((a, b) => a.name.localeCompare(b.name))) {
    if (foldForSearch(group.name).includes(needle)) {
      nameHits.push({ id: group.id, via: null, included: group.included })
      continue
    }
    const via = [...group.itemNames]
      .sort((a, b) => a.localeCompare(b))
      .find((name) => foldForSearch(name).includes(needle))
    if (via !== undefined) itemHits.push({ id: group.id, via, included: group.included })
  }
  return [...nameHits, ...itemHits]
}

// --- FR-27.15: recognising a group in loose positions ------------------------

/**
 * A group of fewer than this many resolved positions never suggests itself: a
 * one-item group would claim every list that happens to mention its item, and
 * a hint that fires everywhere is read as noise rather than as a finding
 * (FR-27.15).
 */
export const GROUP_MATCH_MIN_POSITIONS = 2

/** One Gruppe the detector may recognise, resolution already done. */
export interface GroupMatchCandidate {
  id: string
  name: string
  /** The group's resolved positions (FR-27.2) — its complete definition. */
  positions: ResolvedPosition[]
  /**
   * An already-included group is never offered: its items are covered by the
   * include, and the loose duplicates are FR-27.2's dedup question rather
   * than this one's.
   */
  included: boolean
}

/** One recognised group, as the M8 suggestion row renders it. */
export interface GroupMatch {
  templateId: string
  name: string
  /** The own positions the group covers, in the order they were handed in. */
  positionIds: string[]
  /**
   * How many of those positions define something the group defines
   * differently. Accepting the fold makes the group's definition apply, so
   * the row states the count before the tap — the one thing this feature must
   * never do is change what a trip would generate without having said so.
   */
  deviations: number
}

/**
 * The fields that decide what a position generates. Comparing all of them
 * rather than the quantity alone widens FR-27.15's stated sentence on purpose:
 * a fold that silently turns a per-person row trip-global is exactly the
 * unannounced change the FR forbids, and the quantity is only the most common
 * way that happens.
 */
function generationSignature(pos: TemplateItem): string {
  const conditions = Object.entries(pos.conditions ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(',')
  return [
    pos.quantity,
    pos.assignment,
    pos.dedup,
    pos.default_mode,
    pos.late_packer ? '1' : '0',
    conditions,
  ].join('|')
}

/**
 * matchGroupsInPositions finds the Gruppen a Ferien-Vorlage has re-typed as
 * own positions (FR-27.15).
 *
 * A group is recognised when its **complete** resolved item set is contained
 * in the own positions, compared by master item id — every position references
 * a master item (FR-1.1 creates one even from free text), so name fuzziness
 * has no role here, unlike FR-27.5's after-the-fact match. Surplus loose
 * positions stay loose; no threshold matching, because a half-hit needs its
 * gaps explained and accepting the offer *writes* the composition.
 *
 * Ordering is derived, never incidental: the largest resolved set first,
 * alphabetical within — the FR-27.2/27.12 rule, so two devices offer the same
 * candidates in the same order. Accepting one shrinks the loose set, which
 * makes a subsumed candidate fall out on the next evaluation rather than
 * converting the same items twice.
 */
export function matchGroupsInPositions(
  ownPositions: TemplateItem[],
  candidates: GroupMatchCandidate[],
): GroupMatch[] {
  const byItem = new Map<string, TemplateItem>()
  for (const pos of ownPositions) byItem.set(pos.item_id, pos)

  const matches: GroupMatch[] = []
  for (const group of candidates) {
    if (group.included) continue
    if (group.positions.length < GROUP_MATCH_MIN_POSITIONS) continue
    if (!group.positions.every((gp) => byItem.has(gp.item_id))) continue

    const covered = new Set(group.positions.map((gp) => gp.item_id))
    const deviations = group.positions.filter((gp) => {
      const own = byItem.get(gp.item_id)!
      return (
        own.quantity !== gp.quantity ||
        generationSignature(own) !== generationSignature({ ...gp.position, quantity: own.quantity })
      )
    }).length

    matches.push({
      templateId: group.id,
      name: group.name,
      positionIds: ownPositions.filter((pos) => covered.has(pos.item_id)).map((pos) => pos.id),
      deviations,
    })
  }

  return matches.sort(
    (a, b) => b.positionIds.length - a.positionIds.length || a.name.localeCompare(b.name),
  )
}
