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

import type { FormulaVariables } from './formula'
import { computeQuantity } from './instantiate'
import type { ItemDependency, MasterItem } from '@/types/domain'

export interface DependencyResolutionInput {
  /** Items already on the list (generated or explicit). */
  onList: { source_item_id: string | null; quantity: number }[]
  dependencies: ItemDependency[]
  masterItems: MasterItem[]
  vars: FormulaVariables
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

/** A suggested companion awaiting the user's tap (FR-20.4). */
export interface SuggestedCompanion {
  dependency_id: string
  item_id: string
  name: string
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
      const quantity = computeQuantity(
        { quantity_formula: d.quantity_formula ?? '1' },
        companion,
        input.vars,
      )

      if (d.mode === 'suggested') {
        if (!explicit.has(d.item_id) && !added.has(d.item_id) && !suggestedIDs.has(d.item_id)) {
          suggestedIDs.add(d.item_id)
          suggested.push({
            dependency_id: d.id,
            item_id: d.item_id,
            name: companion.name,
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
  const queue = [itemID]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const d of dependencies) {
      if (d.depends_on_item_id === current && !out.has(d.item_id)) {
        out.add(d.item_id)
        queue.push(d.item_id)
      }
    }
  }
  return out
}

/**
 * dependencyCycleError validates a new dependency edge at save time
 * (analogous to the FR-1.5 formula validator): a cycle cannot be
 * persisted. Returns a human-readable error, or null when acyclic.
 */
export function dependencyCycleError(
  dependencies: ItemDependency[],
  candidate: { item_id: string; depends_on_item_id: string },
  itemName: (id: string) => string,
): string | null {
  if (candidate.item_id === candidate.depends_on_item_id) {
    return `${itemName(candidate.item_id)} cannot depend on itself`
  }
  // Follow depends-on edges from the candidate's main item; reaching the
  // candidate's dependent closes a cycle.
  const dependsOn = new Map<string, string[]>()
  for (const d of dependencies) {
    const list = dependsOn.get(d.item_id) ?? []
    list.push(d.depends_on_item_id)
    dependsOn.set(d.item_id, list)
  }
  const path = findPath(candidate.depends_on_item_id, candidate.item_id, dependsOn, new Set())
  if (!path) return null
  const names = [candidate.item_id, candidate.depends_on_item_id, ...path.slice(1)].map(itemName)
  return `dependency cycle: ${names.join(' → ')}`
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
