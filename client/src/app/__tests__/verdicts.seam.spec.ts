/**
 * FR-9.6: a verdict and its reason are one act — the row's three verdict
 * columns and, when a reason was typed, an FR-7.1 comment on the row — and
 * the undo takes back both (FR-25.31).
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createVerdictActions } from '../actions/verdicts'
import { createCommentActions } from '../actions/comments'
import { makeSeamContext, pullIn, type Recorded, type SeamContext } from './seamContext'
import { TABLE } from '@/api/tables'
import { VERDICT_FEWER, VERDICT_MISSING, VERDICT_UNUSED } from '@/domain/verdict'

const TRIP_ID = 'trip-1'
const ROW_ID = 'ti-akku'

let queued: Recorded[]
let ctx: SeamContext

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued } = makeSeamContext())
})

function build(c: SeamContext) {
  return createVerdictActions(c, { comments: createCommentActions(c) })
}

/** A row with four packed, judged *unnötig* already — so a change has something to replace. */
function seedRow(over: Record<string, unknown> = {}) {
  pullIn(ctx.tripStore, TABLE.tripItems, ROW_ID, {
    trip_id: TRIP_ID,
    name: 'Akku',
    quantity: 4,
    packed_count: 4,
    state: 'packed',
    mode: 'pack',
    late_packer: 0,
    flag_unused: 1,
    flag_missing: 0,
    needed_quantity: null,
    ...over,
  })
}

const muts = () => queued.flatMap((q) => q.muts).map((m) => m.mutation)

describe('setVerdict — one verdict and its reason, one act (FR-9.6)', () => {
  it('writes the verdict alone, the other two cleared, and no comment for a blank reason', () => {
    seedRow()

    const undo = build(ctx).setVerdict(TRIP_ID, ROW_ID, VERDICT_FEWER, 2, '   ')

    expect(queued).toHaveLength(1)
    expect(muts()).toHaveLength(1)
    expect(muts()[0]).toMatchObject({
      table: TABLE.tripItems,
      id: ROW_ID,
      fields: { flag_missing: 0, flag_unused: 0, needed_quantity: 2 },
    })
    expect(undo).toEqual({
      tripId: TRIP_ID,
      rowId: ROW_ID,
      previous: { flag_missing: false, flag_unused: true, needed_quantity: null },
      commentId: null,
    })
  })

  it('adds the reason as a comment on the row, in the same write (FR-7.1)', () => {
    seedRow()

    const undo = build(ctx).setVerdict(TRIP_ID, ROW_ID, VERDICT_UNUSED, undefined, ' zwei reichen ')

    expect(queued).toHaveLength(1)
    const [verdict, comment] = muts()
    expect(verdict).toMatchObject({ table: TABLE.tripItems, fields: { flag_unused: 1 } })
    expect(comment).toMatchObject({
      op: 'insert',
      table: TABLE.comments,
      fields: { trip_id: TRIP_ID, trip_item_id: ROW_ID, body: 'zwei reichen' },
    })
    expect(undo?.commentId).toBe(comment!.id)
  })

  it('clears every verdict for null', () => {
    seedRow({ flag_unused: 0, flag_missing: 1 })

    build(ctx).setVerdict(TRIP_ID, ROW_ID, null)

    expect(muts()[0]!.fields).toEqual({ flag_missing: 0, flag_unused: 0, needed_quantity: null })
  })

  it('writes nothing for a row that is not on the trip', () => {
    expect(build(ctx).setVerdict(TRIP_ID, 'ti-gone', VERDICT_MISSING)).toBeNull()
    expect(queued).toEqual([])
  })

  it('refuses a needed quantity outside the range before anything is written', () => {
    seedRow()

    expect(() => build(ctx).setVerdict(TRIP_ID, ROW_ID, VERDICT_FEWER, 4, 'Grund')).toThrow(
      RangeError,
    )
    expect(queued).toEqual([])
  })
})

describe('undoVerdict — the act taken back (FR-25.31, FR-9.6)', () => {
  it('restores the previous verdict fields and removes the comment the act added', () => {
    seedRow()
    const acts = build(ctx)
    const undo = acts.setVerdict(TRIP_ID, ROW_ID, VERDICT_FEWER, 3, 'drei reichen')!
    queued.length = 0

    acts.undoVerdict(undo)

    const [restore, removal] = muts()
    expect(restore).toMatchObject({
      table: TABLE.tripItems,
      id: ROW_ID,
      fields: { flag_missing: 0, flag_unused: 1, needed_quantity: null },
    })
    expect(removal).toMatchObject({ op: 'delete', table: TABLE.comments, id: undo.commentId })
    expect(muts()).toHaveLength(2)
  })

  it('removes no comment when the act added none', () => {
    seedRow()
    const acts = build(ctx)
    const undo = acts.setVerdict(TRIP_ID, ROW_ID, VERDICT_MISSING)!
    queued.length = 0

    acts.undoVerdict(undo)

    expect(muts().map((m) => m.table)).toEqual([TABLE.tripItems])
  })
})
