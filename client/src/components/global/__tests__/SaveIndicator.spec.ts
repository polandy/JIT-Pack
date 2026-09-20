// @vitest-environment jsdom
/**
 * FR-25.15: the sheet's icon-only auto-save indicator — an amber pulsing
 * lamp while a write is in flight, a green one once it settled on this
 * device, meaning on the tooltip (G-12-06).
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
 *
 * The first case is the one the rest hangs from (owner, 2026-09-20): the
 * indicator used to render its settled state from the moment the sheet
 * opened, which confirms nothing. Everything below asserts that it speaks
 * only as the consequence of a write.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SaveIndicator from '../SaveIndicator.vue'

const LAMP = '[data-testid="save-indicator"]'

describe('SaveIndicator (FR-25.15)', () => {
  it('says nothing at all until a write of mine has been open', () => {
    const wrapper = mount(SaveIndicator, { props: { pending: false } })
    expect(wrapper.find(LAMP).exists()).toBe(false)
  })

  it('shows the in-flight lamp while a write is open, meaning on the tooltip', () => {
    const wrapper = mount(SaveIndicator, { props: { pending: true } })
    expect(wrapper.get(LAMP).classes()).toContain('saving')
    expect(wrapper.get(LAMP).attributes('title')).toBe('Saving…')
  })

  it('settles when the open write lands', async () => {
    const wrapper = mount(SaveIndicator, { props: { pending: true } })
    await wrapper.setProps({ pending: false })
    expect(wrapper.get(LAMP).classes()).toContain('saved')
    expect(wrapper.get(LAMP).attributes('title')).toBe('Saved')
  })

  it('keeps standing once it has settled — the write it answers still happened', async () => {
    const wrapper = mount(SaveIndicator, { props: { pending: true } })
    await wrapper.setProps({ pending: false })
    await wrapper.setProps({ pending: false })
    expect(wrapper.find(LAMP).exists()).toBe(true)
  })

  it('speaks straight away when it is mounted onto a write already open', () => {
    // A sheet can be opened while the device still has the previous edit in
    // flight; the latch is raised by the state, not only by the transition.
    const wrapper = mount(SaveIndicator, { props: { pending: true } })
    expect(wrapper.get(LAMP).classes()).toContain('saving')
  })

  it('carries no glyph — the lamp is a drawn shape, not a ✓ to be tapped', () => {
    const wrapper = mount(SaveIndicator, { props: { pending: true } })
    expect(wrapper.text()).toBe('')
  })
})
