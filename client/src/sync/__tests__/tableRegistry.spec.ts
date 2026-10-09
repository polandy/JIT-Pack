/**
 * The two halves of a table's codec are held against each other.
 *
 * A row is turned into a domain object by `parse` and back into a row by
 * `encode`, and until C-3b nothing compared the two: the parser lived in a
 * store, the builder in `sync/rows.ts`. A column read by one and
 * not written by the other is not a type error and not a red test — a
 * missing column parses as `null`, which is indistinguishable from a column
 * that is genuinely null.
 *
 * Both directions of the comparison catch a different defect:
 *
 * - **Parsed and not encoded** is a column the optimistic write *blanks*:
 *   the store replaces the row rather than merging into it, so an unrelated
 *   edit drops it until the next pull — and in Local Mode no pull ever comes.
 *   Columns like `trips.source_template_id` and `bought_from` (FR-25.11j)
 *   fail this way where only a person looking would notice.
 * - **Encoded and not parsed** is a column written to the wire that no
 *   reader on this device will ever see again. Its inverse — a column
 *   parsed and written by nobody at all, like `trips.series_name` would be —
 *   leaves the FR-14.3 trend heading falling back to the trip's name on
 *   every device.
 *
 * The comparison reads the source rather than calling the functions,
 * because calling them cannot tell an absent column from a null one — the
 * same reason `rowBuilders.spec.ts` holds its own completeness with
 * `satisfies` instead of an assertion.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { KERNEL_TABLE_SPECS, todoCodec, tripTodoCodec } from '../tableRegistry'
import { ALL_ROW_SPECS, CODEC_SOURCES } from '@/__tests__/rowSpecs'
import { TABLE, TABLE_COLUMNS, type SyncTable } from '@/api/tables'

/** Every file a parser or a builder lives in — the kernel's and each module's `rows.ts`. */
const codecSource = CODEC_SOURCES.map((path) =>
  readFileSync(fileURLToPath(new URL(`../../__tests__/${path}`, import.meta.url)), 'utf8'),
).join('\n')

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

/** The functions a body spreads in — `...rowToTrackFields(id, row)` — whose columns are its own. */
function spreads(body: string): string[] {
  return [...body.matchAll(/\.\.\.(\w+)\(/g)].map((m) => m[1] as string)
}

/** The row columns a parser reads, with those of the parsers it spreads in. */
function parsedColumns(fn: string): Set<string> {
  const body = bodyOf(codecSource, fn)
  return new Set([
    ...[...body.matchAll(/row\['(\w+)'\]/g)].map((m) => m[1] as string),
    ...spreads(body).flatMap((inner) => [...parsedColumns(inner)]),
  ])
}

/** The row columns a builder writes, with those of the builders it spreads in. */
function encodedColumns(fn: string): Set<string> {
  const body = bodyOf(codecSource, fn)
  return new Set([
    ...[...body.matchAll(/^ {4}(\w+):/gm)].map((m) => m[1] as string),
    ...spreads(body).flatMap((inner) => [...encodedColumns(inner)]),
  ])
}

/**
 * The pairs, named by the functions rather than read off the specs —
 * a source-level check needs the source-level names, and the registry is
 * asserted below to hold exactly these tables.
 */
const PAIRS: Array<{ table: SyncTable; parse: string; encode: string; encodeOnly?: string[] }> = [
  { table: TABLE.items, parse: 'rowToItem', encode: 'masterItemRow' },
  { table: TABLE.itemDependencies, parse: 'rowToDependency', encode: 'dependencyRow' },
  { table: TABLE.templates, parse: 'rowToTemplate', encode: 'templateRow' },
  { table: TABLE.templateItems, parse: 'rowToTemplateItem', encode: 'templateItemRow' },
  { table: TABLE.tripSeries, parse: 'rowToSeries', encode: 'seriesRow' },
  { table: TABLE.shoppingEntries, parse: 'rowToShoppingEntry', encode: 'shoppingEntryRow' },
  { table: TABLE.ideas, parse: 'rowToIdea', encode: 'ideaRow' },
  { table: TABLE.ideaVotes, parse: 'rowToIdeaVote', encode: 'ideaVoteRow' },
  { table: TABLE.ideaComments, parse: 'rowToIdeaComment', encode: 'ideaCommentRow' },
  { table: TABLE.ideaImages, parse: 'rowToIdeaImage', encode: 'ideaImageRow' },
  { table: TABLE.dayEntries, parse: 'rowToDayEntry', encode: 'dayEntryRow' },
  { table: TABLE.dayEntryTravelers, parse: 'rowToDayEntryTraveler', encode: 'dayEntryTravelerRow' },
  { table: TABLE.meals, parse: 'rowToMeal', encode: 'mealRow' },
  { table: TABLE.mealIngredients, parse: 'rowToMealIngredient', encode: 'mealIngredientRow' },
  { table: TABLE.ideaTracks, parse: 'rowToIdeaTrack', encode: 'ideaTrackRow' },
  {
    table: TABLE.excursionTracks,
    parse: 'rowToExcursionTrack',
    encode: 'excursionTrackRow',
  },
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
  // FR-7.2: `comments` is read three ways — a note, an item todo, a trip
  // todo — and `is_task` is the column the *store* routes on, before any
  // parser runs, so every builder writes it and none reads it. The two
  // todo codecs are not in `KERNEL_TABLE_SPECS` (it is keyed by table), so they are
  // named here by hand.
  { table: TABLE.comments, parse: 'rowToComment', encode: 'commentRow', encodeOnly: ['is_task'] },
  { table: TABLE.comments, parse: 'rowToTodo', encode: 'todoRow', encodeOnly: ['is_task'] },
  // FR-7.4: a trip todo has no anchor by definition — the builder writes
  // the null `trip_item_id` and the parser has nothing to read from it.
  {
    table: TABLE.comments,
    parse: 'rowToTripTodo',
    encode: 'tripTodoRow',
    encodeOnly: ['trip_item_id', 'is_task'],
  },
  { table: TABLE.noteAcks, parse: 'rowToNoteAck', encode: 'noteAckRow' },
  { table: TABLE.excursions, parse: 'rowToExcursion', encode: 'excursionRow' },
  {
    table: TABLE.excursionTravelers,
    parse: 'rowToExcursionTraveler',
    encode: 'excursionTravelerRow',
  },
  { table: TABLE.excursionItems, parse: 'rowToExcursionItem', encode: 'excursionItemRow' },
]

describe('every codec pair agrees about its columns', () => {
  it.each(PAIRS)('$table: $parse', ({ parse, encode, encodeOnly = [] }) => {
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

/**
 * The tables with a parser and no builder in `rows.ts`. There is no pair to
 * compare, but the parser can still read a column the schema never declared —
 * null on every device, like a drifted pair.
 */
const PARSE_ONLY: Array<{ table: SyncTable; parse: string }> = [
  { table: TABLE.tags, parse: 'rowToTag' },
  { table: TABLE.taskTags, parse: 'rowToTaskTag' },
  { table: TABLE.itemTags, parse: 'rowToItemTag' },
  { table: TABLE.templateIncludes, parse: 'rowToInclude' },
  { table: TABLE.templateItemTasks, parse: 'rowToTask' },
  { table: TABLE.templateTasks, parse: 'rowToTemplateTask' },
  { table: TABLE.tripTemplateSources, parse: 'rowToTemplateSource' },
  { table: TABLE.tripGeneratedPositions, parse: 'rowToGeneratedPosition' },
  { table: TABLE.tripAppliedChanges, parse: 'rowToAppliedChange' },
]

/**
 * Both halves agreeing is not yet both halves being right: a column read and
 * written by a pair the schema never declared — `trips.series_name` — passes
 * the comparison above and is null on every device. The column lists are
 * generated from `schema.sql` (ARCH-11), so this holds the pair to the table.
 */
describe('every column a codec pair names is one the schema declares', () => {
  it.each(PAIRS)('$table: $parse', ({ table, parse, encode }) => {
    const declared = new Set<string>(TABLE_COLUMNS[table])
    const named = new Set([...parsedColumns(parse), ...encodedColumns(encode)])

    expect(
      [...named].filter((c) => !declared.has(c)),
      `${parse}/${encode} name columns schema.sql does not declare on ${table}`,
    ).toEqual([])
  })
})

describe('every column a parser without a builder reads is one the schema declares', () => {
  it.each(PARSE_ONLY)('$table', ({ table, parse }) => {
    const declared = new Set<string>(TABLE_COLUMNS[table])

    expect(
      [...parsedColumns(parse)].filter((c) => !declared.has(c)),
      `${parse} reads columns schema.sql does not declare on ${table}`,
    ).toEqual([])
  })
})

describe('the registry covers the wire', () => {
  it('names every table in TABLE, and only those', () => {
    expect(Object.keys(ALL_ROW_SPECS).sort()).toEqual(Object.values(TABLE).sort())
  })

  it('pairs every table a builder exists for', () => {
    const encoded = Object.entries(ALL_ROW_SPECS)
      .filter(([, codec]) => 'encode' in codec)
      .map(([table]) => table)
      .sort()
    expect(encoded).toEqual([...new Set(PAIRS.map((p) => p.table))].sort())
  })

  it('names the todo codecs of comments by the functions they hold', () => {
    const named = PAIRS.filter((p) => p.table === TABLE.comments).map((p) => [p.parse, p.encode])
    for (const codec of [KERNEL_TABLE_SPECS[TABLE.comments], todoCodec, tripTodoCodec]) {
      expect(named).toContainEqual([codec.parse.name, codec.encode?.name])
    }
  })

  it('lists every table without a builder as parse-only', () => {
    const parseOnly = Object.entries(ALL_ROW_SPECS)
      .filter(([, codec]) => !('encode' in codec))
      .map(([table]) => table)
      .sort()
    expect(parseOnly).toEqual(PARSE_ONLY.map((p) => p.table).sort())
  })
})
