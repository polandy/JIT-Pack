// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { t } from '@/i18n'

import DueBadge from '../DueBadge.vue'

/**
 * FR-7.18 — a task's reminder time rides on its due pill, until the day is
 * over: an overdue task has no hour left to be reminded at.
 */
describe('DueBadge with a reminder time (FR-7.18)', () => {
  const today = '2026-07-08'
  const text = (props: { day: string | null; time?: string | null }) =>
    mount(DueBadge, { props: { today, ...props } }).text()

  it('names the time after the day, today and on a later day', () => {
    expect(text({ day: today, time: '14:00' })).toBe(`${t('tasks.dueToday')} 14:00`)
    expect(text({ day: '2026-07-09', time: '08:15' })).toBe(`${t('tasks.dueTomorrow')} 08:15`)
  })

  it('names the day alone without a time, and once overdue', () => {
    expect(text({ day: today })).toBe(t('tasks.dueToday'))
    expect(text({ day: today, time: null })).toBe(t('tasks.dueToday'))
    expect(text({ day: '2026-07-07', time: '14:00' })).toBe(t('tasks.dueOverdue'))
  })
})
