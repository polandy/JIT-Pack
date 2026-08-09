/**
 * M4 packing-list view model (Addendum §3.25) — pure, no I/O, no Vue.
 *
 * The redesigned packing list has to answer three questions that are pure list
 * arithmetic, so they live here instead of in the component: which rows are
 * still worth showing (FR-25.2), which rows belong together as one per-person
 * item (FR-25.1), and what the procurement-mode filter offers (FR-25.4).
 *
 * Counting rule that runs through all of it: **headers count over the full
 * set, lists render the filtered set.** A group that says "3/8" while showing
 * five rows is telling the truth — the other three are done and hidden. Losing
 * that distinction is the easiest way to make the screen lie.
 */
import type { Container, GroupBy, ItemMode, TripItem, Traveler } from '@/types/domain'

/** A single packable row — either a plain item or one traveler's instance of a per-person item. */
export interface PackingRow {
  kind: 'item'
  item: TripItem
  /** "For whom" — set only for per-person instances; renders on the left (FR-25.3). */
  traveler: Traveler | null
  done: boolean
  /** Display name: the item name, or "Item · Person" for a lone per-person instance. */
  label: string
}

/** Several instances of one per-person item, named once (FR-25.1). */
export interface PackingCluster {
  kind: 'cluster'
  key: string
  name: string
  /** Over every instance, including the hidden done ones. */
  doneCount: number
  totalCount: number
  /** Visible instances only. */
  children: PackingRow[]
  /** The mode glyph sits once on the cluster header, not on each child (FR-25.4a). */
  mode: ItemMode
  latePacker: boolean
}

export type PackingEntry = PackingRow | PackingCluster

export interface PackingGroup {
  key: string
  /** `null` = the unassigned bucket; the caller supplies the wording. */
  name: string | null
  /** Over the full set, so the header stays honest while done rows are hidden. */
  doneCount: number
  totalCount: number
  entries: PackingEntry[]
}

export interface PackingView {
  groups: PackingGroup[]
  /** Feeds the "show N packed" toggle; zero once they are revealed. */
  hiddenDoneCount: number
  /** Per-mode counts over the *open* rows, for the filter pills. */
  modeCounts: Record<ItemMode, number>
}

export interface PackingViewInput {
  items: TripItem[]
  travelers: Traveler[]
  containers: Container[]
  groupBy: GroupBy
  /** FR-25.2 reveal toggle — non-destructive and per-user. */
  showDone: boolean
  /** FR-25.4b multi-select; empty means no filter rather than "nothing". */
  modeFilter: ItemMode[]
  /** Ids of items carrying an unresolved preparation todo (FR-7.3). */
  itemsWithOpenPrep: string[]
}

/**
 * A row is done when it needs no further action: fully packed, or consciously
 * skipped (FR-5.5). A packed row with an open preparation todo is deliberately
 * *not* done — FR-7.3's "packed with open prep" still has work attached, and
 * hiding it is exactly the false "all done" the state exists to prevent.
 */
export function isDone(item: TripItem, hasOpenPrep: boolean): boolean {
  if (item.state === 'skipped') return true
  const fullyPacked = item.packed_count >= item.quantity && item.quantity > 0
  return fullyPacked && !hasOpenPrep
}

/**
 * Instances of one per-person item share a source item; ad-hoc rows added
 * during packing (FR-5.6) have none, so they fall back to the name. Both are
 * scoped by traveler-assignment: a row without a traveler is never part of a
 * cluster.
 */
function clusterKeyOf(item: TripItem): string | null {
  if (!item.assigned_traveler_id) return null
  return item.source_item_id ? `src:${item.source_item_id}` : `name:${item.name.toLowerCase()}`
}

function groupOf(
  item: TripItem,
  groupBy: GroupBy,
  travelerById: Map<string, Traveler>,
  containerById: Map<string, Container>,
): { key: string; name: string | null } {
  switch (groupBy) {
    case 'person': {
      const traveler = item.assigned_traveler_id
        ? travelerById.get(item.assigned_traveler_id)
        : undefined
      return { key: traveler?.id ?? '', name: traveler?.name ?? null }
    }
    case 'container': {
      const container = item.container_id ? containerById.get(item.container_id) : undefined
      return { key: container?.id ?? '', name: container?.name ?? null }
    }
    case 'status':
      return { key: item.state, name: item.state }
    case 'category':
    default:
      return { key: item.category_name ?? '', name: item.category_name ?? null }
  }
}

/** Named groups sort alphabetically; the unassigned bucket always trails them. */
function byGroupName(a: PackingGroup, b: PackingGroup): number {
  if (a.name === null) return b.name === null ? 0 : 1
  if (b.name === null) return -1
  return a.name.localeCompare(b.name)
}

export function buildPackingView(input: PackingViewInput): PackingView {
  const { items, travelers, containers, groupBy, showDone, modeFilter, itemsWithOpenPrep } = input

  const travelerById = new Map(travelers.map((t) => [t.id, t]))
  const containerById = new Map(containers.map((c) => [c.id, c]))
  const travelerOrder = new Map(travelers.map((t, i) => [t.id, i]))
  const openPrep = new Set(itemsWithOpenPrep)

  const modeCounts: Record<ItemMode, number> = { pack: 0, buy_before: 0, buy_local: 0 }
  let hiddenDoneCount = 0

  // Mode filtering happens before grouping; mode *counts* are taken over the
  // unfiltered open rows so the pills do not renumber as you toggle them.
  const modeSelected = new Set(modeFilter)
  const visible: TripItem[] = []
  for (const item of items) {
    const done = isDone(item, openPrep.has(item.id))
    if (!done) modeCounts[item.mode] += 1
    if (modeSelected.size > 0 && !modeSelected.has(item.mode)) continue
    if (done && !showDone) {
      hiddenDoneCount += 1
      continue
    }
    visible.push(item)
  }

  // Full-set tallies per group, so headers can count what the list no longer shows.
  const totals = new Map<string, { done: number; total: number }>()
  for (const item of items) {
    if (modeSelected.size > 0 && !modeSelected.has(item.mode)) continue
    const { key } = groupOf(item, groupBy, travelerById, containerById)
    const tally = totals.get(key) ?? { done: 0, total: 0 }
    tally.total += 1
    if (isDone(item, openPrep.has(item.id))) tally.done += 1
    totals.set(key, tally)
  }

  // Cluster sizes are measured over the full set too: whether a per-person item
  // renders as a cluster or as a flat row must not flip just because one of its
  // instances got packed and hidden.
  const clusterSizes = new Map<string, number>()
  if (groupBy !== 'person') {
    for (const item of items) {
      const key = clusterKeyOf(item)
      if (key) clusterSizes.set(key, (clusterSizes.get(key) ?? 0) + 1)
    }
  }

  const groups = new Map<string, PackingGroup>()
  const clusters = new Map<string, PackingCluster>()

  function rowFor(item: TripItem, standalone: boolean): PackingRow {
    const traveler = item.assigned_traveler_id
      ? (travelerById.get(item.assigned_traveler_id) ?? null)
      : null
    // A lone per-person instance says who it is for inline, since no cluster
    // header carries that context. Grouped by traveler the header already does.
    const label =
      standalone && traveler && groupBy !== 'person' ? `${item.name} · ${traveler.name}` : item.name
    return { kind: 'item', item, traveler, done: isDone(item, openPrep.has(item.id)), label }
  }

  for (const item of visible) {
    const { key: groupKey, name } = groupOf(item, groupBy, travelerById, containerById)
    let group = groups.get(groupKey)
    if (!group) {
      const tally = totals.get(groupKey) ?? { done: 0, total: 0 }
      group = { key: groupKey, name, doneCount: tally.done, totalCount: tally.total, entries: [] }
      groups.set(groupKey, group)
    }

    const clusterKey = clusterKeyOf(item)
    const clustered = clusterKey !== null && (clusterSizes.get(clusterKey) ?? 0) > 1

    if (!clustered) {
      group.entries.push(rowFor(item, true))
      continue
    }

    const scopedKey = `${groupKey}::${clusterKey}`
    let cluster = clusters.get(scopedKey)
    if (!cluster) {
      cluster = {
        kind: 'cluster',
        key: scopedKey,
        name: item.name,
        doneCount: 0,
        totalCount: 0,
        children: [],
        mode: item.mode,
        latePacker: false,
      }
      clusters.set(scopedKey, cluster)
      group.entries.push(cluster)
    }
    cluster.children.push(rowFor(item, false))
    // Any instance flagged late-packer marks the cluster; the ⏰ is a warning,
    // and a warning that only shows on some children is one that gets missed.
    cluster.latePacker = cluster.latePacker || item.late_packer
  }

  // Cluster tallies over the full set, matching the group-header rule.
  for (const item of items) {
    if (modeSelected.size > 0 && !modeSelected.has(item.mode)) continue
    const clusterKey = clusterKeyOf(item)
    if (clusterKey === null || (clusterSizes.get(clusterKey) ?? 0) <= 1) continue
    const { key: groupKey } = groupOf(item, groupBy, travelerById, containerById)
    const cluster = clusters.get(`${groupKey}::${clusterKey}`)
    if (!cluster) continue
    cluster.totalCount += 1
    if (isDone(item, openPrep.has(item.id))) cluster.doneCount += 1
  }

  for (const cluster of clusters.values()) {
    cluster.children.sort(
      (a, b) =>
        (travelerOrder.get(a.traveler?.id ?? '') ?? Number.MAX_SAFE_INTEGER) -
        (travelerOrder.get(b.traveler?.id ?? '') ?? Number.MAX_SAFE_INTEGER),
    )
  }

  return {
    groups: [...groups.values()].sort(byGroupName),
    hiddenDoneCount,
    modeCounts,
  }
}
