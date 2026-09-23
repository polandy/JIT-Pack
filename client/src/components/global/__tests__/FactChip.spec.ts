// @vitest-environment jsdom
/**
 * The read-only fact chip (component extraction worklist item 4). What is
 * pinned: the slot content it shows, that `tone`/`bordered` land as classes
 * (the colours themselves are CSS, not something jsdom can assert), and that
 * a caller's own class/testid falls through to the one root element.
 */
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'

import FactChip from '../FactChip.vue'

describe('FactChip', () => {
  it('renders the caller’s slotted content', () => {
    const wrapper = mount(FactChip, { slots: { default: '2×' } })
    expect(wrapper.text()).toBe('2×')
  })

  it('carries no tone class by default', () => {
    const wrapper = mount(FactChip, { slots: { default: 'Plain' } })
    const classes = wrapper.get('.chip').classes()
    expect(classes).toEqual(['chip'])
  })

  it('adds the tone as a class', () => {
    const wrapper = mount(FactChip, { props: { tone: 'warn' }, slots: { default: 'Late packer' } })
    expect(wrapper.get('.chip').classes()).toContain('warn')
  })

  it('adds "bordered" only when asked', () => {
    const plain = mount(FactChip, { props: { tone: 'buy' }, slots: { default: 'Buy' } })
    expect(plain.get('.chip').classes()).not.toContain('bordered')

    const ringed = mount(FactChip, {
      props: { tone: 'missing', bordered: true },
      slots: { default: 'Missing' },
    })
    expect(ringed.get('.chip').classes()).toContain('bordered')
  })

  it('falls through data-testid and class to its one root element', () => {
    const wrapper = mount(FactChip, {
      attrs: { 'data-testid': 'm14-state', class: 'chip-compact' },
      slots: { default: 'Applied' },
    })
    const chip = wrapper.get('.chip')
    expect(chip.attributes('data-testid')).toBe('m14-state')
    expect(chip.classes()).toContain('chip-compact')
  })
})
