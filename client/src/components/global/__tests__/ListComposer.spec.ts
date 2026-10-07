// @vitest-environment jsdom
/**
 * FR-21.24 — M6's and M25's composer has M4's one door: closed until the ＋
 * FAB opens it, open until the reader closes it (✕ or Escape), and open at rest
 * on a list with nothing in it, where the field is the only thing to do.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import ListComposer from '../ListComposer.vue'

function mountComposer(props: { modelValue?: string; listEmpty?: boolean } = {}) {
  return mount(ListComposer, {
    props: {
      modelValue: '',
      placeholder: 'Was kaufen?',
      label: 'Was kaufen?',
      addLabel: 'Auf die Liste',
      closeLabel: 'Schliessen',
      testid: 'composer',
      inputTestid: 'composer-input',
      submitTestid: 'composer-submit',
      ...props,
    },
    slots: { default: '<div data-testid="chips" />' },
  })
}

const card = '[data-testid="composer"]'

describe('ListComposer — one door (FR-21.24)', () => {
  it('FR-21.24: is closed at rest, field and chips alike', () => {
    const composer = mountComposer()
    expect(composer.find(card).exists()).toBe(false)
    expect(composer.find('[data-testid="chips"]').exists()).toBe(false)
    expect(composer.vm.expanded).toBe(false)
  })

  it('FR-21.24: open() shows the card with its chips', async () => {
    const composer = mountComposer()
    await composer.vm.open()
    expect(composer.find(card).exists()).toBe(true)
    expect(composer.find('[data-testid="chips"]').exists()).toBe(true)
    expect(composer.vm.expanded).toBe(true)
  })

  it('FR-21.24: stays open after an entry is submitted — entries come in runs', async () => {
    const composer = mountComposer({ modelValue: 'Milch' })
    await composer.vm.open()
    await composer.get('form').trigger('submit')
    expect(composer.emitted('submit')).toHaveLength(1)
    expect(composer.find(card).exists()).toBe(true)
  })

  it('FR-21.24: ✕ closes it and empties the field', async () => {
    const composer = mountComposer({ modelValue: 'Mil' })
    await composer.vm.open()
    await composer.get('[data-testid="composer-close"]').trigger('click')
    expect(composer.find(card).exists()).toBe(false)
    expect(composer.emitted('update:modelValue')?.at(-1)).toEqual([''])
    expect(composer.emitted('close')).toHaveLength(1)
  })

  it('FR-21.24: Escape in the field closes it', async () => {
    const composer = mountComposer()
    await composer.vm.open()
    await composer.get('[data-testid="composer-input"]').trigger('keydown', { key: 'Escape' })
    expect(composer.find(card).exists()).toBe(false)
  })

  it('FR-21.24: a key other than Escape leaves it open', async () => {
    const composer = mountComposer()
    await composer.vm.open()
    await composer.get('[data-testid="composer-input"]').trigger('keydown', { key: 'a' })
    expect(composer.find(card).exists()).toBe(true)
  })

  it('FR-21.24, G-7: an empty list finds it open', () => {
    const composer = mountComposer({ listEmpty: true })
    expect(composer.find(card).exists()).toBe(true)
  })

  it('FR-21.24, G-7: a list that empties opens it; one that fills does not close it', async () => {
    const composer = mountComposer()
    await composer.setProps({ listEmpty: true })
    expect(composer.find(card).exists()).toBe(true)
    await composer.setProps({ listEmpty: false })
    expect(composer.find(card).exists()).toBe(true)
  })
})
