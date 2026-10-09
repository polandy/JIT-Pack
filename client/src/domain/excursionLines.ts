/**
 * An excursion's lines (FR-31, ADR-077) — pure, no I/O, no Vue.
 *
 * An excursion is a small packing list inside a trip: a day hike, a hut night.
 * It owns its lines and their ticks. This file holds what a line *is*: which
 * travellers go, what a Gruppe amounts to for them, what a change of
 * participants or of a line's „for whom" does to the list, how the list reads
 * — as its own sum — and what saving it as a Gruppe writes.
 * What a line borrows from the suitcase is `excursionSuitcase.ts`, when an
 * excursion is due `excursionSchedule.ts`.
 */

import { generateTripItems } from './instantiate'
import { stateFor, unitsOf, type PackUnits } from './packState'
import type {
  CategorisedMasterItem,
  ExcursionItem,
  ExcursionItemMode,
  ExcursionTraveler,
  MasterItem,
  Template,
  TemplateAssignment,
  TemplateInclude,
  TemplateItem,
  TemplateItemTask,
  Traveler,
} from '@/types/domain'
import { ITEM_MODE_BUY_LOCAL, ITEM_MODE_PACK, STATE_SKIPPED } from '@/types/domain'

// --- Who goes (FR-31.3) ---

/**
 * participantsOf names who goes, in the trip's roster order. An excursion
 * that names nobody takes everybody — so a traveller added to the trip later
 * is on it without anybody having to remember the hike. A named traveller the
 * trip no longer has is nobody.
 */
export function participantsOf(
  excursionId: string,
  rows: readonly ExcursionTraveler[],
  travelers: readonly Traveler[],
): Traveler[] {
  const named = new Set(
    rows.filter((r) => r.excursion_id === excursionId).map((r) => r.traveler_id),
  )
  if (named.size === 0) return [...travelers]
  return travelers.filter((t) => named.has(t.id))
}

/** Whether the excursion names its people, rather than taking every traveller. */
export function namesItsParticipants(
  excursionId: string,
  rows: readonly ExcursionTraveler[],
): boolean {
  return rows.some((r) => r.excursion_id === excursionId)
}

// --- A line before it is written ---

/**
 * One line an excursion is about to gain, before it is linked to the
 * suitcase. `assigned_traveler_id` is set exactly on a per-participant line.
 */
export interface DraftLine {
  source_item_id: string | null
  name: string
  category_name: string | null
  assigned_traveler_id: string | null
  quantity: number
  mode: ExcursionItemMode
  for_all_participants: boolean
  /** The master item's own fields, for a suitcase row the line has to create. */
  weight_grams: number | null
  value_cents: number | null
  source_template_id: string | null
}

/** Everything a Gruppe's expansion reads — the stores shape the arrays. */
export interface GroupDraftInput {
  templateId: string
  templates: Template[]
  includes: TemplateInclude[]
  templateItems: TemplateItem[]
  templateItemTasks: TemplateItemTask[]
  masterItems: CategorisedMasterItem[]
  /** The trip's attributes, for the FR-15.2 conditions. */
  attributes: Record<string, unknown> | null
  /** Who goes: a `per_person` position becomes one line each (FR-31.5). */
  participants: readonly Traveler[]
}

/**
 * draftLinesFromGroup expands a Gruppe for an excursion (FR-31.2): the same
 * resolution M3 performs — includes, conditions, the FR-2.3a merge — with the
 * excursion's **participants** as the roster, so a `per_person` position
 * becomes one line per person going and is remembered as *für alle*.
 *
 * The excursion is not the trip, so two readings differ from generation:
 *
 * - **A purchase before departure is packing here.** *Vor der Abreise
 *   kaufen* means the thing is in the suitcase by the day of the hike; only
 *   *vor Ort* stays a purchase.
 * - **A shared line names nobody.** FR-1.9's default assignee hands a trip
 *   row to its owner's traveller; a line of a small list packed by one
 *   person in the morning is nobody's in particular.
 *
 * The expansion is trip-length free: an excursion is not the trip, and a
 * position counted per day would ask for the whole holiday's socks.
 */
export function draftLinesFromGroup(input: GroupDraftInput): DraftLine[] {
  const generated = generateTripItems({
    templates: input.templates,
    selectedTemplateIds: [input.templateId],
    includes: input.includes,
    templateItems: input.templateItems,
    templateItemTasks: input.templateItemTasks,
    masterItems: input.masterItems,
    trip: {
      duration_days: null,
      attributes: input.attributes,
      travelers: input.participants.map((t) => ({
        name: t.name,
        linked_user_id: t.linked_user_id,
      })),
    },
  })
  return generated.items.map((g) => ({
    source_item_id: g.source_item_id,
    name: g.name,
    category_name: g.category_name,
    assigned_traveler_id:
      g.per_person && g.traveler_index !== null
        ? (input.participants[g.traveler_index]?.id ?? null)
        : null,
    quantity: g.quantity,
    mode: g.mode === ITEM_MODE_BUY_LOCAL ? ITEM_MODE_BUY_LOCAL : ITEM_MODE_PACK,
    for_all_participants: g.per_person,
    weight_grams: g.weight_grams,
    value_cents: g.value_cents,
    source_template_id: g.source_template_id,
  }))
}

/** For whom a line typed into the excursion's composer is (FR-31.5). */
export type LineFor =
  { kind: 'shared' } | { kind: 'all' } | { kind: 'named'; travelerIds: readonly string[] }

/**
 * lineForOf reads the composer strip's chosen people as the excursion does
 * (FR-31.5): nobody is shared, every participant is *für alle* — the set that
 * grows with a joiner — and some are named.
 */
export function lineForOf(travelerIds: readonly string[], participantCount: number): LineFor {
  if (travelerIds.length === 0) return { kind: 'shared' }
  if (travelerIds.length === participantCount) return { kind: 'all' }
  return { kind: 'named', travelerIds }
}

/**
 * draftLinesFor turns one thing typed or picked in the composer into its
 * lines: one shared line, one per participant *für alle*, or one per named
 * person. A name the excursion does not have goes nowhere.
 */
export function draftLinesFor(
  base: Omit<DraftLine, 'assigned_traveler_id' | 'for_all_participants'>,
  forWhom: LineFor,
  participants: readonly Traveler[],
): DraftLine[] {
  if (forWhom.kind === 'shared') {
    return [{ ...base, assigned_traveler_id: null, for_all_participants: false }]
  }
  const goes = new Set(participants.map((p) => p.id))
  const ids =
    forWhom.kind === 'all'
      ? participants.map((p) => p.id)
      : participants
          .map((p) => p.id)
          .filter((id) => forWhom.travelerIds.includes(id) && goes.has(id))
  return ids.map((id) => ({
    ...base,
    assigned_traveler_id: id,
    for_all_participants: forWhom.kind === 'all',
  }))
}

/**
 * FR-31.14: a line the inventory does not know is this excursion's alone.
 * Every other way in — a Gruppe, the quick-add's inventory, the create sheet —
 * names an item, so no flag is needed: the missing item *is* the statement.
 */
export function isExcursionOnly(line: Pick<DraftLine, 'source_item_id'>): boolean {
  return line.source_item_id === null
}

/** Tolerant enough for "Powerbank" vs "powerbank ", deliberately no further (groupAdd.ts). */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

// --- The participants change (FR-31.5) ---

/** What a new set of participants does to the list. */
export interface ParticipantChange {
  /** Lines of every *für alle* set for somebody who joins. */
  add: DraftLine[]
  /** Open lines of somebody who leaves — nothing of theirs is in the rucksack yet. */
  remove: ExcursionItem[]
}

/**
 * planParticipantChange answers what a change of who goes does to the list.
 *
 * - **Somebody joins** → every *für alle* set grows a line for them, at the
 *   amount the set's lines share (one where they differ), open.
 * - **Somebody leaves** → their **open** lines go. A line of theirs already
 *   ticked stays: the thing is in the rucksack, and a list that forgot it
 *   would hide exactly that. The screen marks it *nicht mehr dabei*.
 *
 * Lines named for a person without the flag leave with them the same way;
 * they never grow for somebody new.
 */
export function planParticipantChange(
  lines: readonly ExcursionItem[],
  before: readonly Traveler[],
  after: readonly Traveler[],
): ParticipantChange {
  const had = new Set(before.map((t) => t.id))
  const has = new Set(after.map((t) => t.id))
  const joined = after.filter((t) => !had.has(t.id))

  const remove = lines.filter(
    (l) =>
      l.assigned_traveler_id !== null &&
      had.has(l.assigned_traveler_id) &&
      !has.has(l.assigned_traveler_id) &&
      l.packed_count <= 0,
  )

  const sets = new Map<string, ExcursionItem[]>()
  for (const line of lines) {
    if (!line.for_all_participants) continue
    const key = setKey(line)
    const set = sets.get(key)
    if (set) set.push(line)
    else sets.set(key, [line])
  }

  const add: DraftLine[] = []
  for (const set of sets.values()) {
    const first = set[0]!
    const amounts = new Set(set.map((l) => l.quantity))
    const quantity = amounts.size === 1 ? first.quantity : 1
    for (const person of joined) {
      if (set.some((l) => l.assigned_traveler_id === person.id)) continue
      add.push({
        source_item_id: first.source_item_id,
        name: first.name,
        category_name: first.category_name,
        assigned_traveler_id: person.id,
        quantity,
        mode: first.mode,
        for_all_participants: true,
        weight_grams: null,
        value_cents: null,
        source_template_id: null,
      })
    }
  }
  return { add, remove }
}

/** The key that makes lines one *für alle* set, or one FR-25.1-style cluster. */
function setKey(line: Pick<ExcursionItem, 'source_item_id' | 'name'>): string {
  return line.source_item_id ?? `name:${normalizeName(line.name)}`
}

// --- Reading the list (FR-31.6) ---

/** The units a set of lines contributes — skipped lines none (FR-25.22). */
export function sumUnits(lines: readonly ExcursionItem[]): PackUnits {
  return lines.reduce(
    (acc, l) => {
      const u = unitsOf(l)
      return { done: acc.done + u.done, total: acc.total + u.total }
    },
    { done: 0, total: 0 },
  )
}

/**
 * Whether a line is somebody's who no longer goes (FR-31.5): kept because it
 * is in the rucksack, and marked so it can be taken out again.
 */
export function isLeftBehind(line: ExcursionItem, participants: readonly Traveler[]): boolean {
  return (
    line.assigned_traveler_id !== null &&
    !participants.some((p) => p.id === line.assigned_traveler_id)
  )
}

/** Still to buy on the spot: a vor-Ort line nobody has bought or decided against. */
export function isOpenPurchase(line: ExcursionItem): boolean {
  return (
    line.mode === ITEM_MODE_BUY_LOCAL && line.bought_at === null && line.state !== STATE_SKIPPED
  )
}

/** The line's pack state after a tick, a partial count or an untick. */
export function packedState(packedCount: number, quantity: number) {
  return stateFor(packedCount, quantity)
}

// --- Saving as a Gruppe (FR-31.11) ---

/** One position of the Gruppe an excursion is saved as. */
export interface GroupPositionDraft {
  name: string
  /** Null when the master item has to be created first (FR-27.5's mechanics). */
  itemId: string | null
  quantity: number
  assignment: TemplateAssignment
  default_mode: ExcursionItemMode
}

/** The whole write of *Als Gruppe speichern*, ordered: master items, then positions. */
export interface GroupFromExcursion {
  newMasterItems: string[]
  positions: GroupPositionDraft[]
}

/**
 * planGroupFromExcursion folds an excursion's lines back into a Gruppe
 * (FR-31.11): a *für alle* set becomes one `per_person` position, a line named
 * for particular people one `per_person` position too (a Gruppe has no
 * people), a shared line a `trip_global` one; *vor Ort* survives as the
 * position's default mode. Skipped lines are left out — the list decided
 * against them. A line with no master item is folded onto the inventory by
 * exact name, else a new master item is named (FR-27.5's `masterFold`, for
 * the same reason it is exact).
 */
export function planGroupFromExcursion(
  lines: readonly ExcursionItem[],
  masterItems: readonly MasterItem[],
  /**
   * FR-31.14: whether lines the inventory does not know come along — as new
   * master items — or stay out of the Gruppe. The screen asks.
   */
  includeUnlisted = true,
): GroupFromExcursion {
  const newMasterItems: string[] = []
  const bySet = new Map<string, GroupPositionDraft>()
  for (const line of lines) {
    if (line.state === STATE_SKIPPED) continue
    const perPerson = line.assigned_traveler_id !== null
    const key = `${setKey(line)}|${perPerson ? 'per_person' : 'trip_global'}`
    const existing = bySet.get(key)
    if (existing) {
      existing.quantity = Math.max(existing.quantity, line.quantity)
      continue
    }
    let itemId = line.source_item_id
    let name = line.name
    if (itemId === null) {
      const match = masterItems.find((m) => normalizeName(m.name) === normalizeName(line.name))
      if (match) {
        itemId = match.id
        name = match.name
      } else if (!includeUnlisted) {
        continue
      } else if (!newMasterItems.some((n) => normalizeName(n) === normalizeName(line.name))) {
        newMasterItems.push(line.name)
      }
    }
    bySet.set(key, {
      name,
      itemId,
      quantity: Math.max(line.quantity, 1),
      assignment: perPerson ? 'per_person' : 'trip_global',
      default_mode: line.mode,
    })
  }
  return { newMasterItems, positions: [...bySet.values()] }
}

// --- For whom, changed from the line's sheet (FR-31.5) ---

/** What changing a thing's *für wen* writes. */
export interface ForWhomChange {
  /** Open lines of people it is no longer for. */
  remove: ExcursionItem[]
  /** A line for each person it is newly for, or the one shared line. */
  add: DraftLine[]
  /** Lines that stay, whose *für alle* flag has to follow the new answer. */
  reflag: Array<{ line: ExcursionItem; forAll: boolean }>
}

/**
 * planForWhom answers what M5's strip means on an excursion (FR-31.5): the set
 * of lines one thing has — shared, or one per person — becomes the chosen one.
 * A line already in the rucksack is never taken away, for the leaver's reason;
 * only open lines go. *Alle* marks the set *für alle*, so it follows a joiner;
 * named people do not.
 */
export function planForWhom(
  set: readonly ExcursionItem[],
  target: LineFor,
  participants: readonly Traveler[],
): ForWhomChange {
  const first = set[0]
  if (!first) return { remove: [], add: [], reflag: [] }
  const wanted =
    target.kind === 'shared'
      ? new Set<string | null>([null])
      : new Set<string | null>(
          target.kind === 'all' ? participants.map((p) => p.id) : target.travelerIds,
        )
  const forAll = target.kind === 'all'
  const remove = set.filter((l) => !wanted.has(l.assigned_traveler_id) && l.packed_count <= 0)
  const kept = set.filter((l) => !remove.includes(l))
  const reflag = kept
    .filter((l) => l.assigned_traveler_id !== null && l.for_all_participants !== forAll)
    .map((line) => ({ line, forAll }))
  const add: DraftLine[] = []
  for (const who of wanted) {
    if (kept.some((l) => l.assigned_traveler_id === who)) continue
    add.push({
      source_item_id: first.source_item_id,
      name: first.name,
      category_name: first.category_name,
      assigned_traveler_id: who,
      quantity: 1,
      mode: first.mode,
      for_all_participants: who !== null && forAll,
      weight_grams: null,
      value_cents: null,
      source_template_id: null,
    })
  }
  return { remove, add, reflag }
}

/** Every line of the same thing in one excursion — the set a strip acts on. */
export function lineSetOf(line: ExcursionItem, lines: readonly ExcursionItem[]): ExcursionItem[] {
  return lines.filter((l) => l.excursion_id === line.excursion_id && setKey(l) === setKey(line))
}
