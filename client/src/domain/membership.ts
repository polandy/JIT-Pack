/**
 * FR-25.21 — who needs an item, and how many each. Pure, no I/O.
 *
 * A per-person item is N ordinary `trip_items` rows, one per traveler, each
 * with its own quantity (FR-25.1). This module is the only place that turns
 * a *picked* membership into the rows expressing it, and ADR-036 is the shape
 * it implements: rows are rewritten in place rather than deleted and recreated,
 * because comments (FR-7.1), preparation todos (FR-7.3) and packing progress
 * are the expensive content on a row and membership is cheap metadata.
 *
 * Two rules carry the whole design:
 *
 * 1. **Something always survives.** Going per-person keeps the existing row and
 *    re-points it; coming back keeps the row that carries content. The caller
 *    never has to decide which row to save.
 * 2. **The rows it creates have derived ids**, not random ones — the same
 *    derivation FR-27.4's propagation uses. Two devices doing the same
 *    conversion offline converge on one row per traveler instead of two, and a
 *    later template refresh adopts the row rather than adding a second beside
 *    it (see `propagatedItemId`).
 *
 * The planner decides; it does not write. Its output is read by the sheet to
 * word a confirm and by the orchestrator to emit mutations, which is what keeps
 * "what would this destroy?" answerable before anything is destroyed.
 */

import { foldName } from './nameCollision'
import { propagatedItemId } from './refresh'
import type { Traveler, TripItem } from '@/types/domain'

/** The smallest amount a member can carry — 0 is FR-5.5's *skipped*, not absence. */
const MIN_QUANTITY = 1

/**
 * How many travelers a trip needs before per-person membership is offered at
 * all (FR-25.8, FR-25.13g). One traveler has no membership to distribute: the
 * composer's mode and the browse-sheet's „für alle" are both **absent** there
 * rather than disabled (G-8), and this is the one place that number is decided.
 */
export const MIN_TRAVELERS_FOR_PER_PERSON = 2

/** What the editor asks for: one shared row, or a row per named traveler. */
export type MembershipTarget =
  { kind: 'shared' } | { kind: 'perPerson'; members: MembershipMember[] }

export interface MembershipMember {
  traveler_id: string
  quantity: number
}

export interface MembershipInput {
  tripId: string
  /** Every row of this item today — the FR-25.1 cluster, or the one shared row. */
  rows: TripItem[]
  /** The trip's roster, in trip order: it decides both ladders below. */
  travelers: Traveler[]
  /**
   * Rows carrying comments or preparation todos. Passed in rather than read,
   * because those live in other stores and this module has no I/O.
   */
  rowsWithContent: string[]
  target: MembershipTarget
}

/** A row the plan will create. The id is derived, never drawn (ADR-036). */
export interface MembershipInsert {
  id: string
  traveler_id: string
  quantity: number
  /** The row its fields are copied from — mode, container, category and the rest. */
  from: TripItem
}

export interface MembershipUpdate {
  id: string
  /** Only the fields that actually differ; an empty object never occurs. */
  fields: Partial<Pick<TripItem, 'assigned_traveler_id' | 'quantity' | 'packed_count' | 'state'>>
}

/** A row the plan will delete that is *not* replaceable — what a confirm must name. */
export interface MembershipLoss {
  rowId: string
  travelerName: string
  packedCount: number
  quantity: number
  hasContent: boolean
}

export interface MembershipPlan {
  update: MembershipUpdate[]
  insert: MembershipInsert[]
  delete: string[]
  /**
   * The subset of `delete` that would destroy something — packing progress or
   * a comment thread. Empty means the removal is safe to do silently.
   */
  destructive: MembershipLoss[]
  /** Which row survives a collapse, so the confirm can state the outcome. */
  survivor: { rowId: string; travelerName: string } | null
  /** What the collapsed row will read, for the same sentence. */
  totals: { quantity: number; packed: number } | null
  /**
   * Set when the rewrite takes a *skipped* row along again — the one decision a
   * conversion can silently undo, so the caller can ask before it does. Packing
   * progress needs no such report: it is a count, and it survives as one.
   */
  unskipped: { rowId: string; travelerName: string } | null
  /** True when the rows already express the target — nothing to write. */
  empty: boolean
}

/**
 * The key a derived row id is built on. A generated row is keyed by its master
 * item, so membership and FR-27.4 land on the same id for the same traveler; an
 * FR-5.6 ad-hoc row has no master item and is keyed by its folded name instead,
 * the same fallback `perPersonKey` uses to hold such rows in one cluster.
 */
function identityKey(row: TripItem): string {
  return row.source_item_id ?? `name:${foldName(row.name)}`
}

/**
 * membershipRows picks the rows that are *this* item — the FR-25.1 cluster the
 * editor acts on, including the row it was opened from. Keyed the same way
 * `perPersonKey` groups M4's children, so what the editor edits and what the
 * list draws as one item can never disagree.
 */
export function membershipRows(all: TripItem[], item: TripItem): TripItem[] {
  const key = identityKey(item)
  return all.filter((r) => identityKey(r) === key)
}

/** Trip order, by traveler id — the tie-break both ladders end on. */
function orderOf(travelers: Traveler[]): Map<string, number> {
  return new Map(travelers.map((t, i) => [t.id, i]))
}

/**
 * Which row survives a collapse to *gemeinsam*, and which traveler keeps the
 * existing row when an item goes per-person.
 *
 * The ladder is content, then packing progress, then trip order — deterministic
 * on purpose: membership must not depend on which instance the sheet happened
 * to be opened from.
 */
function survivorOf(
  rows: TripItem[],
  withContent: Set<string>,
  order: Map<string, number>,
): TripItem | undefined {
  return [...rows].sort((a, b) => {
    const contentDelta = Number(withContent.has(b.id)) - Number(withContent.has(a.id))
    if (contentDelta !== 0) return contentDelta
    if (b.packed_count !== a.packed_count) return b.packed_count - a.packed_count
    const ao = order.get(a.assigned_traveler_id ?? '') ?? Number.MAX_SAFE_INTEGER
    const bo = order.get(b.assigned_traveler_id ?? '') ?? Number.MAX_SAFE_INTEGER
    return ao - bo
  })[0]
}

/**
 * The state a row may keep once its numbers have been rewritten, or `undefined`
 * where it keeps the one it has.
 *
 * A conversion changes what a row holds and how much of it is packed, and two
 * of the states describe exactly those numbers: *skipped* is FR-5.5's quantity
 * of nothing, *packed* means the count has reached the amount. Left standing
 * over new numbers, either one makes `isDone` true of a row that is not, and
 * FR-25.2 then takes it off the list while it is unfinished. This is a
 * derivation and not a decision: the state falls back to *open* exactly when it
 * has stopped being true, and is left alone otherwise — an in-progress claim
 * (`packing_now`) describes a person, not a number, and is none of this
 * function's business.
 */
function stateAfter(
  row: TripItem,
  quantity: number,
  packedCount: number,
): TripItem['state'] | undefined {
  if (row.state === 'skipped' && quantity > 0) return 'open'
  if (row.state === 'packed' && packedCount < quantity) return 'open'
  return undefined
}

/** Fields that differ, so a no-op edit writes no mutation. */
function diff(row: TripItem, next: MembershipUpdate['fields']): MembershipUpdate['fields'] {
  const out: MembershipUpdate['fields'] = {}
  if (
    next.assigned_traveler_id !== undefined &&
    next.assigned_traveler_id !== row.assigned_traveler_id
  ) {
    out.assigned_traveler_id = next.assigned_traveler_id
  }
  if (next.quantity !== undefined && next.quantity !== row.quantity) out.quantity = next.quantity
  if (next.packed_count !== undefined && next.packed_count !== row.packed_count) {
    out.packed_count = next.packed_count
  }
  if (next.state !== undefined && next.state !== row.state) out.state = next.state
  return out
}

function lossesFor(
  removed: TripItem[],
  travelerName: (id: string | null) => string,
  withContent: Set<string>,
): MembershipLoss[] {
  return removed
    .filter((r) => r.packed_count > 0 || withContent.has(r.id))
    .map((r) => ({
      rowId: r.id,
      travelerName: travelerName(r.assigned_traveler_id),
      packedCount: r.packed_count,
      quantity: r.quantity,
      hasContent: withContent.has(r.id),
    }))
}

/**
 * planMembership turns the membership somebody picked into the rows expressing
 * it. It writes nothing and reads nothing — the caller emits the mutations.
 */
export function planMembership(input: MembershipInput): MembershipPlan {
  const { rows, travelers, target } = input
  const withContent = new Set(input.rowsWithContent)
  const order = orderOf(travelers)
  const nameOf = (id: string | null): string => travelers.find((t) => t.id === id)?.name ?? ''

  const empty: MembershipPlan = {
    update: [],
    insert: [],
    delete: [],
    destructive: [],
    survivor: null,
    totals: null,
    unskipped: null,
    empty: true,
  }
  // One row is the template every other row of this item is cut from — and
  // proving it exists here is what lets the two planners below take it as given.
  const template = rows[0]
  if (!template) return empty

  if (target.kind === 'shared') return planCollapse(rows, template, withContent, order, nameOf)

  // A traveler the trip does not have would be a dangling foreign key, and
  // invariant 3's reasoning applies to any id the client picks: drop it rather
  // than write it. Trip order, not picker order, so the ladder below is stable.
  const members = target.members
    .filter((m) => order.has(m.traveler_id))
    .map((m) => ({ ...m, quantity: Math.max(MIN_QUANTITY, Math.trunc(m.quantity)) }))
    .sort((a, b) => (order.get(a.traveler_id) ?? 0) - (order.get(b.traveler_id) ?? 0))

  if (members.length === 0) return empty

  return planPerPerson(rows, template, members, withContent, order, nameOf)
}

function planCollapse(
  rows: TripItem[],
  template: TripItem,
  withContent: Set<string>,
  order: Map<string, number>,
  nameOf: (id: string | null) => string,
): MembershipPlan {
  const quantity = rows.reduce((n, r) => n + r.quantity, 0)
  const packed = Math.min(
    rows.reduce((n, r) => n + r.packed_count, 0),
    quantity,
  )
  const keep = survivorOf(rows, withContent, order) ?? template
  const removed = rows.filter((r) => r.id !== keep.id)

  const fields = diff(keep, {
    assigned_traveler_id: null,
    quantity,
    packed_count: packed,
    state: stateAfter(keep, quantity, packed),
  })

  return {
    update: Object.keys(fields).length > 0 ? [{ id: keep.id, fields }] : [],
    insert: [],
    delete: removed.map((r) => r.id),
    destructive: lossesFor(removed, nameOf, withContent),
    survivor: { rowId: keep.id, travelerName: nameOf(keep.assigned_traveler_id) },
    totals: { quantity, packed },
    unskipped:
      fields.state === 'open' && keep.state === 'skipped'
        ? { rowId: keep.id, travelerName: nameOf(keep.assigned_traveler_id) }
        : null,
    empty: removed.length === 0 && Object.keys(fields).length === 0,
  }
}

function planPerPerson(
  rows: TripItem[],
  template: TripItem,
  members: MembershipMember[],
  withContent: Set<string>,
  order: Map<string, number>,
  nameOf: (id: string | null) => string,
): MembershipPlan {
  const byTraveler = new Map<string, TripItem>()
  const unassigned: TripItem[] = []
  for (const r of rows) {
    if (r.assigned_traveler_id) byTraveler.set(r.assigned_traveler_id, r)
    else unassigned.push(r)
  }

  const update: MembershipUpdate[] = []
  const insert: MembershipInsert[] = []
  let unskipped: MembershipPlan['unskipped'] = null
  // ADR-036's keep-and-repoint: the shared row becomes the first selected
  // traveler's, so its thread, todos and progress survive the conversion.
  let repointable: TripItem | null = survivorOf(unassigned, withContent, order) ?? null

  for (const m of members) {
    const existing = byTraveler.get(m.traveler_id)
    if (existing) {
      const fields = diff(existing, { quantity: m.quantity })
      if (Object.keys(fields).length > 0) update.push({ id: existing.id, fields })
      continue
    }
    if (repointable) {
      // The kept row's progress cannot exceed the amount it now carries.
      const packedCount = Math.min(repointable.packed_count, m.quantity)
      const fields = diff(repointable, {
        assigned_traveler_id: m.traveler_id,
        quantity: m.quantity,
        packed_count: packedCount,
        state: stateAfter(repointable, m.quantity, packedCount),
      })
      if (Object.keys(fields).length > 0) update.push({ id: repointable.id, fields })
      if (fields.state === 'open' && repointable.state === 'skipped') {
        unskipped = { rowId: repointable.id, travelerName: nameOf(m.traveler_id) }
      }
      repointable = null
      continue
    }
    insert.push({
      id: propagatedItemId(template.trip_id, identityKey(template), m.traveler_id),
      traveler_id: m.traveler_id,
      quantity: m.quantity,
      from: template,
    })
  }

  const wanted = new Set(members.map((m) => m.traveler_id))
  const removed = [
    ...rows.filter((r) => r.assigned_traveler_id && !wanted.has(r.assigned_traveler_id)),
    // A shared row nothing was re-pointed onto is a leftover, not a member.
    ...(repointable ? [repointable] : []),
  ]

  return {
    update,
    insert,
    delete: removed.map((r) => r.id),
    destructive: lossesFor(removed, nameOf, withContent),
    survivor: null,
    totals: null,
    unskipped,
    empty: update.length === 0 && insert.length === 0 && removed.length === 0,
  }
}

/** How much of the roster an item's membership covers — what the FR-25.21c select-all reports. */
export type MembershipCoverage = 'none' | 'some' | 'all'

/**
 * membershipCoverage says whether none, some or every traveler of the trip is
 * a member. Only travelers the trip still has are counted: a row pointing at a
 * removed traveler is not somebody the roster can show as checked, and letting
 * it count would make a partial set read as full.
 */
export function membershipCoverage(
  travelers: Traveler[],
  members: MembershipMember[],
): MembershipCoverage {
  const ids = new Set(members.map((m) => m.traveler_id))
  const covered = travelers.filter((t) => ids.has(t.id)).length
  if (covered === 0) return 'none'
  return covered === travelers.length ? 'all' : 'some'
}

/**
 * everyoneMembers is FR-25.21c's shortcut: the membership that has the whole
 * roster in it. An amount somebody chose is a decision and is kept — the
 * shortcut only adds the travelers who have none, at the floor of one, so
 * tapping it can enlarge a membership and never rewrite one.
 */
export function everyoneMembers(
  travelers: Traveler[],
  members: MembershipMember[],
): MembershipMember[] {
  const byTraveler = new Map(members.map((m) => [m.traveler_id, m]))
  return travelers.map((t) => byTraveler.get(t.id) ?? { traveler_id: t.id, quantity: MIN_QUANTITY })
}

/**
 * The membership a set of rows already expresses, in trip order.
 *
 * A row assigned to somebody the trip no longer has is left out for the reason
 * {@link membershipCoverage} gives: it is not a member the roster can show, and
 * counting it would let a partial membership read as a full one. What it is
 * *not* is a licence to delete that row — that decision stays with the caller
 * and its confirm (ADR-036).
 */
export function membersOfRows(rows: TripItem[], travelers: Traveler[]): MembershipMember[] {
  const byTraveler = new Map<string, TripItem>()
  for (const row of rows) {
    if (row.assigned_traveler_id !== null) byTraveler.set(row.assigned_traveler_id, row)
  }
  return travelers
    .filter((traveler) => byTraveler.has(traveler.id))
    .map((traveler) => ({
      traveler_id: traveler.id,
      // Non-null by the filter above; the map is keyed by the same ids.
      quantity: byTraveler.get(traveler.id)?.quantity ?? MIN_QUANTITY,
    }))
}

/**
 * Which of these rows a delete would cost more than the row itself: a comment
 * thread (FR-7.1) or a preparation todo (FR-7.3). This module has no I/O, so
 * the two questions are asked of the caller — one callback each rather than
 * two prepared lists, so a caller cannot pass a list it built for other rows.
 *
 * It is the answer {@link planMembership}'s `rowsWithContent` wants, and it
 * lives here because both callers of the planner need it and a second copy is
 * how the two stop agreeing about what a conversion may destroy.
 */
export function rowsCarryingContent(
  rows: TripItem[],
  content: { hasComments: (rowId: string) => boolean; hasTodo: (rowId: string) => boolean },
): string[] {
  return rows
    .filter((row) => content.hasComments(row.id) || content.hasTodo(row.id))
    .map((row) => row.id)
}
