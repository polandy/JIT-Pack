/**
 * FR-27.4's question, as M4 asks it: every change is named before either
 * answer is offered, the consequence of "no" is stated where "no" is pressed,
 * and a long list folds so a busy group cannot bury the packing list.
 *
 * A component test for those rules; the reachable flow — edit a group, open
 * the trip, answer — is E2E-M8-09.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import GroupChangesProposal from '../GroupChangesProposal.vue'
import type { RefreshPlan } from '@/domain/refresh'

function logLine(item: string, kind: 'added' | 'removed' | 'changed' = 'added') {
  return {
    trip_id: 't1',
    source_template_id: 'g1',
    source_template_name: 'Makro Fotografie',
    kind,
    item_name: item,
    detail: null,
  }
}

function plan(log: RefreshPlan['log']): RefreshPlan {
  return { add: [], update: [], remove: [], ledgerUpsert: [], ledgerDelete: [], log }
}

function mountCard(log: RefreshPlan['log']) {
  return mount(GroupChangesProposal, { props: { plan: plan(log) } })
}

describe('GroupChangesProposal (FR-27.4)', () => {
  it('names every change before it asks — a count alone can only be guessed at', () => {
    const wrapper = mountCard([logLine('Stativ'), logLine('Kamera', 'removed')])

    const changes = wrapper.find('[data-testid="m4-group-proposal-changes"]').text()
    expect(changes).toContain('Stativ')
    expect(changes).toContain('Kamera')
    expect(changes).toContain('Makro Fotografie')
  })

  it('words a quantity change from its structured detail, not a stored sentence', () => {
    const wrapper = mountCard([
      { ...logLine('Kamera', 'changed'), detail: { field: 'quantity', from: 1, to: 3 } },
    ])

    const changes = wrapper.find('[data-testid="m4-group-proposal-changes"]').text()
    expect(changes).toContain('1')
    expect(changes).toContain('3')
  })

  it('falls back to a plain line for a field it has no words for', () => {
    // A new propagated field must never leak its column name at the user —
    // `late_packer` is a real ChangedField with no sentence of its own.
    const wrapper = mountCard([
      { ...logLine('Kamera', 'changed'), detail: { field: 'late_packer', from: false, to: true } },
    ])

    const changes = wrapper.find('[data-testid="m4-group-proposal-changes"]').text()
    expect(changes).toContain('Kamera')
    expect(changes).not.toContain('late_packer')
  })

  it('states what declining costs, where declining is pressed', () => {
    const wrapper = mountCard([logLine('Stativ')])

    // The one thing about this card that cannot be worked out from the list.
    // English is the default locale in a test run (i18n/index.ts).
    expect(wrapper.text()).toContain('stop following the group in this trip')
  })

  it('emits the answer it was given, and never both', async () => {
    const wrapper = mountCard([logLine('Stativ')])

    await wrapper.find('[data-testid="m4-group-proposal-apply"]').trigger('click')
    expect(wrapper.emitted('apply')).toHaveLength(1)
    expect(wrapper.emitted('decline')).toBeUndefined()

    await wrapper.find('[data-testid="m4-group-proposal-decline"]').trigger('click')
    expect(wrapper.emitted('decline')).toHaveLength(1)
    expect(wrapper.emitted('apply')).toHaveLength(1)
  })

  it('writes ten changes out in place — no control for a list already on screen', () => {
    const wrapper = mountCard(Array.from({ length: 10 }, (_, i) => logLine(`Artikel ${i}`)))

    expect(wrapper.findAll('[data-testid="m4-group-proposal-changes"] li')).toHaveLength(10)
    expect(wrapper.find('[data-testid="m4-group-proposal-more"]').exists()).toBe(false)
  })

  it('folds an eleventh away, so a busy group cannot bury the packing list', async () => {
    const wrapper = mountCard(Array.from({ length: 11 }, (_, i) => logLine(`Artikel ${i}`)))

    expect(wrapper.findAll('[data-testid="m4-group-proposal-changes"] li')).toHaveLength(10)
    const more = wrapper.find('[data-testid="m4-group-proposal-more"]')
    expect(more.attributes('aria-expanded')).toBe('false')

    await more.trigger('click')

    expect(wrapper.findAll('[data-testid="m4-group-proposal-changes"] li')).toHaveLength(11)
    expect(wrapper.find('[data-testid="m4-group-proposal-more"]').attributes('aria-expanded')).toBe(
      'true',
    )
  })
})
