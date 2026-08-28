// @vitest-environment jsdom
/**
 * G-10's hover title (FR-4.6, NFR-4.12).
 *
 * It is the one string on this component that is *composed*: who, on how many
 * devices, and whether they have caught up — two conditional parts and one
 * pluralized. That is why it lives in script rather than in the template, and
 * why it needs a test: a template expression cannot pluralize through the
 * catalogue, and the old one did not try — it said "(2 devices) · in sync" in
 * every language.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, afterAll } from 'vitest'

import PresenceFacepile from '../PresenceFacepile.vue'
import { setLocale } from '@/i18n'
import type { PresenceUser } from '@/composables/useSyncOrchestrator'

function user(overrides: Partial<PresenceUser> = {}): PresenceUser {
  return { user_id: 'anna', device_count: 1, in_sync: false, ...overrides } as PresenceUser
}

function titles(users: PresenceUser[], names?: Record<string, string>): string[] {
  const wrapper = mount(PresenceFacepile, { props: { users, names } })
  return wrapper.findAll('.face').map((face) => face.attributes('title') ?? '')
}

function initials(users: PresenceUser[], names?: Record<string, string>): string[] {
  const wrapper = mount(PresenceFacepile, { props: { users, names } })
  return wrapper.findAll('.face').map((face) => face.text())
}

afterAll(() => setLocale('en'))

describe('PresenceFacepile — the composed face title', () => {
  it('names the person alone on one device that has not caught up', () => {
    setLocale('en')
    expect(titles([user()])).toEqual(['anna'])
  })

  it('adds the device count only above one, and pluralizes it', () => {
    setLocale('en')
    expect(titles([user({ device_count: 2 })])).toEqual(['anna (2 devices)'])
  })

  it('adds the in-sync suffix when the person has caught up', () => {
    setLocale('en')
    expect(titles([user({ in_sync: true })])).toEqual(['anna · in sync'])
  })

  it('composes both parts in German, plural rule included', () => {
    setLocale('de')
    expect(titles([user({ device_count: 3, in_sync: true })])).toEqual([
      'anna (3 Geräte) · synchron',
    ])
    expect(titles([user({ device_count: 2 })])).toEqual(['anna (2 Geräte)'])
  })
})

/**
 * The presence event carries user ids alone, and `users.id` is a random
 * 32-hex-character key — initialling it names nobody. The caller resolves
 * the name; what is tested here is that the component uses it, and what it
 * does when the directory has not answered yet.
 */
describe('PresenceFacepile — the name behind a face (G-10, FR-4.6)', () => {
  const NAMES = { a1b2c3: 'Alice' }

  it('initials the resolved name rather than the id', () => {
    setLocale('en')
    expect(initials([user({ user_id: 'a1b2c3' })], NAMES)).toEqual(['AL'])
  })

  it('titles the resolved name too', () => {
    setLocale('en')
    expect(titles([user({ user_id: 'a1b2c3' })], NAMES)).toEqual(['Alice'])
  })

  it('falls back to the id where the directory does not know the person', () => {
    setLocale('en')
    expect(initials([user({ user_id: 'a1b2c3' })], {})).toEqual(['A1'])
    expect(titles([user({ user_id: 'a1b2c3' })])).toEqual(['a1b2c3'])
  })
})
