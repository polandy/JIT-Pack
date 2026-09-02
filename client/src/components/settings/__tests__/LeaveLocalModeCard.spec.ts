// @vitest-environment jsdom
/**
 * FR-19.8 — the guard on the switch is what this card exists to show.
 *
 * The switch is disabled while the backup is older than the last change and
 * says so in words; the backup and the switch are two different emits, so a
 * card that wired them together would fail here rather than on a device.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { IonButton } from '@ionic/vue'

import LeaveLocalModeCard from '../LeaveLocalModeCard.vue'

function mountCard(props: Partial<InstanceType<typeof LeaveLocalModeCard>['$props']> = {}) {
  return mount(LeaveLocalModeCard, {
    props: {
      lastBackupAt: null,
      covered: false,
      defaultUrl: 'https://packing.example.com',
      ...props,
    },
  })
}

const byId = (wrapper: ReturnType<typeof mountCard>, id: string) =>
  wrapper.get(`[data-testid="${id}"]`)

// Ionic reflects a bound boolean onto no DOM attribute, so `disabled` has to
// be read off the component rather than the element.
const switchDisabled = (wrapper: ReturnType<typeof mountCard>) =>
  wrapper
    .findAllComponents(IonButton)
    .find((b) => b.attributes('data-testid') === 'settings-move-switch')!
    .props('disabled')

describe('LeaveLocalModeCard', () => {
  it('refuses the switch and names the reason while a change is newer than the backup', () => {
    const wrapper = mountCard({ covered: false, lastBackupAt: 1 })

    expect(switchDisabled(wrapper)).toBe(true)
    expect(byId(wrapper, 'settings-move-guard').text()).toContain(
      'Back up first — something changed since the last backup.',
    )
  })

  it('offers the switch once the backup covers the device, with the guard sentence gone', () => {
    const wrapper = mountCard({ covered: true, lastBackupAt: 1 })

    expect(switchDisabled(wrapper)).toBe(false)
    expect(wrapper.find('[data-testid="settings-move-guard"]').exists()).toBe(false)
  })

  it('says when there has never been a backup', () => {
    const wrapper = mountCard({ lastBackupAt: null })

    expect(byId(wrapper, 'settings-move-last-backup').text()).toBe('No backup yet.')
  })

  it('emits the backup and the switch as two different things', async () => {
    const wrapper = mountCard({ covered: true, lastBackupAt: 1 })

    await byId(wrapper, 'settings-move-backup').trigger('click')
    expect(wrapper.emitted('backup')).toHaveLength(1)
    expect(wrapper.emitted('switch')).toBeUndefined()

    await byId(wrapper, 'settings-move-switch').trigger('click')
    expect(wrapper.emitted('switch')).toEqual([['https://packing.example.com']])
    expect(wrapper.emitted('backup')).toHaveLength(1)
  })

  it('refuses a URL that is not http(s), even when the backup covers the device', async () => {
    const wrapper = mountCard({ covered: true, lastBackupAt: 1 })

    await byId(wrapper, 'settings-move-url').trigger('ionInput', {
      detail: { value: 'packing.example.com' },
    })

    expect(switchDisabled(wrapper)).toBe(true)
    expect(wrapper.text()).toContain('Enter a full http(s) URL.')
  })
})
