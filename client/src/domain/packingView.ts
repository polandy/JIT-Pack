/**
 * M4 packing-list view model (Addendum §3.25) — pure, no I/O, no Vue.
 *
 * The redesigned packing list has to answer questions that are pure list
 * arithmetic, so they live here instead of in the component: which rows are
 * still worth showing (FR-25.2/25.11/25.20), which rows belong together as one
 * per-person item (FR-25.1), and what the facet panel may offer (FR-25.11d).
 *
 * Counting rule that runs through all of it: **headers count over the full
 * set, lists render the filtered set.** A group that says "3/8" while showing
 * five rows is telling the truth — the other three are done and hidden. Losing
 * that distinction is the easiest way to make the screen lie.
 */
import type {
  Container,
  FacetKey,
  Facets,
  GroupBy,
  ItemMode,
  TripItem,
  TripParticipant,
  Traveler,
} from '@/types/domain'
import { ITEM_MODES } from '@/types/domain'

/**
 * The facets in panel order (FR-25.11b). Every value is a string so the whole
 * filter survives a `JSON.stringify` into session storage (FR-25.18).
 */
export const FACET_KEYS: readonly FacetKey[] = [
  'person',
  'category',
  'mode',
  'container',
  'flag',
] as const

/**
 * The empty string addresses the *absence* of a value — shared items in the
 * person facet (FR-25.11f), uncategorised rows, luggage-less rows. It is a
 * value like any other, not "no selection": that is an empty array.
 */
export const NO_VALUE = ''

const MODE_VALUES: readonly ItemMode[] = ITEM_MODES

/** The *Merkmale* facet (FR-25.11b): flags that cut across the other axes. */
const FLAG_VALUES = ['late', 'missing', 'prep'] as const
export type FlagFacetValue = (typeof FLAG_VALUES)[number]

/** An unfiltered facet set — the state every fresh session starts from (FR-25.18). */
export function noFacets(): Facets {
  return { person: [], category: [], mode: [], container: [], flag: [] }
}

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
  /**
   * The master item every instance came from, or null for an ad-hoc name.
   * The head names the item once, so it is the head that renders the item's
   * mark and photo (FR-28.4/28.7) — and a cluster whose visible children are
   * all packed away still has to know whose mark it carries.
   */
  sourceItemId: string | null
}

export type PackingEntry = PackingRow | PackingCluster

export interface PackingGroup {
  key: string
  /** `null` = the unassigned bucket; the caller supplies the wording. */
  name: string | null
  /** Over the full set, so the header stays honest while done rows are hidden. */
  doneCount: number
  totalCount: number
  /** What a folded header has to answer in place of done/total (FR-25.16). */
  openCount: number
  /** Folded shut by the user; the entries are still built so unfolding is free. */
  collapsed: boolean
  entries: PackingEntry[]
}

/** One offer in the filter sheet (FR-25.11d). */
export interface FacetValue {
  value: string
  /**
   * `null` where the wording is UI copy rather than data — modes, flags and
   * every absence bucket. Same convention as `PackingGroup.name`.
   */
  label: string | null
  /** What picking this value would yield, given the *other* active facets. */
  count: number
  selected: boolean
}

export interface PackingView {
  groups: PackingGroup[]
  /**
   * Feeds the reveal toggle in both directions (FR-25.2): done **rows**
   * among the ones the filter lets through, whether they are currently
   * hidden or shown. It does not drop to zero on reveal — the bar labels
   * the same set either way, and a number that changed with the
   * direction of the toggle described two different things.
   */
  doneCount: number
  /** Feeds the FR-25.20 reveal bar; zero once other people's rows are revealed. */
  hiddenOtherCount: number
  /** Who those rows belong to, so the bar can name them rather than just count. */
  hiddenOtherNames: string[]
  facetValues: Record<FacetKey, FacetValue[]>
  /** The filter badge (FR-25.11a): how many facet values are in force. */
  activeFacetCount: number
  /** The sheet's footer promise ("14 Sachen anzeigen") — open rows passing the facets. */
  matchCount: number
  /**
   * Something is hiding rows that are not merely done (FR-25.11e). An empty
   * list may only read as "everything is packed" when this is false — a search,
   * a facet or FR-25.20's default each make completion a lie.
   */
  narrowed: boolean
}

export interface PackingViewInput {
  items: TripItem[]
  travelers: Traveler[]
  containers: Container[]
  /** Trip members, to name the people behind FR-25.20's reveal bar. */
  participants: TripParticipant[]
  groupBy: GroupBy
  /** FR-25.2 reveal toggle — non-destructive and per-user. */
  showDone: boolean
  /** FR-25.11: empty means no restriction on that axis, never "show nothing". */
  facets: Facets
  /** FR-25.11k: the collapsed search field's term; whitespace narrows nothing. */
  search: string
  /** Who "mine" is (FR-25.20). `null` in Single-User and Local Mode, where nothing is assignable. */
  currentUserId: string | null
  /** FR-25.20 reveal toggle. */
  showOthers: boolean
  /** Group keys folded shut (FR-25.16) — by key, so a re-render keeps the fold. */
  collapsedGroups: string[]
  /** Ids of items carrying an unresolved preparation todo (FR-7.3). */
  itemsWithOpenPrep: string[]
  /**
   * FR-9.3's closing pass: list only what was actually packed. An
   * unpacked row is either consciously skipped — already a judgement, and
   * the opposite one — or it was forgotten, and neither is *unused*.
   */
  packedOnly?: boolean
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
 * Who the row's right edge names, or `null` for a row nobody is attached to.
 *
 * FR-25.19 splits one column into two: `packer_user_id` is the assignment the
 * client makes, `packed_by_user_id` the record the server stamps (invariant 3).
 * A row carries **one** avatar, and the record wins — once a row is packed, who
 * was going to do it has stopped being the useful fact, and rendering both
 * leaves the row claiming an open job it no longer has. Where the two differ,
 * the revealed row's FR-25.17 stamp names them both — which is where there is
 * room for it.
 */
export function rowEdgeAvatar(
  item: TripItem,
): { variant: 'assignee' | 'packer'; id: string } | null {
  if (item.packed_by_user_id) return { variant: 'packer', id: item.packed_by_user_id }
  if (item.packer_user_id) return { variant: 'assignee', id: item.packer_user_id }
  return null
}

/**
 * The key every instance of one per-person item shares, or `null` for a row
 * that is nobody's in particular.
 *
 * Instances of one per-person item share a source item; ad-hoc rows added
 * during packing (FR-5.6) have none, so they fall back to the name. Both are
 * scoped by traveler-assignment: a row without a traveler is never part of a
 * cluster. Exported because M6 keys its aggregated buy row the same way
 * (FR-25.6) — two screens grouping the same rows by two rules would be two
 * answers to one question.
 */
export function perPersonKey(item: TripItem): string | null {
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

/**
 * The facet values a row satisfies — one place, so filtering and counting can
 * never drift apart. All facets but *Merkmale* answer with exactly one value.
 */
function valuesOf(item: TripItem, key: FacetKey, hasOpenPrep: boolean): string[] {
  switch (key) {
    case 'person':
      return [item.assigned_traveler_id ?? NO_VALUE]
    case 'category':
      return [item.category_name ?? NO_VALUE]
    case 'mode':
      return [item.mode]
    case 'container':
      return [item.container_id ?? NO_VALUE]
    case 'flag': {
      const flags: FlagFacetValue[] = []
      if (item.late_packer) flags.push('late')
      if (item.flag_missing) flags.push('missing')
      if (hasOpenPrep) flags.push('prep')
      return flags
    }
  }
}

export function buildPackingView(input: PackingViewInput): PackingView {
  const {
    items,
    travelers,
    containers,
    participants,
    groupBy,
    showDone,
    facets,
    search,
    currentUserId,
    showOthers,
    collapsedGroups,
    itemsWithOpenPrep,
    packedOnly = false,
  } = input

  const travelerById = new Map(travelers.map((t) => [t.id, t]))
  const containerById = new Map(containers.map((c) => [c.id, c]))
  const travelerOrder = new Map(travelers.map((t, i) => [t.id, i]))
  const nameByUserId = new Map(participants.map((p) => [p.user_id, p.display_name]))
  const openPrep = new Set(itemsWithOpenPrep)
  const folded = new Set(collapsedGroups)

  const done = (item: TripItem) => isDone(item, openPrep.has(item.id))

  /** FR-25.11c: OR within a facet, AND across them. `skip` leaves one axis out (FR-25.11d). */
  function passesFacets(item: TripItem, skip?: FacetKey): boolean {
    return FACET_KEYS.every((key) => {
      if (key === skip) return true
      const selected = facets[key]
      if (selected.length === 0) return true
      return valuesOf(item, key, openPrep.has(item.id)).some((v) => selected.includes(v))
    })
  }

  const term = search.trim().toLowerCase()
  const matchesSearch = (item: TripItem) => term === '' || item.name.toLowerCase().includes(term)

  /**
   * FR-25.20: assigned, and not to me. An unassigned row is nobody's and
   * therefore everybody's, so it never hides — and where there is no current
   * user (Single-User, Local) nothing is assignable, so nothing hides either.
   * Read from the *assignment*, never from the packing record (FR-25.19).
   */
  const othersJob = (item: TripItem) =>
    currentUserId !== null && item.packer_user_id !== null && item.packer_user_id !== currentUserId

  /** FR-9.3: taken along, in whole or in part — and not consciously left behind. */
  const wasPacked = (item: TripItem) => item.packed_count > 0 && item.state !== 'skipped'

  const matching = items.filter(
    (item) => (!packedOnly || wasPacked(item)) && passesFacets(item) && matchesSearch(item),
  )

  // Offered for reveal only what revealing would actually show: rows already
  // excluded by a facet, the search or the done rule stay out of the count, or
  // the bar promises rows that one tap does not produce.
  const others = matching.filter((item) => othersJob(item) && (showDone || !done(item)))
  const hiddenOtherCount = showOthers ? 0 : others.length
  const hiddenOtherNames = showOthers
    ? []
    : [
        ...new Set(
          others
            .map((item) =>
              item.packer_user_id ? nameByUserId.get(item.packer_user_id) : undefined,
            )
            .filter((name): name is string => name !== undefined),
        ),
      ].sort((a, b) => a.localeCompare(b))

  const shown = showOthers ? matching : matching.filter((item) => !othersJob(item))

  let doneCount = 0
  const visible: TripItem[] = []
  for (const item of shown) {
    if (done(item)) {
      doneCount += 1
      if (!showDone) continue
    }
    visible.push(item)
  }

  // Full-set tallies per group, so headers can count what the list no longer
  // shows. "Full set" means everything the filter lets through — a header
  // counting rows the facet excluded would describe a different list.
  const totals = new Map<string, { done: number; total: number }>()
  for (const item of shown) {
    const { key } = groupOf(item, groupBy, travelerById, containerById)
    const tally = totals.get(key) ?? { done: 0, total: 0 }
    tally.total += 1
    if (done(item)) tally.done += 1
    totals.set(key, tally)
  }

  // Cluster sizes are measured over *every* item, filtered or not: whether a
  // per-person item renders as a cluster or as a flat row must not flip because
  // one instance got packed, or because a facet hid a sibling. Shape is a
  // property of the item, not of the current view.
  const clusterSizes = new Map<string, number>()
  if (groupBy !== 'person') {
    for (const item of items) {
      const key = perPersonKey(item)
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
    return { kind: 'item', item, traveler, done: done(item), label }
  }

  for (const item of visible) {
    const { key: groupKey, name } = groupOf(item, groupBy, travelerById, containerById)
    let group = groups.get(groupKey)
    if (!group) {
      const tally = totals.get(groupKey) ?? { done: 0, total: 0 }
      group = {
        key: groupKey,
        name,
        doneCount: tally.done,
        totalCount: tally.total,
        openCount: tally.total - tally.done,
        collapsed: folded.has(groupKey),
        entries: [],
      }
      groups.set(groupKey, group)
    }

    const clusterKey = perPersonKey(item)
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
        sourceItemId: item.source_item_id ?? null,
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
  for (const item of shown) {
    const clusterKey = perPersonKey(item)
    if (clusterKey === null || (clusterSizes.get(clusterKey) ?? 0) <= 1) continue
    const { key: groupKey } = groupOf(item, groupBy, travelerById, containerById)
    const cluster = clusters.get(`${groupKey}::${clusterKey}`)
    if (!cluster) continue
    cluster.totalCount += 1
    if (done(item)) cluster.doneCount += 1
  }

  for (const cluster of clusters.values()) {
    cluster.children.sort(
      (a, b) =>
        (travelerOrder.get(a.traveler?.id ?? '') ?? Number.MAX_SAFE_INTEGER) -
        (travelerOrder.get(b.traveler?.id ?? '') ?? Number.MAX_SAFE_INTEGER),
    )
  }

  const activeFacetCount = FACET_KEYS.reduce((n, key) => n + facets[key].length, 0)

  return {
    groups: [...groups.values()].sort(byGroupName),
    doneCount,
    hiddenOtherCount,
    hiddenOtherNames,
    facetValues: buildFacetValues({
      items,
      facets,
      passesFacets,
      done,
      hasOpenPrep: (item) => openPrep.has(item.id),
      travelerById,
      containerById,
    }),
    activeFacetCount,
    matchCount: items.filter((item) => passesFacets(item) && !done(item)).length,
    narrowed: activeFacetCount > 0 || term !== '' || hiddenOtherCount > 0,
  }
}

/**
 * FR-25.11d — what each facet may offer, and what picking it would yield.
 *
 * Counts run over **open** rows only (offering to filter for finished work
 * misleads) and against the *other* active facets but not the value's own, so
 * the numbers say what picking it would do rather than what is on screen. A
 * selected value is listed even at zero: a filter that cannot be undone from
 * inside the panel is a trap. The search term deliberately does not enter here
 * — it is a momentary lookup, not part of the filter the panel edits.
 */
function buildFacetValues(ctx: {
  items: TripItem[]
  facets: Facets
  passesFacets: (item: TripItem, skip?: FacetKey) => boolean
  done: (item: TripItem) => boolean
  hasOpenPrep: (item: TripItem) => boolean
  travelerById: Map<string, Traveler>
  containerById: Map<string, Container>
}): Record<FacetKey, FacetValue[]> {
  const { items, facets, passesFacets, done, hasOpenPrep, travelerById, containerById } = ctx
  const open = items.filter((item) => !done(item))

  const result = {} as Record<FacetKey, FacetValue[]>
  for (const key of FACET_KEYS) {
    const counts = new Map<string, number>()
    for (const item of open) {
      if (!passesFacets(item, key)) continue
      for (const value of valuesOf(item, key, hasOpenPrep(item))) {
        counts.set(value, (counts.get(value) ?? 0) + 1)
      }
    }
    for (const value of facets[key]) if (!counts.has(value)) counts.set(value, 0)

    const values: FacetValue[] = [...counts.entries()].map(([value, count]) => ({
      value,
      label: labelFor(key, value, travelerById, containerById),
      count,
      selected: facets[key].includes(value),
    }))
    result[key] = sortFacetValues(key, values)
  }
  return result
}

function labelFor(
  key: FacetKey,
  value: string,
  travelerById: Map<string, Traveler>,
  containerById: Map<string, Container>,
): string | null {
  if (value === NO_VALUE) return null
  switch (key) {
    case 'person':
      return travelerById.get(value)?.name ?? null
    case 'container':
      return containerById.get(value)?.name ?? null
    case 'category':
      return value
    default:
      // Modes and flags are UI copy — the caller words them through t().
      return null
  }
}

/**
 * The absence bucket leads its facet (FR-25.11f/g): "Gemeinsam" and "kein
 * Gepäck" are the absence of a value, not one more name among the people.
 * Modes and flags keep their declared order, everything else sorts by label.
 */
function sortFacetValues(key: FacetKey, values: FacetValue[]): FacetValue[] {
  if (key === 'mode') return orderBy(values, MODE_VALUES)
  if (key === 'flag') return orderBy(values, FLAG_VALUES)
  return [...values].sort((a, b) => {
    if (a.value === NO_VALUE) return b.value === NO_VALUE ? 0 : -1
    if (b.value === NO_VALUE) return 1
    return (a.label ?? a.value).localeCompare(b.label ?? b.value)
  })
}

function orderBy(values: FacetValue[], order: readonly string[]): FacetValue[] {
  return [...values].sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value))
}
