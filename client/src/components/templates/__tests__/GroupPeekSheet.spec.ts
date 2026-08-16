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

/** The item names alone — the marks and the source line are asserted where
 *  they are the subject, not smuggled into every list comparison. */
const itemNames = (wrapper: ReturnType<typeof mountFor>) =>
  wrapper.findAll('[data-testid="group-peek-item"]').map((n) => n.text())

/** Amounts in the same order, for the cases that are about quantities. */
const amounts = (wrapper: ReturnType<typeof mountFor>) =>
  wrapper.findAll('[data-testid="group-peek-line"] .qty').map((n) => n.text())

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('GroupPeekSheet (FR-27.12)', () => {
  it('names the group and lists its items with quantities', () => {
    seed()

    const wrapper = mountFor('g1')

    expect(wrapper.get('[data-testid="group-peek-name"]').text()).toBe('Makro Fotografie')
    expect(itemNames(wrapper)).toEqual(['Kamera', 'Makro-Objektiv'])
    expect(amounts(wrapper)).toEqual(['×1', '×2'])
  })

  it('peeks a Ferien-Vorlage through its composition, deduped (FR-27.2)', () => {
    seed()

    const wrapper = mountFor('v1')

    // v1 owns no positions of its own, and the shared camera arrives once.
    expect(itemNames(wrapper)).toEqual(['Kamera', 'Makro-Objektiv', 'Teleobjektiv'])
    expect(amounts(wrapper)).toEqual(['×1', '×2', '×1'])
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

/**
 * FR-27.14 — the same sheet, opened on a Ferien-Vorlage from M8's resolution
 * footer. It is the one place that answers "what would a trip actually get".
 */
describe('GroupPeekSheet on a Vorlage (FR-27.14)', () => {
  function seedMarks() {
    template('v1', 'Fotoreise', 'template')
    template('g1', 'Makro', 'group')
    template('g2', 'Wildlife', 'group')
    item('cam', 'Kamera')
    item('tele', 'Teleobjektiv')
    item('jacket', 'Regenjacke')
    position('p1', 'g1', 'cam')
    position('p2', 'g2', 'cam')
    position('p3', 'g2', 'tele')
    includes('i1', 'v1', 'g1')
    includes('i2', 'v1', 'g2')
    useMasterStore().applyChange({
      seq: 0,
      table: 'template_items',
      id: 'p4',
      deleted: false,
      row: {
        template_id: 'v1',
        item_id: 'jacket',
        quantity: 1,
        assignment: 'per_person',
        dedup: 'max',
        default_mode: 'pack',
        late_packer: 0,
      },
    })
  }

  const lineFor = (wrapper: ReturnType<typeof mountFor>, name: string) =>
    wrapper.findAll('[data-testid="group-peek-line"]').find((n) => n.text().includes(name))!

  it('says where each line came from', () => {
    seedMarks()

    const wrapper = mountFor('v1')

    expect(lineFor(wrapper, 'Teleobjektiv').text()).toContain('Wildlife')
    // Its own position reads as such — the wording the mockup settled — rather
    // than repeating the Vorlage's name back at the reader.
    expect(lineFor(wrapper, 'Regenjacke').text()).toMatch(/own position|eigene Position/i)
  })

  it('marks a merged line and names both groups', () => {
    seedMarks()

    const line = lineFor(mountFor('v1'), 'Kamera').text().replace(/\s+/g, ' ')
    expect(line).toContain('Makro')
    expect(line).toContain('Wildlife')
    // The mark, not the amount: the amount is ×1 either way, so only the mark
    // distinguishes "one because one was asked for" from "one after a merge".
    expect(line).toMatch(/once only|nur 1×/i)
  })

  it('marks a per-person line instead of showing a traveler count', () => {
    seedMarks()

    // The count belongs to the trip; a template printing "3×" would be guessing.
    expect(lineFor(mountFor('v1'), 'Regenjacke').text()).toMatch(/pro Person|per person/i)
  })

  it('says nothing about provenance when peeking a group itself', () => {
    seedMarks()

    // Every line of a group comes from that group — repeating it on each row
    // would be noise, and the same sheet serves both cases.
    const wrapper = mountFor('g2')
    expect(wrapper.find('[data-testid="group-peek-source"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="group-peek-line"]')).toHaveLength(2)
  })
})
