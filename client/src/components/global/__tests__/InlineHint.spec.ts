// @vitest-environment jsdom
/**
 * The Family-A inline "nothing here" note (component extraction worklist
 * item 2). What is pinned: it renders whatever the caller slots in, on its
 * own root so a passed data-testid/class falls through, and nothing more —
 * the component carries no text or spacing logic of its own to test.
 */
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'

import InlineHint from '../InlineHint.vue'

describe('InlineHint', () => {
  it('renders the caller’s slotted text', () => {
    const wrapper = mount(InlineHint, { slots: { default: 'Noch keine Aufgaben' } })
    expect(wrapper.text()).toBe('Noch keine Aufgaben')
  })

  it('falls through data-testid and class to its one root element', () => {
    const wrapper = mount(InlineHint, {
      attrs: { 'data-testid': 'trip-todo-empty', class: 'hint-wide' },
      slots: { default: 'Alles erledigt' },
    })
    const p = wrapper.get('p')
    expect(p.attributes('data-testid')).toBe('trip-todo-empty')
    expect(p.classes()).toContain('hint-wide')
  })
})
