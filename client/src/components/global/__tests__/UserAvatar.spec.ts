// @vitest-environment jsdom
/**
 * A person, as a circle (FR-25.3) — and specifically what happens when there
 * is no picture, which is the common case rather than the edge one.
 *
 * The avatar endpoint 404s for any account that never uploaded a photo. M20
 * and M17 each rendered a bare `<img>` at it: one showed the browser's
 * torn-picture glyph, the other hid the element on error and left a 64 px
 * hole where a person should be, with the placeholder written for that case
 * sitting behind a condition that was never false. Both were on screen until
 * 2026-08-28. The initials are the ground here, so neither state exists.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UserAvatar from '../UserAvatar.vue'

const PICTURE = '[data-testid="user-avatar-picture"]'

describe('UserAvatar — the picture, and what stands where there is none', () => {
  it('shows initials and no picture element at all without a src', () => {
    const w = mount(UserAvatar, { props: { name: 'Alice Meier', seed: 'u1' } })
    expect(w.text()).toBe('AM')
    expect(w.find(PICTURE).exists()).toBe(false)
  })

  it('lays the picture over the initials when there is one', () => {
    const w = mount(UserAvatar, { props: { name: 'Alice', seed: 'u1', src: '/a.jpg' } })
    expect(w.find(PICTURE).attributes('src')).toBe('/a.jpg')
    // The letters stay in the DOM behind it, which is what a still-loading
    // picture shows instead of an empty circle.
    expect(w.text()).toBe('AL')
  })

  it('drops a picture that fails to load and keeps the initials', async () => {
    const w = mount(UserAvatar, { props: { name: 'Alice', seed: 'u1', src: '/missing.jpg' } })
    await w.find(PICTURE).trigger('error')

    expect(w.find(PICTURE).exists()).toBe(false)
    expect(w.text()).toBe('AL')
  })

  it('tries again when the url changes, so a re-upload is not hidden by the last failure', async () => {
    const w = mount(UserAvatar, { props: { name: 'Alice', seed: 'u1', src: '/a.jpg?v=0' } })
    await w.find(PICTURE).trigger('error')
    expect(w.find(PICTURE).exists()).toBe(false)

    // FR-17.13 busts the cache with a query, which is all that changes.
    await w.setProps({ src: '/a.jpg?v=1' })
    expect(w.find(PICTURE).attributes('src')).toBe('/a.jpg?v=1')
  })

  it('falls back to the seed, then to a question mark, for the letters', () => {
    expect(mount(UserAvatar, { props: { seed: 'ab12' } }).text()).toBe('AB')
    expect(mount(UserAvatar, { props: {} }).text()).toBe('?')
  })
})
