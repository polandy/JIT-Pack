/**
 * M25's reading of a trip's tasks (FR-7.14): what is pressing on top, then
 * each phase's open tasks, then each phase's finished ones.
 *
 * The owner's rework of 2026-09-25 put *what is due now* above the tag
 * groups: a task that is overdue, due today or in the next two days is read
 * in one block across both phases and every tag, and **leaves its group while
 * it is there** — a task listed twice is a task ticked in one place and still
 * open in the other. The finished tasks leave the groups too: one fold per
 * phase, rather than one under every heading.
 *
 * Pure, like the rest of `domain/`: `today` comes from the caller.
 */
import type { TaskPhase } from '@/types/domain'
import { TASK_PHASE_BEFORE, TASK_PHASE_DURING } from '@/types/domain'
import { byDue, isDuePressing } from './taskDue'
import type { TripTask } from './tripTodos'

/** One phase of M25, split the way the screen draws it. */
export interface PhaseShelf {
  /** The open tasks that are not pressing — what the tag groups hold. */
  open: TripTask[]
  /** The finished ones, behind the phase's one *erledigt* fold. */
  resolved: TripTask[]
}

/** What M25 draws, top to bottom. */
export interface TaskBoard {
  /** The *Fällig* block: pressing open tasks of both phases, earliest first. */
  due: TripTask[]
  before: PhaseShelf
  during: PhaseShelf
}

/**
 * taskBoard files every task in exactly one place.
 *
 * `beforeLocked` (FR-7.12): once the packing is finished, *before the trip*
 * is history, and a task still standing there is read in that history rather
 * than called due — the block is for what can still be done.
 */
export function taskBoard(
  tasks: readonly TripTask[],
  today: string,
  opts: { beforeLocked: boolean },
): TaskBoard {
  const pressing = (task: TripTask) =>
    task.task_state === 'open' &&
    !(opts.beforeLocked && task.phase === TASK_PHASE_BEFORE) &&
    isDuePressing(task, today)
  const due = byDue(tasks.filter(pressing), today)
  const shelf = (phase: TaskPhase): PhaseShelf => {
    const inPhase = tasks.filter((task) => task.phase === phase && !pressing(task))
    return {
      open: inPhase.filter((task) => task.task_state === 'open'),
      resolved: inPhase.filter((task) => task.task_state === 'resolved'),
    }
  }
  return { due, before: shelf(TASK_PHASE_BEFORE), during: shelf(TASK_PHASE_DURING) }
}
