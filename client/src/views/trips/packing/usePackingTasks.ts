/**
 * FR-7.4/7.6/7.7: the tasks M4 keeps — its window onto the trip's tasks, the
 * figure and line that count it, and the task sheet M25 opens too.
 */
import { computed, ref } from 'vue'

import { useTaskActs } from '@/composables/useTaskActs'
import { useTripTasks } from '@/composables/useTripTasks'
import {
  packingWindowTasks,
  tripTodoProgress,
  tripTodoStatus,
  type TripTask,
} from '@/domain/tripTodos'
import { t } from '@/i18n'
import type { TaskPhase } from '@/types/domain'

import type { PackingCore } from './usePackingCore'

/** Builds the task window's state and acts over the page's core. */
export function usePackingTasks(core: PackingCore) {
  const { tripId, orchestrator } = core
  const { tasksOf } = useTripTasks()

  /**
   * FR-7.6: every task of the trip, its own and its rows' preparations, in one
   * list — what the section shows and what its head and figure count.
   *
   * Two kinds of pending removal are already out of it (FR-25.31): a task whose
   * own ✕ was tapped, and every task of a row that is on its way off the list.
   * The row leaves the screen before its delete is written, and a task still
   * listed for it would carry a chip into a row nobody can see any more.
   */
  const tasks = computed(() =>
    tasksOf(tripId).filter(
      (task) =>
        !core.removingTodos.value.has(task.id) &&
        !(task.item !== null && core.removingRows.value.has(task.item.id)),
    ),
  )
  /**
   * FR-7.7: what M4 keeps of the tasks — the ones that hang off a packing row
   * and are still due before the trip, because those are the ones you do as
   * part of packing. Everything else lives on M25, one pill away.
   *
   * The section's figure counts this list and not the trip's whole one: a head
   * that said „3 von 8" over four lines would be reporting on a screen the
   * reader is not looking at.
   */
  const windowTasks = computed(() => packingWindowTasks(tasks.value, orchestrator.today()))
  const count = computed(() => tripTodoProgress(windowTasks.value))
  const state = computed(() => tripTodoStatus(count.value))

  /** FR-7.4/7.6: the section head's own check, apart from every packing figure. */
  const line = computed(() => {
    if (state.value === 'none') return null
    if (state.value === 'allDone') return t('tripTodos.allDone')
    return t('tripTodos.progress', { done: count.value.done, total: count.value.total })
  })

  /**
   * FR-7.6/FR-7.7: every act on a task, written once in `useTaskActs` and shared
   * with M25 — the same two kinds of row, the same undo, the same sentences.
   * What stays here is only what belongs to this screen: its snackbar, its
   * picker's audience, and the set of tasks hidden pending a removal.
   */
  const acts = useTaskActs(() => tripId, {
    rowUndo: core.rowUndo,
    announceAct: core.announceAct,
    announceTaskDone: core.announceTaskDone,
    pickAssignee: (header, current) => core.pickAssignee(header, current, core.todoAssignees.value),
    nameOf: core.nameOf,
    removing: core.removingTodos,
  })

  /**
   * FR-7.7: the task sheet, the same one M25 opens. Held by id rather than by
   * value, so a task ticked off on another device cannot leave a sheet behind
   * claiming it is open.
   */
  const openedId = ref<string | null>(null)
  const opened = computed(() => tasks.value.find((task) => task.id === openedId.value) ?? null)

  function open(task: TripTask) {
    openedId.value = task.id
  }

  function close() {
    openedId.value = null
  }

  function onMove(phase: TaskPhase) {
    const task = opened.value
    close()
    if (task) acts.move(task, phase)
  }

  /** FR-7.11: the sheet stays up — the date is one fact of several on it. */
  function onDue(dueDate: string | null) {
    if (opened.value) acts.setDue(opened.value, dueDate)
  }

  /** FR-7.14: finished from the sheet, which closes as the line leaves the window. */
  function onToggleFromSheet() {
    const task = opened.value
    close()
    if (task) acts.toggle(task)
  }

  /** FR-7.14: the words, corrected on the sheet. */
  function onRename(body: string) {
    if (opened.value) acts.rename(opened.value, body)
  }

  function onRemoveFromSheet() {
    const task = opened.value
    close()
    if (task) acts.remove(task)
  }

  return {
    windowTasks,
    state,
    line,
    acts,
    opened,
    open,
    close,
    onMove,
    onDue,
    onToggleFromSheet,
    onRename,
    onRemoveFromSheet,
  }
}
