// @vitest-environment jsdom
/**
 * FR-25.15: the sheet's icon-only auto-save indicator — amber ● while a
 * write is in flight, green ✓ once it settled on this device, meaning on
 * the tooltip (G-12-06).
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SaveIndicator from '../SaveIndicator.vue'

describe('SaveIndicator (FR-25.15)', () => {
  it('shows the settled ✓ with its meaning on the tooltip', () => {
    const wrapper = mount(SaveIndicator, { props: { state: 'local' } })
    expect(wrapper.text()).toBe('✓')
    expect(wrapper.get('[data-testid="save-indicator"]').classes()).toContain('saved')
    expect(wrapper.get('[data-testid="save-indicator"]').attributes('title')).toBe('Saved')
  })

  it('shows the in-flight ● while a write is open', () => {
    const wrapper = mount(SaveIndicator, { props: { state: 'syncing' } })
    expect(wrapper.text()).toBe('●')
    expect(wrapper.get('[data-testid="save-indicator"]').classes()).toContain('saving')
    expect(wrapper.get('[data-testid="save-indicator"]').attributes('title')).toBe('Saving…')
  })

  it('settles when the open write lands (FR-19.2 seam)', async () => {
    const wrapper = mount(SaveIndicator, { props: { state: 'syncing' } })
    await wrapper.setProps({ state: 'local' })
    expect(wrapper.text()).toBe('✓')
  })

  it('reads every non-syncing state as settled — offline is a G-2 story, not this one', () => {
    for (const state of ['synced', 'offline', 'local'] as const) {
      const wrapper = mount(SaveIndicator, { props: { state } })
      expect(wrapper.text()).toBe('✓')
    }
  })
})
