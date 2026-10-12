/**
 * The kernel's own side of the module contracts (ADR-066 amendment 3): the
 * packing and excursion lines on the shopping list (FR-30.2, FR-31.8), the
 * excursions and tasks on the day plan (FR-29.15), what came of an idea on
 * the packing side (FR-29.13), the switcher's kernel counts, and what the
 * meal plan reads of the trip (§3.33). Folded first, like any contribution,
 * so the composition root holds none of it.
 *
 * Every read and write is handed in structurally — the trip store, the tasks,
 * the action groups — because the kernel sits below all of them.
 */
import type { DayPlanTravelers } from '@/domain/shared/dayPlanLine'
import type { MealContext } from '@/domain/shared/mealContext'
import { pendingExcursionCount, spanOf } from '@/domain/excursionSchedule'
import { newNoteCount } from '@/domain/tripNotes'
import type { TripTask } from '@/domain/tripTasks'
import { localIsoDate } from '@/domain/trips'
import type { ItemComment, NoteAck, Trip } from '@/types/domain'
import {
  createDayPlanSource,
  toggleTask,
  type DayPlanReads,
  type TaskTickReads,
  type TaskTickWrites,
} from './dayPlanSource'
import {
  createExcursionShoppingSource,
  type ExcursionShoppingReads,
  type ExcursionShoppingWrites,
} from './excursionShoppingSource'
import { createIdeaResultSource, type IdeaResultReads } from './ideaResultSource'
import type { FoldedSources, KernelPorts } from './moduleContribution'
import {
  createPackingShoppingSource,
  type PackingShoppingReads,
  type PackingShoppingWrites,
} from './packingShoppingSource'

/** What the kernel's ports read off the trip store. */
export interface KernelTripReads
  extends
    PackingShoppingReads,
    ExcursionShoppingReads,
    IdeaResultReads,
    TaskTickReads,
    Pick<DayPlanReads, 'getExcursions' | 'getExcursionItems' | 'getExcursionTravelers'> {
  readonly tripList: readonly Pick<Trip, 'id' | 'name' | 'start_date' | 'end_date'>[]
  getTripComments(tripId: string): ItemComment[]
  getNoteAcks(tripId: string): NoteAck[]
}

/** Everything the kernel's ports are built over. */
export interface KernelPortDeps {
  trips: KernelTripReads
  /** M25's tasks of a trip, prep tasks included (`useTripTasks`). */
  tasksOf(tripId: string): TripTask[]
  /** Whose notes are new — null before the identity is known. */
  myUserId(): string | null
  /** The device's clock, epoch milliseconds. */
  now(): number
  packing: PackingShoppingWrites
  excursions: ExcursionShoppingWrites
  comments: TaskTickWrites
}

/** The kernel's ports, reading the folded lists where another contributor's lines count too. */
export function kernelPorts(deps: KernelPortDeps, sources: FoldedSources): KernelPorts {
  const { trips } = deps

  /* §3.33: what the meal plan reads of the trip, so the module imports neither side. */
  const mealContext: MealContext = {
    trips: () =>
      trips.tripList.map((trip) => ({
        id: trip.id,
        name: trip.name,
        start_date: trip.start_date,
        end_date: trip.end_date,
      })),
    excursions: (tripId) =>
      trips.getExcursions(tripId).flatMap((excursion) => {
        const span = spanOf(excursion)
        return span
          ? [{ id: excursion.id, name: excursion.name, from: span.from, to: span.to }]
          : []
      }),
    // M31: shortlisted ideas, as the planner contributes them — never its store.
    shortlist: (tripId) => sources.shortlist(tripId),
  }

  const dayPlanTravelers: DayPlanTravelers = (tripId) => trips.getTravelers(tripId)

  return {
    mealContext,
    dayPlanTravelers,
    contribution: {
      shoppingSources: [
        createPackingShoppingSource(trips, deps.packing),
        // FR-31.8: an excursion's vor-Ort lines, bought at the kiosk on the way.
        createExcursionShoppingSource(trips, deps.excursions),
      ],
      dayPlanSources: [
        createDayPlanSource(
          {
            getExcursions: (tripId) => trips.getExcursions(tripId),
            getExcursionItems: (tripId) => trips.getExcursionItems(tripId),
            getExcursionTravelers: (tripId) => trips.getExcursionTravelers(tripId),
            tasksOf: deps.tasksOf,
            extraLines: (tripId, excursionId) =>
              sources.excursionExtraLines().flatMap((source) => source.lines(tripId, excursionId)),
          },
          { toggleTask: (tripId, task) => toggleTask(deps.comments, trips, tripId, task) },
        ),
      ],
      ideaResults: [createIdeaResultSource(trips)],
      viewCounts: {
        // FR-31.10: excursions ahead that still have something to pack or buy.
        excursions: (tripId) =>
          pendingExcursionCount(
            trips.getExcursions(tripId),
            trips.getExcursionItems(tripId),
            localIsoDate(deps.now()),
          ),
        // FR-7.13: what is new for me in the trip's notes, never their total.
        notes: (tripId) =>
          newNoteCount(trips.getTripComments(tripId), trips.getNoteAcks(tripId), deps.myUserId()),
      },
    },
  }
}
