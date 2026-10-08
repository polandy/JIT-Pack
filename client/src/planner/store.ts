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
import { bucketedRows, bucketSink } from '@/sync/bucketedRows'
import type { FeatureStore } from '@/sync/featureModule'
import { applyChangesToSinks, type RowSinks } from '@/sync/sinks'
import type {
  DayEntry,
  DayEntryTraveler,
  Idea,
  IdeaComment,
  IdeaImage,
  IdeaTrack,
  IdeaVote,
} from '@/types/domain'
import { TABLE } from '@/types/tables'

export const usePlannerStore = defineStore('planner', () => {
  // Bucketed by trip like the packing rows: every screen reads one trip's.
  const ideas = bucketedRows(ref(new Map<string, Idea[]>()), (r) => r.trip_id)
  const votes = bucketedRows(ref(new Map<string, IdeaVote[]>()), (r) => r.trip_id)
  const comments = bucketedRows(ref(new Map<string, IdeaComment[]>()), (r) => r.trip_id)
  const images = bucketedRows(ref(new Map<string, IdeaImage[]>()), (r) => r.trip_id)
  /** FR-29.15: the day plan's own entries. */
  const dayEntries = bucketedRows(ref(new Map<string, DayEntry[]>()), (r) => r.trip_id)
  /** FR-29.15: whom an entry is for — none of an entry's means everybody. */
  const entryTravelers = bucketedRows(ref(new Map<string, DayEntryTraveler[]>()), (r) => r.trip_id)
  const tracks = bucketedRows(ref(new Map<string, IdeaTrack[]>()), (r) => r.trip_id)
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
    return ideas.get(tripId)
  }

  function getIdea(id: string): Idea | undefined {
    return ideas.find(id)
  }

  function getVotes(tripId: string): IdeaVote[] {
    return votes.get(tripId)
  }

  function getComments(tripId: string): IdeaComment[] {
    return comments.get(tripId)
  }

  /** A trip's pictures, as rows — `domain/pictures.ts` orders them. */
  function getImages(tripId: string): IdeaImage[] {
    return images.get(tripId)
  }

  function getDayEntries(tripId: string): DayEntry[] {
    return dayEntries.get(tripId)
  }

  function getDayEntry(id: string): DayEntry | undefined {
    return dayEntries.find(id)
  }

  /** FR-29.15: a trip's rows naming whom its entries are for. */
  function getDayEntryTravelers(tripId: string): DayEntryTraveler[] {
    return entryTravelers.get(tripId)
  }

  /** A trip's GPX tracks, as rows — `domain/track.ts` orders them (FR-29.17). */
  function getTracks(tripId: string): IdeaTrack[] {
    return tracks.get(tripId)
  }

  /** The sinks, one per table this module holds — the whole of what the kernel reads. */
  const sinks: RowSinks = {
    [TABLE.ideas]: bucketSink(ideas),
    [TABLE.ideaVotes]: bucketSink(votes),
    [TABLE.ideaComments]: bucketSink(comments),
    [TABLE.ideaImages]: bucketSink(images),
    [TABLE.dayEntries]: bucketSink(dayEntries),
    [TABLE.dayEntryTravelers]: bucketSink(entryTravelers),
    [TABLE.ideaTracks]: bucketSink(tracks),
  }

  function applyChanges(changes: PullChange[]): void {
    applyChangesToSinks(sinks, changes)
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
    sinks,
    applyChanges,
  }
})

/** This module's store as the orchestrator reads and writes it (FR-29.9). */
export function plannerFeatureStore(
  plannerStore: ReturnType<typeof usePlannerStore> = usePlannerStore(),
): FeatureStore {
  return { sinks: plannerStore.sinks }
}
