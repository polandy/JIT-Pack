// @vitest-environment jsdom
/**
 * FR-19.7 — the offer to apply a waiting version now.
 *
 * The G-2 dot and its sheet already announced the waiting build; what had no
 * surface was *doing* something about it without knowing what the dot means.
 * The bar is that surface, so what its test must pin is the press, the
 * refusal of a second press, and that "Later" is a separate outcome from
 * applying — three things a purely presentational component can state exactly.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import UpdateBanner from '../UpdateBanner.vue'

function mountBanner(applying = false) {
  return mount(UpdateBanner, { props: { applying } })
}

function text(wrapper: ReturnType<typeof mountBanner>, id: string): string {
  return wrapper.get(`[data-testid="${id}"]`).text()
}

describe('UpdateBanner', () => {
  it('names the version and what the press costs — nothing unsent is lost', () => {
    const wrapper = mountBanner()

    expect(text(wrapper, 'update-banner')).toContain('New version ready')
    expect(text(wrapper, 'update-banner')).toContain('Unsent changes are kept.')
    expect(text(wrapper, 'update-banner-apply')).toBe('Update')
  })

  it('emits the press exactly once', async () => {
    const wrapper = mountBanner()

    await wrapper.get('[data-testid="update-banner-apply"]').trigger('click')

    expect(wrapper.emitted('apply')).toHaveLength(1)
    expect(wrapper.emitted('later')).toBeUndefined()
  })

  it('refuses a second press while the first is in flight, and says why', async () => {
    const wrapper = mountBanner(true)
    const button = wrapper.get('[data-testid="update-banner-apply"]')

    expect(text(wrapper, 'update-banner-apply')).toBe('Updating…')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')

    expect(wrapper.emitted('apply')).toBeUndefined()
  })

  it('reports "Later" as its own outcome — dismissing is not applying', async () => {
    const wrapper = mountBanner()

    await wrapper.get('[data-testid="update-banner-later"]').trigger('click')

    expect(wrapper.emitted('later')).toHaveLength(1)
    expect(wrapper.emitted('apply')).toBeUndefined()
  })
})
