// @vitest-environment jsdom
/**
 * FR-7.18 — the daily reminder's time as the instance names it, kept for an
 * offline start, and the server's default until it has said anything.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_REMINDER_TIME,
  REMINDER_TIME_STORAGE_KEY,
  initReminderTime,
  setReminderTime,
  useDailyReminder,
} from '../reminderTime'
import { MODE_KEY } from '@/mode'

describe('the daily reminder time (FR-7.18)', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(MODE_KEY, 'server')
    setReminderTime(DEFAULT_REMINDER_TIME)
  })

  it('is the server’s default until the instance names one', () => {
    localStorage.removeItem(REMINDER_TIME_STORAGE_KEY)
    initReminderTime()
    expect(useDailyReminder().value).toBe('06:00')
  })

  it('keeps the instance’s time for the next start', () => {
    setReminderTime('07:30')
    expect(useDailyReminder().value).toBe('07:30')
    expect(localStorage.getItem(REMINDER_TIME_STORAGE_KEY)).toBe('07:30')

    setReminderTime(DEFAULT_REMINDER_TIME)
    localStorage.setItem(REMINDER_TIME_STORAGE_KEY, '20:15')
    initReminderTime()
    expect(useDailyReminder().value).toBe('20:15')
  })

  it('ignores an answer that is no time, from an older server or a damaged store', () => {
    setReminderTime('07:30')
    setReminderTime(undefined)
    expect(useDailyReminder().value).toBe('07:30')

    localStorage.setItem(REMINDER_TIME_STORAGE_KEY, 'soon')
    setReminderTime(DEFAULT_REMINDER_TIME)
    initReminderTime()
    expect(useDailyReminder().value).toBe('06:00')
  })

  it('is no time at all in Local Mode, where no server reminds', () => {
    setReminderTime('07:30')
    localStorage.setItem(MODE_KEY, 'local')
    expect(useDailyReminder().value).toBeNull()
  })
})
