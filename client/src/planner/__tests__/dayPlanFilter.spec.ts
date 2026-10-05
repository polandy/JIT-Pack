// @vitest-environment jsdom
// The subject reads and writes localStorage.
/** FR-29.15: whom the day plan is narrowed to, remembered per trip on this device. */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readDayPlanFilter, writeDayPlanFilter } from '../dayPlanFilter'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('the remembered day plan filter', () => {
  it('is nothing until a choice was made, and per trip', () => {
    writeDayPlanFilter('t1', ['tr-sia', 'tr-leo'])
    expect(readDayPlanFilter('t1')).toEqual(['tr-sia', 'tr-leo'])
    expect(readDayPlanFilter('t2')).toBeUndefined()
  })

  it('keeps everybody apart from nothing remembered', () => {
    writeDayPlanFilter('t1', null)
    expect(readDayPlanFilter('t1')).toBeNull()
  })

  it('reads a stored value it cannot make sense of as nothing remembered', () => {
    localStorage.setItem('jp_dayplan_for_t1', '{"x":1}')
    expect(readDayPlanFilter('t1')).toBeUndefined()
  })

  it('reads storage that throws as nothing remembered, and writes past it', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readDayPlanFilter('t1')).toBeUndefined()
    expect(() => writeDayPlanFilter('t1', ['tr-sia'])).not.toThrow()
  })
})
