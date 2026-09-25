/**
 * FR-7.9/FR-7.13 — trip notes: a thread read by every traveller, ticked per
 * person, and new again when somebody else writes in it.
 */
import { describe, it, expect } from 'vitest'

import {
  entryStamp,
  firstUnseenReply,
  latestReply,
  noteMenuEntries,
  myAckFor,
  newNoteCount,
  newTripNotes,
  noteAckState,
  noteThreads,
  threadName,
  type DashboardNoteTrip,
} from '../tripNotes'
import type { ItemComment, NoteAck } from '@/types/domain'

const ME = 'u-anna'
const BEN = 'u-ben'
const CHRIS = 'u-chris'

function note(over: Partial<ItemComment> = {}): ItemComment {
  return {
    id: 'note-1',
    trip_id: 'trip-a',
    trip_item_id: null,
    author_id: BEN,
    body: 'Schlüsselfach: 4711',
    created_at: '2026-09-20T10:00:00Z',
    parent_id: null,
    title: null,
    edited_at: null,
    ...over,
  }
}

function reply(id: string, author: string, at: string, over: Partial<ItemComment> = {}) {
  return note({
    id,
    author_id: author,
    body: `Antwort ${id}`,
    created_at: at,
    parent_id: 'note-1',
    ...over,
  })
}

function ack(over: Partial<NoteAck> = {}): NoteAck {
  return {
    id: 'ack-1',
    trip_id: 'trip-a',
    comment_id: 'note-1',
    user_id: ME,
    acked: true,
    seen_through: '2026-09-20T10:00:00Z',
    ...over,
  }
}

function only<T>(list: readonly T[]): T {
  expect(list).toHaveLength(1)
  return list[0]!
}

describe('noteThreads — the shape (FR-7.13)', () => {
  it('gathers each first note with its replies, in the order they were written', () => {
    const thread = only(
      noteThreads(
        [
          note(),
          reply('r2', ME, '2026-09-20T12:00:00Z'),
          reply('r1', CHRIS, '2026-09-20T11:00:00Z'),
        ],
        [],
        ME,
      ),
    )
    expect(thread.root.id).toBe('note-1')
    expect(thread.replies.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(thread.participants).toEqual([BEN, CHRIS, ME])
    expect(latestReply(thread)?.id).toBe('r2')
  })

  it('keeps an edited reply where it was written — an edit does not move it', () => {
    const thread = only(
      noteThreads(
        [
          note(),
          reply('r1', CHRIS, '2026-09-20T11:00:00Z', { edited_at: '2026-09-20T13:00:00Z' }),
          reply('r2', ME, '2026-09-20T12:00:00Z'),
        ],
        [],
        ME,
      ),
    )
    expect(thread.replies.map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('has no latest reply before anyone answered', () => {
    expect(latestReply(only(noteThreads([note()], [], ME)))).toBeNull()
  })

  it('orders threads by their latest activity — a reply lifts an old thread (question 1)', () => {
    const threads = noteThreads(
      [
        note({ id: 'old', created_at: '2026-09-18T08:00:00Z' }),
        note({ id: 'new', created_at: '2026-09-20T08:00:00Z' }),
        reply('r1', CHRIS, '2026-09-21T08:00:00Z', { parent_id: 'old' }),
      ],
      [],
      ME,
    )
    expect(threads.map((t) => t.root.id)).toEqual(['old', 'new'])
    expect(threads[0]!.lastActivity).toBe('2026-09-21T08:00:00Z')
  })

  it('drops a reply whose first note is not held — nothing to hang it on', () => {
    expect(noteThreads([reply('r1', CHRIS, '2026-09-21T08:00:00Z')], [], ME)).toEqual([])
  })

  it('names an untitled thread by its first line', () => {
    expect(threadName(note({ body: 'Pizza Bella 079 555 12 34\nab 18 Uhr' }))).toBe(
      'Pizza Bella 079 555 12 34',
    )
    expect(threadName(note({ title: 'Schlüsselbox' }))).toBe('Schlüsselbox')
  })

  it('stamps an entry with its edit when it has one', () => {
    expect(entryStamp(note())).toBe('2026-09-20T10:00:00Z')
    expect(entryStamp(note({ edited_at: '2026-09-22T09:00:00Z' }))).toBe('2026-09-22T09:00:00Z')
  })
})

describe('noteThreads — new for me (FR-7.13 §3)', () => {
  it('is new while I have not ticked it, counting every entry by somebody else', () => {
    const thread = only(noteThreads([note(), reply('r1', CHRIS, '2026-09-20T11:00:00Z')], [], ME))
    expect(thread.unseen.map((e) => e.id)).toEqual(['r1', 'note-1'])
    expect(thread.ticked).toBe(false)
  })

  it('is new even before the server has stamped it — nothing read is not the earliest moment', () => {
    const thread = only(noteThreads([note({ created_at: null })], [], ME))
    expect(thread.unseen.map((e) => e.id)).toEqual(['note-1'])
  })

  it('is seen once ticked through its newest entry', () => {
    const thread = only(
      noteThreads(
        [note(), reply('r1', CHRIS, '2026-09-20T11:00:00Z')],
        [ack({ seen_through: '2026-09-20T11:00:00Z' })],
        ME,
      ),
    )
    expect(thread.unseen).toEqual([])
    expect(thread.ticked).toBe(true)
  })

  it('a reply after my tick makes it new again, and only that reply counts', () => {
    const thread = only(
      noteThreads([note(), reply('r1', CHRIS, '2026-09-21T09:00:00Z')], [ack()], ME),
    )
    expect(thread.unseen.map((e) => e.id)).toEqual(['r1'])
    expect(thread.ticked).toBe(false)
  })

  it('an edit by somebody else after my tick re-opens it (question 3)', () => {
    const thread = only(
      noteThreads([note({ body: 'Code 4712', edited_at: '2026-09-21T09:00:00Z' })], [ack()], ME),
    )
    expect(thread.unseen.map((e) => e.id)).toEqual(['note-1'])
  })

  it('a tick from before threads (no seen_through) covers the first note as it was', () => {
    const legacy = ack({ seen_through: null })
    expect(only(noteThreads([note()], [legacy], ME)).unseen).toEqual([])
    const withReply = only(
      noteThreads([note(), reply('r1', CHRIS, '2026-09-21T09:00:00Z')], [legacy], ME),
    )
    expect(withReply.unseen.map((e) => e.id)).toEqual(['r1'])
  })

  it('an un-ticked ack counts for nothing', () => {
    const thread = only(noteThreads([note()], [ack({ acked: false })], ME))
    expect(thread.unseen.map((e) => e.id)).toEqual(['note-1'])
  })

  it("somebody else's tick is not mine", () => {
    expect(only(noteThreads([note()], [ack({ user_id: CHRIS })], ME)).unseen).toHaveLength(1)
  })

  it('replying is not ticking, but what I answered is behind me (question 4)', () => {
    const thread = only(
      noteThreads(
        [
          note(),
          reply('r1', CHRIS, '2026-09-20T11:00:00Z'),
          reply('r2', ME, '2026-09-20T12:00:00Z'),
        ],
        [],
        ME,
      ),
    )
    expect(thread.unseen).toEqual([])
    // Not ticked either — nothing new, but no tick was given.
    expect(thread.ticked).toBe(false)
  })

  it('my own entries are never new for me', () => {
    const thread = only(noteThreads([note({ author_id: ME })], [], ME))
    expect(thread.unseen).toEqual([])
    expect(thread.tickable).toBe(false)
  })

  it('my own thread becomes tickable once somebody else answers', () => {
    const thread = only(
      noteThreads([note({ author_id: ME }), reply('r1', BEN, '2026-09-20T11:00:00Z')], [], ME),
    )
    expect(thread.tickable).toBe(true)
    expect(thread.unseen.map((e) => e.id)).toEqual(['r1'])
  })

  it('without an identity nothing is ever new or tickable (Single-User/Local, G-8)', () => {
    const thread = only(noteThreads([note(), reply('r1', CHRIS, '2026-09-20T11:00:00Z')], [], null))
    expect(thread.unseen).toEqual([])
    expect(thread.tickable).toBe(false)
  })

  it('the tick reaches the newest stamp in the thread, edits included', () => {
    const thread = only(
      noteThreads(
        [note({ edited_at: '2026-09-23T08:00:00Z' }), reply('r1', CHRIS, '2026-09-21T09:00:00Z')],
        [],
        ME,
      ),
    )
    expect(thread.seenThrough).toBe('2026-09-23T08:00:00Z')
  })
})

describe("firstUnseenReply — the thread view's divider (FR-7.13)", () => {
  it('stands above the first reply I have not seen, in reading order', () => {
    const thread = only(
      noteThreads(
        [
          note(),
          reply('r1', CHRIS, '2026-09-20T11:00:00Z'),
          reply('r2', BEN, '2026-09-20T12:00:00Z'),
          reply('r3', CHRIS, '2026-09-20T13:00:00Z'),
        ],
        [ack({ seen_through: '2026-09-20T11:00:00Z' })],
        ME,
      ),
    )
    expect(firstUnseenReply(thread)?.id).toBe('r2')
  })

  it('is absent when the whole thread is new — the first note is itself unseen', () => {
    const thread = only(noteThreads([note(), reply('r1', CHRIS, '2026-09-20T11:00:00Z')], [], ME))
    expect(firstUnseenReply(thread)).toBeNull()
  })

  it('is absent when nothing is new', () => {
    const thread = only(
      noteThreads(
        [note(), reply('r1', CHRIS, '2026-09-20T11:00:00Z')],
        [ack({ seen_through: '2026-09-20T11:00:00Z' })],
        ME,
      ),
    )
    expect(firstUnseenReply(thread)).toBeNull()
  })
})

describe("noteMenuEntries — an entry's menu (FR-7.13 question 2)", () => {
  it('offers the author copy, edit and delete', () => {
    expect(noteMenuEntries(true)).toEqual(['copy', 'edit', 'remove'])
  })

  it('offers everyone else copy and delete, never edit', () => {
    expect(noteMenuEntries(false)).toEqual(['copy', 'remove'])
  })
})

describe('newNoteCount — the notes pill (FR-7.13)', () => {
  it('counts the unseen entries across every thread', () => {
    const notes = [
      note(),
      reply('r1', CHRIS, '2026-09-20T11:00:00Z'),
      note({ id: 'note-2', author_id: CHRIS }),
      note({ id: 'mine', author_id: ME }),
    ]
    expect(newNoteCount(notes, [], ME)).toBe(3)
    expect(newNoteCount(notes, [], null)).toBe(0)
  })
})

describe('myAckFor / noteAckState (FR-7.9 decision 3)', () => {
  it('finds my own ack row and nobody else’s', () => {
    expect(myAckFor('note-1', [ack({ user_id: CHRIS })], ME)).toBeNull()
    expect(myAckFor('note-1', [ack()], ME)?.id).toBe('ack-1')
    expect(myAckFor('note-1', [ack()], null)).toBeNull()
  })

  it('names every reader whose tick stands, and not an un-ticked one', () => {
    const state = noteAckState(
      'note-1',
      [ack(), ack({ id: 'ack-2', user_id: CHRIS, acked: false })],
      ME,
    )
    expect([...state.ackedBy]).toEqual([ME])
    expect(state.mine?.id).toBe('ack-1')
  })
})

describe('newTripNotes — M1 (FR-7.13 §4)', () => {
  function trip(tripId: string, notes: ItemComment[], acks: NoteAck[] = []): DashboardNoteTrip {
    return { tripId, tripName: `Reise ${tripId}`, notes, acks }
  }

  it('lists one row per thread with something new, its newest unseen entry and how many more', () => {
    const rows = newTripNotes(
      [
        trip('a', [
          note({ title: 'Schlüsselbox' }),
          reply('r1', CHRIS, '2026-09-20T11:00:00Z'),
          reply('r2', CHRIS, '2026-09-20T12:00:00Z'),
        ]),
      ],
      ME,
    )
    const row = only(rows)
    expect(row.thread.root.id).toBe('note-1')
    expect(row.latest.id).toBe('r2')
    expect(row.more).toBe(2)
    expect(row.tripName).toBe('Reise a')
  })

  it('orders by the newest unseen entry across trips and stops at the limit', () => {
    const rows = newTripNotes(
      [
        trip('a', [note({ id: 'a1', created_at: '2026-09-20T08:00:00Z' })]),
        trip('b', [
          note({ id: 'b1', created_at: '2026-09-20T09:00:00Z' }),
          note({ id: 'b2', created_at: '2026-09-20T07:00:00Z' }),
        ]),
      ],
      ME,
      2,
    )
    expect(rows.map((r) => r.thread.root.id)).toEqual(['b1', 'a1'])
  })

  it('leaves a thread out once it is ticked through its newest entry', () => {
    expect(newTripNotes([trip('a', [note()], [ack()])], ME)).toEqual([])
  })

  it('has nothing without an identity', () => {
    expect(newTripNotes([trip('a', [note()])], null)).toEqual([])
  })
})
