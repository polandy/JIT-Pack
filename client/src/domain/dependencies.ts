/**
 * Item-dependency resolution ("companion items", Addendum 3.20,
 * FR-20.1–20.4) — pure, no I/O. Runs after template instantiation:
 * required companions of on-list items join the list transitively,
 * suggested ones surface as one-tap candidates, and anything already
 * explicit on the list dedups by source_item_id per FR-20.3.
 *
 * Client-side like instantiate.ts so Local Mode (3.19) gets the
 * feature for free.
 */

import { computeQuantity } from './instantiate'
import type { CategorisedMasterItem, ItemDependency } from '@/types/domain'

export interface DependencyResolutionInput {
  /** Items already on the list (generated or explicit). */
  onList: { source_item_id: string | null; quantity: number }[]
  dependencies: ItemDependency[]
  masterItems: CategorisedMasterItem[]
}

/** A required companion to add — trip-global, mode pack, like any resolved item. */
export interface ResolvedCompanion {
  item_id: string
  name: string
  category_name: string | null
  weight_grams: number | null
  value_cents: number | null
  quantity: number
  via_item_name: string
}

/** A companion that was already explicit on the list (FR-20.3). */
export interface DedupedCompanion {
  item_id: string
  name: string
  via_item_name: string
}

/**
 * A suggested companion awaiting the user's tap (FR-20.4).
 *
 * It carries the item's own fields for the same reason {@link
 * ResolvedCompanion} does: whoever accepts the suggestion writes a trip row
 * from it, and a caller that has to look the item up again is a caller that
 * can forget to (M5's chip wrote rows with no category and a quantity of one).
 */
export interface SuggestedCompanion {
  dependency_id: string
  item_id: string
  name: string
  category_name: string | null
  weight_grams: number | null
  value_cents: number | null
  quantity: number
  via_item_name: string
}

export interface DependencyResolution {
  required: ResolvedCompanion[]
  deduped: DedupedCompanion[]
  suggested: SuggestedCompanion[]
}

export function resolveDependencies(input: DependencyResolutionInput): DependencyResolution {
  const itemsByID = new Map(input.masterItems.map((i) => [i.id, i]))
  const byMain = new Map<string, ItemDependency[]>()
  for (const d of input.dependencies) {
    const list = byMain.get(d.depends_on_item_id) ?? []
    list.push(d)
    byMain.set(d.depends_on_item_id, list)
  }

  const explicit = new Set<string>()
  for (const row of input.onList) {
    if (row.source_item_id) explicit.add(row.source_item_id)
  }

  const added = new Map<string, ResolvedCompanion>()
  const deduped: DedupedCompanion[] = []
  const dedupedIDs = new Set<string>()
  const suggested: SuggestedCompanion[] = []
  const suggestedIDs = new Set<string>()

  // Breadth-first over the on-list items; required companions enter the
  // queue themselves (transitive resolution). visited guards against
  // cycles that slipped past save-time validation on another device.
  const queue = [...explicit]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const mainID = queue.shift()!
    if (visited.has(mainID)) continue
    visited.add(mainID)

    const main = itemsByID.get(mainID)
    for (const d of byMain.get(mainID) ?? []) {
      const companion = itemsByID.get(d.item_id)
      if (!companion || !main) continue
      const quantity = computeQuantity({ quantity: d.quantity ?? 1 })

      if (d.mode === 'suggested') {
        if (!explicit.has(d.item_id) && !added.has(d.item_id) && !suggestedIDs.has(d.item_id)) {
          suggestedIDs.add(d.item_id)
          suggested.push({
            dependency_id: d.id,
            item_id: d.item_id,
            name: companion.name,
            category_name: companion.category_name ?? null,
            weight_grams: companion.weight_grams,
            value_cents: companion.value_cents,
            quantity,
            via_item_name: main.name,
          })
        }
        continue
      }

      if (explicit.has(d.item_id)) {
        // FR-20.3: already on the list in its own right — no second
        // instance, just report the dedup for the M3 preview footer.
        if (!dedupedIDs.has(d.item_id)) {
          dedupedIDs.add(d.item_id)
          deduped.push({ item_id: d.item_id, name: companion.name, via_item_name: main.name })
        }
        continue
      }

      const existing = added.get(d.item_id)
      if (existing) {
        // Two mains pulled in the same companion: one row, max quantity
        // (FR-2.3a's default — the relation carries no dedup attribute).
        existing.quantity = Math.max(existing.quantity, quantity)
        continue
      }

      added.set(d.item_id, {
        item_id: d.item_id,
        name: companion.name,
        category_name: companion.category_name ?? null,
        weight_grams: companion.weight_grams,
        value_cents: companion.value_cents,
        quantity,
        via_item_name: main.name,
      })
      queue.push(d.item_id)
    }
  }

  return { required: [...added.values()], deduped, suggested }
}

/**
 * dependentsOf collects the transitive dependents of an item — the ids
 * to co-skip when the main item is skipped or removed (FR-20.2), in
 * any mode: a suggested companion the user tapped in depends just the
 * same.
 */
export function dependentsOf(itemID: string, dependencies: ItemDependency[]): Set<string> {
  const out = new Set<string>()
  // Cyclic data walks back through the start, and the visited set has to
  // remember it or the walk never ends. The result must not carry it: an
  // item is not its own dependent, and a second row of it on the list would
  // otherwise follow the first one out.
  const seen = new Set<string>([itemID])
  const queue = [itemID]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const d of dependencies) {
      if (d.depends_on_item_id === current && !seen.has(d.item_id)) {
        seen.add(d.item_id)
        out.add(d.item_id)
        queue.push(d.item_id)
      }
    }
  }
  return out
}

/** The little a row has to say about itself to take part in a co-skip. */
export interface CoSkippable {
  id: string
  source_item_id: string | null
  state: string
}

/**
 * coSkipTargets names the trip rows that follow a skipped item out of the
 * list (FR-20.2) — the rows whose master item transitively depends on it,
 * minus those already skipped, and minus those something else on the list
 * still needs.
 *
 * FR-20.2 keeps a companion on the list while its main item is on it and not
 * skipped, and "its main item" is not always the row in hand: a per-person
 * item (FR-25.1) has one row per traveler, and one companion can serve two
 * mains. So every other live row the cascade does not itself take is an
 * *anchor*, and whatever an anchor depends on stays. Skipping one traveler's
 * camera leaves the battery coming for the other.
 *
 * Pure and separate from the mutation that writes them because the caller
 * needs the *list*, not only the effect: FR-5.5's snackbar tells the user
 * which companions went along, and an undo has to put exactly those back.
 * A row with no master item behind it (`source_item_id === null`) is a
 * quick-add and can carry no dependency, so it never joins.
 */
export function coSkipTargets<T extends CoSkippable>(
  main: T,
  rows: readonly T[],
  dependencies: ItemDependency[],
): T[] {
  if (!main.source_item_id) return []
  const dependents = dependentsOf(main.source_item_id, dependencies)
  const stillNeeded = new Set<string>()
  for (const anchor of rows) {
    if (
      anchor.id === main.id ||
      anchor.source_item_id === null ||
      anchor.state === 'skipped' ||
      dependents.has(anchor.source_item_id)
    ) {
      continue
    }
    for (const id of dependentsOf(anchor.source_item_id, dependencies)) stillNeeded.add(id)
  }
  return rows.filter(
    (row) =>
      row.id !== main.id &&
      row.source_item_id !== null &&
      dependents.has(row.source_item_id) &&
      !stillNeeded.has(row.source_item_id) &&
      row.state !== 'skipped',
  )
}

/**
 * skippedVia names the skipped row a skipped row came along with (FR-20.2),
 * or null when it was skipped on its own account.
 *
 * Derived rather than stored: FR-20.2 asks a co-skipped row to say *why*
 * ("skipped: drone not on this trip"), and the dependency graph plus the
 * current states already answer that. A column would have to be kept
 * truthful through un-skips on either side, and would still be wrong after
 * the dependency itself is edited.
 */
export function skippedVia<T extends CoSkippable>(
  row: T,
  rows: readonly T[],
  dependencies: ItemDependency[],
): T | null {
  if (row.state !== 'skipped' || !row.source_item_id) return null
  const source = row.source_item_id
  return (
    rows.find(
      (candidate) =>
        candidate.id !== row.id &&
        candidate.state === 'skipped' &&
        candidate.source_item_id !== null &&
        dependentsOf(candidate.source_item_id, dependencies).has(source),
    ) ?? null
  )
}

/**
 * A rejected dependency edge, as a reason and the item names involved —
 * never as a finished sentence. This module is pure and locale-free (NFR-4.12),
 * so the screen that shows the fault is the one that words it: `self` names the
 * single item, `cycle` names every hop of the path, starting and ending on the
 * same item.
 */
export interface DependencyCycleError {
  reason: 'self' | 'cycle'
  names: string[]
}

/**
 * dependencyCycleError validates a new dependency edge at save time
 * (a save-time validator): a cycle cannot be
 * persisted. Returns the fault, or null when acyclic.
 */
export function dependencyCycleError(
  dependencies: ItemDependency[],
  candidate: { item_id: string; depends_on_item_id: string },
  itemName: (id: string) => string,
): DependencyCycleError | null {
  if (candidate.item_id === candidate.depends_on_item_id) {
    return { reason: 'self', names: [itemName(candidate.item_id)] }
  }
  // Follow depends-on edges from the candidate's main item; reaching the
  // candidate's dependent closes a cycle.
  const dependsOn = dependsOnEdges(dependencies)
  const path = findPath(candidate.depends_on_item_id, candidate.item_id, dependsOn, new Set())
  if (!path) return null
  const names = [candidate.item_id, candidate.depends_on_item_id, ...path.slice(1)].map(itemName)
  return { reason: 'cycle', names }
}

/** The depends-on graph as an adjacency map, keyed by the dependent item. */
function dependsOnEdges(dependencies: ItemDependency[]): Map<string, string[]> {
  const edges = new Map<string, string[]>()
  for (const d of dependencies) {
    const list = edges.get(d.item_id) ?? []
    list.push(d.depends_on_item_id)
    edges.set(d.item_id, list)
  }
  return edges
}

function findPath(
  from: string,
  to: string,
  edges: Map<string, string[]>,
  visited: Set<string>,
): string[] | null {
  if (from === to) return [from]
  if (visited.has(from)) return null
  visited.add(from)
  for (const next of edges.get(from) ?? []) {
    const rest = findPath(next, to, edges, visited)
    if (rest) return [from, ...rest]
  }
  return null
}

// --- Linking many items at once (FR-24.9 over FR-20.1) ---------------------

/**
 * Which way round a bulk link is written. The two are the same edge read from
 * its two ends, which is exactly how M10 renders them: the item whose editor
 * is open *depends on* its mains, and is *accompanied by* whatever depends on
 * it. A batch names the end the user is standing on — the selection — so the
 * direction is the caller's, never guessed from the ids.
 */
export const DEPENDENCY_LINK_MAIN = 'main'
export const DEPENDENCY_LINK_COMPANION = 'companion'
export type DependencyLinkDirection = typeof DEPENDENCY_LINK_MAIN | typeof DEPENDENCY_LINK_COMPANION

/** Why one selected item is left out of a batch. */
export const DEPENDENCY_SKIP_SELF = 'self'
export const DEPENDENCY_SKIP_EXISTS = 'exists'
export const DEPENDENCY_SKIP_CYCLE = 'cycle'
export type DependencySkipReason =
  typeof DEPENDENCY_SKIP_SELF | typeof DEPENDENCY_SKIP_EXISTS | typeof DEPENDENCY_SKIP_CYCLE

/** One edge to write: `item_id` needs `depends_on_item_id` along. */
export interface DependencyEdge {
  item_id: string
  depends_on_item_id: string
}

/** What a batch will write, and which of its items it cannot. */
export interface DependencyBatchPlan {
  edges: DependencyEdge[]
  skipped: { item_id: string; reason: DependencySkipReason }[]
}

/**
 * Plan one bulk link: every selected item against the one item picked for
 * them all (FR-24.9).
 *
 * **A batch never refuses as a whole.** Three of its items may be fine while
 * the fourth is the picked item itself, already linked, or would close a
 * cycle — and answering that with one refusal would make the user find the
 * offender by hand among fifty rows. So each item is decided on its own and
 * the skipped ones are reported by reason, which is also what makes the
 * result sentence honest about what it wrote.
 *
 * **The graph grows as the batch is planned** — though with one picked item
 * that cannot change an answer: every edge of a batch meets that item at the
 * same end, so an accepted one never extends a path the next check follows.
 * It is written this way because the correctness of a plan that reads a graph
 * it is also writing should not rest on that argument.
 */
export function planDependencyBatch(
  dependencies: ItemDependency[],
  selectedIds: string[],
  pickedId: string,
  direction: DependencyLinkDirection,
): DependencyBatchPlan {
  const edges = dependsOnEdges(dependencies)
  const existing = new Set(dependencies.map((d) => edgeKey(d.item_id, d.depends_on_item_id)))
  const plan: DependencyBatchPlan = { edges: [], skipped: [] }

  for (const selectedId of selectedIds) {
    const edge =
      direction === DEPENDENCY_LINK_MAIN
        ? { item_id: selectedId, depends_on_item_id: pickedId }
        : { item_id: pickedId, depends_on_item_id: selectedId }

    const reason = linkRefusal(edge, existing, edges)
    if (reason) {
      plan.skipped.push({ item_id: selectedId, reason })
      continue
    }

    plan.edges.push(edge)
    existing.add(edgeKey(edge.item_id, edge.depends_on_item_id))
    edges.set(edge.item_id, [...(edges.get(edge.item_id) ?? []), edge.depends_on_item_id])
  }
  return plan
}

function linkRefusal(
  edge: DependencyEdge,
  existing: ReadonlySet<string>,
  edges: Map<string, string[]>,
): DependencySkipReason | null {
  if (edge.item_id === edge.depends_on_item_id) return DEPENDENCY_SKIP_SELF
  if (existing.has(edgeKey(edge.item_id, edge.depends_on_item_id))) return DEPENDENCY_SKIP_EXISTS
  const closes = findPath(edge.depends_on_item_id, edge.item_id, edges, new Set())
  return closes ? DEPENDENCY_SKIP_CYCLE : null
}

/** The pair as one map key; no id contains the separator. */
const EDGE_KEY_SEPARATOR = '>'

function edgeKey(itemId: string, dependsOnItemId: string): string {
  return `${itemId}${EDGE_KEY_SEPARATOR}${dependsOnItemId}`
}
