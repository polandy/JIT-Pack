// @vitest-environment jsdom
/**
 * FR-24.12 — M24's rule settings are device-local, like FR-24.4's view
 * preference, and survive a reload.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { cleanupSettings } from '../useCleanupSettings'
import { HYGIENE_RULE_UNUSED, HYGIENE_RULE_UNTAGGED } from '@/domain/inventoryHygiene'

beforeEach(() => {
  localStorage.clear()
  cleanupSettings().reset()
})

describe('cleanupSettings (FR-24.12)', () => {
  it('starts with every rule on, a twelve-month window and nothing kept', () => {
    const { settings } = cleanupSettings()
    expect(Object.values(settings.value.enabled).every(Boolean)).toBe(true)
    expect(settings.value.unusedMonths).toBe(12)
    expect(settings.value.keptItems).toEqual([])
  })

  it('persists a switched rule, the window and a kept item across a reload', () => {
    const s = cleanupSettings()
    s.setRule(HYGIENE_RULE_UNTAGGED, false)
    s.setUnusedMonths(24)
    s.keepItem('i-gas')
    s.keepTag('t-foto')

    s.reload()

    expect(s.settings.value.enabled[HYGIENE_RULE_UNTAGGED]).toBe(false)
    expect(s.settings.value.enabled[HYGIENE_RULE_UNUSED]).toBe(true)
    expect(s.settings.value.unusedMonths).toBe(24)
    expect(s.settings.value.keptItems).toEqual(['i-gas'])
    expect(s.settings.value.keptTags).toEqual(['t-foto'])
  })

  it('forgets a keep again — the undo of „Behalten"', () => {
    const s = cleanupSettings()
    s.keepItem('i-gas')
    s.unkeepItem('i-gas')
    s.keepTag('t-foto')
    s.unkeepTag('t-foto')
    expect(s.settings.value.keptItems).toEqual([])
    expect(s.settings.value.keptTags).toEqual([])
  })

  it('drops what it does not understand rather than trusting it', () => {
    localStorage.setItem(
      'jitpack_inventory_cleanup',
      JSON.stringify({
        enabled: { untagged: 'no', gone: false },
        unusedMonths: 7,
        keptItems: [1, 'i'],
      }),
    )
    const s = cleanupSettings()
    s.reload()
    expect(s.settings.value.enabled[HYGIENE_RULE_UNTAGGED]).toBe(true)
    expect(s.settings.value.unusedMonths).toBe(12)
    expect(s.settings.value.keptItems).toEqual(['i'])
  })

  it('falls back to the defaults on unreadable storage', () => {
    localStorage.setItem('jitpack_inventory_cleanup', '{not json')
    const s = cleanupSettings()
    s.reload()
    expect(s.settings.value.unusedMonths).toBe(12)
  })
})
