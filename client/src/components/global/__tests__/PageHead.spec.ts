// @vitest-environment jsdom
/**
 * G-9's page head (ADR-050).
 *
 * What is worth pinning is the thing a screen would otherwise get wrong by
 * omission: a meta line that is absent renders *no element* rather than an
 * empty one. An empty paragraph still takes its line box, and the head would
 * gain a gap on every screen that has no second line — which is most of them.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PageHead from '../PageHead.vue'

describe('PageHead — the screen names itself (G-9)', () => {
  it('renders the name in the page, at the display role', () => {
    const wrapper = mount(PageHead, { props: { title: 'Samedan Sommer' } })

    const title = wrapper.get('[data-testid="header-title"]')
    expect(title.text()).toBe('Samedan Sommer')
    expect(title.classes()).toContain('jp-page-title')
  })

  it('renders the meta line under the name when there is one', () => {
    const wrapper = mount(PageHead, { props: { title: 'Luggage', meta: 'Samedan Sommer' } })

    expect(wrapper.get('[data-testid="header-meta"]').text()).toBe('Samedan Sommer')
  })

  it('renders no meta element at all when there is none', () => {
    const wrapper = mount(PageHead, { props: { title: 'Luggage' } })

    // The positive half: the head did render, so the absent line is a
    // decision rather than a component that failed to mount.
    expect(wrapper.find('[data-testid="header-title"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="header-meta"]').exists()).toBe(false)
  })
})
