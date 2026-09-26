// @vitest-environment jsdom
/**
 * FR-25.15: the sheet's icon-only auto-save indicator — an amber pulsing
 * lamp while a write is in flight, a green one once it settled on this
 * device, meaning on the tooltip (G-12-06).
 *
 * The prop is a boolean and not a `SyncState` on purpose. Fed from G-2's
 * own state, "every non-syncing state is settled" would follow — and offline
 * is precisely *this* story: `syncStatus.state` answers `offline` before
 * `syncing`, so a write still open on a device with no network would read
 * as saved, the one case FR-25.15 exists for. What the two mean apart is
 * `capturePending`, tested in `composables/__tests__/captureState.spec.ts`.
 *
 * The first case is the one the rest hangs from: a settled state rendered
 * from the moment the sheet opens confirms nothing. Everything below asserts
 * that it speaks only as the consequence of a write.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SaveIndicator from '../SaveIndicator.vue'

const LAMP = '[data-testid="save-indicator"]'
const REGION = '[data-testid="save-announcement"]'

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
    // Scoped to the lamp: the component's own text is the announcement below.
    expect(wrapper.get(LAMP).text()).toBe('')
  })
})

/**
 * FR-25.15, the spoken half. The lamp is the sighted signal and
 * it is deliberately silent until a write happens — but *silence* and *not
 * being there* are the same thing only for the eye. A live region that is
 * created and filled in one frame is not reliably announced: the region has
 * to exist before it has anything to say, and change its text when it does.
 *
 * So the two halves are split. A permanent, visually hidden region carries
 * the words; the lamp carries the picture and is hidden from assistive tech,
 * so the same fact is not announced twice from two elements that could drift.
 */
describe('SaveIndicator — what it announces (FR-25.15)', () => {
  it('keeps its live region in the DOM from the first frame, before it has anything to say', () => {
    const wrapper = mount(SaveIndicator, { props: { pending: false } })
    expect(wrapper.find(REGION).exists()).toBe(true)
    expect(wrapper.get(REGION).attributes('role')).toBe('status')
  })

  it('says nothing through it while nothing has been written', () => {
    const wrapper = mount(SaveIndicator, { props: { pending: false } })
    // Empty, not absent. An empty region makes no announcement, which is
    // what "the indicator is silent until it writes" has to mean out loud.
    expect(wrapper.get(REGION).text()).toBe('')
  })

  it('announces the write, then its landing, in the words the tooltip uses', async () => {
    const wrapper = mount(SaveIndicator, { props: { pending: true } })
    expect(wrapper.get(REGION).text()).toBe('Saving…')
    expect(wrapper.get(REGION).text()).toBe(wrapper.get(LAMP).attributes('title'))

    await wrapper.setProps({ pending: false })
    expect(wrapper.get(REGION).text()).toBe('Saved')
    expect(wrapper.get(REGION).text()).toBe(wrapper.get(LAMP).attributes('title'))
  })

  it('hides the lamp from assistive tech — the region is the one voice', () => {
    const wrapper = mount(SaveIndicator, { props: { pending: true } })
    expect(wrapper.get(LAMP).attributes('aria-hidden')).toBe('true')
    // A label on the lamp itself would sit on an element that is also a
    // live region; a label change there is not reliably announced either.
    expect(wrapper.get(LAMP).attributes('aria-label')).toBeUndefined()
  })
})
