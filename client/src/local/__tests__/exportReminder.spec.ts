import { describe, it, expect } from 'vitest'
import { backupCoversDevice, reminderState, EXPORT_REMINDER_DAYS } from '../exportReminder'

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

  it('reads a stamp from the future as today, never as negative days', () => {
    // The G-2 detail captures `now` when it opens and stamps the backup when
    // the user taps — the stamp is then the later of the two.
    const now = 1_760_000_000_000
    expect(reminderState(now + 5_000, now)).toEqual({
      due: false,
      lastAt: now + 5_000,
      daysSince: 0,
    })
  })
})

/**
 * FR-19.8: the switch off Local Mode is allowed only while the backup is at
 * least as new as the last write — an edit after the backup closes it again.
 */
describe('backupCoversDevice', () => {
  it('holds a device that never wrote to nothing', () => {
    expect(backupCoversDevice(null, null)).toBe(true)
    expect(backupCoversDevice(now, null)).toBe(true)
  })

  it('refuses a device that wrote and never backed up', () => {
    expect(backupCoversDevice(null, now)).toBe(false)
  })

  it('is covered when the backup is newer than the last write, and at the same instant', () => {
    expect(backupCoversDevice(now, now - 1)).toBe(true)
    expect(backupCoversDevice(now, now)).toBe(true)
  })

  it('is uncovered the moment a write lands after the backup', () => {
    expect(backupCoversDevice(now, now + 1)).toBe(false)
  })
})
