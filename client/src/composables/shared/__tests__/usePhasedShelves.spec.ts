/**
 * The shelves M6 and M25 share (FR-30, FR-7.14): which shelf folds to a line
 * at the end, what that line says, and the drop key both screens write.
 */
import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'

import { t } from '@/i18n'
import { usePhasedShelves } from '../usePhasedShelves'

type Shelf = 'before' | 'during'

function shelvesOver(
  state: Record<Shelf, { open: number; due: number; done: number }>,
  locked = false,
) {
  return usePhasedShelves<Shelf>({
    shelves: ['before', 'during'],
    closed: (shelf) => shelf === 'before' && locked,
    open: (shelf) => state[shelf].open,
    due: (shelf) => state[shelf].due,
    done: (shelf) => state[shelf].done,
    words: {
      name: (shelf) => (shelf === 'before' ? 'tasks.before' : 'tasks.during'),
      history: 'tasks.beforeHistory',
      historyEmpty: 'tasks.beforeHistoryEmpty',
      rest: 'tasks.phaseRest',
      restDone: 'tasks.phaseRestDone',
      restDue: 'tasks.phaseRestDue',
      restDueDone: 'tasks.phaseRestDueDone',
    },
  })
}

describe('usePhasedShelves', () => {
  it('folds a shelf with nothing open under its heading, and follows the counts', () => {
    const state = reactive({
      before: { open: 2, due: 0, done: 0 },
      during: { open: 0, due: 0, done: 0 },
    })
    const shelves = shelvesOver(state)
    expect(shelves.inOrder('before')).toBe(true)
    expect(shelves.restShelves.value).toEqual(['during'])

    state.before.open = 0
    expect(shelves.restShelves.value).toEqual(['before', 'during'])
  })

  it('folds the closed shelf even with open rows, as history', () => {
    const shelves = shelvesOver(
      { before: { open: 3, due: 0, done: 2 }, during: { open: 1, due: 0, done: 0 } },
      true,
    )
    expect(shelves.restShelves.value).toEqual(['before'])
    expect(shelves.restLabel('before')).toBe(t('tasks.beforeHistory', { n: 2 }))
    expect(shelves.restExpandable('before')).toBe(true)
  })

  it('names the closed shelf with nothing finished, and still opens on the lock sentence', () => {
    const shelves = shelvesOver(
      { before: { open: 0, due: 0, done: 0 }, during: { open: 1, due: 0, done: 0 } },
      true,
    )
    expect(shelves.restLabel('before')).toBe(t('tasks.beforeHistoryEmpty'))
    expect(shelves.restExpandable('before')).toBe(true)
  })

  it('counts what stands in the due block and what is finished on the fold line', () => {
    const state = reactive({
      before: { open: 0, due: 0, done: 0 },
      during: { open: 0, due: 0, done: 0 },
    })
    const shelves = shelvesOver(state)
    const shelf = t('tasks.before')
    expect(shelves.restLabel('before')).toBe(t('tasks.phaseRest', { shelf }))
    expect(shelves.restExpandable('before')).toBe(false)

    state.before.done = 3
    expect(shelves.restLabel('before')).toBe(t('tasks.phaseRestDone', { shelf, n: 3 }))
    expect(shelves.restExpandable('before')).toBe(true)

    state.before.due = 1
    expect(shelves.restLabel('before')).toBe(t('tasks.phaseRestDueDone', { shelf, due: 1, n: 3 }))

    state.before.done = 0
    expect(shelves.restLabel('before')).toBe(t('tasks.phaseRestDue', { shelf, due: 1 }))
  })

  it('starts every fold closed and toggles one at a time', () => {
    const shelves = shelvesOver({
      before: { open: 0, due: 0, done: 1 },
      during: { open: 0, due: 0, done: 1 },
    })
    expect(shelves.restOpen).toEqual({ before: false, during: false })
    shelves.toggleRest('during')
    expect(shelves.restOpen).toEqual({ before: false, during: true })
  })

  it('reads a drop key back whole, a separator inside the group key included', () => {
    const shelves = shelvesOver({
      before: { open: 1, due: 0, done: 0 },
      during: { open: 1, due: 0, done: 0 },
    })
    const target = shelves.dropKey('during')({ key: 'Bau/Garten' })
    expect(target).toBe('during/Bau/Garten')
    expect(shelves.readDropKey(target)).toEqual({ shelf: 'during', key: 'Bau/Garten' })
  })
})
