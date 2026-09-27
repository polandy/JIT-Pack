/**
 * The planner's rows (§3.29): a trip's ideas, the votes on them and their
 * discussion, held apart from the packing rows.
 *
 * The planner's own store, as the shopping list has its own: nothing the
 * packing side reads can reach an idea, and the orchestrator reaches these
 * rows only as the `FeatureStore` below, handed in by the composition root
 * (FR-29.9, ADR-066).
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { PullChange } from '@/api/types'
import type { CascadeRow } from '@/sync/cascade'
import type { FeatureStore } from '@/sync/featureModule'
import { TABLE_CODECS, type SyncRow } from '@/sync/tableRegistry'
import type { Idea, IdeaComment, IdeaVote } from '@/types/domain'
import { TABLE } from '@/types/tables'

/** The tables this module holds. */
const PLANNER_TABLES: ReadonlySet<string> = new Set<string>([
  TABLE.ideas,
  TABLE.ideaVotes,
  TABLE.ideaComments,
])

export const usePlannerStore = defineStore('planner', () => {
  // Flat and keyed by id, like the shopping store: a trip's board is short,
  // and a per-trip bucket would have to be rebuilt on every tombstone.
  const ideas = ref<Map<string, Idea>>(new Map())
  const votes = ref<Map<string, IdeaVote>>(new Map())
  const comments = ref<Map<string, IdeaComment>>(new Map())

  function getIdeas(tripId: string): Idea[] {
    return [...ideas.value.values()].filter((idea) => idea.trip_id === tripId)
  }

  function getIdea(id: string): Idea | undefined {
    return ideas.value.get(id)
  }

  function getVotes(tripId: string): IdeaVote[] {
    return [...votes.value.values()].filter((vote) => vote.trip_id === tripId)
  }

  function getComments(tripId: string): IdeaComment[] {
    return [...comments.value.values()].filter((comment) => comment.trip_id === tripId)
  }

  function applyChanges(changes: PullChange[]): void {
    for (const change of changes) {
      switch (change.table) {
        case TABLE.ideas:
          apply(ideas.value, change, (id, row) => TABLE_CODECS[TABLE.ideas].parse(id, row))
          break
        case TABLE.ideaVotes:
          apply(votes.value, change, (id, row) => TABLE_CODECS[TABLE.ideaVotes].parse(id, row))
          break
        case TABLE.ideaComments:
          apply(comments.value, change, (id, row) =>
            TABLE_CODECS[TABLE.ideaComments].parse(id, row),
          )
          break
      }
    }
  }

  /** The rows an idea's delete takes with it — its votes and its words (FR-29.2). */
  function ideaChildRows(ideaId: string): CascadeRow[] {
    return [
      ...[...votes.value.values()]
        .filter((vote) => vote.idea_id === ideaId)
        .map((vote) => ({ table: TABLE.ideaVotes, id: vote.id })),
      ...[...comments.value.values()]
        .filter((comment) => comment.idea_id === ideaId)
        .map((comment) => ({ table: TABLE.ideaComments, id: comment.id })),
    ]
  }

  /** Everything a deleted trip takes with it, leaf-first. */
  function tripChildRows(tripId: string): CascadeRow[] {
    return [
      ...getVotes(tripId).map((vote) => ({ table: TABLE.ideaVotes, id: vote.id })),
      ...getComments(tripId).map((comment) => ({ table: TABLE.ideaComments, id: comment.id })),
      ...getIdeas(tripId).map((idea) => ({ table: TABLE.ideas, id: idea.id })),
    ]
  }

  function forgetTrip(tripId: string): void {
    for (const vote of getVotes(tripId)) votes.value.delete(vote.id)
    for (const comment of getComments(tripId)) comments.value.delete(comment.id)
    for (const idea of getIdeas(tripId)) ideas.value.delete(idea.id)
  }

  return {
    getIdeas,
    getIdea,
    getVotes,
    getComments,
    applyChanges,
    ideaChildRows,
    tripChildRows,
    forgetTrip,
  }
})

function apply<T>(
  rows: Map<string, T>,
  change: PullChange,
  parse: (id: string, row: SyncRow) => T,
): void {
  if (change.deleted) rows.delete(change.id)
  else if (change.row) rows.set(change.id, parse(change.id, change.row as SyncRow))
}

/** This module's store as the orchestrator reads and writes it (FR-29.9). */
export function plannerFeatureStore(
  plannerStore: ReturnType<typeof usePlannerStore> = usePlannerStore(),
): FeatureStore {
  return {
    tables: PLANNER_TABLES,
    applyChanges: (changes) => plannerStore.applyChanges(changes),
    tripChildRows: (tripId) => plannerStore.tripChildRows(tripId),
    forgetTrip: (tripId) => plannerStore.forgetTrip(tripId),
  }
}
