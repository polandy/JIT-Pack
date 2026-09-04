/**
 * The two halves of a table's codec are held against each other.
 *
 * A row is turned into a domain object by `parse` and back into a row by
 * `encode`, and until C-3b nothing compared the two: the parser lived in a
 * store, the builder in `composables/sync/rows.ts`. A column read by one and
 * not written by the other is not a type error and not a red test — a
 * missing column parses as `null`, which is indistinguishable from a column
 * that is genuinely null.
 *
 * Both directions of the comparison catch a different defect:
 *
 * - **Parsed and not encoded** is a column the optimistic write *blanks*:
 *   the store replaces the row rather than merging into it, so an unrelated
 *   edit drops it until the next pull — and in Local Mode no pull ever comes.
 *   `trips.source_template_id` (#158) and `bought_from` (FR-25.11j) were
 *   exactly this, both found by a person looking.
 * - **Encoded and not parsed** is a column written to the wire that no
 *   reader on this device will ever see again. `trips.series_name` was the
 *   inverse of it — parsed and written by nobody at all, so the FR-14.3
 *   trend heading fell back to the trip's name on every device there has
 *   ever been.
 *
 * The comparison reads the source rather than calling the functions,
 * because calling them cannot tell an absent column from a null one — the
 * same reason `rowBuilders.spec.ts` holds its own completeness with
 * `satisfies` instead of an assertion.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TABLE_CODECS } from '../tableRegistry'
import { TABLE, type SyncTable } from '@/types/tables'

const registrySource = readFileSync(
  fileURLToPath(new URL('../tableRegistry.ts', import.meta.url)),
  'utf8',
)
const buildersSource = readFileSync(
  fileURLToPath(new URL('../../composables/sync/rows.ts', import.meta.url)),
  'utf8',
)

/** The body of a top-level function, by name. */
function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`)
  expect(start, `${name} not found`).toBeGreaterThan(-1)
  const open = source.indexOf('{', source.indexOf(')', start))
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(open, i)
  }
  throw new Error(`unbalanced body for ${name}`)
}

/** The row columns a parser reads. */
function parsedColumns(fn: string): Set<string> {
  return new Set(
    [...bodyOf(registrySource, fn).matchAll(/row\['(\w+)'\]/g)].map((m) => m[1] as string),
  )
}

/** The row columns a builder writes. */
function encodedColumns(fn: string): Set<string> {
  return new Set(
    [...bodyOf(buildersSource, fn).matchAll(/^ {4}(\w+):/gm)].map((m) => m[1] as string),
  )
}

/**
 * The pairs, named by the functions rather than read off `TABLE_CODECS` —
 * a source-level check needs the source-level names, and the registry is
 * asserted below to hold exactly these tables.
 */
const PAIRS: Array<{ table: SyncTable; parse: string; encode: string; encodeOnly?: string[] }> = [
  { table: TABLE.items, parse: 'rowToItem', encode: 'masterItemRow' },
  { table: TABLE.itemDependencies, parse: 'rowToDependency', encode: 'dependencyRow' },
  { table: TABLE.templates, parse: 'rowToTemplate', encode: 'templateRow' },
  { table: TABLE.templateItems, parse: 'rowToTemplateItem', encode: 'templateItemRow' },
  { table: TABLE.tripSeries, parse: 'rowToSeries', encode: 'seriesRow' },
  { table: TABLE.destinationProfiles, parse: 'rowToProfile', encode: 'profileRow' },
  {
    table: TABLE.destinationChecklistItems,
    parse: 'rowToChecklistItem',
    encode: 'checklistItemRow',
  },
  { table: TABLE.trips, parse: 'rowToTrip', encode: 'tripRow' },
  { table: TABLE.tripMembers, parse: 'rowToMember', encode: 'memberRow' },
  { table: TABLE.tripItems, parse: 'rowToTripItem', encode: 'itemRow' },
  { table: TABLE.travelers, parse: 'rowToTraveler', encode: 'travelerRow' },
  { table: TABLE.containers, parse: 'rowToContainer', encode: 'containerRow' },
  // FR-7.2: `is_task` is the column the *store* routes on, before either
  // parser runs, so both builders write it and neither reads it.
  { table: TABLE.comments, parse: 'rowToComment', encode: 'commentRow', encodeOnly: ['is_task'] },
]

describe('every codec pair agrees about its columns', () => {
  it.each(PAIRS)('$table', ({ parse, encode, encodeOnly = [] }) => {
    const parsed = parsedColumns(parse)
    const encoded = encodedColumns(encode)

    expect(
      [...parsed].filter((c) => !encoded.has(c)),
      `${parse} reads columns ${encode} does not write — an optimistic write blanks them`,
    ).toEqual([])
    expect(
      [...encoded].filter((c) => !parsed.has(c)),
      `${encode} writes columns ${parse} never reads back`,
    ).toEqual(encodeOnly)
  })
})

describe('the registry covers the wire', () => {
  it('names every table in TABLE, and only those', () => {
    expect(Object.keys(TABLE_CODECS).sort()).toEqual(Object.values(TABLE).sort())
  })

  it('pairs every table a builder exists for', () => {
    const encoded = Object.entries(TABLE_CODECS)
      .filter(([, codec]) => 'encode' in codec)
      .map(([table]) => table)
      .sort()
    expect(encoded).toEqual(PAIRS.map((p) => p.table).sort())
  })
})
