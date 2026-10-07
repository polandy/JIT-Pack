/**
 * The planner's rows (§3.29): a trip's ideas, the votes on them, their
 * discussion, their pictures and their tracks, and the day plan's own entries
 * and whom each is for (FR-29.15), held apart from the packing rows.
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
import { encodedRow, TABLE_SPECS, type SyncRow } from '@/sync/tableRegistry'
import type {
  DayEntry,
  DayEntryTraveler,
  Idea,
  IdeaComment,
  IdeaImage,
  IdeaTrack,
  IdeaVote,
} from '@/types/domain'
import { TABLE, type SyncTable } from '@/types/tables'

/** The tables this module holds. */
const PLANNER_TABLES: ReadonlySet<string> = new Set<string>([
  TABLE.ideas,
  TABLE.ideaVotes,
  TABLE.ideaComments,
  TABLE.ideaImages,
  TABLE.dayEntries,
  TABLE.dayEntryTravelers,
  TABLE.ideaTracks,
])

export const usePlannerStore = defineStore('planner', () => {
  // Flat and keyed by id, like the shopping store: a trip's board is short,
  // and a per-trip bucket would have to be rebuilt on every tombstone.
  const ideas = ref<Map<string, Idea>>(new Map())
  const votes = ref<Map<string, IdeaVote>>(new Map())
  const comments = ref<Map<string, IdeaComment>>(new Map())
  const images = ref<Map<string, IdeaImage>>(new Map())
  /** FR-29.15: the day plan's own entries. */
  const dayEntries = ref<Map<string, DayEntry>>(new Map())
  /** FR-29.15: whom an entry is for — none of an entry's means everybody. */
  const entryTravelers = ref<Map<string, DayEntryTraveler>>(new Map())
  const tracks = ref<Map<string, IdeaTrack>>(new Map())
  /**
   * FR-29.16: the ideas whose link's picture is on its way, which the board
   * shows coming. This device's state, not a row: nothing syncs it.
   */
  const picturesComing = ref<Set<string>>(new Set())

  function pictureComing(ideaId: string): boolean {
    return picturesComing.value.has(ideaId)
  }

  function setPictureComing(ideaId: string, coming: boolean): void {
    if (coming) picturesComing.value.add(ideaId)
    else picturesComing.value.delete(ideaId)
  }

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

  /** A trip's pictures, as rows — `domain/pictures.ts` orders them. */
  function getImages(tripId: string): IdeaImage[] {
    return [...images.value.values()].filter((image) => image.trip_id === tripId)
  }

  function getDayEntries(tripId: string): DayEntry[] {
    return [...dayEntries.value.values()].filter((entry) => entry.trip_id === tripId)
  }

  function getDayEntry(id: string): DayEntry | undefined {
    return dayEntries.value.get(id)
  }

  /** FR-29.15: a trip's rows naming whom its entries are for. */
  function getDayEntryTravelers(tripId: string): DayEntryTraveler[] {
    return [...entryTravelers.value.values()].filter((row) => row.trip_id === tripId)
  }

  /** A trip's GPX tracks, as rows — `domain/track.ts` orders them (FR-29.17). */
  function getTracks(tripId: string): IdeaTrack[] {
    return [...tracks.value.values()].filter((track) => track.trip_id === tripId)
  }

  /** Where each of the module's tables keeps its rows — what a write reads back. */
  const rowMaps: Record<string, Map<string, unknown>> = {
    [TABLE.ideas]: ideas.value,
    [TABLE.ideaVotes]: votes.value,
    [TABLE.ideaComments]: comments.value,
    [TABLE.ideaImages]: images.value,
    [TABLE.dayEntries]: dayEntries.value,
    [TABLE.dayEntryTravelers]: entryTravelers.value,
    [TABLE.ideaTracks]: tracks.value,
  }

  /** One row in its wire shape, or undefined where this store does not hold it. */
  function currentRow(table: string, id: string): SyncRow | undefined {
    const row = rowMaps[table]?.get(id)
    return row === undefined ? undefined : encodedRow(table as SyncTable, row)
  }

  function applyChanges(changes: PullChange[]): void {
    for (const change of changes) {
      switch (change.table) {
        case TABLE.ideas:
          apply(ideas.value, change, (id, row) => TABLE_SPECS[TABLE.ideas].parse(id, row))
          break
        case TABLE.ideaVotes:
          apply(votes.value, change, (id, row) => TABLE_SPECS[TABLE.ideaVotes].parse(id, row))
          break
        case TABLE.ideaComments:
          apply(comments.value, change, (id, row) => TABLE_SPECS[TABLE.ideaComments].parse(id, row))
          break
        case TABLE.ideaImages:
          apply(images.value, change, (id, row) => TABLE_SPECS[TABLE.ideaImages].parse(id, row))
          break
        case TABLE.dayEntries:
          apply(dayEntries.value, change, (id, row) => TABLE_SPECS[TABLE.dayEntries].parse(id, row))
          break
        case TABLE.dayEntryTravelers:
          apply(entryTravelers.value, change, (id, row) =>
            TABLE_SPECS[TABLE.dayEntryTravelers].parse(id, row),
          )
          break
        case TABLE.ideaTracks:
          apply(tracks.value, change, (id, row) => TABLE_SPECS[TABLE.ideaTracks].parse(id, row))
          break
      }
    }
  }

  /** The rows an idea's delete takes with it — its votes, words, pictures and tracks (FR-29.2). */
  function ideaChildRows(ideaId: string): CascadeRow[] {
    return [
      ...[...images.value.values()]
        .filter((image) => image.idea_id === ideaId)
        .map((image) => ({ table: TABLE.ideaImages, id: image.id })),
      ...[...tracks.value.values()]
        .filter((track) => track.idea_id === ideaId)
        .map((track) => ({ table: TABLE.ideaTracks, id: track.id })),
      ...[...votes.value.values()]
        .filter((vote) => vote.idea_id === ideaId)
        .map((vote) => ({ table: TABLE.ideaVotes, id: vote.id })),
      ...[...comments.value.values()]
        .filter((comment) => comment.idea_id === ideaId)
        .map((comment) => ({ table: TABLE.ideaComments, id: comment.id })),
    ]
  }

  /** The rows an entry's delete takes with it — whom it was for (FR-29.15). */
  function dayEntryChildRows(entryId: string): CascadeRow[] {
    return [...entryTravelers.value.values()]
      .filter((row) => row.day_entry_id === entryId)
      .map((row) => ({ table: TABLE.dayEntryTravelers, id: row.id }))
  }

  /** The rows a traveller taken off the trip takes along — their place on entries (FR-29.15). */
  function travelerChildRows(travelerId: string): CascadeRow[] {
    return [...entryTravelers.value.values()]
      .filter((row) => row.traveler_id === travelerId)
      .map((row) => ({ table: TABLE.dayEntryTravelers, id: row.id }))
  }

  /** Everything a deleted trip takes with it, leaf-first. */
  function tripChildRows(tripId: string): CascadeRow[] {
    return [
      ...getVotes(tripId).map((vote) => ({ table: TABLE.ideaVotes, id: vote.id })),
      ...getComments(tripId).map((comment) => ({ table: TABLE.ideaComments, id: comment.id })),
      ...getImages(tripId).map((image) => ({ table: TABLE.ideaImages, id: image.id })),
      ...getTracks(tripId).map((track) => ({ table: TABLE.ideaTracks, id: track.id })),
      ...getIdeas(tripId).map((idea) => ({ table: TABLE.ideas, id: idea.id })),
      ...getDayEntryTravelers(tripId).map((row) => ({
        table: TABLE.dayEntryTravelers,
        id: row.id,
      })),
      ...getDayEntries(tripId).map((entry) => ({ table: TABLE.dayEntries, id: entry.id })),
    ]
  }

  function forgetTrip(tripId: string): void {
    for (const vote of getVotes(tripId)) votes.value.delete(vote.id)
    for (const comment of getComments(tripId)) comments.value.delete(comment.id)
    for (const image of getImages(tripId)) images.value.delete(image.id)
    for (const track of getTracks(tripId)) tracks.value.delete(track.id)
    for (const idea of getIdeas(tripId)) ideas.value.delete(idea.id)
    for (const row of getDayEntryTravelers(tripId)) entryTravelers.value.delete(row.id)
    for (const entry of getDayEntries(tripId)) dayEntries.value.delete(entry.id)
  }

  return {
    getIdeas,
    getIdea,
    getVotes,
    getComments,
    getImages,
    getDayEntries,
    getDayEntry,
    getDayEntryTravelers,
    getTracks,
    pictureComing,
    setPictureComing,
    applyChanges,
    currentRow,
    ideaChildRows,
    dayEntryChildRows,
    travelerChildRows,
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
    currentRow: (table, id) => plannerStore.currentRow(table, id),
    tripChildRows: (tripId) => plannerStore.tripChildRows(tripId),
    travelerChildRows: (travelerId) => plannerStore.travelerChildRows(travelerId),
    forgetTrip: (tripId) => plannerStore.forgetTrip(tripId),
  }
}
