/**
 * FR-25.13f — what the inventory browse-sheet may offer on a row the scope
 * already carries.
 *
 * The sheet lists **master items**; a trip carries **trip rows**, and since
 * FR-25.21 one master item can be several of them — one per person. A verb
 * tapped on such a line therefore acts on the whole set, and whether it may
 * be offered at all is a property of the set, not of any one row. That
 * summary is this function, and it is the sheet's only source for it.
 *
 * Since FR-25.13g the summary also answers *how much of the roster this item
 * already reaches*, because the one-tap „für alle" may only be offered where
 * somebody is still missing — the same set-shaped question, asked of people
 * instead of states.
 *
 * Rows without a `source_item_id` are deliberately absent: they were typed
 * by hand and the sheet cannot match them to an inventory line. Matching
 * them by name is FR-27.10's rule for whole groups, and a second, quieter
 * copy of it here is exactly the drift FR-25.11g warns about.
 */
import { STATE_PACKED, STATE_SKIPPED, type Traveler } from '@/types/domain'

import { MIN_TRAVELERS_FOR_PER_PERSON } from './membership'
import type { PackableRow } from './packingView'

/** The state the sheet renders for a master item the scope already carries. */
export type BrowseRowState = 'open' | 'packed' | 'skipped' | 'locked'

/** One master item's whole presence on the trip. */
export interface BrowseRowSummary {
  state: BrowseRowState
  /** Every trip row generated from this master item, in the given order. */
  itemIds: string[]
  /**
   * FR-25.13g: how many of the trip's travelers already have a row of their
   * own for this item. Counted against the roster the caller passes, so a row
   * left behind by a traveler who has since left the trip is not somebody the
   * sheet can offer to reach.
   */
  travelersReached: number
  /** G-3's sentence naming the holder — non-null exactly when `locked`. */
  lockNote: string | null
}

/**
 * Summarise the trip's rows per master item.
 *
 * The state rules, in the order they are asked:
 *
 * 1. **Any row locked → `locked`**, carrying G-3's sentence about who holds
 *    it. A set somebody else is packing is not mine to act on; taking it
 *    over is FR-5.7's confirmed step and deliberately not a one-tap verb.
 *    The caller decides what "locked" means by returning a note or null —
 *    one callback rather than a predicate beside a formatter, so the state
 *    and the sentence explaining it can never disagree.
 * 2. **Every row packed → `packed`**, every row skipped → `skipped`. Both
 *    are settled: the sheet states them and offers nothing.
 * 3. **Anything else → `open`**, including a half-packed per-person set —
 *    there is something left to decide, so the verbs stay on offer and act
 *    on the rows that are not in that state yet.
 */
export function browseRowStates<R extends PackableRow>(
  items: readonly R[],
  lockNoteOf: (item: R) => string | null,
  travelers: readonly Traveler[],
): Map<string, BrowseRowSummary> {
  const rows = new Map<string, R[]>()
  for (const item of items) {
    if (item.source_item_id === null) continue
    const group = rows.get(item.source_item_id)
    if (group) group.push(item)
    else rows.set(item.source_item_id, [item])
  }

  const roster = new Set(travelers.map((traveler) => traveler.id))
  const summaries = new Map<string, BrowseRowSummary>()
  for (const [sourceItemId, group] of rows) {
    const lockNote = group.map(lockNoteOf).find((note) => note !== null) ?? null
    summaries.set(sourceItemId, {
      state: lockNote !== null ? 'locked' : settledState(group),
      itemIds: group.map((item) => item.id),
      travelersReached: travelersReached(group, roster),
      lockNote,
    })
  }
  return summaries
}

/** The travelers of the roster this item already has a row for, counted once each. */
function travelersReached(group: readonly PackableRow[], roster: ReadonlySet<string>): number {
  const reached = new Set<string>()
  for (const item of group) {
    if (item.assigned_traveler_id !== null && roster.has(item.assigned_traveler_id)) {
      reached.add(item.assigned_traveler_id)
    }
  }
  return reached.size
}

function settledState(group: readonly PackableRow[]): BrowseRowState {
  if (group.every((item) => item.state === 'packed')) return 'packed'
  if (group.every((item) => item.state === 'skipped')) return 'skipped'
  return 'open'
}

/**
 * What a list tells the browse-sheet about itself: what it carries, how that
 * stands, and who travels. One object, because the three answer one question
 * together — which verbs a line may offer.
 */
export interface BrowseScope {
  /** Master item ids the scope already carries — rendered as "already in". */
  carriedItemIds: readonly string[]
  /**
   * FR-25.13f: what the scope carries, per master item, as {@link browseRowStates}
   * summarises it. `null` is a scope with no packing states (M8's template),
   * and that is what keeps the decision verbs off its lines (G-8).
   */
  rowStates: ReadonlyMap<string, BrowseRowSummary> | null
  /**
   * FR-25.13g/h: the roster, trip order — who a „für alle" reaches and what the
   * avatar buttons are built from. Below {@link MIN_TRAVELERS_FOR_PER_PERSON}
   * there is no membership to distribute and the verbs are absent.
   */
  travelers: readonly Traveler[]
}

/** A scope with nothing but what it carries: no packing states, nobody to distribute to. */
export function plainBrowseScope(carriedItemIds: readonly string[] = []): BrowseScope {
  return { carriedItemIds, rowStates: null, travelers: [] }
}

/** Which verbs the sheet offers in a scope — derived, so it cannot disagree with it. */
export interface BrowseOffer {
  /** FR-25.13f/i: ✓, ✕ and the settled line's reset. */
  decide: boolean
  /** FR-25.13g/h: „für alle" and the per-traveler picks. */
  forAll: boolean
}

export function browseOffer(scope: BrowseScope): BrowseOffer {
  return {
    decide: scope.rowStates !== null,
    forAll: scope.travelers.length >= MIN_TRAVELERS_FOR_PER_PERSON,
  }
}

/** The decision a sheet add is made with (FR-25.13f) — absent is "add it, open". */
export type BrowseDecision = typeof STATE_PACKED | typeof STATE_SKIPPED

/**
 * One verb tapped in the sheet, as it leaves it. `I` is the item as the
 * receiver knows it: the sheet sends master items, the composer relays the
 * fields an add takes ({@link BrowseAddition}). The verbs on a carried line
 * name the master item by id, because they act on the rows the list has.
 */
export type BrowseAction<I> =
  | { verb: 'add'; item: I; decided?: BrowseDecision }
  /** FR-25.13g: add it with a row for every traveler. */
  | { verb: 'addForAll'; item: I }
  /** FR-25.13h: add or update it with exactly this set of travelers assigned. */
  | { verb: 'assign'; item: I; travelerIds: string[] }
  /**
   * `spread` gives the travelers without a row one (FR-25.13g, ADR-036);
   * `packCarried` and `skipCarried` decide every row (FR-25.13f); `undo` takes back this
   * run's last verb; `reopen` puts every row back to open, whoever decided it
   * (FR-25.13i).
   */
  | { verb: 'spread' | 'packCarried' | 'skipCarried' | 'undo' | 'reopen'; itemId: string }

/** The fields an add carries over, whichever verb sent it (FR-25.7 defaults). */
export interface BrowseAddition {
  name: string
  /** Always an inventory item (FR-24.11). */
  sourceItemId: string
  weightGrams: number | null
  valueCents: number | null
  categoryName: string | null
}

/** What one tap in this run of the sheet did to a line — FR-25.13f's local ledger. */
export type BrowseRunVerb = 'added' | 'forAll' | 'assigned' | 'packed' | 'skipped'

/** A verb, and how many trip rows it reached (FR-25.21's per-person set). */
export interface BrowseRunRecord {
  verb: BrowseRunVerb
  rows: number
  /** FR-25.13h: who an `assigned` record went to — the other verbs leave it unset. */
  travelerName?: string
}

/**
 * What one line renders. The kinds are exclusive; {@link browseRowView} asks
 * them in order.
 */
export type BrowseRowView =
  | { kind: 'acted'; act: BrowseRunRecord; done: boolean; undoable: boolean }
  | { kind: 'assigning'; act: BrowseRunRecord; selected: ReadonlySet<string> }
  | { kind: 'locked'; lockNote: string }
  | { kind: 'settled'; state: BrowseDecision; reopen: boolean }
  | { kind: 'carried'; spread: boolean }
  | { kind: 'free' }

/** Everything a line's view is read from: the scope, and the sheet's own run. */
export interface BrowseRunState {
  scope: BrowseScope
  offer: BrowseOffer
  /** {@link BrowseScope.carriedItemIds} as a set. */
  carried: ReadonlySet<string>
  /** This run's ledger, keyed by master item. */
  acted: ReadonlyMap<string, BrowseRunRecord>
  /** FR-25.13h: who a line's avatar buttons have on, keyed by master item. */
  assigned: ReadonlyMap<string, ReadonlySet<string>>
  /**
   * FR-25.13e: what the scope carried when the hide switch went on — `null`
   * while the switch is off.
   */
  hiddenAtSwitch: ReadonlySet<string> | null
}

/**
 * The line for one master item. The rules, in the order they are asked:
 *
 * 1. **What this run did wins** — the ledger, or FR-25.13e's own signal: while
 *    the switch is on, a carried line the snapshot does not hold was added
 *    since, wherever from. The ledger speaks only where the decision verbs do:
 *    without them M8 has one add and no way back, so its tapped line keeps
 *    saying *„schon drin"* exactly as FR-25.13d wrote it. An `assigned` record
 *    stays open for more taps (FR-25.13h's multi-select) and is its own kind.
 *    Only what this sheet did can be taken back by it: a line the scope
 *    reports as newly carried may have been added from anywhere.
 * 2. **G-3's lock**, with the sentence naming the holder.
 * 3. **A settled state** — packed or skipped — carrying FR-25.13i's reset
 *    wherever the scope reports states at all.
 * 4. **Carried**, offering the spread only while somebody is still missing —
 *    a verb that would do nothing is furniture (FR-25.13g).
 * 5. **Free.**
 */
export function browseRowView(itemId: string, run: BrowseRunState): BrowseRowView {
  const act =
    (run.offer.decide ? run.acted.get(itemId) : undefined) ?? addedSinceSwitch(itemId, run)
  if (act) {
    if (act.verb === 'assigned') {
      return { kind: 'assigning', act, selected: run.assigned.get(itemId) ?? new Set() }
    }
    return { kind: 'acted', act, done: act.verb !== 'skipped', undoable: run.acted.has(itemId) }
  }
  const summary = run.scope.rowStates?.get(itemId)
  if (summary?.state === 'locked' && summary.lockNote !== null) {
    return { kind: 'locked', lockNote: summary.lockNote }
  }
  if (summary?.state === STATE_PACKED || summary?.state === STATE_SKIPPED) {
    return { kind: 'settled', state: summary.state, reopen: run.offer.decide }
  }
  if (run.carried.has(itemId)) {
    return {
      kind: 'carried',
      spread: run.offer.forAll && (summary?.travelersReached ?? 0) < run.scope.travelers.length,
    }
  }
  return { kind: 'free' }
}

function addedSinceSwitch(itemId: string, run: BrowseRunState): BrowseRunRecord | undefined {
  const added =
    run.hiddenAtSwitch !== null && run.carried.has(itemId) && !run.hiddenAtSwitch.has(itemId)
  return added ? { verb: 'added', rows: 1 } : undefined
}
