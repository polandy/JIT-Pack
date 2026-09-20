// @vitest-environment jsdom
/**
 * FR-24.15: which of the picked items stays.
 *
 * Mounted directly, for TagManagerSheet's reason — Ionic renders an overlay's
 * content only once it has presented, and under jsdom it never does. What the
 * page does with the pick is asserted in `ItemInventoryPage.spec.ts`.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import MergeItemsSheet, { type MergeCandidate } from '../MergeItemsSheet.vue'
import { t } from '@/i18n'
import type { MasterItem } from '@/types/domain'

function item(id: string, name: string, extra: Partial<MasterItem> = {}): MasterItem {
  return {
    id,
    name,
    weight_grams: null,
    value_cents: null,
    icon: null,
    image_hash: null,
    retired_at: null,
    default_assignee_id: null,
    ...extra,
  } as MasterItem
}

const CANDIDATES: MergeCandidate[] = [
  { item: item('i-new', 'Stirnlampe Petzl'), tags: ['Technik'], uses: 0 },
  { item: item('i-old', 'Stirnlampe', { weight_grams: 90, image_hash: 'abc' }), tags: [], uses: 7 },
]

function mountSheet(candidates: MergeCandidate[] = CANDIDATES) {
  return mount(MergeItemsSheet, {
    props: { isOpen: true, candidates },
    global: {
      stubs: {
        SheetModal: { template: '<div><slot /></div>' },
        SheetHead: true,
        ItemMark: true,
      },
    },
  })
}

describe('MergeItemsSheet (FR-24.15)', () => {
  it('offers the most-used candidate first, whatever order it was handed', () => {
    // The row a duplicate was split off from is the one the data hangs on, and
    // keeping it is what moves the fewest rows.
    const names = mountSheet()
      .findAll('[data-testid^="m9-merge-keep-"]')
      .map((button) => button.attributes('data-testid'))

    expect(names).toEqual(['m9-merge-keep-Stirnlampe', 'm9-merge-keep-Stirnlampe Petzl'])
  })

  it('says what each candidate brings, so the choice is not made on the name alone', () => {
    const sheet = mountSheet()

    const kept = sheet.get('[data-testid="m9-merge-keep-Stirnlampe"]')
    expect(kept.text()).toContain('90 g')
    // The other one has the tag, which is the reason a user might keep it.
    expect(sheet.get('[data-testid="m9-merge-keep-Stirnlampe Petzl"]').text()).toContain('Technik')
  })

  it('says „never used" rather than counting to zero', () => {
    // The plural rule is one/other, so a count of 0 takes the „other" form —
    // „used 0×" — and the row this list most needs to describe is the one that
    // was never packed.
    const sheet = mountSheet()

    expect(sheet.get('[data-testid="m9-merge-keep-Stirnlampe Petzl"]').text()).toContain(
      t('items.mergeUnused'),
    )
    expect(sheet.get('[data-testid="m9-merge-keep-Stirnlampe"]').text()).toContain(
      t('items.mergeUses', { n: 7 }),
    )
  })

  it('emits the id of the row that stays', async () => {
    const sheet = mountSheet()

    await sheet.get('[data-testid="m9-merge-keep-Stirnlampe"]').trigger('click')

    expect(sheet.emitted('pick')?.[0]).toEqual(['i-old'])
  })

  it('breaks a tie by tags and then by name, so two devices offer one order', () => {
    const tied: MergeCandidate[] = [
      { item: item('i-b', 'Zelt B'), tags: [], uses: 0 },
      { item: item('i-a', 'Zelt A'), tags: [], uses: 0 },
      { item: item('i-c', 'Zelt C'), tags: ['Camping'], uses: 0 },
    ]

    const names = mountSheet(tied)
      .findAll('[data-testid^="m9-merge-keep-"]')
      .map((button) => button.attributes('data-testid'))

    expect(names).toEqual(['m9-merge-keep-Zelt C', 'm9-merge-keep-Zelt A', 'm9-merge-keep-Zelt B'])
  })
})
