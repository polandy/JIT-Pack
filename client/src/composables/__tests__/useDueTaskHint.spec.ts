// @vitest-environment jsdom
/**
 * FR-7.11's stand-in for the push in Local Mode: one sentence when the app
 * opens, once the trips it counts are on the device, and never twice.
 */
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import type { TripTask } from '@/domain/tripTodos'
import { setLocale } from '@/i18n'
import { resetDueTaskHint, useDueTaskHint } from '../useDueTaskHint'

const toasts = vi.hoisted(() => [] as string[])
vi.mock('@/lib/toast', () => ({
  presentToast: vi.fn(async (opts: { message: string }) => void toasts.push(opts.message)),
}))

const TODAY = '2026-07-08'
const task = (id: string, due: string | null): TripTask =>
  ({ id, body: id, task_state: 'open', due_date: due }) as TripTask

function setup(opts: { local: boolean; loaded?: () => boolean; tasks?: TripTask[] }) {
  const tripIds = ref<string[]>(['t1'])
  useDueTaskHint({
    local: opts.local,
    tripIds,
    loaded: opts.loaded ?? (() => true),
    tasksOf: () => opts.tasks ?? [task('Pass', '2026-07-01'), task('Velo', '2026-07-09')],
    today: () => TODAY,
  })
  return tripIds
}

beforeEach(() => {
  resetDueTaskHint()
  toasts.length = 0
  setLocale('de')
})

describe('useDueTaskHint (FR-7.11, Local Mode)', () => {
  it('says how many are due by tomorrow, once', async () => {
    const ids = setup({ local: true })
    await flushPromises()
    expect(toasts).toEqual(['2 Aufgaben fällig'])

    ids.value = ['t1', 't2']
    await flushPromises()
    setup({ local: true })
    await flushPromises()
    expect(toasts).toHaveLength(1)
  })

  it('waits for the rows, rather than counting a partition in flight', async () => {
    const loaded = ref(false)
    setup({ local: true, loaded: () => loaded.value })
    await flushPromises()
    expect(toasts).toEqual([])

    loaded.value = true
    await flushPromises()
    expect(toasts).toEqual(['2 Aufgaben fällig'])
  })

  it('is silent where nothing is due', async () => {
    setup({ local: true, tasks: [task('Später', '2026-07-30')] })
    await flushPromises()
    expect(toasts).toEqual([])
  })

  it('leaves a server-backed app to its push', async () => {
    setup({ local: false })
    await flushPromises()
    expect(toasts).toEqual([])
  })
})
