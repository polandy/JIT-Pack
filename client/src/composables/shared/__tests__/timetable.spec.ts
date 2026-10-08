// @vitest-environment jsdom
/**
 * FR-29.18 — whether the connection search is offered: the instance's switch,
 * kept for an offline start, and the device's connection as it comes and goes.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  TIMETABLE_STORAGE_KEY,
  initTimetable,
  setTimetable,
  useTimetableOffered,
} from '../timetable'

function goOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online })
  window.dispatchEvent(new Event(online ? 'online' : 'offline'))
}

describe('the timetable search (FR-29.18)', () => {
  beforeEach(() => {
    localStorage.clear()
    initTimetable()
    setTimetable(true)
    goOnline(true)
  })

  it('is offered until the instance says otherwise', () => {
    expect(useTimetableOffered().value).toBe(true)
    setTimetable(false)
    expect(useTimetableOffered().value).toBe(false)
  })

  it('keeps the instance’s „off" for the next start, and forgets it once on again', () => {
    setTimetable(false)
    expect(localStorage.getItem(TIMETABLE_STORAGE_KEY)).toBe('off')
    setTimetable(true)
    expect(localStorage.getItem(TIMETABLE_STORAGE_KEY)).toBeNull()

    localStorage.setItem(TIMETABLE_STORAGE_KEY, 'off')
    initTimetable()
    expect(useTimetableOffered().value).toBe(false)
  })

  it('is not offered while the device is offline — the hand fields stay', () => {
    goOnline(false)
    expect(useTimetableOffered().value).toBe(false)
    goOnline(true)
    expect(useTimetableOffered().value).toBe(true)
  })
})
