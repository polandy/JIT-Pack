/**
 * Every act on a task, written once (FR-7.6/FR-7.7).
 *
 * Two screens now operate the same list: M4's window of what is to be done
 * while packing, and M25, where all of it lives. Each act has three parts that
 * have to agree — which of the two kinds of task is being written, what the
 * undo puts back, and what the snackbar says — and the first of them is a
 * question neither screen should be answering twice.
 *
 * It was M4's private code until FR-7.7 gave the tasks a screen of their own.
 * Moved rather than copied, for `rowFacts.ts`'s reason: two transcriptions of
 * one rule do not stay one rule. The seams it needs — the undo record, the
 * announcer, the assignee picker — are passed in, because they belong to the
 * screen: a snackbar is a property of the page the reader is looking at.
 */
import type { Ref } from 'vue'

import { useOrchestrator } from '@/composables/useOrchestrator'
import type { RowUndo } from '@/composables/useRowUndo'
import type { TripTask } from '@/domain/tripTodos'
import { t } from '@/i18n'
import { useTripStore } from '@/stores/tripStore'
import type { ItemTodo, TaskPhase, TripTodo } from '@/types/domain'
import { TASK_PHASE_DURING } from '@/types/domain'

/** What a screen lends the acts: its undo, its voice, its pickers. */
export interface TaskActDeps {
  rowUndo: RowUndo
  /** The screen's snackbar sentence. */
  announceAct: (message: string) => unknown
  /** FR-19.4's *„erledigt"* announcement, which is not an ordinary sentence. */
  announceTaskDone: (body: string) => unknown
  /** The action sheet that asks whose job it is; `undefined` means cancelled. */
  pickAssignee: (header: string, current: string | null) => Promise<string | null | undefined>
  /** A member's display name, or null where nobody can be named (G-8). */
  nameOf: (userId: string | null) => string | null
  /**
   * Tasks hidden while their removal can still be taken back. The screen owns
   * the set because it is the screen that must stop listing them (FR-25.31).
   */
  removing: Ref<Set<string>>
}

/** useTaskActs binds the acts to one trip and one screen's seams. */
export function useTaskActs(tripId: () => string, deps: TaskActDeps) {
  const orchestrator = useOrchestrator()
  const tripStore = useTripStore()
  const { rowUndo, announceAct, announceTaskDone, pickAssignee, nameOf, removing } = deps

  /** The trip's own task as it is now, or null once it has left the trip. */
  function liveTripTodo(id: string): TripTodo | null {
    return tripStore.getTripTodos(tripId()).find((row) => row.id === id) ?? null
  }

  /** A row's preparation as it is now, for the same reason. */
  function liveItemTodo(itemId: string, id: string): ItemTodo | null {
    return tripStore.getItemTodos(tripId(), itemId).find((row) => row.id === id) ?? null
  }

  /** Either kind, found by the task's own id — the sheet and the move need it. */
  function liveTask(task: TripTask): ItemTodo | TripTodo | null {
    return task.item ? liveItemTodo(task.item.id, task.id) : liveTripTodo(task.id)
  }

  /**
   * FR-7.6: one checkbox, two kinds of task. The live row is looked up here
   * because the task in hand is a projection of the pre-tap state, and writing
   * from it would hand the optimistic layer a stale baseline.
   */
  function toggle(task: TripTask) {
    if (task.item) {
      const prep = liveItemTodo(task.item.id, task.id)
      if (prep) togglePrep(prep)
      return
    }
    const todo = liveTripTodo(task.id)
    if (todo) toggleOwn(todo)
  }

  function toggleOwn(todo: TripTodo) {
    const live = () => liveTripTodo(todo.id)
    if (todo.task_state === 'open') {
      orchestrator.resolveTripTodo(todo)
      rowUndo.armAction(todo.body, () => {
        const row = live()
        if (row?.task_state === 'resolved') orchestrator.reopenTripTodo(row)
      })
      void announceTaskDone(todo.body)
    } else {
      orchestrator.reopenTripTodo(todo)
      rowUndo.armAction(todo.body, () => {
        const row = live()
        if (row?.task_state === 'open') orchestrator.resolveTripTodo(row)
      })
      void announceAct(t('packing.taskReopenedToast', { body: todo.body }))
    }
  }

  function togglePrep(todo: ItemTodo) {
    const live = () => liveItemTodo(todo.trip_item_id, todo.id)
    if (todo.task_state === 'open') {
      orchestrator.resolvePrepTodo(tripId(), todo)
      rowUndo.armAction(todo.body, () => {
        const row = live()
        if (row?.task_state === 'resolved') orchestrator.reopenPrepTodo(tripId(), row)
      })
      void announceTaskDone(todo.body)
    } else {
      orchestrator.reopenPrepTodo(tripId(), todo)
      rowUndo.armAction(todo.body, () => {
        const row = live()
        if (row?.task_state === 'open') orchestrator.resolvePrepTodo(tripId(), row)
      })
      void announceAct(t('packing.taskReopenedToast', { body: todo.body }))
    }
  }

  /** The composer wrote one: the undo takes it out again. */
  function added(id: string, body: string, message?: string) {
    rowUndo.armAction(body, () => {
      const live = liveTripTodo(id)
      if (live) orchestrator.deleteTripTodo(live)
    })
    void announceAct(message ?? t('packing.taskAddedToast', { body }))
  }

  /**
   * FR-7.5/FR-7.7: the seat, tapped. Since FR-7.7 a preparation has one too,
   * so the write goes through whichever action owns that kind — the column is
   * the same, the optimistic row is not.
   */
  async function assign(task: TripTask) {
    const todo = liveTask(task)
    if (!todo) return
    const picked = await pickAssignee(todo.body, todo.assignee_user_id)
    if (picked === undefined || picked === todo.assignee_user_id) return
    const previous = todo.assignee_user_id
    rowUndo.armAction(todo.body, () => {
      const live = liveTask(task)
      if (live) writeAssignee(live, previous)
    })
    writeAssignee(todo, picked)
    void announceAct(
      picked === null
        ? t('packing.unassignedToast', { name: todo.body })
        : t('packing.assignedToast', { name: todo.body, who: nameOf(picked) ?? '' }),
    )
  }

  function writeAssignee(todo: ItemTodo | TripTodo, userId: string | null) {
    if ('trip_item_id' in todo) orchestrator.assignPrepTodo(tripId(), todo, userId)
    else orchestrator.assignTripTodo(todo, userId)
  }

  /** Hidden now and deleted when the undo lapses — the confirmed removal's reason. */
  function remove(task: TripTask) {
    const id = task.id
    rowUndo.armAction(
      task.body,
      () => removing.value.delete(id),
      () => {
        const live = liveTripTodo(id)
        if (live) orchestrator.deleteTripTodo(live)
        removing.value.delete(id)
      },
    )
    removing.value.add(id)
    void announceAct(t('packing.taskDeletedToast', { body: task.body }))
  }

  /**
   * FR-7.7's crossing by hand: the salve moves to *during the trip*, or back.
   *
   * The undo writes the phase the task actually had rather than the other one
   * — a task written before FR-7.7 carries none at all, and „the opposite of
   * during" would be a statement nobody made.
   */
  function move(task: TripTask, phase: TaskPhase) {
    const todo = liveTask(task)
    if (!todo) return
    const previous = todo.phase
    rowUndo.armAction(todo.body, () => {
      const live = liveTask(task)
      if (live) orchestrator.setTaskPhase(tripId(), live, previous)
    })
    orchestrator.setTaskPhase(tripId(), todo, phase)
    void announceAct(
      t(phase === TASK_PHASE_DURING ? 'tasks.movedToDuring' : 'tasks.movedToBefore', {
        body: todo.body,
      }),
    )
  }

  /**
   * FR-7.8: the task lands somewhere — a tag, a phase, or both in one motion,
   * which is what the owner asked a drag across the two to do.
   *
   * **One undo for the whole movement.** The record holds a single action at
   * a time by design (`useRowUndo`), so arming one for the tag and another
   * for the phase would leave the first without a way back. It writes both
   * previous values, and it writes them even where only one changed: an undo
   * that put back what never moved is harmless, while one that forgot half a
   * movement is the defect.
   */
  function retag(task: TripTask, phase: TaskPhase, taskTagId: string | null) {
    const todo = liveTask(task)
    if (!todo) return
    const before = { tag: todo.task_tag_id, phase: todo.phase }
    const movedTag = before.tag !== taskTagId
    const movedPhase = before.phase !== phase
    // A drop that changed nothing writes nothing and arms nothing. The
    // gesture still ends — `data-drag` returns to idle either way — and a
    // snackbar for a non-event would be noise.
    if (!movedTag && !movedPhase) return

    rowUndo.armAction(todo.body, () => {
      const live = liveTask(task)
      if (!live) return
      if (movedTag) orchestrator.setTaskTag(tripId(), live, before.tag)
      if (movedPhase) orchestrator.setTaskPhase(tripId(), live, before.phase)
    })
    if (movedTag) orchestrator.setTaskTag(tripId(), todo, taskTagId)
    if (movedPhase) orchestrator.setTaskPhase(tripId(), todo, phase)
    void announceAct(t('tasks.movedToast', { body: todo.body }))
  }

  return { toggle, added, assign, remove, move, retag, liveTripTodo, liveItemTodo }
}
