/**
 * An excursion line and the suitcase (FR-31.4, FR-31.7, FR-31.12, FR-31.13) —
 * pure, no I/O, no Vue. A line may come out of the suitcase (`trip_item_id`)
 * or be bought on the spot: which suitcase row a line borrows and what the
 * suitcase has to gain for it, which excursions borrow a row, whether a line
 * bought on the spot can join the packing list or the inventory, and the
 * line's menu that offers it.
 */

import {
  excursionLineAsRow,
  isExcursionOnly,
  normalizeName,
  type DraftLine,
} from './excursionLines'
import { whenOf } from './excursionSchedule'
import type { GeneratedTripItemFields } from './instantiate'
import { rowMenuEntries, type RowMenuAction } from './rowMenu'
import type { Excursion, ExcursionItem, MasterItem, TripItem } from '@/types/domain'
import { ITEM_MODE_BUY_LOCAL, ITEM_MODE_PACK, STATE_SKIPPED } from '@/types/domain'

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
 *
 * A line with no inventory item is the excursion's alone (FR-31.14): a
 * chocolate bar added *nur für diesen Ausflug* neither borrows nor adds a
 * suitcase row, until it is taken into the inventory.
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
    // FR-31.14: a line of this excursion alone — lunch, water — and a vor-Ort
    // line never touch the suitcase.
    if (draft.mode === ITEM_MODE_BUY_LOCAL || isExcursionOnly(draft)) {
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

/** A line as the draft it would be written from — to link one that exists. */
export function draftOf(line: ExcursionItem): DraftLine {
  return {
    source_item_id: line.source_item_id,
    name: line.name,
    category_name: line.category_name,
    assigned_traveler_id: line.assigned_traveler_id,
    quantity: line.quantity,
    mode: line.mode,
    for_all_participants: line.for_all_participants,
    weight_grams: null,
    value_cents: null,
    source_template_id: null,
  }
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
 * FR-31.14: a line of the excursion alone that can still become an inventory
 * item — one meant for the rucksack. A vor-Ort line takes FR-31.13's way
 * instead, once bought.
 */
export function canAdoptIntoInventory(line: ExcursionItem): boolean {
  return isExcursionOnly(line) && line.mode === ITEM_MODE_PACK && line.state !== STATE_SKIPPED
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

// --- The line's menu (FR-31.6, M4's FR-5.5) ---

/**
 * What an excursion line's press-and-hold can offer: M4's own entries where a
 * line has them, and the excursion's four acts beside them.
 */
export type ExcursionMenuAction =
  | RowMenuAction
  /** FR-31.8: a vor-Ort line was bought, or was not after all. */
  | 'markBought'
  | 'markUnbought'
  /** FR-31.13: a bought line joins the packing list and the inventory. */
  | 'keep'
  /** FR-31.14: a line of the excursion alone joins the inventory. */
  | 'adopt'

/**
 * M4's entries a line never has: nobody claims a line (G-3 is the suitcase's),
 * departure day is the suitcase's (FR-25.27), and *unused* is judged on the
 * trip's rows (FR-9.3).
 */
const SUITCASE_ONLY: ReadonlySet<RowMenuAction> = new Set([
  'takeover',
  'release',
  'packingNow',
  'latePackerOn',
  'latePackerOff',
  'flagUnused',
  'unflagUnused',
])

/**
 * The entries a line's menu offers, in order — M4's `rowMenuEntries` over the
 * line read as its row, so the amount, the skip, the mode and the removal are
 * offered where and as M4 offers them; the excursion's own acts go before the
 * removal, which stays last.
 */
export function excursionMenuEntries(line: ExcursionItem): ExcursionMenuAction[] {
  const own = rowMenuEntries(excursionLineAsRow(line), {
    closingPass: false,
    locked: false,
    canTakeOver: false,
    mine: false,
    judgeable: false,
    forWhom: false,
  }).filter((action) => !SUITCASE_ONLY.has(action))
  const extra: ExcursionMenuAction[] = []
  if (line.state !== STATE_SKIPPED && line.mode === ITEM_MODE_BUY_LOCAL) {
    extra.push(line.bought_at === null ? 'markBought' : 'markUnbought')
  }
  if (canJoinPackingList(line)) extra.push('keep')
  if (canAdoptIntoInventory(line)) extra.push('adopt')
  const removal = own.indexOf('remove')
  return removal < 0 ? [...own, ...extra] : [...own.slice(0, removal), ...extra, 'remove']
}
