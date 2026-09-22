/**
 * FR-7.9 — trip notes: a comment read by every traveller, ticked per person.
 */
import { describe, it, expect } from 'vitest'

import {
  isNoteNewForMe,
  myAckFor,
  newTripNotes,
  noteAckState,
  tripNoteRows,
  type DashboardNoteTrip,
} from '../tripNotes'
import type { ItemComment, NoteAck } from '@/types/domain'

const ME = 'u-anna'
const OTHER = 'u-ben'

function note(over: Partial<ItemComment> = {}): ItemComment {
  return {
    id: 'note-1',
    trip_id: 'trip-a',
    trip_item_id: null,
    author_id: OTHER,
    body: 'Schlüsselfach: 4711',
    created_at: '2026-09-20T10:00:00Z',
    ...over,
  }
}

function ack(over: Partial<NoteAck> = {}): NoteAck {
  return {
    id: 'ack-1',
    trip_id: 'trip-a',
    comment_id: 'note-1',
    user_id: ME,
    acked: true,
    ...over,
  }
}

describe('isNoteNewForMe (FR-7.9 decision 4)', () => {
  it('is new when somebody else wrote it and I have not ticked it', () => {
    expect(isNoteNewForMe(note(), [], ME)).toBe(true)
  })

  it('is never new once my own ack row says acked', () => {
    expect(isNoteNewForMe(note(), [ack()], ME)).toBe(false)
  })

  it('stays new while my ack row exists but says un-ticked', () => {
    expect(isNoteNewForMe(note(), [ack({ acked: false })], ME)).toBe(true)
  })

  it('is never new for the person who wrote it, ticked or not', () => {
    expect(isNoteNewForMe(note({ author_id: ME }), [], ME)).toBe(false)
  })

  it('is never new without an identity (Single-User/Local, G-8)', () => {
    expect(isNoteNewForMe(note(), [], null)).toBe(false)
  })

  it('reads only my own tick, never a co-traveller’s', () => {
    expect(isNoteNewForMe(note(), [ack({ user_id: 'u-chris' })], ME)).toBe(true)
  })
})

describe('myAckFor', () => {
  it('finds my own row among several readers’ ticks', () => {
    const acks = [ack({ id: 'ack-ben', user_id: OTHER }), ack({ id: 'ack-anna', user_id: ME })]
    expect(myAckFor('note-1', acks, ME)?.id).toBe('ack-anna')
  })

  it('is null where I have never ticked the note', () => {
    expect(myAckFor('note-1', [], ME)).toBeNull()
  })

  it('is null without an identity', () => {
    expect(myAckFor('note-1', [ack()], null)).toBeNull()
  })
})

describe('noteAckState (FR-7.9 decision 3)', () => {
  it('names everyone who ticked, not only me', () => {
    const acks = [ack({ id: 'a1', user_id: ME }), ack({ id: 'a2', user_id: 'u-chris' })]
    const state = noteAckState('note-1', acks, ME)
    expect(state.ackedBy).toEqual(new Set([ME, 'u-chris']))
    expect(state.mine?.id).toBe('a1')
  })

  it('leaves out a reader whose row says un-ticked', () => {
    const acks = [ack({ user_id: 'u-chris', acked: false })]
    expect(noteAckState('note-1', acks, ME).ackedBy).toEqual(new Set())
  })
})

describe('tripNoteRows (FR-7.9 §4)', () => {
  it('orders newest first and marks which are new to me', () => {
    const notes = [
      note({ id: 'old', created_at: '2026-09-01T00:00:00Z' }),
      note({ id: 'new', created_at: '2026-09-20T00:00:00Z' }),
    ]
    const rows = tripNoteRows(notes, [], ME)
    expect(rows.map((r) => r.note.id)).toEqual(['new', 'old'])
    expect(rows.every((r) => r.isNew)).toBe(true)
  })

  it('sinks a note I have ticked below the unticked ones, muted', () => {
    const notes = [
      note({ id: 'ticked', created_at: '2026-09-20T00:00:00Z' }),
      note({ id: 'unticked', created_at: '2026-09-01T00:00:00Z' }),
    ]
    const acks = [ack({ comment_id: 'ticked' })]
    const rows = tripNoteRows(notes, acks, ME)
    expect(rows.map((r) => r.note.id)).toEqual(['unticked', 'ticked'])
    expect(rows.find((r) => r.note.id === 'ticked')?.ackedByMe).toBe(true)
    expect(rows.find((r) => r.note.id === 'unticked')?.ackedByMe).toBe(false)
  })
})

describe('newTripNotes (FR-7.9 decision 1, M1)', () => {
  const trips: DashboardNoteTrip[] = [
    {
      tripId: 'trip-a',
      tripName: 'Laos',
      notes: [
        note({ id: 'a-old', created_at: '2026-09-01T00:00:00Z' }),
        note({ id: 'a-mine', author_id: ME, created_at: '2026-09-22T00:00:00Z' }),
      ],
      acks: [],
    },
    {
      tripId: 'trip-b',
      tripName: 'Moskau',
      notes: [note({ id: 'b-new', created_at: '2026-09-21T00:00:00Z' })],
      acks: [],
    },
  ]

  it('gathers new notes by others across trips, newest first, and names the trip', () => {
    const rows = newTripNotes(trips, ME)
    expect(rows.map((r) => r.note.id)).toEqual(['b-new', 'a-old'])
    expect(rows[0]).toMatchObject({ tripId: 'trip-b', tripName: 'Moskau' })
  })

  it('never lists my own note (decision 4)', () => {
    expect(newTripNotes(trips, ME).map((r) => r.note.id)).not.toContain('a-mine')
  })

  it('caps at the given limit, the newest kept', () => {
    expect(newTripNotes(trips, ME, 1).map((r) => r.note.id)).toEqual(['b-new'])
  })

  it('is empty without an identity (Single-User/Local, G-8)', () => {
    expect(newTripNotes(trips, null)).toEqual([])
  })
})
