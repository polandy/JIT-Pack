// @vitest-environment jsdom
/**
 * The trip that is next, as a card (FR-21.13).
 *
 * What is worth pinning is what the hero *omits* when it has nothing to
 * say — a hero with an empty eyebrow, an empty second line and an empty
 * action row is three blank boxes tall on a screen whose whole point is
 * to be read without tapping.
 */
import { mount } from '@vue/test-utils'
import { RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TripHero from '../TripHero.vue'

const base = {
  name: 'Samedan Sommer',
  percent: 62,
  progress: '31/50 packed',
  to: '/trips/t1',
}

const global = { stubs: { RouterLink: RouterLinkStub } }

describe('TripHero — one trip, answered before it is tapped (FR-21.13)', () => {
  it('names the trip at the hero role and links to it', () => {
    const wrapper = mount(TripHero, { props: base, global })

    expect(wrapper.get('[data-testid="hero-name"]').text()).toBe('Samedan Sommer')
    expect(wrapper.get('[data-testid="hero-name"]').classes()).toContain('jp-hero-title')
    expect(wrapper.getComponent(RouterLinkStub).props('to')).toBe('/trips/t1')
  })

  it('carries the share twice — as a ring and as a sentence', () => {
    // Not a duplication to remove: the ring is the glance, the words are
    // what the glance sends you to when the number is not the answer.
    const wrapper = mount(TripHero, { props: base, global })

    expect(wrapper.get('[data-testid="progress-ring"]').attributes('aria-label')).toBe('62%')
    expect(wrapper.get('[data-testid="hero-progress"]').text()).toBe('31/50 packed')
  })

  it('shows when it is and who is on it when it knows', () => {
    const wrapper = mount(TripHero, {
      props: { ...base, when: '12 to 19 September', meta: 'Andy, Mia' },
      global,
    })

    expect(wrapper.get('[data-testid="hero-when"]').text()).toBe('12 to 19 September')
    expect(wrapper.get('[data-testid="hero-when"]').classes()).toContain('jp-hero-eyebrow')
    expect(wrapper.get('[data-testid="hero-meta"]').text()).toBe('Andy, Mia')
  })

  it('renders no line at all for a fact it does not have', () => {
    const wrapper = mount(TripHero, { props: base, global })

    // The positive half: the card did render, so each absence is a
    // decision rather than a component that failed to mount.
    expect(wrapper.get('[data-testid="hero-name"]').text()).toBe('Samedan Sommer')
    expect(wrapper.find('[data-testid="hero-when"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="hero-meta"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="hero-detail"]').exists()).toBe(false)
    expect(wrapper.find('.actions').exists()).toBe(false)
  })

  it('draws the track to the same share as the ring', () => {
    const wrapper = mount(TripHero, { props: base, global })

    expect(wrapper.get('.track i').attributes('style')).toContain('width: 62%')
  })

  it('clamps the track the way the ring clamps its arc', () => {
    const wrapper = mount(TripHero, { props: { ...base, percent: 140 }, global })

    expect(wrapper.get('.track i').attributes('style')).toContain('width: 100%')
  })

  it('puts what the screen adds under the numbers', () => {
    const wrapper = mount(TripHero, {
      props: base,
      slots: { default: '<p data-testid="dashboard-more-x">+1 more</p>' },
      global,
    })

    expect(wrapper.get('[data-testid="dashboard-more-x"]').text()).toBe('+1 more')
  })

  it('sets a second figure beside the share, as its pair (FR-7.4)', () => {
    const wrapper = mount(TripHero, {
      props: base,
      slots: { beside: '<b data-testid="hero-tasks">ring {{ params.ringSize }}</b>' },
      global,
    })

    const row = wrapper.get('.figures')
    expect(row.get('[data-testid="hero-progress"]').text()).toBe('31/50 packed')
    // One ring size for both, handed down rather than kept in step.
    const shareRing = row.get('[data-testid="progress-ring"]').attributes('style')!
    const size = /--ring-size: (\d+)px/.exec(shareRing)![1]
    expect(row.get('[data-testid="hero-tasks"]').text()).toBe(`ring ${size}`)
    expect(row.get('.hero-figure').classes()).toContain('paired')
  })

  it('keeps the share alone on its row when nothing stands beside it', () => {
    const wrapper = mount(TripHero, { props: base, global })

    expect(wrapper.get('.figures [data-testid="hero-progress"]').text()).toBe('31/50 packed')
    expect(wrapper.find('.figures .beside').exists()).toBe(false)
    expect(wrapper.get('.hero-figure').classes()).not.toContain('paired')
    expect(wrapper.get('[data-testid="progress-ring"]').attributes('style')).toContain(
      '--ring-size: 58px',
    )
  })

  it('names the phase after the dates and opposite the name the day counter (FR-7.10)', () => {
    const wrapper = mount(TripHero, {
      props: {
        ...base,
        when: '12.–18. Okt 2026',
        phase: { label: 'Vor Ort', done: true },
        counter: { headline: 'Tag 2 von 7', sub: 'noch 5 Tage' },
      },
      global,
    })

    expect(wrapper.get('[data-testid="hero-phase"]').text()).toBe('Vor Ort')
    expect(wrapper.get('[data-testid="hero-phase"]').classes()).toContain('done')
    expect(wrapper.get('[data-testid="hero-counter"]').text()).toContain('Tag 2 von 7')
    expect(wrapper.get('[data-testid="hero-counter"]').text()).toContain('noch 5 Tage')
  })

  it('leaves the counter out when it has none, and the phase’s ink quiet while packing (FR-7.10)', () => {
    const wrapper = mount(TripHero, {
      props: { ...base, when: '2026', phase: { label: 'Packen', done: false } },
      global,
    })

    expect(wrapper.find('[data-testid="hero-counter"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="hero-phase"]').classes()).not.toContain('done')
  })

  it('is one link while the packing is open (FR-7.10’s other half)', () => {
    const wrapper = mount(TripHero, { props: base, global })
    const link = wrapper.getComponent(RouterLinkStub)
    expect(link.find('[data-testid="hero-progress"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="hero-head"]').exists()).toBe(false)
  })

  it('stops being one link once it is worked: only the head leads on, and the blocks are the slot’s (FR-7.10)', () => {
    const wrapper = mount(TripHero, {
      props: { ...base, workable: true },
      slots: { blocks: '<button data-testid="in-block">tick</button>' },
      global,
    })

    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links).toHaveLength(1)
    expect(links[0]!.props('to')).toBe('/trips/t1')
    expect(links[0]!.find('[data-testid="hero-name"]').exists()).toBe(true)
    // The control is in the card and outside the link: a tap on it is a tick.
    expect(wrapper.find('[data-testid="in-block"]').exists()).toBe(true)
    expect(links[0]!.find('[data-testid="in-block"]').exists()).toBe(false)
    // The card itself is not the link, so the figure is not inside one, and none is drawn.
    expect(wrapper.find('[data-testid="hero-progress"]').exists()).toBe(false)
  })
})
