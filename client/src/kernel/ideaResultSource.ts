/**
 * The packing side's results of an idea (FR-29.13) — its half of the contract
 * in `kernel/ideaBridge.ts`: the excursion and the trip tasks whose `idea_id`
 * names the idea. A projection, never a copy; the shopping module answers for
 * its entries itself.
 */
import {
  IDEA_RESULT_EXCURSION,
  IDEA_RESULT_TASK,
  type IdeaResult,
  type IdeaResultSource,
} from '@/kernel/ideaBridge'
import { tripExcursionsPath, tripSubPath } from '@/router/paths'
import type { Excursion, TripTodo } from '@/types/domain'

/** What the source reads — the trip store's excursions and trip tasks. */
export interface IdeaResultReads {
  getExcursions(tripId: string): Excursion[]
  getTripTodos(tripId: string): TripTodo[]
}

export function createIdeaResultSource(reads: IdeaResultReads): IdeaResultSource {
  return {
    results(tripId, ideaId): IdeaResult[] {
      const excursions = reads
        .getExcursions(tripId)
        .filter((excursion) => excursion.idea_id === ideaId)
        .map((excursion) => ({
          key: `excursion:${excursion.id}`,
          kind: IDEA_RESULT_EXCURSION,
          title: excursion.name,
          done: false,
          path: tripExcursionsPath(tripId, excursion.id),
        }))
      const tasks = reads
        .getTripTodos(tripId)
        .filter((task) => task.idea_id === ideaId)
        .map((task) => ({
          key: `task:${task.id}`,
          kind: IDEA_RESULT_TASK,
          title: task.body,
          done: task.task_state === 'resolved',
          path: tripSubPath(tripId, 'tasks'),
        }))
      return [...excursions, ...tasks]
    },
  }
}
