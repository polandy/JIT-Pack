/**
 * FR-27.12 — the peek sheet: what a group actually contains, read-only.
 *
 * The list is the *resolved* one (FR-27.2), so a Ferien-Vorlage peeks through
 * its composition and a shared item appears once. Ordering and truncation are
 * specified in domain/__tests__/templates.spec.ts; here we pin that the sheet
 * renders that list and nothing that could edit it.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import GroupPeekSheet from '../GroupPeekSheet.vue'
import { useMasterStore } from '@/stores/masterStore'

function template(id: string, name: string, kind: 'template' | 'group') {
  useMasterStore().applyChange({
    seq: 0,
    table: 'templates',
    id,
    deleted: false,
    row: { owner_id: 'me', name, kind },
  })
}

function item(id: string, name: string) {
  useMasterStore().applyChange({ seq: 0, table: 'items', id, deleted: false, row: { name } })
}

function position(id: string, templateId: string, itemId: string, quantity = 1) {
  useMasterStore().applyChange({
    seq: 0,
    table: 'template_items',
    id,
    deleted: false,
    row: {
      template_id: templateId,
      item_id: itemId,
      quantity,
      assignment: 'trip_global',
      dedup: 'max',
      default_mode: 'pack',
      late_packer: 0,
    },
  })
}

function includes(id: string, templateId: string, includedTemplateId: string) {
  useMasterStore().applyChange({
    seq: 0,
    table: 'template_includes',
    id,
    deleted: false,
    row: { template_id: templateId, included_template_id: includedTemplateId },
  })
}

function seed() {
  template('v1', 'Sommerferien', 'template')
  template('g1', 'Makro Fotografie', 'group')
  template('g2', 'Wildlife Fotografie', 'group')
  item('cam', 'Kamera')
  item('macro', 'Makro-Objektiv')
  item('tele', 'Teleobjektiv')
  position('p1', 'g1', 'cam')
  position('p2', 'g1', 'macro', 2)
  position('p3', 'g2', 'cam')
  position('p4', 'g2', 'tele')
  includes('inc1', 'v1', 'g1')
  includes('inc2', 'v1', 'g2')
}

const mountFor = (templateId: string) => mount(GroupPeekSheet, { props: { templateId } })

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('GroupPeekSheet (FR-27.12)', () => {
  it('names the group and lists its items with quantities', () => {
    seed()

    const wrapper = mountFor('g1')

    expect(wrapper.get('[data-testid="group-peek-name"]').text()).toBe('Makro Fotografie')
    expect(wrapper.findAll('[data-testid="group-peek-line"]').map((n) => n.text())).toEqual([
      'Kamera×1',
      'Makro-Objektiv×2',
    ])
  })

  it('peeks a Ferien-Vorlage through its composition, deduped (FR-27.2)', () => {
    seed()

    const wrapper = mountFor('v1')

    // v1 owns no positions of its own, and the shared camera arrives once.
    expect(wrapper.findAll('[data-testid="group-peek-line"]').map((n) => n.text())).toEqual([
      'Kamera×1',
      'Makro-Objektiv×2',
      'Teleobjektiv×1',
    ])
  })

  it('says a group is empty rather than showing an empty list', () => {
    template('g9', 'Leer', 'group')

    const wrapper = mountFor('g9')

    expect(wrapper.findAll('[data-testid="group-peek-line"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="group-peek-empty"]').exists()).toBe(true)
  })

  it('is a look, not an editor — it offers no control that writes', () => {
    seed()

    const wrapper = mountFor('g1')

    // Close is the only button; anything else would be a second editing
    // surface beside M8, which is where a group is edited.
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]!.attributes('data-testid')).toBe('group-peek-close')
    expect(wrapper.findAll('input')).toHaveLength(0)
  })

  it('closes on the close button', async () => {
    seed()

    const wrapper = mountFor('g1')
    await wrapper.get('[data-testid="group-peek-close"]').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
