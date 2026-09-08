// @vitest-environment jsdom
/**
 * The figure M1's hero and M4's header line now share (FR-21.23).
 *
 * What is worth pinning is the part a caller cannot see going wrong: the
 * track is drawn from the same percentage as the ring, so the two can never
 * disagree, and the detail line is absent rather than empty when there is
 * nothing to qualify the share with.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ProgressFigure from '../ProgressFigure.vue'

/** How wide the track's fill was drawn, as the caller's own percentage. */
function fill(wrapper: ReturnType<typeof mount>): string {
  return wrapper.get('.track i').attributes('style')!
}

describe('ProgressFigure — ring, sentence and track say one thing (FR-21.23)', () => {
  it('draws the track at the share the ring was given', () => {
    const wrapper = mount(ProgressFigure, {
      props: { percent: 35, headline: '9/26 packed' },
    })

    expect(wrapper.get('[data-testid="progress-ring"]').attributes('aria-label')).toBe('35%')
    expect(fill(wrapper)).toContain('width: 35%')
  })

  it('clamps the track the way the ring clamps its arc', () => {
    expect(fill(mount(ProgressFigure, { props: { percent: 140, headline: 'x' } }))).toContain(
      'width: 100%',
    )
    expect(fill(mount(ProgressFigure, { props: { percent: -8, headline: 'x' } }))).toContain(
      'width: 0%',
    )
  })

  it('says the share in words, because a ring is a shape and not a sentence', () => {
    const wrapper = mount(ProgressFigure, {
      props: {
        percent: 35,
        headline: '9/26 packed',
        detail: '4.2 kg · 2 prep',
        headlineTestid: 'm4-progress',
        detailTestid: 'm4-stats-detail',
      },
    })

    expect(wrapper.get('[data-testid="m4-progress"]').text()).toBe('9/26 packed')
    expect(wrapper.get('[data-testid="m4-stats-detail"]').text()).toBe('4.2 kg · 2 prep')
  })

  it('leaves the second line out rather than rendering an empty one', () => {
    const wrapper = mount(ProgressFigure, { props: { percent: 0, headline: '0/3 packed' } })

    expect(wrapper.find('.detail').exists()).toBe(false)
  })

  it('takes the ring down to the size a header line can keep when asked', () => {
    expect(
      mount(ProgressFigure, { props: { percent: 0, headline: 'x', ringSize: 42 } })
        .get('.ring')
        .attributes('style'),
    ).toContain('--ring-size: 42px')
  })
})
