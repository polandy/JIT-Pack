// @vitest-environment jsdom
/**
 * FR-9.5 — „Ausblenden" on the forgotten radar, kept on this device per trip.
 *
 * jsdom because the subject *is* `localStorage`, as in delegationSeen.spec.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { hideRadar, isRadarHidden } from '../radarHidden'

describe('radarHidden (FR-9.5)', () => {
  beforeEach(() => localStorage.clear())

  it('shows the radar on a trip nobody has hidden it on', () => {
    expect(isRadarHidden('samedan-2026')).toBe(false)
  })

  it('hides it for that trip and no other', () => {
    hideRadar('samedan-2026')
    expect(isRadarHidden('samedan-2026')).toBe(true)
    expect(isRadarHidden('samedan-2027')).toBe(false)
  })

  it('reads an unreadable store as nothing hidden rather than throwing', () => {
    localStorage.setItem('jitpack_radar_hidden', '{not json')
    expect(isRadarHidden('samedan-2026')).toBe(false)
  })
})
