/**
 * FR-25.13f–i, FR-31.6: `onBrowse` routes every browse-sheet action — what
 * adds to the list's own {@link BrowseAdds}, what acts on the rows a master
 * item already has to the {@link RowPort}. One table, one row per verb, each
 * asserting the whole set of writes it makes and nothing else.
 */
import { describe, expect, it } from 'vitest'
import { computed } from 'vue'

import { useRowUndo } from '@/composables/useRowUndo'
import type { BrowseAction, BrowseAddition } from '@/domain/browseRows'
import { STATE_PACKED, type TripItem } from '@/types/domain'

import type { RowPort } from '../rowPort'
import { useBrowseVerbs, type BrowseAdds } from '../useBrowseVerbs'

function row(id: string, sourceItemId: string, state: TripItem['state']): TripItem {
  return {
    id,
    name: 'Trinkflasche',
    quantity: 1,
    packed_count: state === STATE_PACKED ? 1 : 0,
    state,
    source_item_id: sourceItemId,
    assigned_traveler_id: null,
  } as TripItem
}

/** One master item carried three ways (FR-25.21), and a row of another one. */
const ROWS = [
  row('r-open', 'm1', 'open'),
  row('r-packed', 'm1', 'packed'),
  row('r-skipped', 'm1', 'skipped'),
  row('r-other', 'm2', 'open'),
]

const ITEM: BrowseAddition = {
  name: 'Trinkflasche',
  sourceItemId: 'm1',
  weightGrams: null,
  valueCents: null,
  categoryName: null,
}

type Call = [string, ...unknown[]]

/** A port and an adds whose every write lands in one log, rows named by id. */
function fakes() {
  const calls: Call[] = []
  const log =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args.map((arg) => (isRow(arg) ? arg.id : arg))])
    }
  const announce =
    (name: string) =>
    async (...args: unknown[]) =>
      log(name)(...args)
  const port = {
    rows: computed(() => ROWS),
    travelers: computed(() => []),
    span: computed(() => ({ start: null, end: null })),
    liveRow: () => null,
    inert: () => false,
    setQuantity: log('setQuantity'),
    packIncrement: log('packIncrement'),
    packDecrement: log('packDecrement'),
    packComplete: log('packComplete'),
    packZero: log('packZero'),
    packToggle: log('packToggle'),
    skip: (r: TripItem) => {
      log('skip')(r)
      return [r]
    },
    unskip: log('unskip'),
    restorePacked: log('restorePacked'),
    restoreSkip: log('restoreSkip'),
    rowUndo: useRowUndo(),
    announceAct: announce('announceAct'),
    announcePacked: announce('announcePacked'),
    announceSkipped: announce('announceSkipped'),
  } satisfies RowPort<TripItem>
  const adds: BrowseAdds = {
    add: log('adds.add'),
    addForAll: log('adds.addForAll'),
    assign: log('adds.assign'),
    spread: log('adds.spread'),
  }
  return { calls, onBrowse: useBrowseVerbs(port, () => null).onBrowse(adds) }
}

function isRow(value: unknown): value is TripItem {
  return typeof value === 'object' && value !== null && 'source_item_id' in value
}

/** The undo records a verb on `m1` arms, for the rows it changed. */
function records(...ids: string[]) {
  return ROWS.filter((r) => ids.includes(r.id)).map((r) => ({
    itemId: r.id,
    name: r.name,
    quantity: r.quantity,
    packedCount: r.packed_count,
    state: r.state,
  }))
}

describe('useBrowseVerbs.onBrowse (FR-25.13f–i, FR-31.6)', () => {
  const routes: [string, BrowseAction<BrowseAddition>[], Call[]][] = [
    ['add, open', [{ verb: 'add', item: ITEM }], [['adds.add', ITEM, undefined]]],
    [
      'add, decided',
      [{ verb: 'add', item: ITEM, decided: 'skipped' }],
      [['adds.add', ITEM, 'skipped']],
    ],
    ['addForAll', [{ verb: 'addForAll', item: ITEM }], [['adds.addForAll', ITEM]]],
    [
      'assign',
      [{ verb: 'assign', item: ITEM, travelerIds: ['t1', 't2'] }],
      [['adds.assign', ITEM, ['t1', 't2']]],
    ],
    ['spread', [{ verb: 'spread', itemId: 'm1' }], [['adds.spread', 'm1']]],
    [
      'packCarried — every row of the item not packed yet',
      [{ verb: 'packCarried', itemId: 'm1' }],
      [
        ['packComplete', 'r-open'],
        ['packComplete', 'r-skipped'],
      ],
    ],
    [
      'skipCarried — every row of the item not skipped yet',
      [{ verb: 'skipCarried', itemId: 'm1' }],
      [
        ['skip', 'r-open'],
        ['skip', 'r-packed'],
      ],
    ],
    [
      'reopen — a skipped row unskipped, the others unpacked',
      [{ verb: 'reopen', itemId: 'm1' }],
      [
        ['packZero', 'r-open'],
        ['packZero', 'r-packed'],
        ['unskip', 'r-skipped'],
      ],
    ],
    ['undo with nothing to take back', [{ verb: 'undo', itemId: 'm1' }], []],
    [
      'undo after a pack restores what it packed',
      [
        { verb: 'packCarried', itemId: 'm1' },
        { verb: 'undo', itemId: 'm1' },
      ],
      [
        ['packComplete', 'r-open'],
        ['packComplete', 'r-skipped'],
        ['restorePacked', records('r-open', 'r-skipped')],
      ],
    ],
    [
      'undo after a skip restores what it skipped, once',
      [
        { verb: 'skipCarried', itemId: 'm1' },
        { verb: 'undo', itemId: 'm1' },
        { verb: 'undo', itemId: 'm1' },
      ],
      [
        ['skip', 'r-open'],
        ['skip', 'r-packed'],
        ['restoreSkip', records('r-open', 'r-packed')],
      ],
    ],
  ]

  it.each(routes)('%s', (_, actions, expected) => {
    const { calls, onBrowse } = fakes()
    for (const action of actions) onBrowse(action)
    expect(calls).toEqual(expected)
  })
})
