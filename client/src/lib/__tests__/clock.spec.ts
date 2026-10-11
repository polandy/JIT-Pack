import { describe, it, expect, vi } from 'vitest'
import { defaultNowIso, defaultNowMs, isoFrom } from '../clock'

describe('the client clock (C-5)', () => {
  it('isoFrom turns a millisecond clock into the string a row stores', () => {
    const at = Date.parse('2026-03-14T15:09:26.535Z')
    expect(isoFrom(() => at)()).toBe('2026-03-14T15:09:26.535Z')
  })

  // The whole point of the seam: two consumers handed the same clock write
  // the same instant. Before this, `today` and a mutation's `packed_at` read
  // two separate `Date` calls and could land either side of midnight.
  it('two readers of one clock cannot disagree', () => {
    let at = Date.parse('2026-03-14T23:59:59.999Z')
    const now = () => at
    const iso = isoFrom(now)
    expect(iso()).toBe(new Date(now()).toISOString())
    at = Date.parse('2026-03-15T00:00:00.000Z')
    expect(iso()).toBe('2026-03-15T00:00:00.000Z')
  })

  // The machine clock is set rather than read, so the default is held to
  // the exact instant instead of to "not earlier than".
  it('the default clock is the machine clock', () => {
    const at = Date.parse('2026-03-14T15:09:26.535Z')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at)
    try {
      expect(defaultNowMs()).toBe(at)
      expect(defaultNowIso()).toBe('2026-03-14T15:09:26.535Z')
    } finally {
      vi.useRealTimers()
    }
  })
})
