/**
 * Excursions (FR-31, ADR-077) — pure, no I/O, no Vue.
 *
 * An excursion is a small packing list inside a trip: a day hike, a hut night.
 * It owns its lines and their ticks, and a line may come out of the suitcase
 * (`trip_item_id`) or be bought on the spot. Every rule the screens and the
 * actions apply lives here, so Local Mode runs the identical path (invariant
 * 4): which travellers go, what a Gruppe amounts to for them, which suitcase
 * row a line borrows and what the suitcase has to gain for it, what a change
 * of participants does to the list, how the list reads, and what saving it as
 * a Gruppe writes.
 */

import { generateTripItems, type GeneratedTripItemFields } from './instantiate'
import { stateFor, unitsOf, type PackUnits } from './packState'
import type {
  CategorisedMasterItem,
  Excursion,
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
  TripItem,
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

// --- Borrowing from the suitcase (FR-31.4, FR-31.7) ---

/** What the suitcase has to gain so a line can come out of it. */
export type SuitcaseWrite =
  /** The row is there with too few: raise it (max, never sum). */
  | { kind: 'raise'; tripItem: TripItem; quantity: number }
  /** The row is not there: create it, and the line links the new id. */
  | { kind: 'create'; ref: string; fields: GeneratedTripItemFields; travelerId: string | null }

/** One line as it will be written, with its link settled. */
export interface PlannedLine {
  draft: DraftLine
  /**
   * The suitcase row it borrows: an existing row's id, a `create` write's
   * `ref` (the caller substitutes the new row's id), or null for none.
   */
  link: { existing: string } | { created: string } | null
  not_in_luggage: boolean
}

/** A line list and what the suitcase gains for it — one act, one undo. */
export interface LinkPlan {
  lines: PlannedLine[]
  suitcase: SuitcaseWrite[]
}

/**
 * planLinks settles where each line comes from (FR-31.4) and what the trip's
 * list has to gain for it.
 *
 * - **A vor-Ort line never touches the suitcase** — lunch is bought at the
 *   trailhead.
 * - **While the suitcase is open** (`suitcaseOpen`, i.e. *before* is not
 *   over), a line finds its row — by master item, else by name; a
 *   per-participant line the row of **the same person**, a shared line the
 *   shared row first — and raises it to the line's amount where it holds
 *   fewer: the hike borrows the suitcase's water bottle, it does not need a
 *   second one. A row that is not there is created, so the headlamp is not
 *   left at home. A row decided *bewusst nicht mitgenommen* (FR-5.5) is not
 *   revived behind the user's back: the line links it and says it is not in
 *   the luggage.
 * - **Once the suitcase is closed** (FR-31.7) nothing is written to the trip's
 *   list — it is packed, or on its way. A line with nothing packed behind it
 *   is *nicht im Gepäck*, which the screen offers to buy on the spot.
 *
 * Two lines naming the same missing thing create it once; the second links
 * the first's row.
 */
export function planLinks(
  drafts: readonly DraftLine[],
  tripItems: readonly TripItem[],
  suitcaseOpen: boolean,
): LinkPlan {
  const lines: PlannedLine[] = []
  const suitcase: SuitcaseWrite[] = []
  const raised = new Map<string, number>()
  const created = new Map<string, { ref: string; fields: GeneratedTripItemFields }>()

  for (const draft of drafts) {
    if (draft.mode === ITEM_MODE_BUY_LOCAL) {
      lines.push({ draft, link: null, not_in_luggage: false })
      continue
    }
    const row = suitcaseRowFor(draft, tripItems)
    if (!suitcaseOpen) {
      lines.push({
        draft,
        link: row ? { existing: row.id } : null,
        not_in_luggage: !row || row.packed_count <= 0,
      })
      continue
    }
    if (row) {
      const skipped = row.state === STATE_SKIPPED
      const already = raised.get(row.id) ?? row.quantity
      if (!skipped && already < draft.quantity) raised.set(row.id, draft.quantity)
      lines.push({ draft, link: { existing: row.id }, not_in_luggage: skipped })
      continue
    }
    const key = matchKey(draft.source_item_id, draft.name, draft.assigned_traveler_id)
    const pending = created.get(key)
    if (pending) {
      pending.fields.quantity = Math.max(pending.fields.quantity, draft.quantity)
      lines.push({ draft, link: { created: pending.ref }, not_in_luggage: false })
      continue
    }
    const ref = `create:${created.size}`
    const fields: GeneratedTripItemFields = {
      source_item_id: draft.source_item_id,
      source_template_id: draft.source_template_id,
      name: draft.name,
      category_name: draft.category_name,
      weight_grams: draft.weight_grams,
      value_cents: draft.value_cents,
      quantity: draft.quantity,
      mode: ITEM_MODE_PACK,
      late_packer: false,
    }
    created.set(key, { ref, fields })
    suitcase.push({ kind: 'create', ref, fields, travelerId: draft.assigned_traveler_id })
    lines.push({ draft, link: { created: ref }, not_in_luggage: false })
  }

  for (const [id, quantity] of raised) {
    const tripItem = tripItems.find((t) => t.id === id)
    if (tripItem && quantity > tripItem.quantity)
      suitcase.push({ kind: 'raise', tripItem, quantity })
  }
  return { lines, suitcase }
}

/**
 * The suitcase row a line comes out of: the same master item (or, for a row
 * typed by hand, the same name), and for a per-participant line the same
 * person — Sia's sleeping bag is in Sia's part of the luggage. A shared line
 * takes the shared row first, then any.
 */
function suitcaseRowFor(draft: DraftLine, tripItems: readonly TripItem[]): TripItem | null {
  const same = tripItems.filter((t) => sameThing(t, draft.source_item_id, draft.name))
  if (draft.assigned_traveler_id !== null) {
    return same.find((t) => t.assigned_traveler_id === draft.assigned_traveler_id) ?? null
  }
  return same.find((t) => t.assigned_traveler_id === null) ?? same[0] ?? null
}

function sameThing(
  row: { source_item_id: string | null; name: string },
  sourceItemId: string | null,
  name: string,
): boolean {
  if (sourceItemId !== null && row.source_item_id !== null)
    return row.source_item_id === sourceItemId
  return normalizeName(row.name) === normalizeName(name)
}

function matchKey(sourceItemId: string | null, name: string, travelerId: string | null): string {
  return `${sourceItemId ?? `name:${normalizeName(name)}`}|${travelerId ?? 'shared'}`
}

/** Tolerant enough for "Powerbank" vs "powerbank ", deliberately no further (groupAdd.ts). */
function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * suitcaseOf is the row a line borrows, as this device holds it — or null. A
 * link to a row the device does not have is no link: the server clears a
 * deleted row's link in the engine and announces nothing (FR-31.4).
 */
export function suitcaseOf(
  line: Pick<ExcursionItem, 'trip_item_id'>,
  tripItems: readonly TripItem[],
): TripItem | null {
  if (line.trip_item_id === null) return null
  return tripItems.find((t) => t.id === line.trip_item_id) ?? null
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

/** One entry of a category: a shared line, or a cluster of per-person lines. */
export type ExcursionEntry =
  | { kind: 'line'; line: ExcursionItem }
  | {
      kind: 'cluster'
      key: string
      name: string
      forAll: boolean
      units: PackUnits
      lines: ExcursionItem[]
    }

/** One category heading with its entries. */
export interface ExcursionGroup {
  /** The category, or null for lines that name none. */
  category: string | null
  units: PackUnits
  entries: ExcursionEntry[]
}

/**
 * excursionView arranges the lines as M4 does (FR-25.1): by category, a
 * thing that is per person once as a cluster with a child per person in the
 * participants' order, a shared thing as one line. Categories and names sort
 * alphabetically, lines without a category last.
 */
export function excursionView(
  lines: readonly ExcursionItem[],
  participants: readonly Traveler[],
): ExcursionGroup[] {
  const order = new Map(participants.map((p, i) => [p.id, i]))
  const byCategory = new Map<string | null, ExcursionItem[]>()
  for (const line of lines) {
    const list = byCategory.get(line.category_name)
    if (list) list.push(line)
    else byCategory.set(line.category_name, [line])
  }

  const groups: ExcursionGroup[] = []
  for (const [category, members] of byCategory) {
    const clusters = new Map<string, ExcursionItem[]>()
    const entries: ExcursionEntry[] = []
    for (const line of members) {
      if (line.assigned_traveler_id === null) {
        entries.push({ kind: 'line', line })
        continue
      }
      const key = setKey(line)
      const cluster = clusters.get(key)
      if (cluster) cluster.push(line)
      else clusters.set(key, [line])
    }
    for (const [key, cluster] of clusters) {
      cluster.sort(
        (a, b) =>
          (order.get(a.assigned_traveler_id!) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.assigned_traveler_id!) ?? Number.MAX_SAFE_INTEGER),
      )
      entries.push({
        kind: 'cluster',
        key,
        name: cluster[0]!.name,
        forAll: cluster.some((l) => l.for_all_participants),
        units: sumUnits(cluster),
        lines: cluster,
      })
    }
    entries.sort((a, b) => entryName(a).localeCompare(entryName(b)))
    groups.push({ category, units: sumUnits(members), entries })
  }
  groups.sort((a, b) =>
    a.category === null ? 1 : b.category === null ? -1 : a.category.localeCompare(b.category),
  )
  return groups
}

function entryName(entry: ExcursionEntry): string {
  return entry.kind === 'line' ? entry.line.name : entry.name
}

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

// --- Time (FR-31.10) ---

/** Where an excursion stands against today. */
export type ExcursionWhen = 'upcoming' | 'undated' | 'past'

/**
 * whenOf places an excursion: past once its last day is before today, upcoming
 * while it is today or ahead, undated while it has no day. A reversed pair is
 * read as its min and max — field-level LWW can leave one (FR-31.1).
 */
export function whenOf(
  excursion: Pick<Excursion, 'starts_on' | 'ends_on'>,
  today: string,
): ExcursionWhen {
  const days = [excursion.starts_on, excursion.ends_on].filter((d): d is string => d !== null)
  if (days.length === 0) return 'undated'
  const last = days.reduce((a, b) => (a > b ? a : b))
  return last < today ? 'past' : 'upcoming'
}

/** The first and last day, ordered, or null for an undated excursion. */
export function spanOf(
  excursion: Pick<Excursion, 'starts_on' | 'ends_on'>,
): { from: string; to: string } | null {
  const days = [excursion.starts_on, excursion.ends_on].filter((d): d is string => d !== null)
  if (days.length === 0) return null
  const sorted = [...days].sort()
  return { from: sorted[0]!, to: sorted[sorted.length - 1]! }
}

/** The list M27 shows: upcoming by first day, then undated by name, then past, latest first. */
export function arrangeExcursions<T extends Pick<Excursion, 'starts_on' | 'ends_on' | 'name'>>(
  excursions: readonly T[],
  today: string,
): { upcoming: T[]; undated: T[]; past: T[] } {
  const upcoming: T[] = []
  const undated: T[] = []
  const past: T[] = []
  for (const e of excursions) {
    const when = whenOf(e, today)
    if (when === 'upcoming') upcoming.push(e)
    else if (when === 'undated') undated.push(e)
    else past.push(e)
  }
  upcoming.sort(
    (a, b) => spanOf(a)!.from.localeCompare(spanOf(b)!.from) || a.name.localeCompare(b.name),
  )
  undated.sort((a, b) => a.name.localeCompare(b.name))
  past.sort((a, b) => spanOf(b)!.to.localeCompare(spanOf(a)!.to) || a.name.localeCompare(b.name))
  return { upcoming, undated, past }
}

/**
 * Whether the dashboard shows an excursion (FR-31.10): the day before it and
 * the day it starts, while it still has something open — the daypack is
 * packed the evening before as often as the morning of.
 */
export function isDueSoon(
  excursion: Pick<Excursion, 'starts_on' | 'ends_on'>,
  lines: readonly ExcursionItem[],
  today: string,
  tomorrow: string,
): boolean {
  const span = spanOf(excursion)
  if (!span || (span.from !== today && span.from !== tomorrow)) return false
  return lines.some((l) => unitsOf(l).done < unitsOf(l).total)
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

/**
 * The count the switcher's pill wears (FR-31.10): excursions still ahead,
 * today's included, with something on their list still to pack or buy. A
 * finished list, a past excursion and one without a day ask for nothing.
 */
export function pendingExcursionCount(
  excursions: readonly Excursion[],
  lines: readonly ExcursionItem[],
  today: string,
): number {
  return excursions.filter(
    (e) =>
      whenOf(e, today) === 'upcoming' &&
      lines.some((l) => l.excursion_id === e.id && unitsOf(l).done < unitsOf(l).total),
  ).length
}

/**
 * Which excursions borrow each suitcase row (FR-31.12): the names M4 shows on
 * a row, so it is not skipped or left out of the suitcase blind. Past
 * excursions are left out — they borrowed it already — and each name is
 * listed once however many of its lines point at the row.
 */
export function borrowersByTripItem(
  excursions: readonly Excursion[],
  lines: readonly ExcursionItem[],
  today: string,
): Map<string, string[]> {
  const names = new Map(
    excursions.filter((e) => whenOf(e, today) !== 'past').map((e) => [e.id, e.name]),
  )
  const out = new Map<string, string[]>()
  for (const line of lines) {
    const name = names.get(line.excursion_id)
    if (line.trip_item_id === null || name === undefined) continue
    const list = out.get(line.trip_item_id) ?? []
    if (!list.includes(name)) list.push(name)
    out.set(line.trip_item_id, list)
  }
  return out
}

/** One excursion the dashboard shows (FR-31.10). */
export interface DueExcursionRow {
  tripId: string
  tripName: string
  excursion: Excursion
  /** Whether it starts today — else tomorrow. */
  today: boolean
  units: PackUnits
}

/**
 * dueExcursions lists what M1 shows: every trip's excursions starting today or
 * tomorrow that still have something open, today's first.
 */
export function dueExcursions(
  trips: ReadonlyArray<{
    id: string
    name: string
    excursions: readonly Excursion[]
    lines: readonly ExcursionItem[]
  }>,
  today: string,
): DueExcursionRow[] {
  const tomorrow = dayAfter(today)
  const rows: DueExcursionRow[] = []
  for (const trip of trips) {
    for (const excursion of trip.excursions) {
      const lines = trip.lines.filter((l) => l.excursion_id === excursion.id)
      if (!isDueSoon(excursion, lines, today, tomorrow)) continue
      rows.push({
        tripId: trip.id,
        tripName: trip.name,
        excursion,
        today: spanOf(excursion)!.from === today,
        units: sumUnits(lines),
      })
    }
  }
  return rows.sort(
    (a, b) => Number(b.today) - Number(a.today) || a.excursion.name.localeCompare(b.excursion.name),
  )
}

/** The calendar day after an ISO day, through UTC so no zone moves it. */
export function dayAfter(iso: string): string {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

// --- Bought on the spot, kept (FR-31.13) ---

/**
 * Whether a line can be taken onto the trip's packing list: bought on the spot
 * and not yet a suitcase row. From then on it travels with the luggage — the
 * rain cape bought at the hut comes home.
 */
export function canJoinPackingList(line: ExcursionItem): boolean {
  return (
    line.mode === ITEM_MODE_BUY_LOCAL &&
    line.bought_at !== null &&
    line.state !== STATE_SKIPPED &&
    line.trip_item_id === null
  )
}

/**
 * The inventory item a kept line becomes (FR-31.13): the one it already names,
 * else one of the inventory's by the exact name (FR-27.5's rule, and its
 * reason), else a new one under the line's name.
 */
export function inventoryItemFor(
  line: Pick<ExcursionItem, 'source_item_id' | 'name'>,
  masterItems: readonly MasterItem[],
): { itemId: string } | { create: string } {
  if (line.source_item_id !== null) return { itemId: line.source_item_id }
  const match = masterItems.find((m) => normalizeName(m.name) === normalizeName(line.name))
  return match ? { itemId: match.id } : { create: line.name.trim() }
}

// --- Read as M4's row (FR-31.6) ---

/**
 * excursionLineAsRow reads a line in the shape M4's row renders (FR-31.6: the
 * excursion's list is the packing list's row, stepper and glyphs included).
 * What a line does not have is what a fresh trip row has not either — no
 * packer, container, claim, flags or purchase record — so the row shows
 * nothing it could not act on.
 */
export function excursionLineAsRow(line: ExcursionItem): TripItem {
  return {
    id: line.id,
    trip_id: line.trip_id,
    source_item_id: line.source_item_id,
    source_template_id: null,
    name: line.name,
    weight_grams: null,
    value_cents: null,
    category_name: line.category_name,
    quantity: line.quantity,
    packed_count: line.packed_count,
    state: line.state,
    mode: line.mode,
    late_packer: false,
    assigned_traveler_id: line.assigned_traveler_id,
    packer_user_id: null,
    packed_by_user_id: null,
    packed_at: null,
    container_id: null,
    packing_now_by: null,
    packing_now_at: null,
    flag_unused: false,
    flag_missing: false,
    bought_from: null,
    bought_at: null,
    bought_by_user_id: null,
    updated_hlc: '',
  }
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
