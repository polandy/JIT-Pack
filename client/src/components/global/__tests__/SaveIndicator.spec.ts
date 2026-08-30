// @vitest-environment jsdom
/**
 * FR-25.15: the sheet's icon-only auto-save indicator — amber ● while a
 * write is in flight, green ✓ once it settled on this device, meaning on
 * the tooltip (G-12-06).
 *
 * The prop is a boolean and not a `SyncState` on purpose (2026-08-30). It
 * used to be the latter, fed straight from G-2's own state, and this file's
 * last case asserted the consequence as if it were the rule: "every
 * non-syncing state is settled — offline is a G-2 story, not this one".
 * Offline is precisely *this* story. `syncStatus.state` answers `offline`
 * before `syncing`, so a write still open on a device with no network read
 * as saved — the one case FR-25.15 exists for, pinned green by its own test.
 * What the two mean apart is now `capturePending`, tested in
 * `composables/__tests__/captureState.spec.ts`.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SaveIndicator from '../SaveIndicator.vue'

describe('SaveIndicator (FR-25.15)', () => {
  it('shows the settled ✓ with its meaning on the tooltip', () => {
    const wrapper = mount(SaveIndicator, { props: { pending: false } })
    expect(wrapper.text()).toBe('✓')
    expect(wrapper.get('[data-testid="save-indicator"]').classes()).toContain('saved')
    expect(wrapper.get('[data-testid="save-indicator"]').attributes('title')).toBe('Saved')
  })

  it('shows the in-flight ● while a write is open', () => {
    const wrapper = mount(SaveIndicator, { props: { pending: true } })
    expect(wrapper.text()).toBe('●')
    expect(wrapper.get('[data-testid="save-indicator"]').classes()).toContain('saving')
    expect(wrapper.get('[data-testid="save-indicator"]').attributes('title')).toBe('Saving…')
  })

  it('settles when the open write lands', async () => {
    const wrapper = mount(SaveIndicator, { props: { pending: true } })
    await wrapper.setProps({ pending: false })
    expect(wrapper.text()).toBe('✓')
  })
})
