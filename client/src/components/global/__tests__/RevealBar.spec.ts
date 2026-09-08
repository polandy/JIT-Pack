// @vitest-environment jsdom
/**
 * The bar that shows or hides rows a screen is keeping back (FR-21.22).
 *
 * What is pinned is the part a stylesheet could not say: it is a disclosure
 * button, and it tells a reader which way the tap goes without relying on
 * the caret being seen. The edge it wears is asserted where the edge exists,
 * on the rendered screen (E2E-M4-74).
 */
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'

import RevealBar from '../RevealBar.vue'

function mountBar(open: boolean) {
  return mount(RevealBar, {
    props: { open, label: open ? 'Hide 2 packed' : 'Show 2 packed', testid: 'm4-done-bar' },
    global: { stubs: { IonIcon: { template: '<i class="icon" />' } } },
  })
}

describe('RevealBar', () => {
  it('states whether the rows it governs are on screen', () => {
    expect(mountBar(false).get('button').attributes('aria-expanded')).toBe('false')
    expect(mountBar(true).get('button').attributes('aria-expanded')).toBe('true')
  })

  it('carries the screen’s own wording and its test id', () => {
    const wrapper = mountBar(false)
    expect(wrapper.text()).toBe('Show 2 packed')
    expect(wrapper.find('[data-testid="m4-done-bar"]').exists()).toBe(true)
  })

  it('asks the screen to toggle rather than deciding for itself', async () => {
    const wrapper = mountBar(false)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
    // The bar owns no state: it is still closed until the screen says so.
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
  })
})
