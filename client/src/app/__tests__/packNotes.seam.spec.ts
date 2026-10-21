/**
 * The pack-note group runs on a context, not on the orchestrator (R-4):
 * what a typed note stores, and that it writes the note and nothing else.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createPackNoteActions } from '../actions/packNotes'
import { makeSeamContext, pullIn, type Recorded, type SeamContext } from './seamContext'
import { TABLE } from '@/api/tables'
import type { TripItem } from '@/types/domain'

let queued: Recorded[]
let ctx: SeamContext

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued } = makeSeamContext())
})

describe('pack-note actions (FR-25.33)', () => {
  it.each([
    ['stores what was typed, trimmed', '  Jeans ', 'Jeans'],
    ['a blank entry clears the note to NULL', '   ', null],
    [
      'a note past 60 characters is cut, never refused by the column',
      'a'.repeat(70),
      'a'.repeat(60),
    ],
  ])('setPackNote %s, and writes nothing else', (_name, typed, stored) => {
    pullIn(ctx.tripStore, TABLE.tripItems, 'ti-1', {
      trip_id: 'trip-1',
      name: 'Lange Hose',
      quantity: 1,
      packed_count: 1,
      state: 'packed',
      mode: 'pack',
    })
    const item = ctx.tripStore.getItems('trip-1').find((row) => row.id === 'ti-1') as TripItem

    createPackNoteActions(ctx).setPackNote(item, typed)

    expect(queued).toHaveLength(1)
    expect(queued[0]!.muts[0]!.mutation.fields).toEqual({ pack_note: stored })
  })
})
