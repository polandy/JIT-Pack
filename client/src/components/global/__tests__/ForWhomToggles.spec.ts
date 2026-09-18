// @vitest-environment jsdom
/**
 * FR-25.28 — the toggle line is laid out for three travelers (owner,
 * 2026-09-18): the full face up to three, the compact one above. The layout
 * itself is a rendered question and E2E-M4-100 reads it; what is pinned here is
 * the threshold, so a change to it is a decision rather than a drift.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import ForWhomToggles from '../ForWhomToggles.vue'
import UserAvatar from '../UserAvatar.vue'
import type { Traveler } from '@/types/domain'

function roster(n: number): Traveler[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `tr-${i}`,
    trip_id: 't1',
    name: `Person ${i}`,
    linked_user_id: null,
  }))
}

function sizesAt(n: number) {
  const wrapper = mount(ForWhomToggles, {
    props: { travelers: roster(n), amounts: new Map(), testKey: 'k' },
  })
  return {
    roomy: wrapper.get('[role="group"]').attributes('data-roomy'),
    sizes: wrapper.findAllComponents(UserAvatar).map((a) => a.props('size')),
  }
}

describe('ForWhomToggles — sized for three (FR-25.28)', () => {
  it('draws the full 40 px face for a roster of three', () => {
    expect(sizesAt(3)).toEqual({ roomy: 'true', sizes: [40, 40, 40] })
  })

  it('steps down to the compact 32 px face from the fourth traveler', () => {
    expect(sizesAt(4)).toEqual({ roomy: 'false', sizes: [32, 32, 32, 32] })
  })
})
