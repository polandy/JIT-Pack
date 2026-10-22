/**
 * M4's full-set tally (Addendum §3.25) — pure, no I/O, no Vue. Split out of
 * `packingView.ts` (ADR-067 is schema-only; this split carries no tradeoff
 * of its own, just `scripts/file-size-gate.mjs`'s ratchet): the headers'
 * counting rule is one self-contained question, read by `buildPackingView`
 * and nothing else.
 */
import type { Traveler } from '@/types/domain'

import { unitsOf } from './packState'
import {
  perPersonKey,
  rowJudged,
  type ClusterFace,
  type PackableRow,
  type PackingViewInput,
  type ViewRules,
} from './packingView'

/** What a head counts over the full set, done instances included. */
export interface ClusterTally {
  units: { done: number; total: number }
  /** In roster order, like {@link instanceIds}. */
  faces: ClusterFace[]
  instanceIds: string[]
}

/** The full-set counts every head answers with, and which items render as clusters. */
export interface Tallies {
  /** By group key. */
  groups: Map<string, { done: number; total: number }>
  /** By `groupKey::clusterKey` — a cluster is scoped to its group. */
  clusters: Map<string, ClusterTally>
  /** The cluster key of a row that renders inside a cluster, or null for a flat row. */
  clusterKeyOf(row: PackableRow): string | null
}

/**
 * Headers count over the full set — everything the filter lets through,
 * hidden done rows included — so a head can count what the list no longer
 * shows. A header counting rows a facet excluded would describe a different
 * list.
 *
 * Units, not rows (FR-25.22): the head has to answer with the same arithmetic
 * the rows under it and the trip line above it use, or a row that is one of
 * two packed counts as nothing for its group.
 */
export function tally(
  input: PackingViewInput<PackableRow>,
  rules: ViewRules,
  shown: PackableRow[],
): Tallies {
  const { items, groupBy, closingPass = false } = input
  // FR-9.3/9.6: the pass's headers answer "how many of these rows have a
  // verdict" — one count per row — never "how many units", which is what
  // the ordinary list's packed/total asks.
  const countOf = (row: PackableRow) =>
    closingPass ? { total: 1, done: rowJudged(row) ? 1 : 0 } : unitsOf(row)

  // Cluster sizes are measured before anything hides an instance: whether a
  // per-person item renders as a cluster or as a flat row must not flip because
  // one instance got packed, or because a facet hid a sibling. The one axis
  // that does set the shape is the Person facet (FR-25.30): choosing whose
  // things are on screen is choosing the list, and a cluster left with one
  // person in it is a fold around a single row that has to be opened to tick.
  const clusterSizes = new Map<string, number>()
  if (groupBy !== 'person') {
    for (const row of items.filter(rules.inPersonScope)) {
      const key = perPersonKey(row)
      if (key) clusterSizes.set(key, (clusterSizes.get(key) ?? 0) + 1)
    }
  }
  const clusterKeyOf = (row: PackableRow) => {
    const key = perPersonKey(row)
    return key !== null && (clusterSizes.get(key) ?? 0) > 1 ? key : null
  }

  const groups = new Map<string, { done: number; total: number }>()
  const instances = new Map<string, { id: string; traveler: Traveler | null; done: boolean }[]>()
  const clusters = new Map<string, ClusterTally>()
  for (const row of shown) {
    const { key: groupKey } = rules.groupOf(row)
    const units = countOf(row)
    const group = groups.get(groupKey) ?? { done: 0, total: 0 }
    group.total += units.total
    group.done += units.done
    groups.set(groupKey, group)

    // The faces come from the same pass as the counts: a shut head stands in
    // for every instance, so it must not answer over a narrower set than its
    // own count does (FR-25.23).
    const clusterKey = clusterKeyOf(row)
    if (clusterKey === null) continue
    const scopedKey = `${groupKey}::${clusterKey}`
    const cluster = clusters.get(scopedKey) ?? {
      units: { done: 0, total: 0 },
      faces: [],
      instanceIds: [],
    }
    cluster.units.total += units.total
    cluster.units.done += units.done
    clusters.set(scopedKey, cluster)
    const list = instances.get(scopedKey) ?? []
    list.push({ id: row.id, traveler: rules.travelerOf(row), done: rules.done(row) })
    instances.set(scopedKey, list)
  }

  for (const [scopedKey, list] of instances) {
    const cluster = clusters.get(scopedKey)!
    list.sort(rules.byTravelerOrder)
    cluster.faces = list.map(({ traveler, done }) => ({ traveler, done }))
    cluster.instanceIds = list.map((instance) => instance.id)
  }

  return { groups, clusters, clusterKeyOf }
}
