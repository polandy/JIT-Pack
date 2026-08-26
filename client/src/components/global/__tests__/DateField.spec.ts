// @vitest-environment jsdom
/**
 * ADR-035 / UX-6: the date control wears the theme and speaks the app's
 * language. The field displays its value through `formatDay` — the one
 * temporal formatter — never the browser's own date rendering, and the
 * picker is the app's sheet chrome, not the browser's popup.
 */
import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, beforeEach } from 'vitest'

import DateField from '../DateField.vue'
import { setLocale } from '@/i18n'

const SheetModalStub = {
  name: 'SheetModal',
  props: ['isOpen'],
  emits: ['dismiss'],
  template: '<div v-if="isOpen" data-stub="sheet"><slot /></div>',
}

const IonInputStub = {
  name: 'IonInput',
  props: ['value', 'label', 'placeholder', 'readonly'],
  template: '<div data-stub="input">{{ value }}</div>',
}

const IonDatetimeStub = {
  name: 'IonDatetime',
  props: ['value', 'locale', 'firstDayOfWeek', 'doneText', 'cancelText', 'clearText'],
  emits: ['ionChange', 'ionCancel'],
  template: '<div data-stub="datetime" />',
}

function mountField(props: Record<string, unknown>): VueWrapper {
  return mount(DateField, {
    props: { label: 'Von', testid: 'field', value: '', ...props },
    global: {
      stubs: { SheetModal: SheetModalStub, IonInput: IonInputStub, IonDatetime: IonDatetimeStub },
    },
  })
}

describe('DateField (ADR-035)', () => {
  beforeEach(() => setLocale('de'))

  it('displays the value through formatDay, per locale', () => {
    expect(mountField({ value: '2026-09-13' }).findComponent(IonInputStub).props('value')).toBe(
      '13.09.2026',
    )
    setLocale('en')
    expect(mountField({ value: '2026-09-13' }).findComponent(IonInputStub).props('value')).toBe(
      'Sep 13, 2026',
    )
  })

  it('shows the catalogue placeholder when empty, not a fabricated date', () => {
    const input = mountField({}).findComponent(IonInputStub)
    expect(input.props('value')).toBe('')
    expect(input.props('placeholder')).toBe('Datum wählen')
  })

  it('opens the picker on click, with the app locale and Monday first', async () => {
    const wrapper = mountField({ value: '2026-09-13' })
    expect(wrapper.find('[data-stub="sheet"]').exists()).toBe(false)
    await wrapper.find('[data-stub="input"]').trigger('click')
    const datetime = wrapper.findComponent(IonDatetimeStub)
    expect(datetime.exists()).toBe(true)
    expect(datetime.props('locale')).toBe('de')
    expect(datetime.props('firstDayOfWeek')).toBe(1)
    expect(datetime.props('value')).toBe('2026-09-13')
  })

  it('stays closed on a locked row (G-3)', async () => {
    const wrapper = mountField({ value: '2026-09-13', readonly: true })
    await wrapper.find('[data-stub="input"]').trigger('click')
    expect(wrapper.find('[data-stub="sheet"]').exists()).toBe(false)
  })

  it('emits the date part on confirm and closes', async () => {
    const wrapper = mountField({ value: '' })
    await wrapper.find('[data-stub="input"]').trigger('click')
    await wrapper
      .findComponent(IonDatetimeStub)
      .vm.$emit('ionChange', { detail: { value: '2026-09-13T00:00:00' } })
    expect(wrapper.emitted('update')).toEqual([['2026-09-13']])
    expect(wrapper.find('[data-stub="sheet"]').exists()).toBe(false)
  })

  it('emits the empty string when cleared', async () => {
    const wrapper = mountField({ value: '2026-09-13' })
    await wrapper.find('[data-stub="input"]').trigger('click')
    await wrapper.findComponent(IonDatetimeStub).vm.$emit('ionChange', { detail: { value: null } })
    expect(wrapper.emitted('update')).toEqual([['']])
  })
})
