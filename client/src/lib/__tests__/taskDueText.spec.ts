// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, setLocale } from '@/i18n'
import { dueLabel } from '../taskDueText'

const TODAY = '2026-07-08'
const open = (due: string | null) => ({ due_date: due, task_state: 'open' as const })

describe('FR-7.11 dueLabel', () => {
  afterEach(() => setLocale(DEFAULT_LOCALE))

  it.each([
    ['2026-07-08', 'today', 'Heute'],
    ['2026-07-09', 'soon', 'Morgen'],
    ['2026-07-10', 'soon', 'In 2 Tagen'],
  ])('words %s as %s', (due, state, text) => {
    setLocale('de')
    expect(dueLabel(open(due), TODAY)).toEqual({ state, text })
  })

  it('says overdue without the date, and names the date of one further out', () => {
    setLocale('de')
    const overdue = dueLabel(open('2026-07-03'), TODAY)!
    expect(overdue.state).toBe('overdue')
    expect(overdue.text).toBe('Überfällig')
    const later = dueLabel(open('2026-07-17'), TODAY)!
    expect(later.state).toBe('later')
    expect(later.text).toMatch(/17\.7\./)
  })

  it('says nothing of a task without a date, or of a finished one', () => {
    expect(dueLabel(open(null), TODAY)).toBeNull()
    expect(dueLabel({ due_date: '2026-07-01', task_state: 'resolved' }, TODAY)).toBeNull()
  })
})
