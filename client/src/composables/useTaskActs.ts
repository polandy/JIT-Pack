/**
 * Every act on a task, written once (FR-7.6/FR-7.7).
 *
 * Two screens now operate the same list: M4's window of what is to be done
 * while packing, and M25, where all of it lives. Each act has three parts that
 * have to agree — which of the two kinds of task is being written, what the
 * undo puts back, and what the snackbar says — and the first of them is a
 * question neither screen should be answering twice.
 *
 * Shared by M4 and M25 (FR-7.7) rather than copied, for `rowFacts.ts`'s
 * reason: two transcriptions of one rule do not stay one rule. The seams it needs — the undo record, the
 * announcer, the assignee picker — are passed in, because they belong to the
 * screen: a snackbar is a property of the page the reader is looking at.
 */
import type { Ref } from 'vue'

import { useOrchestrator } from '@/composables/useOrchestrator'
import type { RowUndo } from '@/composables/useRowUndo'
import { tasksToMove, tasksToRetag, type TripTask } from '@/domain/tripTodos'
import { t } from '@/i18n'
import { shortDueDay } from '@/lib/taskDueText'
import { useTripStore } from '@/stores/tripStore'
import type { ItemTodo, TaskPhase, TodoState, TripTodo } from '@/types/domain'
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
   * FR-7.11: the day a task is due, set, moved or taken off. The undo writes
   * the date it had — null included, which is a state and not a gap.
   */
  function setDue(task: TripTask, dueDate: string | null) {
    const todo = liveTask(task)
    if (!todo || todo.due_date === dueDate) return
    const previous = todo.due_date
    rowUndo.armAction(todo.body, () => {
      const live = liveTask(task)
      if (live) orchestrator.setTaskDueDate(tripId(), live, previous)
    })
    orchestrator.setTaskDueDate(tripId(), todo, dueDate)
    void announceAct(
      dueDate === null
        ? t('tasks.dueClearedToast', { body: todo.body })
        : t('tasks.dueSetToast', { body: todo.body, date: shortDueDay(dueDate) }),
    )
  }

  /**
   * FR-7.8: the task lands somewhere — a tag, a phase, or both in one motion,
   * which is what a drag across the two does.
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

  /**
   * FR-7.8's batch, from a selection: several tasks under one tag, or into one
   * phase, in one act. Only what changes is written (`tasksToRetag`,
   * `tasksToMove`), and **one undo takes the whole batch back** — the undo
   * record holds one action at a time, so a batch armed task by task would
   * leave all but the last without a way home. Each task's own previous value
   * is what the undo writes, never „the opposite".
   *
   * Returns how many were written, so the screen can say when a batch changed
   * nothing instead of announcing a non-event.
   */
  function retagMany(tasks: readonly TripTask[], taskTagId: string | null): number {
    return writeBatch(
      tasksToRetag(tasks, taskTagId),
      (todo) => todo.task_tag_id,
      (todo, value) => orchestrator.setTaskTag(tripId(), todo, value),
      taskTagId,
      (n) => t('tasks.bulkRetagged', { n }),
    )
  }

  function moveMany(tasks: readonly TripTask[], phase: TaskPhase): number {
    return writeBatch(
      tasksToMove(tasks, phase),
      (todo) => todo.phase,
      (todo, value) => orchestrator.setTaskPhase(tripId(), todo, value),
      phase,
      (n) =>
        t(phase === TASK_PHASE_DURING ? 'tasks.bulkMovedToDuring' : 'tasks.bulkMovedToBefore', {
          n,
        }),
    )
  }

  /**
   * FR-7.14: the selection's *Erledigt* — every selected open task ticked off
   * in one act, with one undo that reopens exactly those. Only open tasks
   * reach a selection, so every one of them changes.
   */
  function resolveMany(tasks: readonly TripTask[]): number {
    return writeBatch(
      tasks.filter((task) => task.task_state === 'open'),
      (todo) => todo.task_state,
      (todo, state) => writeState(todo, state),
      'resolved' as TodoState,
      (n) => t('tasks.bulkResolved', { n }),
    )
  }

  /** FR-7.14: the selection's *Fällig* — one day for all of them, or none. */
  function dueMany(tasks: readonly TripTask[], dueDate: string | null): number {
    return writeBatch(
      tasks.filter((task) => task.due_date !== dueDate),
      (todo) => todo.due_date,
      (todo, value) => orchestrator.setTaskDueDate(tripId(), todo, value),
      dueDate,
      (n) =>
        dueDate === null
          ? t('tasks.bulkDueCleared', { n })
          : t('tasks.bulkDueSet', { n, date: shortDueDay(dueDate) }),
    )
  }

  /**
   * FR-7.14: the selection's *Löschen*, for the trip's own tasks (a
   * preparation is removed on its row, FR-7.3). Hidden now and deleted when
   * the undo lapses, as one removal is — and one undo brings them all back.
   */
  function removeMany(tasks: readonly TripTask[]): number {
    const ids = tasks.filter((task) => task.item === null).map((task) => task.id)
    if (ids.length === 0) return 0
    const message = t('tasks.bulkRemoved', { n: ids.length })
    rowUndo.armAction(
      message,
      () => ids.forEach((id) => removing.value.delete(id)),
      () => {
        for (const id of ids) {
          const live = liveTripTodo(id)
          if (live) orchestrator.deleteTripTodo(live)
          removing.value.delete(id)
        }
      },
    )
    ids.forEach((id) => removing.value.add(id))
    void announceAct(message)
    return ids.length
  }

  /**
   * FR-7.14: a task's words, corrected on its sheet. The undo writes back the
   * words it had.
   */
  function rename(task: TripTask, body: string) {
    const todo = liveTask(task)
    if (!todo || todo.body === body) return
    const previous = todo.body
    rowUndo.armAction(body, () => {
      const live = liveTask(task)
      if (live) orchestrator.setTaskBody(tripId(), live, previous)
    })
    orchestrator.setTaskBody(tripId(), todo, body)
    void announceAct(t('tasks.renamedToast', { body }))
  }

  /** Resolve or reopen either kind, to the state asked for. */
  function writeState(todo: ItemTodo | TripTodo, state: TodoState) {
    if (todo.task_state === state) return
    if ('trip_item_id' in todo) {
      if (state === 'resolved') orchestrator.resolvePrepTodo(tripId(), todo)
      else orchestrator.reopenPrepTodo(tripId(), todo)
    } else if (state === 'resolved') orchestrator.resolveTripTodo(todo)
    else orchestrator.reopenTripTodo(todo)
  }

  function writeBatch<V>(
    changing: readonly TripTask[],
    read: (todo: ItemTodo | TripTodo) => V,
    write: (todo: ItemTodo | TripTodo, value: V) => void,
    value: V,
    message: (n: number) => string,
  ): number {
    const writes = changing.flatMap((task) => {
      const todo = liveTask(task)
      return todo ? [{ task, todo, previous: read(todo) }] : []
    })
    if (writes.length === 0) return 0
    rowUndo.armAction(message(writes.length), () => {
      for (const { task, previous } of writes) {
        const live = liveTask(task)
        if (live) write(live, previous)
      }
    })
    for (const { todo } of writes) write(todo, value)
    void announceAct(message(writes.length))
    return writes.length
  }

  return {
    toggle,
    added,
    assign,
    remove,
    move,
    setDue,
    retag,
    retagMany,
    moveMany,
    resolveMany,
    dueMany,
    removeMany,
    rename,
    liveTripTodo,
    liveItemTodo,
  }
}
