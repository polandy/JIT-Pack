// @vitest-environment jsdom
/**
 * M1's due line (FR-7.11, FR-30.10): what is due by tomorrow across the
 * active trips, said in the page head's second line for as long as it is
 * true, each count leading to its block. It replaced a toast that said it
 * once, for three seconds, in Local Mode only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import type { HeadMetaPart } from '@/composables/shared/useHeaderTitle'
import type { TripTask } from '@/domain/tripTodos'
import { setLocale } from '@/i18n'
import type { DueTally } from '@/domain/shared/dueDay'
import { DUE_BLOCK_SHOPPING, DUE_BLOCK_TASKS } from '@/kernel/tripCards'
import { useDueLine } from '../useDueLine'

const TODAY = '2026-07-08'
const task = (id: string, due: string | null, state = 'open'): TripTask =>
  ({ id, body: id, task_state: state, due_date: due }) as TripTask

const sentence = (parts: readonly HeadMetaPart[] | null) =>
  parts === null ? null : parts.map((part) => part.text).join('')

function setup(opts: {
  trips?: Record<string, TripTask[]>
  purchases?: Record<string, DueTally>
  loaded?: () => boolean
  noShopping?: boolean
}) {
  const trips = opts.trips ?? { t1: [task('Pass', '2026-07-01'), task('Velo', '2026-07-09')] }
  const tripIds = ref(Object.keys(trips))
  const go = vi.fn()
  const line = useDueLine({
    tripIds,
    loaded: opts.loaded ?? (() => true),
    tasksOf: (id) => trips[id] ?? [],
    purchases: opts.noShopping ? undefined : (id) => opts.purchases?.[id] ?? { due: 0, overdue: 0 },
    today: () => TODAY,
    go,
  })
  return { line, go, tripIds }
}

beforeEach(() => setLocale('de'))

describe('useDueLine — what it says (FR-7.11, FR-30.10)', () => {
  it.each([
    [
      'tasks and purchases, one task late',
      [task('Pass', '2026-07-01'), task('Velo', '2026-07-09')],
      { due: 3, overdue: 0 },
      '2 Aufgaben (1 überfällig) · 3 Einkäufe fällig',
    ],
    ['only tasks', [task('Velo', '2026-07-08')], { due: 0, overdue: 0 }, '1 Aufgabe fällig'],
    ['only purchases', [], { due: 2, overdue: 0 }, '2 Einkäufe fällig'],
    [
      'only something late',
      [task('Pass', '2026-07-01')],
      { due: 0, overdue: 0 },
      '1 Aufgabe überfällig',
    ],
    [
      'one kind all late, the other not',
      [task('Pass', '2026-07-01')],
      { due: 3, overdue: 1 },
      '1 Aufgabe überfällig · 3 Einkäufe fällig (1 überfällig)',
    ],
  ])('%s', (_name, tasks, purchases, want) => {
    const { line } = setup({ trips: { t1: tasks }, purchases: { t1: purchases } })
    expect(sentence(line.value)).toBe(want)
  })

  it('says nothing where nothing is due by tomorrow — the head keeps its own line', () => {
    const { line } = setup({ trips: { t1: [task('Später', '2026-07-30'), task('Ohne', null)] } })
    expect(line.value).toBeNull()
  })

  it('never counts a finished task, whatever its date', () => {
    const { line } = setup({ trips: { t1: [task('Pass', '2026-07-01', 'done')] } })
    expect(line.value).toBeNull()
  })

  it('sums every active trip', () => {
    const { line } = setup({
      trips: { t1: [task('Pass', '2026-07-08')], t2: [task('Velo', '2026-07-09')] },
      purchases: { t2: { due: 1, overdue: 0 } },
    })
    expect(sentence(line.value)).toBe('2 Aufgaben · 1 Einkauf fällig')
  })

  it('counts no purchases in a build without the shopping module', () => {
    const { line } = setup({ noShopping: true })
    expect(sentence(line.value)).toBe('2 Aufgaben fällig (1 überfällig)')
  })

  it('says it in English too', () => {
    setLocale('en')
    const { line } = setup({ purchases: { t1: { due: 1, overdue: 0 } } })
    expect(sentence(line.value)).toBe('2 tasks (1 overdue) · 1 purchase due')
  })
})

describe('useDueLine — when it speaks (ADR-033)', () => {
  it('waits for the rows, rather than counting a partition in flight', () => {
    const loaded = ref(false)
    const { line } = setup({ loaded: () => loaded.value })
    expect(line.value).toBeNull()

    loaded.value = true
    expect(sentence(line.value)).toBe('2 Aufgaben fällig (1 überfällig)')
  })

  it('says nothing without an active trip', () => {
    const { line, tripIds } = setup({})
    tripIds.value = []
    expect(line.value).toBeNull()
  })
})

describe('useDueLine — where a count leads', () => {
  it('leads each count to its block on the first trip that has some due', () => {
    const { line, go } = setup({
      trips: { t1: [], t2: [task('Velo', '2026-07-09')] },
      purchases: { t1: { due: 1, overdue: 0 } },
    })
    const acts = line.value!.filter((part) => part.act)
    expect(acts.map((part) => part.testid)).toEqual(['due-line-tasks', 'due-line-shopping'])

    acts[0]!.act!()
    acts[1]!.act!()
    expect(go.mock.calls).toEqual([
      [DUE_BLOCK_TASKS, 't2'],
      [DUE_BLOCK_SHOPPING, 't1'],
    ])
  })

  it('sets only the late counts apart', () => {
    const { line } = setup({ purchases: { t1: { due: 1, overdue: 0 } } })
    expect(line.value!.filter((part) => part.late).map((part) => part.text)).toEqual([
      ' (1 überfällig)',
    ])
  })
})
