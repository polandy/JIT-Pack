/**
 * FR-7.9's trip notes, as FR-7.13's threads — pure over rows the device
 * already holds, like every other rule in this directory (invariant 4: Local
 * Mode has no server to derive it there instead).
 *
 * A note is a trip-level `comments` row (FR-7.1's shape, `trip_item_id`
 * null, `is_task = 0`); a reply is one that names its thread's first note in
 * `parent_id`, one level deep. The per-person tick is `note_acks`, on the
 * first note, and says how far it reached (`seen_through`). "New for me" is
 * derived, never stored — the same lesson `packingView.ts`'s `isDone`
 * already carries for a packed row with open prep.
 */

import type { ItemComment, NoteAck } from '@/types/domain'

/** The tick a note's sheet shows for every reader, not only mine. */
export interface NoteAckState {
  /** This device's own ack row for the note, or null if it never ticked it. */
  mine: NoteAck | null
  /** Every user id that has ticked the note (acked = true), for the sheet. */
  ackedBy: ReadonlySet<string>
}

/**
 * When an entry last changed: its edit if it has one, else its writing. What
 * a tick is compared with — an edit by somebody else after my tick re-opens
 * the thread (FR-7.13 question 3). ISO strings compare as time.
 */
export function entryStamp(entry: ItemComment): string {
  const created = entry.created_at ?? ''
  const edited = entry.edited_at ?? ''
  return edited > created ? edited : created
}

/** What a thread is called: its title, or else the first line of its first note. */
export function threadName(root: ItemComment): string {
  return root.title?.trim() || (root.body.split('\n')[0] ?? '')
}

/** One thread, as M25's notes view and M1 read it (FR-7.13). */
export interface NoteThread {
  root: ItemComment
  /**
   * Oldest first, the order a conversation is read in, with the reply field
   * under the last one (the UX rework reversed question 1's newest-first).
   */
  replies: ItemComment[]
  /** The latest stamp in the thread, which is what orders the list. */
  lastActivity: string
  /**
   * Entries by somebody else I have not seen, newest first. Their number is
   * the thread's *neu* count.
   */
  unseen: ItemComment[]
  /** My tick stands and nothing has come since — the checkbox's state. */
  ticked: boolean
  /** There is somebody to tell apart: an identity, and an entry not mine. */
  tickable: boolean
  /** What a tick given now records: the newest stamp in the thread. */
  seenThrough: string
  /** The first note's author, then each replier once, in the order they joined. */
  participants: string[]
}

const newestFirst = (a: ItemComment, b: ItemComment) => entryStamp(b).localeCompare(entryStamp(a))
/** A reply's place is when it was written; an edit does not move it. */
const writtenFirst = (a: ItemComment, b: ItemComment) =>
  (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id)

/**
 * How far I have read a thread: my tick's reach, if it stands, and anything
 * I wrote myself — replying is not ticking (question 4), but what I answered
 * is behind me. A tick from before threads carries no reach, and covers the
 * first note as it was then. Null is „nothing read yet", which is not the
 * same as the earliest moment: an entry with no stamp is still unread.
 */
function readMark(
  root: ItemComment,
  entries: readonly ItemComment[],
  mine: NoteAck | null,
  myUserId: string,
): string | null {
  let mark = mine?.acked ? (mine.seen_through ?? root.created_at ?? '') : null
  for (const entry of entries) {
    const written = entry.created_at
    if (entry.author_id === myUserId && written && (mark === null || written > mark)) {
      mark = written
    }
  }
  return mark
}

function threadOf(
  root: ItemComment,
  replies: ItemComment[],
  acks: readonly NoteAck[],
  myUserId: string | null,
): NoteThread {
  const ordered = [...replies].sort(writtenFirst)
  const entries = [root, ...ordered]
  const stamps = entries.map(entryStamp)
  const lastActivity = stamps.reduce((a, b) => (b > a ? b : a), '')
  const participants = [...new Set(entries.map((e) => e.author_id))]
  const othersWrote = myUserId !== null && entries.some((e) => e.author_id !== myUserId)

  let unseen: ItemComment[] = []
  const mine = myAckFor(root.id, acks, myUserId)
  if (myUserId && othersWrote) {
    const mark = readMark(root, entries, mine, myUserId)
    unseen = entries
      .filter((e) => e.author_id !== myUserId && (mark === null || entryStamp(e) > mark))
      .sort(newestFirst)
  }
  return {
    root,
    replies: ordered,
    lastActivity,
    unseen,
    ticked: othersWrote && mine?.acked === true && unseen.length === 0,
    tickable: othersWrote,
    seenThrough: lastActivity,
    participants,
  }
}

/**
 * Every thread of a trip, the one with the latest activity first (FR-7.13
 * question 1: a reply lifts its thread). `notes` are the trip-level comments
 * — first notes and replies alike; a reply whose first note this device does
 * not hold has nothing to hang on and is left out.
 */
export function noteThreads(
  notes: readonly ItemComment[],
  acks: readonly NoteAck[],
  myUserId: string | null,
): NoteThread[] {
  const replies = new Map<string, ItemComment[]>()
  for (const note of notes) {
    if (!note.parent_id) continue
    const list = replies.get(note.parent_id) ?? []
    list.push(note)
    replies.set(note.parent_id, list)
  }
  return notes
    .filter((note) => !note.parent_id)
    .map((root) => threadOf(root, replies.get(root.id) ?? [], acks, myUserId))
    .sort(
      (a, b) => b.lastActivity.localeCompare(a.lastActivity) || a.root.id.localeCompare(b.root.id),
    )
}

/** The newest reply, which a thread's card quotes — or null before anyone answered. */
export function latestReply(thread: NoteThread): ItemComment | null {
  return thread.replies.at(-1) ?? null
}

/**
 * The reply the thread view's *neu seit deinem letzten Besuch* divider stands
 * above: the first unseen one in reading order. None when the first note is
 * itself unseen — then the whole thread is new, and its card says so.
 */
export function firstUnseenReply(thread: NoteThread): ItemComment | null {
  const unseen = new Set(thread.unseen.map((entry) => entry.id))
  if (unseen.has(thread.root.id)) return null
  return thread.replies.find((reply) => unseen.has(reply.id)) ?? null
}

/** What an entry's menu offers on the thread view, in order. */
export type NoteMenuAction = 'copy' | 'edit' | 'remove'

/**
 * An entry's menu: copying for everyone, editing for its author only
 * (question 2). Deleting stays open to every member, as FR-7.9 has it: a
 * wrong code has to be removable by whoever notices.
 */
export function noteMenuEntries(mine: boolean): NoteMenuAction[] {
  return mine ? ['copy', 'edit', 'remove'] : ['copy', 'remove']
}

/** What the notes view's pill counts: the entries new for me, across threads. */
export function newNoteCount(
  notes: readonly ItemComment[],
  acks: readonly NoteAck[],
  myUserId: string | null,
): number {
  if (!myUserId) return 0
  return noteThreads(notes, acks, myUserId).reduce((n, thread) => n + thread.unseen.length, 0)
}

/** This device's ack row for one note, if any — insert vs. upsert reads this. */
export function myAckFor(
  noteId: string,
  acks: readonly NoteAck[],
  myUserId: string | null,
): NoteAck | null {
  if (!myUserId) return null
  return acks.find((a) => a.comment_id === noteId && a.user_id === myUserId) ?? null
}

/** Every tick of one note, for the sheet's "who has seen this" (decision 3). */
export function noteAckState(
  noteId: string,
  acks: readonly NoteAck[],
  myUserId: string | null,
): NoteAckState {
  const ackedBy = new Set(
    acks.filter((a) => a.comment_id === noteId && a.acked).map((a) => a.user_id),
  )
  return { mine: myAckFor(noteId, acks, myUserId), ackedBy }
}

/** One trip's notes, as M1's cross-trip card needs them. */
export interface DashboardNoteTrip {
  tripId: string
  tripName: string
  notes: readonly ItemComment[]
  acks: readonly NoteAck[]
}

/** A thread on M1's *Neue Notizen* card (FR-7.13 §4), with its trip. */
export interface DashboardNoteRow {
  tripId: string
  tripName: string
  thread: NoteThread
  /** The newest entry I have not seen — what the row quotes. */
  latest: ItemComment
  /** How many more unseen entries stand behind it — the row's *+n*. */
  more: number
}

/**
 * One row per thread with something new for me, across active trips, the
 * newest unseen entry first — M1's counterpart of `dashboardSections.ts`'s
 * `delegatedToMe`. `limit` defaults to the three the card shows.
 */
export function newTripNotes(
  trips: readonly DashboardNoteTrip[],
  myUserId: string | null,
  limit = 3,
): DashboardNoteRow[] {
  if (!myUserId) return []
  const out: DashboardNoteRow[] = []
  for (const trip of trips) {
    for (const thread of noteThreads(trip.notes, trip.acks, myUserId)) {
      const [latest, ...rest] = thread.unseen
      if (!latest) continue
      out.push({ tripId: trip.tripId, tripName: trip.tripName, thread, latest, more: rest.length })
    }
  }
  return out
    .sort((a, b) => entryStamp(b.latest).localeCompare(entryStamp(a.latest)))
    .slice(0, limit)
}
