/**
 * The planner's writes (§3.29) — its own rows only, through the `ModuleHost`
 * the orchestrator hands out: the same outbox, clock and optimistic paint as
 * every other write, and no reach into the packing mutations.
 *
 * An actor column (an idea's or a word's author, a vote's voter) is the
 * server's to stamp (invariant 3). The client still sends its own id where it
 * knows it, because the optimistic row is built from the mutation: a vote
 * painted under a placeholder would not read as mine until the pull came
 * back. Where there is no identity — Local Mode — the placeholder stands.
 */
import type { TrackUpload } from '@/api/types'
import {
  MAX_TRACKS,
  nextTrackPosition,
  orderTracks,
  trackSettingsChanges,
  type TrackSettings,
} from '@/domain/shared/track'
import { newId } from '@/lib/ids'
import { dbBool, jsonColumn } from '@/sync/columns'
import type { ModuleHost } from '@/sync/featureModule'
import type { Write } from '@/sync/writeFunnel'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import { cascadeChanges, cascadeOf, cascadeTombstones } from '@/sync/cascade'
import { optimisticDelete } from '@/sync/optimistic'
import { trackSettingsColumns } from '@/sync/rows'
import type { IdeaImage, IdeaTrack } from '@/types/domain'
import type {
  ConnectionLeg,
  DayEntry,
  ExcursionRole,
  Idea,
  IdeaComment,
  IdeaState,
  IdeaTag,
  IdeaVoteValue,
} from './types'
import { DAY_ENTRY_CONNECTION, DAY_ENTRY_NOTE, IDEA_STATE_IDEA } from './types'
import { TABLE } from '@/api/tables'
import { connectionDay, connectionTitle, timeOf } from './domain/connections'
import type { VoteTally } from './domain/ideas'
import { canAddPicture, coverMoves, ideaPictures, nextPicturePosition } from './domain/pictures'
import type { usePlannerStore } from './store'

/** What the day plan's sheet writes for a connection (FR-29.18). The link is already parsed. */
export interface ConnectionFields {
  legs: ConnectionLeg[]
  link: string | null
}

/**
 * What the day plan's entry sheet writes (FR-29.15): its own fields and the
 * connection it carries (FR-29.18) — null for none. Left out, a new entry has
 * none and a changed one keeps what it had.
 */
export interface DayEntryFields {
  title: string
  note: string | null
  /** `HH:MM`, or null for none — with a connection, its first departure. */
  time: string | null
  connection?: ConnectionFields | null
  /**
   * Whom it is for — null for everybody (FR-29.15). Left out, a new entry is
   * for everybody and a changed one keeps whom it had.
   */
  travelerIds?: readonly string[] | null
}

/** The excursion a new entry is a way of (FR-29.18), and which way. */
export interface WayFields {
  excursionId: string
  role: ExcursionRole | null
}

/** What the add and edit sheets write (FR-29.1). The link is already parsed. */
export interface IdeaFields {
  title: string
  note: string | null
  link: string | null
  tag: IdeaTag | null
  rainProof: boolean
}

export function createPlannerActions(
  host: ModuleHost,
  plannerStore: ReturnType<typeof usePlannerStore>,
) {
  /** FR-29.1: a new idea, in *Ideen*. A blank title is not an idea. */
  function addIdea(tripId: string, fields: IdeaFields, me: string | null): string | null {
    const title = fields.title.trim()
    if (title === '') return null
    const id = newId()
    const mutation = host.mutation('insert', TABLE.ideas, id, {
      trip_id: tripId,
      author_id: me ?? CLIENT_ACTOR_PLACEHOLDER,
      title,
      note: blankToNull(fields.note),
      link: fields.link,
      tag: fields.tag,
      rain_proof: dbBool(fields.rainProof),
      state: IDEA_STATE_IDEA,
      created_at: host.nowIso(),
    })
    host.write(mutation)
    return id
  }

  /** FR-29.1: an edit writes only what changed, so it overwrites no one else's field. */
  function updateIdea(idea: Idea, fields: IdeaFields): void {
    const patch: Record<string, unknown> = {}
    const title = fields.title.trim()
    if (title !== '' && title !== idea.title) patch['title'] = title
    const note = blankToNull(fields.note)
    if (note !== idea.note) patch['note'] = note
    if (fields.link !== idea.link) patch['link'] = fields.link
    if (fields.tag !== idea.tag) patch['tag'] = fields.tag
    if (fields.rainProof !== idea.rain_proof) patch['rain_proof'] = dbBool(fields.rainProof)
    writeIdea(idea, patch)
  }

  /**
   * FR-29.2: moves an idea to another segment by hand. Returns the undo,
   * which writes the state back only if nobody has moved it since.
   */
  function setState(idea: Idea, state: IdeaState): () => void {
    if (state === idea.state) return () => {}
    writeIdea(idea, { state })
    return () => {
      const now = plannerStore.getIdea(idea.id)
      if (now && now.state === state) writeIdea(now, { state: idea.state })
    }
  }

  /**
   * FR-29.14: plans an idea on a day, and when on it — or takes its day away
   * (null). Writes only the fields that change; a time without a day is not
   * kept, since it would read as none.
   */
  function planIdea(idea: Idea, day: string | null, time: string | null): void {
    const at = day === null ? null : time
    const patch: Record<string, unknown> = {}
    if (day !== idea.planned_on) patch['planned_on'] = day
    if (at !== idea.planned_at) patch['planned_at'] = at
    writeIdea(idea, patch)
  }

  /**
   * FR-29.15/29.18: an entry of the day plan's own, and the connection it may
   * carry. With one it stands on the connection's day — which a link may name
   * — at its first departure where it has no time of its own, and is named by
   * its stops where it has no title; without one a blank title is no entry.
   */
  function addDayEntry(
    tripId: string,
    day: string,
    fields: DayEntryFields,
    me: string | null,
    way?: WayFields,
  ): string | null {
    const connection = fields.connection ?? null
    const title = entryTitle(fields.title, connection)
    if (title === '') return null
    const id = newId()
    const own = {
      trip_id: tripId,
      author_id: me ?? CLIENT_ACTOR_PLACEHOLDER,
      on_date: connection ? connectionDay(connection.legs) : day,
      at_time: entryTime(fields.time, connection),
      title,
      note: blankToNull(fields.note),
    }
    const mutation = host.mutation(
      'insert',
      TABLE.dayEntries,
      id,
      connection
        ? {
            ...own,
            kind: DAY_ENTRY_CONNECTION,
            link: connection.link,
            legs: jsonColumn(connection.legs),
            excursion_id: way?.excursionId ?? null,
            excursion_role: way?.role ?? null,
          }
        : own,
    )
    host.write(mutation, ...travelerWrites(tripId, id, fields.travelerIds ?? null))
    return id
  }

  /**
   * FR-29.15/29.18: an edit writes only what changed, so it overwrites no one
   * else's field. A connection added or changed moves the entry to its day
   * and makes it one; taken off, the entry is a note again. The legs are
   * written whole, never leg by leg.
   */
  function updateDayEntry(entry: DayEntry, fields: DayEntryFields): void {
    const patch: Record<string, unknown> = {}
    const connection =
      fields.connection === undefined
        ? entry.legs
          ? { legs: entry.legs, link: entry.link }
          : null
        : fields.connection
    const title = entryTitle(fields.title, connection)
    if (title !== '' && title !== entry.title) patch['title'] = title
    const note = blankToNull(fields.note)
    if (note !== entry.note) patch['note'] = note
    const time = entryTime(fields.time, connection)
    if (time !== entry.at_time) patch['at_time'] = time
    const legs = connection ? jsonColumn(connection.legs) : null
    if (legs !== (entry.legs ? jsonColumn(entry.legs) : null)) {
      patch['legs'] = legs
      if (connection) {
        const day = connectionDay(connection.legs)
        if (day !== entry.on_date) patch['on_date'] = day
      }
    }
    const kind = connection ? DAY_ENTRY_CONNECTION : DAY_ENTRY_NOTE
    if (kind !== entry.kind) patch['kind'] = kind
    const link = connection?.link ?? null
    if (link !== entry.link) patch['link'] = link
    const writes =
      fields.travelerIds === undefined
        ? []
        : travelerWrites(entry.trip_id, entry.id, fields.travelerIds)
    if (Object.keys(patch).length > 0) {
      const mutation = host.mutation('upsert', TABLE.dayEntries, entry.id, patch)
      writes.unshift(mutation)
    }
    if (writes.length > 0) host.write(...writes)
  }

  /**
   * FR-29.15: the rows that make an entry for `travelerIds` — null for
   * everybody — from the rows it has: one inserted per person newly named,
   * one deleted per person no longer, none touched for a person kept, so two
   * devices naming different people both keep theirs.
   */
  function travelerWrites(
    tripId: string,
    entryId: string,
    travelerIds: readonly string[] | null,
  ): Write[] {
    const rows = plannerStore
      .getDayEntryTravelers(tripId)
      .filter((row) => row.day_entry_id === entryId)
    const wanted = new Set(travelerIds ?? [])
    const writes: Write[] = []
    for (const row of rows) {
      if (wanted.has(row.traveler_id)) continue
      writes.push(host.mutation('delete', TABLE.dayEntryTravelers, row.id))
    }
    for (const travelerId of wanted) {
      if (rows.some((row) => row.traveler_id === travelerId)) continue
      writes.push(
        host.mutation('insert', TABLE.dayEntryTravelers, newId(), {
          trip_id: tripId,
          day_entry_id: entryId,
          traveler_id: travelerId,
        }),
      )
    }
    return writes
  }

  /** FR-29.15: an entry's delete takes whom it was for, as one mutation (`sync/cascade.ts`). */
  function removeDayEntry(entry: DayEntry): void {
    const mutation = host.mutation('delete', TABLE.dayEntries, entry.id)
    host.write({
      mutation,
      optimistic: [
        ...cascadeChanges(TABLE.dayEntries, entry.id, plannerStore),
        optimisticDelete(mutation),
      ],
    })
  }

  /**
   * FR-29.2: deletes an idea with its votes, its words and its pictures — one
   * mutation, the children's tombstones painted with it, as `sync/cascade.ts`
   * does for the packing tables, so Local Mode's disk loses them too.
   */
  function removeIdea(idea: Idea): void {
    const mutation = host.mutation('delete', TABLE.ideas, idea.id)
    const children = cascadeOf(TABLE.ideas, idea.id, plannerStore)
    host.write({
      mutation,
      optimistic: [...cascadeTombstones(children), optimisticDelete(mutation)],
    })
    void host.pictures.forget(
      children.filter((row) => row.table === TABLE.ideaImages).map((row) => row.id),
    )
    void host.tracks.forget(
      children.filter((row) => row.table === TABLE.ideaTracks).map((row) => row.id),
    )
  }

  function picturesOf(idea: Idea): IdeaImage[] {
    return ideaPictures(idea.id, plannerStore.getImages(idea.trip_id))
  }

  /**
   * FR-29.5: a picture on an idea, behind its last one. False when the idea
   * already carries four, so nothing is scaled or sent; a failed upload
   * rejects, and the screen says so.
   */
  async function addPicture(idea: Idea, source: Blob): Promise<boolean> {
    const pictures = picturesOf(idea)
    if (!canAddPicture(pictures)) return false
    await host.pictures.add(
      {
        id: newId(),
        trip_id: idea.trip_id,
        idea_id: idea.id,
        position: nextPicturePosition(pictures),
      },
      source,
    )
    return true
  }

  /**
   * FR-29.16: the picture a link's page names, added in the background — and
   * only where the idea still has none when it arrives, which may be well
   * after the idea was saved. An idea deleted meanwhile takes none.
   */
  async function addLinkPicture(ideaId: string, source: Blob): Promise<boolean> {
    const idea = plannerStore.getIdea(ideaId)
    if (!idea || picturesOf(idea).length > 0) return false
    return addPicture(idea, source)
  }

  /**
   * FR-29.16: waits for a link's picture in the background and adds it where
   * the idea still wants it, the idea showing it coming meanwhile. A picture
   * that cannot be had or put up is a preview missing its picture, not a
   * failure the person who saved has to hear about.
   */
  async function awaitLinkPicture(ideaId: string, picture: Promise<Blob | null>): Promise<void> {
    plannerStore.setPictureComing(ideaId, true)
    try {
      const blob = await picture
      if (blob) await addLinkPicture(ideaId, blob)
    } catch {
      // See above: the idea simply stays without its link's picture.
    } finally {
      plannerStore.setPictureComing(ideaId, false)
    }
  }

  /** FR-29.5's „Als Titelbild": the picture to the front, the rest behind it in order. */
  function makeCover(idea: Idea, imageId: string): void {
    const moves = coverMoves(picturesOf(idea), imageId).map(({ image, position }) =>
      host.mutation('upsert', TABLE.ideaImages, image.id, { position }),
    )
    if (moves.length > 0) host.write(...moves)
  }

  function removePicture(image: IdeaImage): void {
    const mutation = host.mutation('delete', TABLE.ideaImages, image.id)
    host.write(mutation)
    void host.pictures.forget([image.id])
  }

  /** FR-29.17: an idea's tracks, in their order. */
  function tracksOf(idea: Idea): IdeaTrack[] {
    return orderTracks(
      plannerStore.getTracks(idea.trip_id).filter((track) => track.idea_id === idea.id),
    )
  }

  /**
   * FR-29.17: a GPX track on an idea, behind its last one, from what the
   * device read from the file. Null when the idea already carries five, so
   * nothing is sent; a failed upload rejects, and the screen says so.
   */
  async function addTrack(idea: Idea, upload: TrackUpload): Promise<string | null> {
    const tracks = tracksOf(idea)
    if (tracks.length >= MAX_TRACKS) return null
    const id = newId()
    await host.tracks.add(
      { id, trip_id: idea.trip_id, idea_id: idea.id, position: nextTrackPosition(tracks) },
      upload,
    )
    return id
  }

  /** FR-29.17's „Durch andere Datei ersetzen": the file changes, what was set stays. */
  async function replaceTrack(track: IdeaTrack, upload: TrackUpload): Promise<void> {
    await host.tracks.replace(track, upload)
  }

  /** FR-29.17: writes only the settings that changed. */
  function updateTrack(track: IdeaTrack, settings: TrackSettings): void {
    const patch = trackSettingsColumns(trackSettingsChanges(track, settings))
    if (Object.keys(patch).length === 0) return
    const mutation = host.mutation('upsert', TABLE.ideaTracks, track.id, patch)
    host.write(mutation)
  }

  function removeTrack(track: IdeaTrack): void {
    const mutation = host.mutation('delete', TABLE.ideaTracks, track.id)
    host.write(mutation)
    void host.tracks.forget([track.id])
  }

  /** The file as it was uploaded, for *GPX herunterladen*. */
  function trackFile(track: IdeaTrack): Promise<Blob | null> {
    return host.tracks.file(track)
  }

  /**
   * FR-29.3: casts, changes or withdraws my vote. One row per person and
   * idea: a withdrawn vote keeps its row, so the next tap updates it rather
   * than asking the server for a second one it would refuse.
   */
  function vote(
    tripId: string,
    ideaId: string,
    tally: VoteTally,
    next: IdeaVoteValue | null,
    me: string | null,
  ): void {
    if (tally.myRow) {
      const mutation = host.mutation('upsert', TABLE.ideaVotes, tally.myRow.id, { vote: next })
      host.write(mutation)
      return
    }
    if (next === null) return
    const mutation = host.mutation('insert', TABLE.ideaVotes, newId(), {
      trip_id: tripId,
      idea_id: ideaId,
      user_id: me ?? CLIENT_ACTOR_PLACEHOLDER,
      vote: next,
    })
    host.write(mutation)
  }

  /** FR-29.4: a word about an idea. A blank one is not written. */
  function addComment(
    tripId: string,
    ideaId: string,
    body: string,
    me: string | null,
  ): string | null {
    const words = body.trim()
    if (words === '') return null
    const id = newId()
    const mutation = host.mutation('insert', TABLE.ideaComments, id, {
      trip_id: tripId,
      idea_id: ideaId,
      author_id: me ?? CLIENT_ACTOR_PLACEHOLDER,
      body: words,
      created_at: host.nowIso(),
    })
    host.write(mutation)
    return id
  }

  /**
   * FR-29.4: the author changes their words — only the body and when, so it
   * overwrites nothing else. A blank or unchanged body writes nothing.
   */
  function editComment(comment: IdeaComment, body: string): void {
    const words = body.trim()
    if (words === '' || words === comment.body) return
    const mutation = host.mutation('upsert', TABLE.ideaComments, comment.id, {
      body: words,
      edited_at: host.nowIso(),
    })
    host.write(mutation)
  }

  function removeComment(comment: IdeaComment): void {
    const mutation = host.mutation('delete', TABLE.ideaComments, comment.id)
    host.write(mutation)
  }

  function writeIdea(idea: Idea, patch: Record<string, unknown>): void {
    if (Object.keys(patch).length === 0) return
    const mutation = host.mutation('upsert', TABLE.ideas, idea.id, patch)
    host.write(mutation)
  }

  return {
    addIdea,
    updateIdea,
    setState,
    planIdea,
    addDayEntry,
    updateDayEntry,
    removeDayEntry,
    removeIdea,
    addPicture,
    addLinkPicture,
    awaitLinkPicture,
    makeCover,
    removePicture,
    tracksOf,
    addTrack,
    replaceTrack,
    updateTrack,
    removeTrack,
    trackFile,
    vote,
    addComment,
    editComment,
    removeComment,
  }
}

function blankToNull(value: string | null): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/** An entry's title: its own, or with a connection and none, the connection's stops. */
function entryTitle(title: string, connection: ConnectionFields | null): string {
  const own = title.trim()
  return own === '' && connection ? connectionTitle(connection.legs) : own
}

/** An entry's time: its own, or with a connection and none, its first departure. */
function entryTime(time: string | null, connection: ConnectionFields | null): string | null {
  return time ?? (connection ? timeOf(connection.legs[0]!.dep) : null)
}
