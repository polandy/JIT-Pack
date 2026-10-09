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
 * that distinction is the easiest way to make the screen lie. What the
 * fractions count is units, never rows (FR-25.22).
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

import {
  buildFacetValues,
  FACET_KEYS,
  packStatusOf,
  valuesOf,
  type FacetValue,
} from './packingFacets'
import { isFullyPacked, unitsOf } from './packState'

/**
 * The row the packing view reads — its port (FR-25, FR-31.6). A trip item is
 * one, and so is an excursion's line, as it is: both have a name, a count, a
 * state, a mode and a person it is for. The suitcase's own facts — the
 * luggage it is in, the departure-day and missing flags, the unused verdict,
 * who is to pack it and who did — are optional, and a list whose rows have
 * none of them leaves them out: absent reads as none.
 */
export type PackableRow = Pick<
  TripItem,
  | 'id'
  | 'name'
  | 'source_item_id'
  | 'category_name'
  | 'assigned_traveler_id'
  | 'quantity'
  | 'packed_count'
  | 'state'
  | 'mode'
> &
  Partial<
    Pick<
      TripItem,
      | 'container_id'
      | 'late_packer'
      | 'flag_missing'
      | 'flag_unused'
      | 'packer_user_id'
      | 'packed_by_user_id'
    >
  >

/** A single packable row — either a plain item or one traveler's instance of a per-person item. */
export interface PackingRow<R extends PackableRow = PackableRow> {
  kind: 'item'
  item: R
  /** "For whom" — set only for per-person instances; renders on the left (FR-25.3). */
  traveler: Traveler | null
  done: boolean
  /** Display name: the item name, or "Item · Person" for a lone per-person instance. */
  label: string
}

/** One instance's face on a shut cluster head (FR-25.23). */
export interface ClusterFace {
  /** `null` for an instance with no traveler on it. */
  traveler: Traveler | null
  /** Whether that instance is fully dealt with — the ring the head paints. */
  done: boolean
}

/** Several instances of one per-person item, named once (FR-25.1). */
export interface PackingCluster<R extends PackableRow = PackableRow> {
  kind: 'cluster'
  key: string
  name: string
  /** Units over every instance, including the hidden done ones (FR-25.22). */
  doneCount: number
  totalCount: number
  /** The units a shut head has to answer with, mirroring FR-25.16's group head. */
  openCount: number
  /**
   * FR-25.23: shut unless the caller expanded it. The default is the opposite
   * of a group's because a cluster head is an *extra* line over its children
   * rather than a heading over a block — always open, it costs more lines than
   * naming the item once saves.
   */
  collapsed: boolean
  /**
   * One face per instance over the same full set `doneCount`/`totalCount`
   * counts, in roster order — so a shut head answers "who, and how far"
   * without its children, including for instances FR-25.2 has hidden.
   */
  faces: ClusterFace[]
  /** Visible instances only. */
  children: PackingRow<R>[]
  /**
   * Every instance the head answers for, in the same roster order as
   * {@link faces} — including the ones FR-25.2 has hidden as done, and
   * excluding the ones a facet or the search has filtered out.
   *
   * It is the set FR-25.26's „für alle" writes, and it is deliberately the
   * same set the head *counts*: a head that says „4 offen" and writes three,
   * or writes a fifth instance the filter is hiding, is lying in one of the
   * two directions.
   */
  instanceIds: string[]
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

export type PackingEntry<R extends PackableRow = PackableRow> = PackingRow<R> | PackingCluster<R>

export interface PackingGroup<R extends PackableRow = PackableRow> {
  key: string
  /** `null` = the unassigned bucket; the caller supplies the wording. */
  name: string | null
  /** Units over the full set, so the header stays honest while done rows are hidden. */
  doneCount: number
  totalCount: number
  /** The units a folded header has to answer with in place of done/total (FR-25.16). */
  openCount: number
  /** Folded shut by the user; the entries are still built so unfolding is free. */
  collapsed: boolean
  entries: PackingEntry<R>[]
}

export interface PackingView<R extends PackableRow = PackableRow> {
  groups: PackingGroup<R>[]
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
  /**
   * FR-25.27's reveal bar and its switch, which label the same set and so
   * carry one number (FR-25.22): flagged rows among the ones the filter lets
   * through, whether they are currently hidden or shown — it does not drop
   * to zero on reveal, because a number that changed with the direction of
   * the toggle would describe two different sets.
   *
   * Rows another rule is already hiding are left out: revealing these would
   * not produce them, so this must not promise them.
   */
  lateCount: number
  /** Who those rows belong to, so the bar can name them rather than just count. */
  hiddenOtherNames: string[]
  facetValues: Record<FacetKey, FacetValue[]>
  /** The filter badge (FR-25.11a): how many facet values are in force. */
  activeFacetCount: number
  /** The sheet's footer promise ("14 Sachen anzeigen") — open rows passing the facets. */
  matchCount: number
  /**
   * Open **rows** over the trip's whole set, before search and facets. It
   * answers FR-25.11e's „N offene Sachen sind hinter dem Filter" by
   * subtraction against the rows on screen, so both sides of that
   * subtraction are rows: a left-hand side taken from the trip's packed
   * *units* gets a hidden count out of a list with nothing hidden in it
   * (FR-25.22).
   */
  openRowCount: number
  /**
   * Something is hiding rows that are not merely done (FR-25.11e). An empty
   * list may only read as "everything is packed" when this is false — a search,
   * a facet or FR-25.20's default each make completion a lie.
   */
  narrowed: boolean
}

export interface PackingViewInput<R extends PackableRow = PackableRow> {
  items: R[]
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
  /**
   * FR-25.27 reveal toggle, and the one that defaults to *shown*: a
   * late-packer row is not finished with, it is merely not due yet, so
   * hiding it is something the reader asks for rather than something the
   * screen does on its own.
   */
  showLate: boolean
  /** Group keys folded shut (FR-25.16) — by key, so a re-render keeps the fold. */
  collapsedGroups: string[]
  /**
   * FR-25.23: cluster keys the user opened. Named the other way round from
   * `collapsedGroups` because the defaults are opposite — a group is open
   * until folded, a cluster is folded until opened — and a set whose name
   * says "collapsed" while holding the exceptions to shut is a trap.
   */
  expandedClusters?: string[]
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
export function isDone(item: PackableRow, hasOpenPrep: boolean): boolean {
  if (item.state === 'skipped') return true
  return isFullyPacked(item) && !hasOpenPrep
}

/**
 * An entry that asks nothing further of anyone, and so sinks to the end of
 * its group (FR-25.2).
 *
 * A cluster settles only when every *visible* instance is done: the head
 * names one item and cannot be in two places, so one open instance keeps the
 * whole cluster up with the open rows. The children themselves keep their
 * traveler order — inside a cluster the people are the axis, and sorting
 * them by progress would move a person's row out from under their own hand.
 */
function entrySettled(entry: PackingEntry): boolean {
  if (entry.kind === 'item') return entry.done
  return entry.children.length > 0 && entry.children.every((child) => child.done)
}

/**
 * An entry that is packed on departure day, and so sinks below the rows that
 * can be dealt with now (FR-25.27).
 *
 * A cluster counts as late as soon as one visible instance is flagged — the
 * same rule its ⏰ follows, because a warning that holds for only some
 * children is one the reader misses.
 */
function entryLate(entry: PackingEntry): boolean {
  return entry.kind === 'item' ? entry.item.late_packer === true : entry.latePacker
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
  item: Pick<PackableRow, 'packer_user_id' | 'packed_by_user_id'>,
): { variant: 'assignee' | 'packer'; id: string } | null {
  if (item.packed_by_user_id) return { variant: 'packer', id: item.packed_by_user_id }
  if (item.packer_user_id) return { variant: 'assignee', id: item.packer_user_id }
  return null
}

/** What M4 knows about an element the list is about to drop (FR-25.28). */
export interface LeavingEntry {
  /** The item it stood for — `membershipKey`, the name that survives a reshape. */
  key: string
  /** The one row it drew; `null` for a cluster or a strip, which draw an item. */
  rowId: string | null
}

/**
 * isReshaped says whether a leaving element is an item **changing shape**
 * rather than an item going away — and therefore leaves at once instead of
 * collapsing (FR-25.2's pack-out).
 *
 * Lighting a second traveler turns a row into a cluster under a new list key,
 * and unlighting one turns it back: to the list, one entry departs and another
 * arrives. Animated, the old shape would stand beside its own replacement for
 * the length of the collapse — the item named twice, and its strip drawn twice.
 * It does not matter where the change was made: M5's strip reshapes the list
 * under the sheet exactly as M4's own does.
 *
 * An item is reshaped when it is **still shown** under another entry and this
 * element's row did not merely go out of sight. A row that still exists and is
 * no longer shown was hidden — packed, filtered, somebody else's — and keeps
 * its collapse even while a sibling instance of the same item stays on screen,
 * which is what grouping by traveler produces.
 */
export function isReshaped(
  leaving: LeavingEntry,
  shown: { keys: ReadonlySet<string>; rowIds: ReadonlySet<string> },
  existingRowIds: ReadonlySet<string>,
): boolean {
  if (!shown.keys.has(leaving.key)) return false
  if (leaving.rowId === null) return true
  return !existingRowIds.has(leaving.rowId) || shown.rowIds.has(leaving.rowId)
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
export function perPersonKey(item: PackableRow): string | null {
  if (!item.assigned_traveler_id) return null
  return item.source_item_id ? `src:${item.source_item_id}` : `name:${item.name.toLowerCase()}`
}

function groupOf(
  item: PackableRow,
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
 * The view in four phases, each over what the one before it settled: the
 * {@link viewRules} every phase asks, the {@link narrow} that decides which
 * rows are shown, the {@link tally} that counts the full set behind every
 * head, and the {@link grouping} that lays out what is left to see.
 */
export function buildPackingView<R extends PackableRow>(
  input: PackingViewInput<R>,
): PackingView<R> {
  const rules = viewRules(input)
  const narrowed = narrow(input, rules)
  const tallies = tally(input, rules, narrowed.shown)
  const groups = grouping(input, rules, narrowed.visible, tallies)
  const { items, facets, showLate } = input

  const activeFacetCount = FACET_KEYS.reduce((n, key) => n + facets[key].length, 0)

  return {
    groups,
    doneCount: narrowed.doneCount,
    hiddenOtherCount: narrowed.hiddenOtherCount,
    lateCount: narrowed.lateCount,
    hiddenOtherNames: narrowed.hiddenOtherNames,
    facetValues: buildFacetValues({
      items,
      facets,
      passesFacets: rules.passesFacets,
      done: rules.done,
      hasOpenPrep: (item) => rules.openPrep.has(item.id),
      travelerById: rules.travelerById,
      containerById: rules.containerById,
    }),
    activeFacetCount,
    matchCount: items.filter((item) => rules.passesFacets(item) && !rules.done(item)).length,
    openRowCount: items.filter((item) => !rules.done(item)).length,
    narrowed:
      activeFacetCount > 0 ||
      rules.searching ||
      narrowed.hiddenOtherCount > 0 ||
      (!showLate && narrowed.lateCount > 0),
  }
}

/** The lookups and per-row questions every phase of the view asks. */
interface ViewRules {
  travelerById: Map<string, Traveler>
  containerById: Map<string, Container>
  travelerOf(row: PackableRow): Traveler | null
  openPrep: ReadonlySet<string>
  done(row: PackableRow): boolean
  /** FR-25.11c: OR within a facet, AND across them. `skip` leaves one axis out (FR-25.11d). */
  passesFacets(row: PackableRow, skip?: FacetKey): boolean
  /** FR-25.30: the Person facet alone, which is the one facet that shapes clusters. */
  inPersonScope(row: PackableRow): boolean
  filteredToOnly(traveler: Traveler): boolean
  matchesSearch(row: PackableRow): boolean
  /**
   * FR-25.32: a term is a request to *find* a row, and the three reveal
   * switches put rows away for a reader who is not looking for one — so an
   * active search lifts all three for the rows it matches, the way picking a
   * Status value lifts the Erledigte one (FR-25.11l). Facets are not lifted:
   * they were chosen, the switches were defaults.
   */
  searching: boolean
  /**
   * FR-25.20: assigned, and not to me. An unassigned row is nobody's and
   * therefore everybody's, so it never hides — and where there is no current
   * user (Single-User, Local) nothing is assignable, so nothing hides either.
   * Read from the *assignment*, never from the packing record (FR-25.19).
   */
  othersJob(row: PackableRow): boolean
  /**
   * FR-25.11l: picking a Status value is asking to *see* that bucket, so it
   * overrides the Erledigte switch for exactly the rows it names — selecting
   * "gepackt" with Erledigte off would otherwise match every packed row in
   * `passesFacets` and then hide every one of them again as done, showing
   * nothing for a filter that reports a nonzero count.
   */
  revealedByStatus(row: PackableRow): boolean
  /**
   * FR-25.27: hidden because it is not due yet. Picking ⏰ in *Merkmale* is
   * the same ask as picking a Status value — show me exactly those rows —
   * so it overrides the switch, or the panel reports a count it then shows
   * nothing for (the FR-25.11l trap on a second axis).
   */
  hiddenAsLate(row: PackableRow): boolean
  /** FR-25.20's half of the same question, so the two reveal bars can ask it of each other. */
  hiddenAsOthers(row: PackableRow): boolean
  groupOf(row: PackableRow): { key: string; name: string | null }
  /** Roster order, for the two lists a cluster keeps of the same people. */
  byTravelerOrder(a: { traveler: Traveler | null }, b: { traveler: Traveler | null }): number
}

function viewRules(input: PackingViewInput<PackableRow>): ViewRules {
  const {
    travelers,
    containers,
    groupBy,
    facets,
    search,
    currentUserId,
    showOthers,
    showLate,
    itemsWithOpenPrep,
  } = input

  const travelerById = new Map(travelers.map((t) => [t.id, t]))
  const containerById = new Map(containers.map((c) => [c.id, c]))
  const travelerOrder = new Map(travelers.map((t, i) => [t.id, i]))
  const openPrep = new Set(itemsWithOpenPrep)
  const term = search.trim().toLowerCase()
  const searching = term !== ''

  const othersJob = (row: PackableRow) => {
    const packer = row.packer_user_id ?? null
    return currentUserId !== null && packer !== null && packer !== currentUserId
  }

  return {
    travelerById,
    containerById,
    travelerOf: (row) =>
      row.assigned_traveler_id ? (travelerById.get(row.assigned_traveler_id) ?? null) : null,
    openPrep,
    done: (row) => isDone(row, openPrep.has(row.id)),
    passesFacets: (row, skip) =>
      FACET_KEYS.every((key) => {
        if (key === skip) return true
        const selected = facets[key]
        if (selected.length === 0) return true
        return valuesOf(row, key, openPrep.has(row.id)).some((v) => selected.includes(v))
      }),
    inPersonScope: (row) =>
      facets.person.length === 0 ||
      valuesOf(row, 'person', false).some((v) => facets.person.includes(v)),
    filteredToOnly: (traveler) => facets.person.length === 1 && facets.person[0] === traveler.id,
    matchesSearch: (row) => term === '' || row.name.toLowerCase().includes(term),
    searching,
    othersJob,
    revealedByStatus: (row) => facets.status.includes(packStatusOf(row)),
    hiddenAsLate: (row) =>
      !showLate && !searching && row.late_packer === true && !facets.flag.includes('late'),
    hiddenAsOthers: (row) => !showOthers && !searching && othersJob(row),
    groupOf: (row) => groupOf(row, groupBy, travelerById, containerById),
    byTravelerOrder: (a, b) =>
      (travelerOrder.get(a.traveler?.id ?? '') ?? Number.MAX_SAFE_INTEGER) -
      (travelerOrder.get(b.traveler?.id ?? '') ?? Number.MAX_SAFE_INTEGER),
  }
}

/** Which rows the filter lets through, which of them are shown, and what the reveal bars offer. */
interface Narrowed<R extends PackableRow> {
  /** Through the facets, the search and FR-9.3's packed-only — before any switch hides a row. */
  shown: R[]
  /** What the list renders: {@link shown} without the done rows the Erledigte switch puts away. */
  visible: R[]
  doneCount: number
  hiddenOtherCount: number
  hiddenOtherNames: string[]
  lateCount: number
}

function narrow<R extends PackableRow>(input: PackingViewInput<R>, rules: ViewRules): Narrowed<R> {
  const { items, participants, facets, showDone, showOthers, packedOnly = false } = input
  const { done, searching, othersJob, revealedByStatus, hiddenAsLate, hiddenAsOthers } = rules
  const nameByUserId = new Map(participants.map((p) => [p.user_id, p.display_name]))

  /** FR-9.3: taken along, in whole or in part — and not consciously left behind. */
  const wasPacked = (row: PackableRow) => row.packed_count > 0 && row.state !== 'skipped'

  const matching = items.filter(
    (row) => (!packedOnly || wasPacked(row)) && rules.passesFacets(row) && rules.matchesSearch(row),
  )

  // Offered for reveal only what revealing would actually show: rows already
  // excluded by a facet, the search or the done rule stay out of the count, or
  // the bar promises rows that one tap does not produce. The two bars exclude
  // each other's rows for that same reason — a row both rules hide stays hidden
  // whichever one is tapped, so neither may claim it.
  const revealable = (row: PackableRow) =>
    showDone || searching || !done(row) || revealedByStatus(row)
  const others = matching.filter((row) => othersJob(row) && !hiddenAsLate(row) && revealable(row))
  const hiddenOtherCount = showOthers || searching ? 0 : others.length
  // Independent of the switch, unlike `hiddenOtherCount`: this one labels a
  // set rather than reporting a state, so it is the same number either way.
  const lateCount = matching.filter(
    (row) =>
      row.late_packer === true &&
      !facets.flag.includes('late') &&
      !hiddenAsOthers(row) &&
      revealable(row),
  ).length
  const hiddenOtherNames =
    showOthers || searching
      ? []
      : [
          ...new Set(
            others
              .map((row) => (row.packer_user_id ? nameByUserId.get(row.packer_user_id) : undefined))
              .filter((name): name is string => name !== undefined),
          ),
        ].sort((a, b) => a.localeCompare(b))

  const shown = matching.filter((row) => !hiddenAsOthers(row) && !hiddenAsLate(row))

  let doneCount = 0
  const visible: R[] = []
  for (const row of shown) {
    if (done(row)) {
      doneCount += 1
      if (!showDone && !searching && !revealedByStatus(row)) continue
    }
    visible.push(row)
  }

  return { shown, visible, doneCount, hiddenOtherCount, hiddenOtherNames, lateCount }
}

/** What a head counts over the full set, done instances included. */
interface ClusterTally {
  units: { done: number; total: number }
  /** In roster order, like {@link instanceIds}. */
  faces: ClusterFace[]
  instanceIds: string[]
}

/** The full-set counts every head answers with, and which items render as clusters. */
interface Tallies {
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
function tally(
  input: PackingViewInput<PackableRow>,
  rules: ViewRules,
  shown: PackableRow[],
): Tallies {
  const { items, groupBy } = input

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
    const units = unitsOf(row)
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

/** The groups, their clusters and rows, over the visible rows and the full-set tallies. */
function grouping<R extends PackableRow>(
  input: PackingViewInput<R>,
  rules: ViewRules,
  visible: R[],
  tallies: Tallies,
): PackingGroup<R>[] {
  const { groupBy, collapsedGroups, expandedClusters = [], packedOnly = false } = input
  const folded = new Set(collapsedGroups)
  const opened = new Set(expandedClusters)

  const groups = new Map<string, PackingGroup<R>>()
  const clusters = new Map<string, PackingCluster<R>>()

  function rowFor(item: R, standalone: boolean): PackingRow<R> {
    const traveler = rules.travelerOf(item)
    // A lone per-person instance says who it is for inline, since no cluster
    // header carries that context. Grouped by traveler the header already does,
    // and filtered to that traveler alone the chip row does (FR-25.30).
    const label =
      standalone && traveler && groupBy !== 'person' && !rules.filteredToOnly(traveler)
        ? `${item.name} · ${traveler.name}`
        : item.name
    return { kind: 'item', item, traveler, done: rules.done(item), label }
  }

  for (const item of visible) {
    const { key: groupKey, name } = rules.groupOf(item)
    let group = groups.get(groupKey)
    if (!group) {
      const units = tallies.groups.get(groupKey) ?? { done: 0, total: 0 }
      group = {
        key: groupKey,
        name,
        doneCount: units.done,
        totalCount: units.total,
        openCount: units.total - units.done,
        collapsed: folded.has(groupKey),
        entries: [],
      }
      groups.set(groupKey, group)
    }

    const clusterKey = tallies.clusterKeyOf(item)
    if (clusterKey === null) {
      group.entries.push(rowFor(item, true))
      continue
    }

    const scopedKey = `${groupKey}::${clusterKey}`
    let cluster = clusters.get(scopedKey)
    if (!cluster) {
      const counted = tallies.clusters.get(scopedKey)
      const units = counted?.units ?? { done: 0, total: 0 }
      cluster = {
        kind: 'cluster',
        key: scopedKey,
        name: item.name,
        doneCount: units.done,
        totalCount: units.total,
        openCount: units.total - units.done,
        collapsed: !opened.has(scopedKey),
        faces: counted?.faces ?? [],
        instanceIds: counted?.instanceIds ?? [],
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
    cluster.latePacker = cluster.latePacker || item.late_packer === true
  }

  for (const cluster of clusters.values()) cluster.children.sort(rules.byTravelerOrder)

  /*
   * FR-9.3's closing pass is exempt, and its own test is what said so: there
   * every visible row was packed, so "done" separates fully packed from
   * partly packed — an axis nobody is working through. Sinking would sort a
   * review list by something the reviewer did not ask about.
   */
  if (!packedOnly) {
    for (const group of groups.values()) {
      // Partitioned rather than sorted: three passes are obviously stable,
      // where a comparator's stability is a property of the engine rather
      // than of the rule being stated. Three tiers, in the order the day
      // runs: what is still to do, what is packed on the way out the door
      // (FR-25.27), and what asks nothing of anyone.
      const open = group.entries.filter((entry) => !entrySettled(entry))
      group.entries = [
        ...open.filter((entry) => !entryLate(entry)),
        ...open.filter(entryLate),
        ...group.entries.filter(entrySettled),
      ]
    }
  }

  return [...groups.values()].sort(byGroupName)
}
