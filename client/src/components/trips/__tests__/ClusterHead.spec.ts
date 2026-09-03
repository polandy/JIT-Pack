// @vitest-environment jsdom
/**
 * U-1.5 (design review 2026-09-02). FR-25.1's cluster head — the line that
 * names a per-person item once — was markup inside `PackingListPage.vue`
 * and had no unit at all. What is pinned here is what makes it a *head*
 * rather than a row: it carries the item's mark and glyphs, so the traveler
 * rows under it carry none (FR-28.4 — one tent, not three).
 */
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'

import ClusterHead from '../ClusterHead.vue'
import type { MasterItem } from '@/types/domain'

const master: MasterItem = {
  id: 'm1',
  name: 'Zelt',
  weight_grams: null,
  value_cents: null,
  icon: '⛺',
}

function mountHead(props: Partial<InstanceType<typeof ClusterHead>['$props']> = {}) {
  return mount(ClusterHead, {
    props: {
      name: 'Zelt',
      mode: 'pack',
      late: false,
      doneCount: 1,
      totalCount: 3,
      master: null,
      ...props,
    },
  })
}

describe('ClusterHead (FR-25.1)', () => {
  it('names the item once and counts its instances', () => {
    const wrapper = mountHead()
    expect(wrapper.get('.cluster-name').text()).toBe('Zelt')
    expect(wrapper.get('.cluster-count').text()).toBe('1/3')
  })

  it('carries the testid the e2e suite addresses the cluster by', () => {
    expect(mountHead({ name: 'Wanderstöcke' }).attributes('data-testid')).toBe(
      'm4-cluster-Wanderstöcke',
    )
  })

  it('shows the master row’s mark, which is why the children need none (FR-28.4)', () => {
    const wrapper = mountHead({ master })
    expect(wrapper.text()).toContain('⛺')
  })

  it('keeps the mark’s column even when the item has no mark', () => {
    // The slot holds its width regardless — otherwise a list where most rows
    // carry no mark starts its names at two different x positions.
    expect(mountHead({ master: null }).find('.row-mark').exists()).toBe(true)
  })

  it('draws no procurement glyph for the dominant pack mode (FR-25.4a)', () => {
    expect(mountHead({ mode: 'pack' }).find('.mode-icon').exists()).toBe(false)
  })

  it('draws the procurement glyph for a mode that is not packing', () => {
    expect(mountHead({ mode: 'buy_before' }).find('.mode-icon').exists()).toBe(true)
  })

  it('shows the late-packer glyph when any instance in the cluster carries it', () => {
    expect(mountHead({ late: true }).find('.late-icon').exists()).toBe(true)
    expect(mountHead({ late: false }).find('.late-icon').exists()).toBe(false)
  })
})
