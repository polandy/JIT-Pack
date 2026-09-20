// @vitest-environment jsdom
/**
 * The sheet a bulk link picks its item in (FR-24.9 over FR-20.1).
 *
 * Mounted directly, for the reason `BulkTagSheet.spec.ts` gives: Ionic renders
 * an overlay's content only once it has presented, and under jsdom it never
 * does. What M9 does with the `pick` is asserted in `ItemInventoryPage.spec.ts`;
 * what the sheet *offers*, and which direction it says it is offering it in,
 * is asserted here.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import BulkDependencySheet from '../BulkDependencySheet.vue'
import { DEPENDENCY_LINK_COMPANION, DEPENDENCY_LINK_MAIN } from '@/domain/dependencies'
import { DEPENDENCY_OFFER_CAP } from '@/lib/itemEditorOffers'
import { t } from '@/i18n'
import type { MasterItem } from '@/types/domain'

function item(id: string, name: string, icon?: string): MasterItem {
  return { id, name, weight_grams: null, value_cents: null, ...(icon ? { icon } : {}) }
}

const items: MasterItem[] = [
  item('i1', 'Kamera', '📷'),
  item('i2', 'Ersatzakku'),
  item('i3', 'Elektronisches Zubehör'),
]

function mountSheet(props: Partial<InstanceType<typeof BulkDependencySheet>['$props']> = {}) {
  return mount(BulkDependencySheet, {
    props: {
      isOpen: true,
      direction: DEPENDENCY_LINK_MAIN,
      items,
      selected: 4,
      ...props,
    },
    global: { stubs: { SheetModal: { template: '<div><slot /></div>' }, SheetHead: true } },
  })
}

describe('BulkDependencySheet — what it offers (FR-24.9, FR-20.1)', () => {
  it('says which end of the edge the selection is on', () => {
    const main = mountSheet()
    expect(main.findComponent({ name: 'SheetHead' }).props('title')).toBe(
      t('items.bulkDependsOnTitle'),
    )
    expect(main.text()).toContain(t('items.bulkDependsOnHint'))

    // The same edge, read from its other end — and the sentence is the only
    // thing that tells the two apart.
    const companion = mountSheet({ direction: DEPENDENCY_LINK_COMPANION })
    expect(companion.findComponent({ name: 'SheetHead' }).props('title')).toBe(
      t('items.bulkCompanionTitle'),
    )
    expect(companion.text()).toContain(t('items.bulkCompanionHint'))
  })

  it('names how many items the link would touch', () => {
    expect(mountSheet().findComponent({ name: 'SheetHead' }).props('meta')).toBe(
      t('items.bulkSelected', { n: 4 }),
    )
  })

  it('picks required edges by default, and suggested ones when asked (FR-20.4)', async () => {
    const sheet = mountSheet()
    await sheet.find('[data-testid="m9-bulk-dep-pick-Kamera"]').trigger('click')
    expect(sheet.emitted('pick')?.[0]).toEqual([{ itemId: 'i1', mode: 'required' }])

    await sheet.find('[data-testid="m9-bulk-dep-suggested"]').setValue(true)
    await sheet.find('[data-testid="m9-bulk-dep-pick-Kamera"]').trigger('click')
    expect(sheet.emitted('pick')?.[1]).toEqual([{ itemId: 'i1', mode: 'suggested' }])
  })

  it('searches the inventory under the app’s fold', async () => {
    const sheet = mountSheet()

    await sheet.find('[data-testid="m9-bulk-dep-search"]').setValue('zubehoer')
    expect(sheet.find('[data-testid="m9-bulk-dep-pick-Elektronisches Zubehör"]').exists()).toBe(
      true,
    )
    expect(sheet.find('[data-testid="m9-bulk-dep-pick-Kamera"]').exists()).toBe(false)
  })

  it('says when a query matched nothing', async () => {
    const sheet = mountSheet()
    await sheet.find('[data-testid="m9-bulk-dep-search"]').setValue('zzz')
    expect(sheet.find('[data-testid="m9-bulk-dep-none"]').text()).toBe(
      t('items.editor.dependencyNoMatch'),
    )
  })

  it('names what the cap holds back, so a hit is never mistaken for a missing item', async () => {
    const many = Array.from({ length: DEPENDENCY_OFFER_CAP + 3 }, (_, i) =>
      item(`x${i}`, `Artikel ${i}`),
    )
    const sheet = mountSheet({ items: many })

    expect(sheet.findAll('[data-testid^="m9-bulk-dep-pick-"]')).toHaveLength(DEPENDENCY_OFFER_CAP)
    expect(sheet.find('[data-testid="m9-bulk-dep-more"]').text()).toBe(
      t('items.bulkDependencyMore', { n: 3 }),
    )

    // Narrowing removes the note along with what it was counting.
    await sheet.find('[data-testid="m9-bulk-dep-search"]').setValue('Artikel 1')
    expect(sheet.find('[data-testid="m9-bulk-dep-more"]').exists()).toBe(false)
  })

  it('shows an item’s mark beside its name (FR-28.1)', () => {
    expect(mountSheet().get('[data-testid="m9-bulk-dep-pick-Kamera"]').text()).toContain('📷')
  })

  it('forgets the query and the switch when it closes', async () => {
    const sheet = mountSheet()
    await sheet.find('[data-testid="m9-bulk-dep-search"]').setValue('kamera')
    await sheet.find('[data-testid="m9-bulk-dep-suggested"]').setValue(true)

    await sheet.setProps({ isOpen: false })
    await sheet.setProps({ isOpen: true })

    expect(sheet.find('[data-testid="m9-bulk-dep-pick-Ersatzakku"]').exists()).toBe(true)
    await sheet.find('[data-testid="m9-bulk-dep-pick-Ersatzakku"]').trigger('click')
    expect(sheet.emitted('pick')?.at(-1)).toEqual([{ itemId: 'i2', mode: 'required' }])
  })
})
