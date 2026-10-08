// @vitest-environment jsdom
/**
 * The search row (G-12, FR-25.11k, FR-24.6): its ✕ is the round close
 * control at the round-control size (G-14, UX-18), and what it says it does
 * follows the row's life.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import RoundClose from '../RoundClose.vue'
import SearchRow from '../SearchRow.vue'

describe('SearchRow — the way out is the round control (G-14)', () => {
  it('closes the magnifier’s field through the round close control', () => {
    const wrapper = mount(SearchRow, { props: { modelValue: '', placeholder: 'Suchen' } })

    const close = wrapper.getComponent(RoundClose)
    expect(close.attributes('data-testid')).toBe('search-close')
    expect(close.attributes('aria-label')).toBe(close.props('label'))
    close.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('offers a persistent field’s clear only once there is something to clear (FR-24.6)', async () => {
    const wrapper = mount(SearchRow, {
      props: { modelValue: '', placeholder: 'Suchen', persistent: true },
    })
    expect(wrapper.findComponent(RoundClose).exists()).toBe(false)

    await wrapper.setProps({ modelValue: 'zelt' })
    expect(wrapper.getComponent(RoundClose).attributes('data-testid')).toBe('search-clear')
  })

  it('draws the control at the round-control size, not as a bare glyph', () => {
    // A bare icon with no box of its own is a target a thumb misses.
    const src = readFileSync(resolve(process.cwd(), 'src/components/global/RoundClose.vue'), 'utf8')
    expect(src).toMatch(/width: var\(--jp-control-round\)/)
    expect(src).toMatch(/height: var\(--jp-control-round\)/)
  })
})
