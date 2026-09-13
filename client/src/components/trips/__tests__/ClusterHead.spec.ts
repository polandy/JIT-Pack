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
import type { ClusterFace } from '@/domain/packingView'
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
      openCount: 2,
      collapsed: false,
      faces: [],
      master: null,
      ...props,
    },
  })
}

const faces: ClusterFace[] = [
  { traveler: { id: 't1', name: 'Andy', trip_id: 'trip', linked_user_id: null }, done: false },
  { traveler: { id: 't2', name: 'Leo', trip_id: 'trip', linked_user_id: null }, done: true },
]

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

  describe('the head folds its cluster (FR-25.23)', () => {
    it('is a control, not a caption — it has to be operable to fold anything', () => {
      const wrapper = mountHead()
      expect(wrapper.get('[data-testid="m4-cluster-Zelt"]').element.tagName).toBe('BUTTON')
    })

    it('asks to be toggled when pressed', async () => {
      const wrapper = mountHead()
      await wrapper.get('[data-testid="m4-cluster-Zelt"]').trigger('click')
      expect(wrapper.emitted('toggle')).toHaveLength(1)
    })

    it('answers with the open units while shut, in place of done/total (FR-25.16 grammar)', () => {
      // Shut, the head is all that is left of the cluster, so it answers the
      // question its hidden children would have — exactly as a group head does.
      const wrapper = mountHead({ collapsed: true, openCount: 2 })
      expect(wrapper.get('.cluster-count').text()).toBe('2 open')
    })

    it('goes back to done/total once it is open, because the children carry the rest', () => {
      const wrapper = mountHead({ collapsed: false, doneCount: 1, totalCount: 3 })
      expect(wrapper.get('.cluster-count').text()).toBe('1/3')
    })

    it('names the people while shut, since no child row is left to do it', () => {
      const wrapper = mountHead({ collapsed: true, faces })
      const shown = wrapper.findAll('.cluster-face')
      expect(shown).toHaveLength(2)
      // The face shows initials, so the name it stands for has to reach
      // assistive tech some other way or the head says nothing about who.
      expect(shown.map((f) => f.attributes('aria-label'))).toEqual(['Andy', 'Leo'])
    })

    it('marks the faces whose instance is already dealt with', () => {
      const wrapper = mountHead({ collapsed: true, faces })
      const marked = wrapper.findAll('.cluster-face.done')
      expect(marked).toHaveLength(1)
    })

    it('drops the faces when open — the child rows say who, and twice is noise', () => {
      const wrapper = mountHead({ collapsed: false, faces })
      expect(wrapper.findAll('.cluster-face')).toHaveLength(0)
    })

    it('tells assistive tech which way it is, so the caret is not the only signal', () => {
      expect(mountHead({ collapsed: true }).attributes('aria-expanded')).toBe('false')
      expect(mountHead({ collapsed: false }).attributes('aria-expanded')).toBe('true')
    })
  })
})
