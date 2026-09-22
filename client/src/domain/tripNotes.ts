/**
 * FR-7.9's trip notes — pure over rows the device already holds, like every
 * other rule in this directory (invariant 4: Local Mode has no server to
 * derive it there instead).
 *
 * A note is a trip-level `comments` row (FR-7.1's shape, `trip_item_id`
 * null, `is_task = 0`); its per-person tick is `note_acks`. "New for me" is
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
 * A note is new to a reader when somebody else wrote it and the reader has
 * not ticked it. Own notes are never new (FR-7.9 decision 4) — a tick on
 * your own words would say nothing — and without an identity (Single-User,
 * Local) there is no other author, so nothing is ever new.
 */
export function isNoteNewForMe(
  note: ItemComment,
  acks: readonly NoteAck[],
  myUserId: string | null,
): boolean {
  if (!myUserId || note.author_id === myUserId) return false
  return !acks.some((a) => a.comment_id === note.id && a.user_id === myUserId && a.acked)
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

/** One M25 row: the note, whether it is new, and whether I have ticked it. */
export interface TripNoteRow {
  note: ItemComment
  isNew: boolean
  ackedByMe: boolean
}

/**
 * M25's notes segment (FR-7.9 §4): new ones first and marked, ticked ones
 * below and muted — read order rather than store order, which is why this
 * exists beside `isNoteNewForMe` and not only as a `.filter()` at the call
 * site. Within each of the two groups, newest first.
 */
export function tripNoteRows(
  notes: readonly ItemComment[],
  acks: readonly NoteAck[],
  myUserId: string | null,
): TripNoteRow[] {
  return notes
    .map((note) => ({
      note,
      isNew: isNoteNewForMe(note, acks, myUserId),
      ackedByMe: myAckFor(note.id, acks, myUserId)?.acked === true,
    }))
    .sort(
      (a, b) =>
        Number(a.ackedByMe) - Number(b.ackedByMe) ||
        Number(b.isNew) - Number(a.isNew) ||
        (b.note.created_at ?? '').localeCompare(a.note.created_at ?? ''),
    )
}

/** One trip's notes, as M1's cross-trip card needs them. */
export interface DashboardNoteTrip {
  tripId: string
  tripName: string
  notes: readonly ItemComment[]
  acks: readonly NoteAck[]
}

/** A note on M1's *Neue Notizen* card (FR-7.9 decision 1/2), with its trip. */
export interface DashboardNoteRow {
  tripId: string
  tripName: string
  note: ItemComment
}

/**
 * The latest notes by others, not yet ticked by me, across active trips
 * (FR-7.9 decision 1) — M1's counterpart of `dashboardSections.ts`'s
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
    for (const note of trip.notes) {
      if (!isNoteNewForMe(note, trip.acks, myUserId)) continue
      out.push({ tripId: trip.tripId, tripName: trip.tripName, note })
    }
  }
  return out
    .sort((a, b) => (b.note.created_at ?? '').localeCompare(a.note.created_at ?? ''))
    .slice(0, limit)
}
