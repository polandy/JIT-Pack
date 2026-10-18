// @vitest-environment jsdom
/**
 * The sheet chrome renders its presentation as a state. Ionic's enter
 * animation is a duration nobody controls, and what the sheet's content can
 * do before it ends differs from after — so a test, and a child, can ask
 * whether the sheet has landed instead of guessing from visibility.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SheetModal from '../SheetModal.vue'

const IonModalStub = {
  name: 'IonModal',
  props: ['isOpen'],
  emits: ['didPresent', 'didDismiss'],
  template: '<div data-stub="modal"><slot /></div>',
}

function mountSheet(props: { height?: string } = {}) {
  return mount(SheetModal, {
    props: { isOpen: true, testid: 'sheet', ...props },
    slots: { default: '<section class="body">content</section>' },
    global: { stubs: { IonModal: IonModalStub } },
  })
}

describe('SheetModal', () => {
  it('renders the presentation as an attribute, and forwards it', async () => {
    const wrapper = mountSheet()
    const modal = wrapper.findComponent(IonModalStub)
    expect(modal.attributes('data-presented')).toBeUndefined()

    await modal.vm.$emit('didPresent')
    expect(modal.attributes('data-presented')).toBe('true')
    expect(wrapper.emitted('present')).toHaveLength(1)
  })

  it('drops the attribute on dismiss, so a re-opened sheet is not already landed', async () => {
    const wrapper = mountSheet()
    const modal = wrapper.findComponent(IonModalStub)
    await modal.vm.$emit('didPresent')
    await modal.vm.$emit('didDismiss')
    expect(modal.attributes('data-presented')).toBeUndefined()
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  /*
   * G-14: the inset is the chrome's, so no sheet decides its own.
   * Forty-one sheets that each padded their body had arrived at ten values.
   */
  it('sets the slotted body in by the sheet inset', () => {
    const inset = mountSheet().find('.sheet-inset')
    expect(inset.exists()).toBe(true)
    expect(inset.find('.body').exists()).toBe(true)
  })

  it('leaves a sized sheet unpadded, because its own IonContent owns the edge', () => {
    const wrapper = mountSheet({ height: '86%' })
    expect(wrapper.find('.sheet-inset').exists()).toBe(false)
    expect(wrapper.find('.body').exists()).toBe(true)
  })
})
