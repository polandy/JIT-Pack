/**
 * FR-27.16: a trip row keeps the name it was generated with, and M4 can take
 * the inventory's current name over on request.
 *
 * A row copies its master item's name when it is written (`trip_items.name`),
 * and the only path that ever carried a rename across afterwards is FR-27.4 —
 * which, by design, asks about a group's rows only, never touches a packed,
 * skipped or hand-edited one, and never a past trip. Everything outside that
 * keeps its old name for good. This is the rest: every row whose inventory item
 * is now called something else, offered as a choice rather than written.
 *
 * Nothing here is stored. What differs is recomputed from the two names each
 * time, so a device needs no "declined" flag and there is nothing to sync.
 */
import type { GeneratedPosition, MasterItem, TripItem } from '@/types/domain'

/** One name a trip can take over from the inventory. */
export interface InventoryRename {
  /** Stable across renders: the master item and the name being replaced. */
  key: string
  sourceItemId: string
  /** The name the rows carry now. */
  from: string
  /** The inventory's current name. */
  to: string
  /**
   * Every row this choice renames. More than one when an item is carried per
   * person (FR-25.21): the instances are one thing on M4's cluster, and a
   * choice that renamed only some of them would split it into two names.
   */
  rows: TripItem[]
  /**
   * The trip holds its own name on purpose, so the sheet does not pre-select
   * it. Only a generated row can say so — its ledger entry records the name
   * generation produced, and a row that differs from it was renamed on the
   * trip or had a group rename refused (FR-27.4's „No"). A row added straight
   * from the inventory has no such record and is never deliberate.
   */
  deliberate: boolean
}

/** What `inventoryRenames` reads. */
export interface InventoryRenameInput {
  items: readonly TripItem[]
  masterItems: readonly Pick<MasterItem, 'id' | 'name'>[]
  ledger: readonly GeneratedPosition[]
  /**
   * Rows whose rename FR-27.4 is already asking about. They are left to that
   * card: the same question in two places has two answers that can disagree.
   */
  proposedRowIds: ReadonlySet<string>
}

const KEY_SEPARATOR = '\u0000'

/**
 * inventoryRenames lists every name on the trip that the inventory has moved
 * on from, ordered by the new name so two devices list them alike.
 *
 * A row without a master item — typed free on the trip, or whose item has not
 * synced yet — has nothing to take over and is left out.
 */
export function inventoryRenames(input: InventoryRenameInput): InventoryRename[] {
  const names = new Map(input.masterItems.map((m) => [m.id, m.name]))
  const ledgerByRow = new Map(input.ledger.map((e) => [e.trip_item_id, e]))
  const byKey = new Map<string, InventoryRename>()

  for (const row of input.items) {
    const sourceItemId = row.source_item_id
    if (!sourceItemId) continue
    const to = names.get(sourceItemId)
    if (to === undefined || to === row.name) continue
    if (input.proposedRowIds.has(row.id)) continue

    const entry = ledgerByRow.get(row.id)
    const deliberate = entry !== undefined && entry.name !== row.name
    const key = `${sourceItemId}${KEY_SEPARATOR}${row.name}`
    const found = byKey.get(key)
    if (found) {
      found.rows.push(row)
      found.deliberate = found.deliberate || deliberate
    } else {
      byKey.set(key, { key, sourceItemId, from: row.name, to, rows: [row], deliberate })
    }
  }

  return [...byKey.values()].sort(
    (a, b) => a.to.localeCompare(b.to) || a.from.localeCompare(b.from),
  )
}

/** One row's new name. */
export interface RowRename {
  item: TripItem
  name: string
}

/** Everything taking a set of names over writes. */
export interface NameAdoption {
  rows: RowRename[]
  /**
   * Ledger entries rewritten to the new name. Without this a generated row
   * would read as hand-edited to FR-27.4 from then on — its name no longer
   * matching the snapshot — and quietly stop following its group.
   */
  ledger: GeneratedPosition[]
}

/**
 * planNameAdoption turns the chosen renames into the writes that carry them
 * out. An entry already holding the new name — a refused group rename — is
 * left alone: it says what generation produced, and that has not changed.
 */
export function planNameAdoption(
  chosen: readonly InventoryRename[],
  ledger: readonly GeneratedPosition[],
): NameAdoption {
  const ledgerByRow = new Map(ledger.map((e) => [e.trip_item_id, e]))
  const rows: RowRename[] = []
  const entries: GeneratedPosition[] = []
  for (const rename of chosen) {
    for (const item of rename.rows) {
      rows.push({ item, name: rename.to })
      const entry = ledgerByRow.get(item.id)
      if (entry && entry.name !== rename.to) entries.push({ ...entry, name: rename.to })
    }
  }
  return { rows, ledger: entries }
}

/**
 * planNameRestore is the undo: the same rows back under the names they had,
 * and the ledger entries as they were. The rows need nothing extra — an
 * adoption holds each row as it was before, old name included — but the
 * ledger has to be read from `ledgerBefore`, because the adoption only knows
 * the entries' new names.
 */
export function planNameRestore(
  adoption: NameAdoption,
  ledgerBefore: readonly GeneratedPosition[],
): NameAdoption {
  const previous = new Map(ledgerBefore.map((e) => [e.id, e]))
  return {
    rows: adoption.rows.map(({ item }) => ({ item, name: item.name })),
    ledger: adoption.ledger.flatMap((entry) => {
      const before = previous.get(entry.id)
      return before ? [before] : []
    }),
  }
}
