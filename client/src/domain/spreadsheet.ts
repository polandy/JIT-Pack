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
  header: string
}

export interface GridAnalysis {
  /** Column holding the item names (most non-quantity text). */
  itemColumn: number
  /** Candidate trip columns with their header-row label. */
  tripColumns: TripColumnGuess[]
  /** Suggested category grouping rows (no quantities anywhere). */
  categoryRows: number[]
}

export function analyzeGrid(grid: string[][]): GridAnalysis {
  const width = Math.max(0, ...grid.map((r) => r.length))

  let itemColumn = 0
  let bestText = -1
  for (let col = 0; col < width; col++) {
    let text = 0
    for (let rowIdx = 1; rowIdx < grid.length; rowIdx++) {
      const value = grid[rowIdx][col] ?? ''
      if (value !== '' && parseQuantity(value) === null) text++
    }
    if (text > bestText) {
      bestText = text
      itemColumn = col
    }
  }

  const tripColumns: TripColumnGuess[] = []
  for (let col = 0; col < width; col++) {
    if (col === itemColumn) continue
    const hasQuantity = grid.some((r, rowIdx) => rowIdx > 0 && parseQuantity(r[col] ?? '') !== null)
    if (!hasQuantity) continue
    tripColumns.push({ index: col, header: grid[0][col] ?? '' })
  }

  const categoryRows: number[] = []
  for (let rowIdx = 1; rowIdx < grid.length; rowIdx++) {
    const name = grid[rowIdx][itemColumn] ?? ''
    if (name === '') continue
    const empty = tripColumns.every((t) => (grid[rowIdx][t.index] ?? '') === '')
    if (empty) categoryRows.push(rowIdx)
  }

  return { itemColumn, tripColumns, categoryRows }
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
      if (levenshtein(normalized, existingNorm) <= 2 && Math.min(normalized.length, existingNorm.length) >= 4) {
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
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = curr
  }
  return prev[b.length]
}

// --- Import plan (FR-16.2) ---

export interface ImportMapping {
  itemColumn: number
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

  let currentCategory: string | null = null
  for (let rowIdx = 1; rowIdx < grid.length; rowIdx++) {
    const raw = (grid[rowIdx][mapping.itemColumn] ?? '').trim()
    if (raw === '') continue
    if (categoryRows.has(rowIdx)) {
      currentCategory = raw
      if (!newCategories.includes(raw)) newCategories.push(raw)
      continue
    }
    const hasOpenTask = raw.endsWith('?')
    const name = hasOpenTask ? raw.replace(/\?+$/, '').trim() : raw
    rowToItemIndex.set(rowIdx, items.length)
    items.push({
      name,
      categoryName: currentCategory,
      existingItemId: mergeDecisions.get(name) ?? null,
      hasOpenTask,
    })
  }

  const trips: ImportPlanTrip[] = mapping.trips.map((trip) => {
    const tripItems: { itemIndex: number; quantity: number }[] = []
    for (const [rowIdx, itemIndex] of rowToItemIndex) {
      const quantity = parseQuantity(grid[rowIdx][trip.column] ?? '')
      if (quantity !== null) tripItems.push({ itemIndex, quantity })
    }
    return { name: trip.name, endDate: trip.endDate, seriesId: trip.seriesId, items: tripItems }
  })

  return { newCategories, items, trips }
}
