// @vitest-environment jsdom
/**
 * G-10 — trip presence (FR-4.6), as decided on 2026-08-28: everything the
 * pattern knows is on screen, rather than a sheet behind a tap.
 *
 * The states that matter here cannot be produced end-to-end. A device that
 * is genuinely *behind* needs its reported pull cursor to sit below the
 * trip's head, and the client reports a cursor the moment its pull returns —
 * so a Playwright case could only race it, which the project forbids. The
 * lagging half, the ordering and the overflow therefore live here, against
 * props, where the state is stated rather than waited for. E2E-G10-01 owns
 * the two-person caught-up reality and the tap.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, afterAll } from 'vitest'

import PresenceFacepile from '../PresenceFacepile.vue'
import { setLocale } from '@/i18n'
import type { PresenceUser } from '@/composables/useSyncOrchestrator'

function user(overrides: Partial<PresenceUser> = {}): PresenceUser {
  return { user_id: 'anna', device_count: 1, in_sync: false, ...overrides } as PresenceUser
}

function render(users: PresenceUser[], names?: Record<string, string>, max?: number) {
  return mount(PresenceFacepile, { props: { users, names, max } })
}

const NAMES = { u1: 'Alice', u2: 'Bob', u3: 'Carol', u4: 'Dora', u5: 'Emil' }
const everyone = (inSync: boolean) =>
  Object.keys(NAMES).map((id) => user({ user_id: id, in_sync: inSync }))

afterAll(() => setLocale('en'))

describe('PresenceFacepile — what a face says', () => {
  it('names the person and their state, on the title and to a screen reader', () => {
    setLocale('en')
    const w = render([user({ user_id: 'u1', in_sync: true }), user({ user_id: 'u2' })], NAMES)
    const faces = w.findAll('.face')

    // Bob is behind, so he sorts first — see the ordering case below.
    expect(faces[0]!.attributes('title')).toBe('Bob · catching up')
    expect(faces[0]!.attributes('aria-label')).toBe('Bob · catching up')
    expect(faces[1]!.attributes('title')).toBe('Alice · up to date')
  })

  it('initials the resolved name, and falls back to the id where there is none', () => {
    setLocale('en')
    expect(
      render([user({ user_id: 'u1' })], NAMES)
        .find('.face')
        .text(),
    ).toBe('AL')
    expect(
      render([user({ user_id: 'ab12' })])
        .find('.face')
        .text(),
    ).toBe('AB')
  })

  it('says it in German too', () => {
    setLocale('de')
    const w = render([user({ user_id: 'u1', in_sync: true })], NAMES)
    expect(w.find('.face').attributes('title')).toBe('Alice · aktuell')
    setLocale('en')
  })
})

describe('PresenceFacepile — the group answer', () => {
  it('reports the group in sync when nobody is behind', () => {
    setLocale('en')
    const w = render(everyone(true), NAMES)
    expect(w.find('[data-testid="presence-in-sync"]').exists()).toBe(true)
    expect(w.find('[data-testid="presence-behind"]').exists()).toBe(false)
  })

  it('counts the ones still catching up, and pluralizes the count', () => {
    setLocale('en')
    const one = render([user({ user_id: 'u1', in_sync: true }), user({ user_id: 'u2' })], NAMES)
    expect(one.find('[data-testid="presence-behind"]').text()).toBe('1 catching up')
    expect(one.find('[data-testid="presence-in-sync"]').exists()).toBe(false)

    const two = render([user({ user_id: 'u1' }), user({ user_id: 'u2' })], NAMES)
    expect(two.find('[data-testid="presence-behind"]').text()).toBe('2 catching up')
  })

  /**
   * The ring marks the exception. Ringing everyone who is caught up says
   * what the badge already says and leaves the one person worth noticing
   * marked by an absence — which is what the first rendered version did.
   */
  it('rings whoever is behind and leaves the caught-up faces plain', () => {
    const w = render([user({ user_id: 'u1', in_sync: true }), user({ user_id: 'u2' })], NAMES)
    const faces = w.findAll('.face')
    expect(faces[0]!.classes()).toContain('behind') // Bob
    expect(faces[1]!.classes()).not.toContain('behind') // Alice
  })
})

describe('PresenceFacepile — more people than fit', () => {
  it('caps the faces and counts the rest', () => {
    setLocale('en')
    const w = render(everyone(true), NAMES, 2)
    expect(w.findAll('.face:not(.more)')).toHaveLength(2)
    expect(w.find('[data-testid="presence-overflow"]').text()).toBe('+3')
  })

  it('shows no bubble when everyone fits', () => {
    const w = render(everyone(true), NAMES, 5)
    expect(w.find('[data-testid="presence-overflow"]').exists()).toBe(false)
    expect(w.findAll('.face:not(.more)')).toHaveLength(5)
  })

  /**
   * The rule the overflow exists to protect. Hiding whoever is behind would
   * summarise away the one fact the pile is there to show — and the badge
   * would then count somebody with no face to point at.
   */
  it('never hides somebody who is behind', () => {
    const users = [
      user({ user_id: 'u1', in_sync: true }),
      user({ user_id: 'u2', in_sync: true }),
      user({ user_id: 'u3', in_sync: true }),
      user({ user_id: 'u5' }), // Emil, last alphabetically, and behind
    ]
    const w = render(users, NAMES, 2)
    const shown = w.findAll('.face:not(.more)').map((f) => f.text())
    expect(shown[0]).toBe('EM')
    expect(w.find('[data-testid="presence-overflow"]').text()).toBe('+2')
  })

  it('orders by name within the same state, so the pile does not reshuffle', () => {
    const w = render(
      [
        user({ user_id: 'u3', in_sync: true }),
        user({ user_id: 'u1', in_sync: true }),
        user({ user_id: 'u2', in_sync: true }),
      ],
      NAMES,
    )
    expect(w.findAll('.face').map((f) => f.text())).toEqual(['AL', 'BO', 'CA'])
  })
})

describe('PresenceFacepile — the tap that names somebody', () => {
  it('spells the person out on tap, because a phone has no hover', async () => {
    setLocale('en')
    const w = render([user({ user_id: 'u1', in_sync: true }), user({ user_id: 'u2' })], NAMES)
    expect(w.find('[data-testid="presence-named"]').exists()).toBe(false)

    await w.find('[data-testid="presence-face-Bob"]').trigger('click')
    expect(w.find('[data-testid="presence-named"]').text()).toContain('Bob · catching up')
  })

  it('closes on a second tap of the same face, and swaps on another', async () => {
    setLocale('en')
    const w = render([user({ user_id: 'u1', in_sync: true }), user({ user_id: 'u2' })], NAMES)

    await w.find('[data-testid="presence-face-Bob"]').trigger('click')
    await w.find('[data-testid="presence-face-Alice"]').trigger('click')
    expect(w.find('[data-testid="presence-named"]').text()).toContain('Alice · up to date')

    await w.find('[data-testid="presence-face-Alice"]').trigger('click')
    expect(w.find('[data-testid="presence-named"]').exists()).toBe(false)
  })

  it('dismisses from its own control', async () => {
    const w = render([user({ user_id: 'u1', in_sync: true }), user({ user_id: 'u2' })], NAMES)
    await w.find('[data-testid="presence-face-Bob"]').trigger('click')
    await w.find('[data-testid="presence-named-dismiss"]').trigger('click')
    expect(w.find('[data-testid="presence-named"]').exists()).toBe(false)
  })

  /** A line about somebody who left is a sentence about nobody. */
  it('drops the line when that person leaves the trip', async () => {
    const w = render([user({ user_id: 'u1', in_sync: true }), user({ user_id: 'u2' })], NAMES)
    await w.find('[data-testid="presence-face-Bob"]').trigger('click')
    expect(w.find('[data-testid="presence-named"]').exists()).toBe(true)

    await w.setProps({ users: [user({ user_id: 'u1', in_sync: true })] })
    expect(w.find('[data-testid="presence-named"]').exists()).toBe(false)
  })
})
