/**
 * M15 spreadsheet import (FR-16.1–16.3, NFR-4.7) — pure, no I/O.
 *
 * Parses the classic legacy layout (rows = items with category grouping
 * rows, columns = trips with quantities), suggests a mapping, matches
 * near-duplicates against the master inventory, and builds the final
 * import plan the orchestrator commits as ordinary mutations.
 *
 * Client-side by decision: FR-19.4 lists the spreadsheet import as
 * Local-Mode feature parity, so it cannot live in a server RPC.
 * CSV only (comma / semicolon / tab, auto-detected); XLSX is deferred —
 * a parser dependency fails the footprint bar (NFR-4.3), and every
 * spreadsheet tool exports CSV.
 */

import type { MasterItem } from '@/types/domain'

// --- Parsing ---

/** parseSpreadsheet splits CSV text into a grid, auto-detecting the delimiter. */
export function parseSpreadsheet(text: string): string[][] {
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const pushCell = () => {
    row.push(cell.trim())
    cell = ''
  }
  const pushRow = () => {
    pushCell()
    if (row.some((c) => c !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === delimiter) pushCell()
    else if (ch === '\n') pushRow()
    else if (ch !== '\r') cell += ch
  }
  if (cell !== '' || row.length > 0) pushRow()
  return rows
}

function detectDelimiter(text: string): string {
  const sample = text.slice(0, 2000)
  let best = ','
  let bestCount = -1
  for (const candidate of [';', ',', '\t']) {
    const count = sample.split(candidate).length - 1
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

// --- Analysis (FR-16.1) ---

export interface TripColumnGuess {
  index: number
  /** The column's own label, from the header row that names the trips. */
  name: string
  /** A year or ISO date read from the header, '' when none is there. */
  date: string
}

export interface GridAnalysis {
  /**
   * Leading rows that describe the columns rather than an item. A decade-old
   * family spreadsheet routinely spends two on it — the year above the trip's
   * name — and reading only the first names every trip after its year.
   */
  headerRows: number
  /** Column holding the item names (most non-quantity text). */
  itemColumn: number
  /**
   * Column holding the item's category, forward-filled down the rows, or
   * null when the sheet groups by category *rows* instead. Both layouts are
   * in the wild and neither is a variant of the other.
   */
  categoryColumn: number | null
  /** Candidate trip columns with their header labels. */
  tripColumns: TripColumnGuess[]
  /** Suggested category grouping rows (no quantities anywhere). */
  categoryRows: number[]
}

export function analyzeGrid(grid: string[][]): GridAnalysis {
  const width = Math.max(0, ...grid.map((r) => r.length))
  // The two answers depend on each other: which rows are header depends on
  // where the item names are, and counting those names has to skip the
  // header. A provisional guess under the old one-row assumption breaks it.
  const headerRows = countHeaderRows(grid, pickTextColumn(grid, width, 1))
  const itemColumn = pickTextColumn(grid, width, headerRows)

  const quantityColumns: number[] = []
  for (let col = 0; col < width; col++) {
    if (col === itemColumn) continue
    const hasQuantity = grid.some(
      (r, rowIdx) => rowIdx >= headerRows && parseQuantity(r[col] ?? '') !== null,
    )
    if (hasQuantity) quantityColumns.push(col)
  }

  const { nameRow, dateRow } = pickHeaderRows(grid, headerRows, quantityColumns)
  const tripColumns: TripColumnGuess[] = quantityColumns.map((col) => {
    const date = dateRow === null ? '' : (grid[dateRow]?.[col] ?? '')
    // A sheet whose only header is the year names its trips by it, which is
    // what this wizard has always done — and better than "Trip 3".
    const name = nameRow === null ? date : (grid[nameRow]?.[col] ?? '')
    return { index: col, name, date }
  })

  const categoryColumn = findCategoryColumn(grid, width, headerRows, itemColumn, quantityColumns)

  /*
   * "A row with no quantity in any trip column" only means a heading while
   * there is a trip column for it to be empty in. With a category column it
   * means an item nobody ever packed; with no trip column at all it is
   * vacuously true of every row, and an inventory-only sheet would import as
   * nothing but categories. In both cases the ticks are the user's to make.
   */
  const categoryRows: number[] = []
  if (categoryColumn === null && tripColumns.length > 0) {
    for (let rowIdx = headerRows; rowIdx < grid.length; rowIdx++) {
      const name = grid[rowIdx]?.[itemColumn] ?? ''
      if (name === '') continue
      const empty = tripColumns.every((t) => (grid[rowIdx]?.[t.index] ?? '') === '')
      if (empty) categoryRows.push(rowIdx)
    }
  }

  return { headerRows, itemColumn, categoryColumn, tripColumns, categoryRows }
}

/** pickTextColumn returns the column with the most non-quantity text below `from`. */
function pickTextColumn(grid: string[][], width: number, from: number): number {
  let column = 0
  let bestText = -1
  for (let col = 0; col < width; col++) {
    let text = 0
    for (let rowIdx = from; rowIdx < grid.length; rowIdx++) {
      const value = grid[rowIdx]?.[col] ?? ''
      if (value !== '' && parseQuantity(value) === null) text++
    }
    if (text > bestText) {
      bestText = text
      column = col
    }
  }
  return column
}

/**
 * The header block is the leading rows that name no item. Counting rows
 * without a *quantity* would not do: a year reads as one, so a header row of
 * years is indistinguishable from a row of amounts by its cells alone.
 * There is always at least one header row — every sheet labels its columns.
 */
function countHeaderRows(grid: string[][], itemColumn: number): number {
  let rows = 0
  while (rows < grid.length && (grid[rows]?.[itemColumn] ?? '').trim() === '') rows++
  return Math.min(Math.max(1, rows), Math.max(0, grid.length - 1))
}

/**
 * Which header row names the trips and which one dates them, decided over
 * the whole block rather than per column: a stray cell in an otherwise empty
 * header row would otherwise become one trip's name.
 */
function pickHeaderRows(
  grid: string[][],
  headerRows: number,
  quantityColumns: number[],
): { nameRow: number | null; dateRow: number | null } {
  let dateRow: number | null = null
  let dateHits = 0
  let nameRow: number | null = null
  let nameHits = 0

  for (let rowIdx = 0; rowIdx < headerRows; rowIdx++) {
    let dates = 0
    let names = 0
    for (const col of quantityColumns) {
      const value = (grid[rowIdx]?.[col] ?? '').trim()
      if (value === '') continue
      if (normalizeTripDate(value) !== null) dates++
      else names++
    }
    if (dates > dateHits) {
      dateHits = dates
      dateRow = rowIdx
    }
    if (names > nameHits) {
      nameHits = names
      nameRow = rowIdx
    }
  }
  return { nameRow, dateRow }
}

/**
 * A category column is the one column beside the item names that carries
 * sparse text and no quantities — the layout where "Schuhe" sits left of
 * "Wanderschuhe" instead of above it.
 */
function findCategoryColumn(
  grid: string[][],
  width: number,
  headerRows: number,
  itemColumn: number,
  quantityColumns: number[],
): number | null {
  const quantity = new Set(quantityColumns)
  let best: number | null = null
  let bestText = 0
  for (let col = 0; col < width; col++) {
    if (col === itemColumn || quantity.has(col)) continue
    let text = 0
    for (let rowIdx = headerRows; rowIdx < grid.length; rowIdx++) {
      const value = (grid[rowIdx]?.[col] ?? '').trim()
      if (value !== '' && parseQuantity(value) === null) text++
    }
    if (text > bestText) {
      bestText = text
      best = col
    }
  }
  return best
}

/** parseQuantity reads a cell as a quantity: integers, or x/✓ marks as 1. */
export function parseQuantity(value: string): number | null {
  const v = value.trim().toLowerCase()
  if (v === '') return null
  if (v === 'x' || v === '✓' || v === '✔') return 1
  const n = Number(v.replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.ceil(n)
}

/** normalizeTripDate accepts a bare year (→ Dec 31) or a full ISO date. */
export function normalizeTripDate(input: string): string | null {
  const v = input.trim()
  if (/^\d{4}$/.test(v)) return `${v}-12-31`
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))) return v
  return null
}

// --- Deduplication (FR-16.3) ---

export interface DedupMatch {
  imported: string
  existingId: string
  existingName: string
  /** Exact (normalized) matches merge without a prompt. */
  exact: boolean
}

export function findDuplicates(names: string[], existing: MasterItem[]): DedupMatch[] {
  const matches: DedupMatch[] = []
  for (const name of names) {
    const normalized = normalize(name)
    let best: DedupMatch | null = null
    for (const item of existing) {
      const existingNorm = normalize(item.name)
      if (normalized === existingNorm) {
        best = { imported: name, existingId: item.id, existingName: item.name, exact: true }
        break
      }
      if (
        levenshtein(normalized, existingNorm) <= 2 &&
        Math.min(normalized.length, existingNorm.length) >= 4
      ) {
        best ??= { imported: name, existingId: item.id, existingName: item.name, exact: false }
      }
    }
    if (best) matches.push(best)
  }
  return matches
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3 // early out, we only care about ≤2
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j]! + 1,
        curr[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = curr
  }
  return prev[b.length]!
}

// --- Import plan (FR-16.2) ---

export interface ImportMapping {
  /** Leading rows that describe the columns; never items. */
  headerRows: number
  itemColumn: number
  /** Forward-filled category column, or null when categories are rows. */
  categoryColumn: number | null
  categoryRows: number[]
  /** Included trip columns only (FR-16.1: user-selected). */
  trips: { column: number; name: string; endDate: string; seriesId: string | null }[]
}

export interface ImportPlanItem {
  name: string
  categoryName: string | null
  /** Merge target from the dedup step; null creates a new master item. */
  existingItemId: string | null
  /** NFR-4.7: a trailing '?' became an open task on every occurrence. */
  hasOpenTask: boolean
}

export interface ImportPlanTrip {
  name: string
  /**
   * FR-2.1b: the one required temporal fact, read off the end date the
   * mapping validated. `trips.year` is NOT NULL, so a trip without it is
   * refused by the server rather than imported.
   */
  year: number
  endDate: string
  seriesId: string | null
  items: { itemIndex: number; quantity: number }[]
}

export interface ImportPlan {
  newCategories: string[]
  items: ImportPlanItem[]
  trips: ImportPlanTrip[]
}

/**
 * buildImportPlan resolves the mapped grid into categories, items
 * (merged per the dedup decisions: imported name → existing item id),
 * and archived trips with their original quantities.
 */
export function buildImportPlan(
  grid: string[][],
  mapping: ImportMapping,
  mergeDecisions: Map<string, string>,
): ImportPlan {
  const categoryRows = new Set(mapping.categoryRows)
  const newCategories: string[] = []
  const items: ImportPlanItem[] = []
  const rowToItemIndex = new Map<number, number>()

  // FR-16.3: `items` is UNIQUE (name), so a name the sheet lists twice is one
  // item — the dedup step catches it against the inventory but never against
  // the file itself, and the second insert is refused at the wire.
  const itemIndexByName = new Map<string, number>()

  let currentCategory: string | null = null
  for (let rowIdx = mapping.headerRows; rowIdx < grid.length; rowIdx++) {
    if (mapping.categoryColumn !== null) {
      // A category column names the category on the row where it changes and
      // stays silent afterwards, so it is carried forward rather than read.
      const cell = (grid[rowIdx]?.[mapping.categoryColumn] ?? '').trim()
      if (cell !== '') {
        currentCategory = cell
        if (!newCategories.includes(cell)) newCategories.push(cell)
      }
    }
    const raw = (grid[rowIdx]?.[mapping.itemColumn] ?? '').trim()
    if (raw === '') continue
    if (categoryRows.has(rowIdx)) {
      currentCategory = raw
      if (!newCategories.includes(raw)) newCategories.push(raw)
      continue
    }
    const hasOpenTask = raw.endsWith('?')
    const name = hasOpenTask ? raw.replace(/\?+$/, '').trim() : raw

    const seen = itemIndexByName.get(normalize(name))
    if (seen !== undefined) {
      // The first row keeps the spelling and the category; a question mark on
      // either occurrence is a question about the thing, not about the row.
      rowToItemIndex.set(rowIdx, seen)
      if (hasOpenTask) items[seen]!.hasOpenTask = true
      continue
    }

    itemIndexByName.set(normalize(name), items.length)
    rowToItemIndex.set(rowIdx, items.length)
    items.push({
      name,
      categoryName: currentCategory,
      existingItemId: mergeDecisions.get(name) ?? null,
      hasOpenTask,
    })
  }

  const trips: ImportPlanTrip[] = mapping.trips.map((trip) => {
    // Keyed by item rather than by row, because two rows may now be one item.
    // Where both carry an amount for the same trip they describe one packing,
    // so the larger is the honest answer — adding them would invent luggage.
    const byItem = new Map<number, number>()
    for (const [rowIdx, itemIndex] of rowToItemIndex) {
      const quantity = parseQuantity(grid[rowIdx]?.[trip.column] ?? '')
      if (quantity === null) continue
      byItem.set(itemIndex, Math.max(byItem.get(itemIndex) ?? 0, quantity))
    }
    const tripItems = [...byItem].map(([itemIndex, quantity]) => ({ itemIndex, quantity }))
    return {
      name: trip.name,
      year: tripYear(trip.endDate),
      endDate: trip.endDate,
      seriesId: trip.seriesId,
      items: tripItems,
    }
  })

  return { newCategories, items, trips }
}

/**
 * tripYear reads FR-2.1b's required year off the end date the mapping has
 * already validated through normalizeTripDate, which is why it can be a
 * plain slice: a bare year became `YYYY-12-31` there.
 */
function tripYear(endDate: string): number {
  return Number(endDate.slice(0, 4))
}
