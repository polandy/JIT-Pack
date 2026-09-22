// @vitest-environment jsdom
/**
 * FR-7.10: the dashboard's field files a task and says where it went in its own
 * words (*„… zu Aufgaben hinzugefügt“*), while M25's composer keeps the
 * sentence it always had. Both go through the same act, so the undo is the same.
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { t } from '@/i18n'
import { ORCHESTRATOR } from '../useOrchestrator'
import { useRowUndo } from '../useRowUndo'
import { useTaskActs } from '../useTaskActs'

const deleteTripTodo = vi.fn()

function actsFor() {
  const announceAct = vi.fn()
  const rowUndo = useRowUndo()
  let acts!: ReturnType<typeof useTaskActs>
  mount(
    defineComponent({
      setup() {
        acts = useTaskActs(() => 't1', {
          rowUndo,
          announceAct,
          announceTaskDone: vi.fn(),
          pickAssignee: () => Promise.resolve(undefined),
          nameOf: () => null,
          removing: ref(new Set<string>()),
        })
        return () => null
      },
    }),
    { global: { provide: { [ORCHESTRATOR]: { deleteTripTodo } } } },
  )
  return { acts, announceAct, rowUndo }
}

beforeEach(() => {
  setActivePinia(createPinia())
  deleteTripTodo.mockClear()
})

describe('useTaskActs.added (FR-7.10)', () => {
  it('says what the caller says, when the caller says something', () => {
    const { acts, announceAct } = actsFor()
    acts.added('k1', 'Post nachsenden', t('dashboard.tasksAdded', { body: 'Post nachsenden' }))
    expect(announceAct).toHaveBeenCalledWith(t('dashboard.tasksAdded', { body: 'Post nachsenden' }))
  })

  it('keeps M25’s sentence when it is not told another', () => {
    const { acts, announceAct } = actsFor()
    acts.added('k1', 'Post nachsenden')
    expect(announceAct).toHaveBeenCalledWith(
      t('packing.taskAddedToast', { body: 'Post nachsenden' }),
    )
  })

  it('arms the same undo either way: it takes the task out again', () => {
    const { acts, rowUndo } = actsFor()
    acts.added('k1', 'x', 'custom')
    expect(rowUndo.pending.value).toHaveLength(1)
  })
})
