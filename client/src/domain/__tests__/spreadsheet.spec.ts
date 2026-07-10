/**
 * M15 spreadsheet import (FR-16.1–16.3, NFR-4.7): CSV parsing with
 * delimiter detection, grid analysis (item column, trip columns,
 * category rows, '?' noise), near-duplicate matching, and the final
 * import plan.
 */
import { describe, it, expect } from 'vitest'

import {
  analyzeGrid,
  buildImportPlan,
  findDuplicates,
  normalizeTripDate,
  parseSpreadsheet,
} from '@/domain/spreadsheet'
import type { MasterItem } from '@/types/domain'

function masterItem(id: string, name: string): MasterItem {
  return {
    id,
    name,
    category_id: null,
    weight_grams: null,
    value_cents: null,
    is_consumable: false,
    unit: 'pieces',
    per_day_rate: null,
  }
}

// The classic legacy layout: header row, category rows, item rows.
const legacyCSV = [
  'Gegenstand;2023;2024;2025',
  'Kleidung;;;',
  'Unterhosen;5;6;6',
  'Socken;5;x;6',
  'Ausrüstung;;;',
  'Regenschutz Rucksack?;1;;1',
  ';;;',
].join('\r\n')

describe('parseSpreadsheet', () => {
  it('detects semicolon delimiters and handles CRLF + trailing empty row', () => {
    const grid = parseSpreadsheet(legacyCSV)
    expect(grid[0]).toEqual(['Gegenstand', '2023', '2024', '2025'])
    expect(grid[2]).toEqual(['Unterhosen', '5', '6', '6'])
    expect(grid).toHaveLength(6) // fully empty trailing row dropped
  })

  it('parses comma CSV with quoted fields containing the delimiter', () => {
    const grid = parseSpreadsheet('Item,2024\n"Socken, dick",3\n')
    expect(grid[1]).toEqual(['Socken, dick', '3'])
  })

  it('parses tab-separated input', () => {
    const grid = parseSpreadsheet('Item\t2024\nSocken\t3')
    expect(grid[1]).toEqual(['Socken', '3'])
  })
})

describe('analyzeGrid (FR-16.1, NFR-4.7)', () => {
  const grid = parseSpreadsheet(legacyCSV)
  const analysis = analyzeGrid(grid)

  it('finds the item-name column and the trip columns with headers', () => {
    expect(analysis.itemColumn).toBe(0)
    expect(analysis.tripColumns.map((t) => t.header)).toEqual(['2023', '2024', '2025'])
  })

  it('suggests rows without any quantities as category rows', () => {
    expect(analysis.categoryRows).toEqual([1, 4])
  })
})

describe('findDuplicates (FR-16.3)', () => {
  const existing = [masterItem('i1', 'Unterhosen'), masterItem('i2', 'Regenjacke')]

  it('marks case-insensitive exact matches as exact', () => {
    const matches = findDuplicates(['unterhosen '], existing)
    expect(matches).toEqual([
      { imported: 'unterhosen ', existingId: 'i1', existingName: 'Unterhosen', exact: true },
    ])
  })

  it('suggests near matches within small edit distance', () => {
    const matches = findDuplicates(['Unterhose'], existing)
    expect(matches[0]).toMatchObject({ existingId: 'i1', exact: false })
  })

  it('stays quiet for unrelated names', () => {
    expect(findDuplicates(['Zelt'], existing)).toHaveLength(0)
  })
})

describe('normalizeTripDate', () => {
  it.each([
    ['2024', '2024-12-31'],
    ['2026-08-10', '2026-08-10'],
    ['nonsense', null],
    ['', null],
  ])('%s → %s', (input, want) => {
    expect(normalizeTripDate(input)).toBe(want)
  })
})

describe('buildImportPlan (FR-16.2, NFR-4.7)', () => {
  const grid = parseSpreadsheet(legacyCSV)
  const mapping = {
    itemColumn: 0,
    categoryRows: [1, 4],
    trips: [
      { column: 1, name: 'Engadin 2023', endDate: '2023-12-31', seriesId: 'ser-1' },
      { column: 3, name: 'Engadin 2025', endDate: '2025-12-31', seriesId: 'ser-1' },
    ],
  }

  it('groups items under category rows and merges decided duplicates', () => {
    const plan = buildImportPlan(grid, mapping, new Map([['Unterhosen', 'i1']]))

    expect(plan.newCategories).toEqual(['Kleidung', 'Ausrüstung'])
    const unterhosen = plan.items.find((i) => i.name === 'Unterhosen')!
    expect(unterhosen).toMatchObject({ existingItemId: 'i1', categoryName: 'Kleidung' })
    const socken = plan.items.find((i) => i.name === 'Socken')!
    expect(socken).toMatchObject({ existingItemId: null, categoryName: 'Kleidung' })
  })

  it('strips trailing question marks into an open task (NFR-4.7)', () => {
    const plan = buildImportPlan(grid, mapping, new Map())
    const regen = plan.items.find((i) => i.name === 'Regenschutz Rucksack')!
    expect(regen.hasOpenTask).toBe(true)
    expect(regen.categoryName).toBe('Ausrüstung')
  })

  it('builds archived trips with original quantities, x marks as 1, gaps omitted', () => {
    const plan = buildImportPlan(grid, mapping, new Map())

    expect(plan.trips).toHaveLength(2)
    const t2023 = plan.trips[0]!
    expect(t2023).toMatchObject({ name: 'Engadin 2023', endDate: '2023-12-31', seriesId: 'ser-1' })
    const quantities = t2023.items.map((ti) => ({
      name: plan.items[ti.itemIndex]!.name,
      quantity: ti.quantity,
    }))
    expect(quantities).toEqual([
      { name: 'Unterhosen', quantity: 5 },
      { name: 'Socken', quantity: 5 },
      { name: 'Regenschutz Rucksack', quantity: 1 },
    ])

    // 2025: Socken column has 'x' in 2024 (not imported) — 2025 has 6.
    const t2025 = plan.trips[1]!
    expect(t2025.items.map((ti) => ti.quantity)).toEqual([6, 6, 1])
  })

  it('treats x marks as quantity 1', () => {
    const plan = buildImportPlan(
      grid,
      {
        ...mapping,
        trips: [{ column: 2, name: 'Engadin 2024', endDate: '2024-12-31', seriesId: null }],
      },
      new Map(),
    )
    const socken = plan.items.findIndex((i) => i.name === 'Socken')
    const entry = plan.trips[0]!.items.find((ti) => ti.itemIndex === socken)
    expect(entry?.quantity).toBe(1)
  })
})
