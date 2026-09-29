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
import { newId } from '@/lib/ids'
import { dbBool } from '@/sync/columns'
import type { ModuleHost } from '@/sync/featureModule'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import { cascadeTombstones } from '@/sync/cascade'
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import { TABLE_CODECS } from '@/sync/tableRegistry'
import type {
  Idea,
  IdeaComment,
  IdeaImage,
  IdeaState,
  IdeaTag,
  IdeaVoteValue,
} from '@/types/domain'
import { IDEA_STATE_IDEA } from '@/types/domain'
import { TABLE } from '@/types/tables'
import type { VoteTally } from './domain/ideas'
import { canAddPicture, coverMoves, ideaPictures, nextPicturePosition } from './domain/pictures'
import type { usePlannerStore } from './store'

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
  const encodeIdea = TABLE_CODECS[TABLE.ideas].encode
  const encodeVote = TABLE_CODECS[TABLE.ideaVotes].encode
  const encodeComment = TABLE_CODECS[TABLE.ideaComments].encode
  const encodeImage = TABLE_CODECS[TABLE.ideaImages].encode

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
    host.writeTrip(tripId, { mutation, optimistic: optimisticInsert(mutation) })
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
   * FR-29.2: deletes an idea with its votes, its words and its pictures — one
   * mutation, the children's tombstones painted with it, as `sync/cascade.ts`
   * does for the packing tables, so Local Mode's disk loses them too.
   */
  function removeIdea(idea: Idea): void {
    const mutation = host.mutation('delete', TABLE.ideas, idea.id)
    const children = plannerStore.ideaChildRows(idea.id)
    host.writeTrip(idea.trip_id, {
      mutation,
      optimistic: [...cascadeTombstones(children), optimisticDelete(mutation)],
    })
    void host.pictures.forget(
      children.filter((row) => row.table === TABLE.ideaImages).map((row) => row.id),
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

  /** FR-29.5's „Als Titelbild": the picture to the front, the rest behind it in order. */
  function makeCover(idea: Idea, imageId: string): void {
    const moves = coverMoves(picturesOf(idea), imageId).map(({ image, position }) => {
      const mutation = host.mutation('upsert', TABLE.ideaImages, image.id, { position })
      return { mutation, optimistic: optimisticUpdate(mutation, encodeImage(image)) }
    })
    if (moves.length > 0) host.writeTrip(idea.trip_id, ...moves)
  }

  function removePicture(image: IdeaImage): void {
    const mutation = host.mutation('delete', TABLE.ideaImages, image.id)
    host.writeTrip(image.trip_id, { mutation, optimistic: optimisticDelete(mutation) })
    void host.pictures.forget([image.id])
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
      host.writeTrip(tripId, {
        mutation,
        optimistic: optimisticUpdate(mutation, encodeVote(tally.myRow)),
      })
      return
    }
    if (next === null) return
    const mutation = host.mutation('insert', TABLE.ideaVotes, newId(), {
      trip_id: tripId,
      idea_id: ideaId,
      user_id: me ?? CLIENT_ACTOR_PLACEHOLDER,
      vote: next,
    })
    host.writeTrip(tripId, { mutation, optimistic: optimisticInsert(mutation) })
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
    host.writeTrip(tripId, { mutation, optimistic: optimisticInsert(mutation) })
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
    host.writeTrip(comment.trip_id, {
      mutation,
      optimistic: optimisticUpdate(mutation, encodeComment(comment)),
    })
  }

  function removeComment(comment: IdeaComment): void {
    const mutation = host.mutation('delete', TABLE.ideaComments, comment.id)
    host.writeTrip(comment.trip_id, { mutation, optimistic: optimisticDelete(mutation) })
  }

  function writeIdea(idea: Idea, patch: Record<string, unknown>): void {
    if (Object.keys(patch).length === 0) return
    const mutation = host.mutation('upsert', TABLE.ideas, idea.id, patch)
    host.writeTrip(idea.trip_id, {
      mutation,
      optimistic: optimisticUpdate(mutation, encodeIdea(idea)),
    })
  }

  return {
    addIdea,
    updateIdea,
    setState,
    removeIdea,
    addPicture,
    makeCover,
    removePicture,
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
