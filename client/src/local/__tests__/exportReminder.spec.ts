import { describe, it, expect } from 'vitest'
import { reminderState, EXPORT_REMINDER_DAYS } from '../exportReminder'

// NFR-4.11: in Local Mode the portable YAML export is the only backup, so
// the app nudges the user when it has been too long (or never).

const DAY = 86_400_000
const now = 1_000 * DAY

describe('reminderState', () => {
  it('is due and has no history when never exported', () => {
    expect(reminderState(null, now)).toEqual({ due: true, lastAt: null, daysSince: null })
  })

  it('is not due right after an export', () => {
    const s = reminderState(now - 2 * DAY, now)
    expect(s.due).toBe(false)
    expect(s.daysSince).toBe(2)
  })

  it('becomes due at the threshold', () => {
    expect(reminderState(now - EXPORT_REMINDER_DAYS * DAY, now).due).toBe(true)
  })

  it('stays not due just under the threshold', () => {
    expect(reminderState(now - (EXPORT_REMINDER_DAYS - 1) * DAY, now).due).toBe(false)
  })

  it('honors a custom threshold', () => {
    expect(reminderState(now - 8 * DAY, now, 7).due).toBe(true)
    expect(reminderState(now - 6 * DAY, now, 7).due).toBe(false)
  })
})
