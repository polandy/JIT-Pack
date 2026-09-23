// @vitest-environment jsdom
/**
 * The round ✕ that takes a row off a list (component extraction worklist
 * item 1). What is pinned is what a stylesheet could not say: the label it
 * carries is the caller's, the icon defaults to ✕ but can be asked to be
 * something else, and a tap is reported rather than decided on.
 */
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import { addOutline, closeOutline } from 'ionicons/icons'

import RemoveButton from '../RemoveButton.vue'

const iconStub = { template: '<i class="icon" :data-icon="icon" />', props: ['icon'] }

function mountButton(props: { label: string; icon?: string } = { label: 'Aufgabe entfernen' }) {
  return mount(RemoveButton, {
    props,
    attrs: { 'data-testid': 'rm-1' },
    global: { stubs: { IonIcon: iconStub } },
  })
}

describe('RemoveButton', () => {
  it('carries the caller’s label as its accessible name', () => {
    const wrapper = mountButton({ label: 'Position entfernen' })
    expect(wrapper.get('button').attributes('aria-label')).toBe('Position entfernen')
  })

  it('falls through data-testid to its one root element', () => {
    const wrapper = mountButton()
    expect(wrapper.find('[data-testid="rm-1"]').exists()).toBe(true)
  })

  it('defaults to the ✕ glyph, but a caller can ask for another', () => {
    const withDefault = mountButton()
    expect(withDefault.get('.icon').attributes('data-icon')).toBe(closeOutline)

    const withCustom = mountButton({ label: 'Entfernen', icon: addOutline })
    expect(withCustom.get('.icon').attributes('data-icon')).toBe(addOutline)
  })

  it('reports a tap rather than acting on it', async () => {
    const wrapper = mountButton()
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})
