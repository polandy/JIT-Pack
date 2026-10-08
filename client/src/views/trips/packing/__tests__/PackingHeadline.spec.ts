// @vitest-environment jsdom
/**
 * M4's sticky header line (G-12, FR-21.17) and the search field that stands
 * in for its card while the search is open (FR-25.11k, UX-18).
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { TripKPIs } from '@/types/domain'

import PackingHeadline from '../PackingHeadline.vue'

const KPIS: TripKPIs = {
  totalItems: 3,
  packedItems: 1,
  totalWeight: 0,
  packedWeight: 0,
  totalValue: 0,
  packedValue: 0,
  totalTodos: 0,
  resolvedTodos: 0,
}

function mountHeadline(opts: { collapsed?: boolean; loaded?: boolean; search?: string } = {}) {
  return mount(PackingHeadline, {
    props: {
      tripId: 't1',
      kpis: KPIS,
      loaded: opts.loaded ?? true,
      collapsed: opts.collapsed ?? false,
      tasks: [],
      todoState: 'open',
      todoLine: null,
      presenceUsers: [],
      participants: [],
      isDesktop: false,
    },
    slots: opts.search === undefined ? {} : { search: opts.search },
    global: {
      stubs: { ProgressFigure: true, TripTodoFigure: true, PresenceFacepile: true },
    },
  })
}

describe('PackingHeadline — the search opens in the sticky band (G-12, FR-25.11k)', () => {
  it('shows the progress card while no search is open', () => {
    const wrapper = mountHeadline()

    expect(wrapper.find('[data-testid="m4-progress-card"]').exists()).toBe(true)
  })

  it('puts the search field in the card’s place while the search is open', () => {
    const wrapper = mountHeadline({ search: '<div class="search-row" data-testid="field" />' })

    const line = wrapper.get('[data-testid="m4-header"]')
    expect(line.find('[data-testid="field"]').exists()).toBe(true)
    expect(line.find('[data-testid="m4-progress-card"]').exists()).toBe(false)
    // A lone field is one row; the pair's taller allowance belongs to the card.
    expect(line.classes()).not.toContain('paired')
  })

  it('holds the field in place when the head yields to the list (FR-21.17)', () => {
    // The card yields on the way down; a field being typed into must not,
    // or the term scrolls away with the rows it is narrowing.
    const wrapper = mountHeadline({ collapsed: true, search: '<div class="search-row" />' })

    expect(wrapper.get('[data-testid="m4-header"]').classes()).not.toContain('collapsed')
  })

  it('still lets the card yield when no search is open', () => {
    const wrapper = mountHeadline({ collapsed: true })

    expect(wrapper.get('[data-testid="m4-header"]').classes()).toContain('collapsed')
  })

  it('shows the field before the partition has arrived (ADR-033)', () => {
    // The empty band waits for the figure; the field has nothing to wait for.
    const wrapper = mountHeadline({ loaded: false, search: '<div class="search-row" />' })

    expect(wrapper.get('[data-testid="m4-header"]').classes()).not.toContain('collapsed')
  })
})
