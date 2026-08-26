/**
 * M15 spreadsheet import (FR-16.1–16.3, NFR-4.7): CSV parsing with
 * delimiter detection, grid analysis (item column, trip columns,
 * category rows and a category column, '?' noise), near-duplicate
 * matching, and the final import plan.
 */
import { describe, it, expect } from 'vitest'

import {
  analyzeGrid,
  buildImportPlan,
  findDuplicates,
  parseTripDate,
  parseSpreadsheet,
} from '@/domain/spreadsheet'
import type { MasterItem } from '@/types/domain'

function masterItem(id: string, name: string): MasterItem {
  return {
    id,
    name,
    weight_grams: null,
    value_cents: null,
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
    expect(analysis.tripColumns.map((t) => t.name)).toEqual(['2023', '2024', '2025'])
  })

  it('suggests rows without any quantities as category rows', () => {
    expect(analysis.categoryRows).toEqual([1, 4])
    expect(analysis.categoryColumn).toBeNull()
  })

  it('reads a lone year header as both the name and the date (FR-16.1)', () => {
    expect(analysis.headerRows).toBe(1)
    expect(analysis.tripColumns.map((t) => t.date)).toEqual(['2023', '2024', '2025'])
  })
})

/*
 * The layout a decade-old family spreadsheet actually has (FR-16.1, found
 * 2026-08-23 on a real 34-column sheet): the column header is two rows —
 * the year above the trip's name — and the category is its own column,
 * forward-filled, rather than a grouping row.
 */
const twoRowHeaderCSV = [
  ',,2016,2016,2017',
  ',,Sjas,Laos,Moskau',
  'Schuhe,Wanderschuhe,1,1,',
  ',Sandalen,1,,2',
  'Unterwäsche,Socken,9,9,9',
].join('\n')

describe('analyzeGrid — two-row header and category column (FR-16.1)', () => {
  const grid = parseSpreadsheet(twoRowHeaderCSV)
  const analysis = analyzeGrid(grid)

  it('counts the leading rows that carry no quantity as the header block', () => {
    expect(analysis.headerRows).toBe(2)
  })

  it('names each trip from the header row that names them, not from the year row', () => {
    expect(analysis.tripColumns.map((t) => t.name)).toEqual(['Sjas', 'Laos', 'Moskau'])
  })

  it('takes the date from the header row that parses as one', () => {
    expect(analysis.tripColumns.map((t) => t.date)).toEqual(['2016', '2016', '2017'])
  })

  it('finds the item column beside the category column, not the category column', () => {
    expect(analysis.itemColumn).toBe(1)
    expect(analysis.categoryColumn).toBe(0)
  })

  it('suggests no category rows once a category column carries them', () => {
    // Without this, an item nobody ever packed reads as a category heading:
    // the rule that finds category rows is "no quantity anywhere".
    expect(analysis.categoryRows).toEqual([])
  })
})

/*
 * An inventory with no history at all (FR-16.1, added 2026-08-23): the sheet
 * is a list of things, not a matrix. Nothing distinguishes a category row from
 * an item row without a quantity column to be empty in — so the wizard must
 * claim neither, and the user ticks the categories.
 */
const inventoryOnlyCSV = [
  'Kategorie,Artikel',
  'Schuhe,Wanderschuhe',
  ',Sandalen',
  'Bad,Handtuch',
].join('\n')

/** The same thing without even a category column: a bare list of names. */
const bareListCSV = ['Artikel', 'Wanderschuhe', 'Sandalen', 'Handtuch'].join('\n')

describe('analyzeGrid — a bare list with nothing but names (FR-16.1)', () => {
  const grid = parseSpreadsheet(bareListCSV)
  const analysis = analyzeGrid(grid)

  it('claims no category rows, because every row qualifies once there are none', () => {
    // "A row with no quantity in any trip column" is vacuously true for every
    // row when there is no trip column, so the whole list read as headings and
    // the import produced categories and not one item.
    expect(analysis.tripColumns).toEqual([])
    expect(analysis.categoryRows).toEqual([])
  })

  it('imports every row as an item', () => {
    const plan = buildImportPlan(
      grid,
      {
        headerRows: analysis.headerRows,
        itemColumn: analysis.itemColumn,
        categoryColumn: analysis.categoryColumn,
        categoryRows: analysis.categoryRows,
        trips: [],
      },
      new Map(),
    )
    expect(plan.items.map((i) => i.name)).toEqual(['Wanderschuhe', 'Sandalen', 'Handtuch'])
    expect(plan.newCategories).toEqual([])
  })
})

describe('analyzeGrid — an inventory with no trip columns (FR-16.1)', () => {
  const grid = parseSpreadsheet(inventoryOnlyCSV)
  const analysis = analyzeGrid(grid)

  it('finds no trip columns and claims no category rows', () => {
    expect(analysis.tripColumns).toEqual([])
    // Every row is "empty in all trip columns" when there are none, and the
    // old rule therefore turned the whole inventory into category headings.
    expect(analysis.categoryRows).toEqual([])
  })

  it('still finds the item column and its category column', () => {
    expect(analysis.itemColumn).toBe(1)
    expect(analysis.categoryColumn).toBe(0)
  })
})

describe('buildImportPlan — an inventory with no trips (FR-16.1/16.2)', () => {
  it('imports the items and creates no trip', () => {
    const grid = parseSpreadsheet(inventoryOnlyCSV)
    const a = analyzeGrid(grid)
    const plan = buildImportPlan(
      grid,
      {
        headerRows: a.headerRows,
        itemColumn: a.itemColumn,
        categoryColumn: a.categoryColumn,
        categoryRows: a.categoryRows,
        trips: [],
      },
      new Map(),
    )

    expect(plan.trips).toEqual([])
    expect(plan.items.map((i) => i.name)).toEqual(['Wanderschuhe', 'Sandalen', 'Handtuch'])
    expect(plan.items.map((i) => i.categoryName)).toEqual(['Schuhe', 'Schuhe', 'Bad'])
  })
})

/*
 * The same thing listed twice in one sheet (FR-16.3, found 2026-08-23 on the
 * owner's file, where "Regenhosen" and "Tele" each appear under two
 * categories). `items` is UNIQUE (name), so the second row was refused at the
 * wire and its amounts were lost — silently, because the dedup step compares
 * the file against the *inventory* and never against itself.
 */
const repeatedNameCSV = [
  'Kategorie,Artikel,2024,2025',
  'Hosen,Regenhosen,1,1',
  'Velo,regenhosen ,,3',
  ',Pumpe?,1,',
  ',Pumpe,,2',
].join('\n')

describe('buildImportPlan — a name repeated inside one file (FR-16.3)', () => {
  const grid = parseSpreadsheet(repeatedNameCSV)
  const analysis = analyzeGrid(grid)
  const mapping = {
    headerRows: analysis.headerRows,
    itemColumn: analysis.itemColumn,
    categoryColumn: analysis.categoryColumn,
    categoryRows: analysis.categoryRows,
    trips: analysis.tripColumns.map((t) => ({
      column: t.index,
      name: t.name,
      ...parseTripDate(t.date)!,
      seriesId: null,
    })),
  }
  const plan = buildImportPlan(grid, mapping, new Map())

  it('folds the repeats into one item, keeping the first spelling and category', () => {
    expect(plan.items.map((i) => i.name)).toEqual(['Regenhosen', 'Pumpe'])
    expect(plan.items[0]!.categoryName).toBe('Hosen')
  })

  it('merges the amounts per trip, taking the larger of the two rows', () => {
    const amounts = plan.trips.map((t) => [t.name, t.items.map((i) => i.quantity)])
    // 2024: only the first row has Regenhosen (1) and only the '?' row has
    // Pumpe (1). 2025: Regenhosen 1 vs 3 → 3, Pumpe 2.
    expect(amounts).toEqual([
      ['2024', [1, 1]],
      ['2025', [3, 2]],
    ])
  })

  it('keeps the open task when either row carried the question mark (NFR-4.7)', () => {
    expect(plan.items.find((i) => i.name === 'Pumpe')!.hasOpenTask).toBe(true)
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

describe('parseTripDate', () => {
  it.each([
    // UX-5: a bare year stays a bare year — no Dec-31 is fabricated.
    ['2024', { year: 2024, endDate: null }],
    ['2026-08-10', { year: 2026, endDate: '2026-08-10' }],
    ['nonsense', null],
    ['', null],
  ] as const)('%s → %o', (input, want) => {
    expect(parseTripDate(input)).toEqual(want)
  })
})

describe('buildImportPlan (FR-16.2, NFR-4.7)', () => {
  const grid = parseSpreadsheet(legacyCSV)
  const mapping = {
    headerRows: 1,
    itemColumn: 0,
    categoryColumn: null,
    categoryRows: [1, 4],
    trips: [
      { column: 1, name: 'Engadin 2023', year: 2023, endDate: null, seriesId: 'ser-1' },
      { column: 3, name: 'Engadin 2025', year: 2025, endDate: null, seriesId: 'ser-1' },
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
    expect(t2023).toMatchObject({
      name: 'Engadin 2023',
      // FR-2.1b: the one required temporal fact, and the column that the
      // schema refuses a trip without.
      year: 2023,
      endDate: null,
      seriesId: 'ser-1',
    })
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
        trips: [{ column: 2, name: 'Engadin 2024', year: 2024, endDate: null, seriesId: null }],
      },
      new Map(),
    )
    const socken = plan.items.findIndex((i) => i.name === 'Socken')
    const entry = plan.trips[0]!.items.find((ti) => ti.itemIndex === socken)
    expect(entry?.quantity).toBe(1)
  })
})

describe('buildImportPlan — two-row header and category column (FR-16.1/16.2)', () => {
  const grid = parseSpreadsheet(twoRowHeaderCSV)
  const analysis = analyzeGrid(grid)
  const mapping = {
    headerRows: analysis.headerRows,
    itemColumn: analysis.itemColumn,
    categoryColumn: analysis.categoryColumn,
    categoryRows: analysis.categoryRows,
    trips: analysis.tripColumns.map((t) => ({
      column: t.index,
      name: t.name,
      ...parseTripDate(t.date)!,
      seriesId: null,
    })),
  }

  it('does not turn a header row into an item', () => {
    const plan = buildImportPlan(grid, mapping, new Map())
    expect(plan.items.map((i) => i.name)).toEqual(['Wanderschuhe', 'Sandalen', 'Socken'])
  })

  it('forward-fills the category column down its rows', () => {
    const plan = buildImportPlan(grid, mapping, new Map())
    expect(plan.newCategories).toEqual(['Schuhe', 'Unterwäsche'])
    expect(plan.items.map((i) => i.categoryName)).toEqual(['Schuhe', 'Schuhe', 'Unterwäsche'])
  })

  it('carries each trip year, which the schema requires (FR-2.1b)', () => {
    const plan = buildImportPlan(grid, mapping, new Map())
    expect(plan.trips.map((t) => [t.name, t.year, t.endDate])).toEqual([
      ['Sjas', 2016, null],
      ['Laos', 2016, null],
      ['Moskau', 2017, null],
    ])
  })
})
