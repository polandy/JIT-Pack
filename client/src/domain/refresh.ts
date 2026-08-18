/**
 * The group refresh (FR-27.4) — pure, no I/O.
 *
 * A trip follows the templates it was generated from until it is *past*
 * (followsGroups): positions the group gained, positions it lost, quantity
 * and attribute changes. None of it lands by itself — this module derives
 * the diff, and the trip's owner answers it (planRefresh / declinePlan).
 *
 * The mechanism is a re-resolution diff rather than a push from the editing
 * screen: M8, M14 and M21 all write to a group, and a diff means one rule for
 * all three — and for the group edit that arrived over sync from another
 * device, which no screen on this device could have pushed. Running it
 * client-side keeps Local Mode at parity (invariant 4).
 *
 * The one absolute rule is that **manual edits on the trip always win**, and
 * this module is where that is decided. It needs to tell "the user changed
 * this row" from "the template changed it last time", which no comparison of
 * the row against the *current* template can answer — hence the ledger
 * (`trip_generated_positions`): what generation last produced, per position.
 */

import { generateTripItems, type GeneratedItem, type GenerationInput } from './instantiate'
import type {
  AppliedChange,
  ChangeDetail,
  GeneratedPosition,
  ItemTodo,
  MasterItem,
  Template,
  TemplateInclude,
  TemplateItem,
  TemplateItemTask,
  Traveler,
  Trip,
  TripItem,
  TripTemplateSource,
} from '@/types/domain'
import { followsGroups } from './trips'

/** A row the refresh will create, with the traveler it belongs to resolved. */
export interface PlannedAdd {
  generated: GeneratedItem
  /** null = trip-global. */
  traveler_id: string | null
  /** Stable id, so two devices refreshing the same trip agree (see ADR-016). */
  trip_item_id: string
  ledger: GeneratedPosition
}

/** A row the refresh will update in place, and the todos that follow it. */
export interface PlannedUpdate {
  item: TripItem
  /** Only the fields that actually differ — an empty object never occurs. */
  fields: Partial<
    Pick<
      TripItem,
      | 'name'
      | 'quantity'
      | 'mode'
      | 'late_packer'
      | 'weight_grams'
      | 'value_cents'
      | 'category_name'
    >
  >
  /** FR-27.7 tasks the group gained, to be written as FR-7.3 todos. */
  addTasks: string[]
  /** Open todos whose task the group lost. Resolved ones are a record, and stay. */
  removeTodos: ItemTodo[]
  ledger: GeneratedPosition
}

export interface PlannedRemoval {
  item: TripItem
  ledger: GeneratedPosition
}

/**
 * What the refresh would do. Empty in every field means "nothing moved" —
 * the normal case, and the one the caller must be able to detect cheaply
 * so an open trip does not write on every render.
 */
export interface RefreshPlan {
  add: PlannedAdd[]
  update: PlannedUpdate[]
  remove: PlannedRemoval[]
  /** Ledger entries to write (adds and updates carry their own). */
  ledgerUpsert: GeneratedPosition[]
  /** Ledger ids to drop — the position is gone and nothing protects it. */
  ledgerDelete: string[]
  /** The log behind M2's chip, in the order the changes were decided. */
  log: Omit<AppliedChange, 'id' | 'created_at'>[]
}

export interface RefreshInput {
  trip: Trip
  /** The templates the trip follows (FR-27.4 registry). */
  sources: TripTemplateSource[]
  templates: Template[]
  includes: TemplateInclude[]
  templateItems: TemplateItem[]
  templateItemTasks: TemplateItemTask[]
  masterItems: MasterItem[]
  travelers: Traveler[]
  items: TripItem[]
  todos: ItemTodo[]
  ledger: GeneratedPosition[]
  /** Today as ISO `YYYY-MM-DD` — see followsGroups; never read from the clock here. */
  today: string
}

/** True when the plan would write nothing — the normal case on an open trip. */
export function isEmptyPlan(plan: RefreshPlan): boolean {
  return (
    plan.add.length === 0 &&
    plan.update.length === 0 &&
    plan.remove.length === 0 &&
    plan.ledgerUpsert.length === 0 &&
    plan.ledgerDelete.length === 0
  )
}

/**
 * proposedChangeCount is what the user is asked about (FR-27.4): the rows the
 * refresh would add, change or drop.
 *
 * Deliberately not the ledger halves. Adopting a hand-added row into the
 * ledger, or dropping an entry whose row and position are both long gone, is
 * bookkeeping that changes nothing the user can see — counting it would put a
 * number on M2's chip that no screen can explain.
 */
export function proposedChangeCount(plan: RefreshPlan): number {
  return plan.add.length + plan.update.length + plan.remove.length
}

/**
 * declinePlan is the answer "no" (FR-27.4): the trip keeps what it has, and
 * the ledger advances anyway.
 *
 * Advancing the snapshot is the whole mechanism. The ledger is the record of
 * what generation last produced, and `isProtected` reads a row that differs
 * from it as the user's own — so writing the refused version into the ledger
 * detaches exactly the positions that were refused, and leaves every other
 * position in the group still following. There is no "declined" flag, no
 * expiry and nothing to sync: the refusal is expressed in the same row the
 * acceptance would have been.
 *
 * The consequence, stated plainly because the UI has to say it: a refused
 * position stops following the group *in this trip*. A refused addition is
 * not offered again, a refused removal stays, and a refused change keeps the
 * value the trip already had.
 */
export function declinePlan(plan: RefreshPlan): RefreshPlan {
  return {
    add: [],
    update: [],
    remove: [],
    ledgerUpsert: plan.ledgerUpsert,
    ledgerDelete: plan.ledgerDelete,
    log: [],
  }
}

function emptyPlan(): RefreshPlan {
  return { add: [], update: [], remove: [], ledgerUpsert: [], ledgerDelete: [], log: [] }
}

/** The ledger's identity, shared by the diff and the id derivation. */
function positionKey(sourceItemId: string, travelerId: string): string {
  return `${sourceItemId}|${travelerId}`
}

/**
 * Ids the refresh derives rather than draws at random, so two devices
 * refreshing the same trip from the same group edit converge on one row
 * instead of two (ADR-016). The merge is per row and last-write-wins
 * (NFR-4.2a), which resolves identical ids into a single row and identical
 * values — but only if the ids *are* identical.
 */
export function propagatedItemId(tripId: string, sourceItemId: string, travelerId: string): string {
  return deriveId('item', tripId, positionKey(sourceItemId, travelerId))
}

export function ledgerId(tripId: string, sourceItemId: string, travelerId: string): string {
  return deriveId('ledger', tripId, positionKey(sourceItemId, travelerId))
}

/**
 * deriveId hashes its parts into a 32-hex-character id, the shape
 * `lower(hex(randomblob(16)))` produces — nothing downstream may need to
 * tell a derived id from a random one. FNV-1a four times over, each pass
 * seeded differently, because one 32-bit pass is far too narrow to carry a
 * primary key.
 */
function deriveId(namespace: string, tripId: string, key: string): string {
  const input = `${namespace}:${tripId}:${key}`
  const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
  return seeds.map((seed) => fnv1a(input, seed).toString(16).padStart(8, '0')).join('')
}

function fnv1a(input: string, seed: number): number {
  let hash = seed >>> 0
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * planRefresh re-resolves the trip's sources and diffs the result against
 * what is on the trip, honouring the ledger's record of what generation
 * produced last time.
 *
 * Returns an empty plan — never a partial one — for a trip that no longer
 * follows its groups or has no registered sources: the freeze on a past trip
 * is absolute, and a trip created before the registry existed must not be
 * guessed at.
 *
 * The plan is an *offer*. Writing it is the caller's decision, and the two
 * answers are "apply it" and declinePlan.
 */
export function planRefresh(input: RefreshInput): RefreshPlan {
  if (!followsGroups(input.trip, input.today)) return emptyPlan()
  const selectedTemplateIds = input.sources.map((s) => s.template_id)
  if (selectedTemplateIds.length === 0) return emptyPlan()

  const generation: GenerationInput = {
    templates: input.templates,
    selectedTemplateIds,
    includes: input.includes,
    templateItems: input.templateItems,
    templateItemTasks: input.templateItemTasks,
    masterItems: input.masterItems,
    trip: {
      duration_days: input.trip.duration_days,
      attributes: input.trip.attributes,
      // The *current* travelers, deliberately: a person added to a trip
      // gets the per-person positions (FR-25.8) rather than a list that
      // silently skips them, and one removed takes their untouched rows with
      // them. The trip follows its plan, and the roster is part of the plan.
      travelers: input.travelers.map((t) => ({ name: t.name })),
    },
  }
  const resolved = generateTripItems(generation)

  const templateNames = new Map(input.templates.map((t) => [t.id, t.name]))
  const itemsById = new Map(input.items.map((i) => [i.id, i]))
  const ledgerByKey = new Map(
    input.ledger.map((l) => [positionKey(l.source_item_id, l.traveler_id), l]),
  )
  // Rows the user added by hand carry the same (item, traveler) identity as a
  // generated one would. Adopting them instead of adding a second row is what
  // keeps "I already packed a power bank" from becoming two power banks.
  const rowsByKey = new Map<string, TripItem>()
  for (const item of input.items) {
    if (!item.source_item_id) continue
    const key = positionKey(item.source_item_id, item.assigned_traveler_id ?? '')
    if (!rowsByKey.has(key)) rowsByKey.set(key, item)
  }

  const plan = emptyPlan()
  const seen = new Set<string>()

  for (const generated of resolved.items) {
    const traveler =
      generated.traveler_index === null ? null : (input.travelers[generated.traveler_index] ?? null)
    // A per-person row whose traveler vanished mid-resolution is not a row we
    // can place; skipping beats writing one with no owner.
    if (generated.traveler_index !== null && !traveler) continue
    // A generated row with no template is an FR-27.3 single item. The refresh
    // resolves *sources* and so never produces one — but it could not follow
    // anything either: with no template behind it, nothing would ever change
    // it. Skipping keeps that a fact rather than a coincidence of the caller.
    const sourceTemplateId = generated.source_template_id
    if (sourceTemplateId === null) continue
    const travelerId = traveler?.id ?? ''
    const key = positionKey(generated.source_item_id, travelerId)
    seen.add(key)

    const entry = ledgerByKey.get(key)
    const groupName = templateNames.get(sourceTemplateId) ?? ''

    if (!entry) {
      const existing = rowsByKey.get(key)
      if (existing) {
        // Already on the trip without a ledger entry: a hand-added row, or a
        // trip generated before the ledger existed. Adopt it silently — it is
        // the user's row, so nothing is logged and nothing is overwritten;
        // from here on the ledger can tell whether they touch it again.
        plan.ledgerUpsert.push(
          snapshotOf(
            input.trip.id,
            existing.id,
            generated,
            sourceTemplateId,
            travelerId,
            ledgerId(input.trip.id, generated.source_item_id, travelerId),
          ),
        )
        continue
      }
      const tripItemId = propagatedItemId(input.trip.id, generated.source_item_id, travelerId)
      const ledgerEntry = snapshotOf(
        input.trip.id,
        tripItemId,
        generated,
        sourceTemplateId,
        travelerId,
        ledgerId(input.trip.id, generated.source_item_id, travelerId),
      )
      plan.add.push({
        generated,
        traveler_id: traveler?.id ?? null,
        trip_item_id: tripItemId,
        ledger: ledgerEntry,
      })
      plan.ledgerUpsert.push(ledgerEntry)
      plan.log.push({
        trip_id: input.trip.id,
        source_template_id: sourceTemplateId,
        source_template_name: groupName,
        kind: 'added',
        item_name: generated.name,
        detail: null,
      })
      continue
    }

    const row = itemsById.get(entry.trip_item_id)
    // The ledger knows the row, the trip does not: deleted by hand. FR-27.4's
    // "a row the user deleted is never touched" — the entry stays, so the
    // position is not re-added on every single open.
    if (!row) continue
    if (isProtected(row, entry)) continue

    const next = snapshotOf(
      input.trip.id,
      row.id,
      generated,
      sourceTemplateId,
      travelerId,
      entry.id,
    )
    const fields = changedFields(entry, next)
    const addTasks = next.tasks.filter((t) => !entry.tasks.includes(t))
    const lostTasks = entry.tasks.filter((t) => !next.tasks.includes(t))
    const removeTodos = input.todos.filter(
      (todo) =>
        todo.trip_item_id === row.id && todo.task_state === 'open' && lostTasks.includes(todo.body),
    )

    if (Object.keys(fields).length === 0 && addTasks.length === 0 && removeTodos.length === 0) {
      continue
    }

    plan.update.push({ item: row, fields, addTasks, removeTodos, ledger: next })
    plan.ledgerUpsert.push(next)
    for (const detail of describeFieldChanges(entry, next)) {
      plan.log.push({
        trip_id: input.trip.id,
        source_template_id: sourceTemplateId,
        source_template_name: groupName,
        kind: 'changed',
        item_name: next.name,
        detail,
      })
    }
    if (addTasks.length > 0 || removeTodos.length > 0) {
      plan.log.push({
        trip_id: input.trip.id,
        source_template_id: sourceTemplateId,
        source_template_name: groupName,
        kind: 'changed',
        item_name: next.name,
        detail: { field: 'tasks', from: entry.tasks.length, to: next.tasks.length },
      })
    }
  }

  // What the resolution no longer contains: the group dropped the position,
  // a condition stopped matching (FR-15.2), or its traveler left the trip.
  for (const entry of input.ledger) {
    const key = positionKey(entry.source_item_id, entry.traveler_id)
    if (seen.has(key)) continue
    const row = itemsById.get(entry.trip_item_id)
    if (!row) {
      // Gone from both sides — the ledger entry is the only thing left of it.
      plan.ledgerDelete.push(entry.id)
      continue
    }
    if (isProtected(row, entry)) continue
    plan.remove.push({ item: row, ledger: entry })
    plan.ledgerDelete.push(entry.id)
    plan.log.push({
      trip_id: entry.trip_id,
      source_template_id: entry.source_template_id,
      source_template_name: templateNames.get(entry.source_template_id) ?? '',
      kind: 'removed',
      item_name: entry.name,
      detail: null,
    })
  }

  return plan
}

/**
 * isProtected decides FR-27.4's absolute rule. Three ways a row stops being
 * the template's to change:
 *
 *   * it no longer matches what generation produced — edited by hand;
 *   * packing has begun on it, so a quantity change would rewrite a count
 *     someone physically verified;
 *   * it was skipped (FR-5.5) — "deliberately not coming" is a decision, and
 *     a template edit must not quietly undo it.
 *
 * A protected row's ledger entry is deliberately *not* refreshed: the
 * snapshot stays the record of the last generation that actually landed, so
 * the row stays protected instead of drifting back under template control.
 */
function isProtected(row: TripItem, entry: GeneratedPosition): boolean {
  if (row.state === 'skipped') return true
  if (row.packed_count > 0) return true
  return (
    row.name !== entry.name ||
    row.quantity !== entry.quantity ||
    row.mode !== entry.mode ||
    row.late_packer !== entry.late_packer ||
    (row.weight_grams ?? null) !== entry.weight_grams ||
    (row.value_cents ?? null) !== entry.value_cents ||
    (row.category_name ?? null) !== entry.category_name
  )
}

/**
 * The template is passed rather than read off `generated`: a generated row may
 * have none since FR-27.3, planRefresh skips exactly those, and the ledger's
 * identity depends on the id being there.
 */
function snapshotOf(
  tripId: string,
  tripItemId: string,
  generated: GeneratedItem,
  sourceTemplateId: string,
  travelerId: string,
  id: string,
): GeneratedPosition {
  return {
    id,
    trip_id: tripId,
    trip_item_id: tripItemId,
    source_template_id: sourceTemplateId,
    source_item_id: generated.source_item_id,
    traveler_id: travelerId,
    name: generated.name,
    quantity: generated.quantity,
    mode: generated.mode,
    late_packer: generated.late_packer,
    weight_grams: generated.weight_grams,
    value_cents: generated.value_cents,
    category_name: generated.category_name,
    tasks: [...generated.tasks],
  }
}

const PROPAGATED_FIELDS = [
  'name',
  'quantity',
  'mode',
  'late_packer',
  'weight_grams',
  'value_cents',
  'category_name',
] as const

function changedFields(before: GeneratedPosition, after: GeneratedPosition) {
  const fields: PlannedUpdate['fields'] = {}
  for (const field of PROPAGATED_FIELDS) {
    if (before[field] !== after[field]) {
      Object.assign(fields, { [field]: after[field] })
    }
  }
  return fields
}

function describeFieldChanges(before: GeneratedPosition, after: GeneratedPosition): ChangeDetail[] {
  const details: ChangeDetail[] = []
  for (const field of PROPAGATED_FIELDS) {
    if (before[field] !== after[field]) {
      details.push({ field, from: before[field], to: after[field] })
    }
  }
  return details
}
