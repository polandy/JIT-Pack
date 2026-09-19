// @vitest-environment jsdom
/**
 * The sheet a bulk action picks its tag in (FR-24.9).
 *
 * Mounted directly, for the reason `TagFilterSheet.spec.ts` gives: Ionic
 * renders an overlay's content only once it has presented, and under jsdom it
 * never does. What M9 does with the `pick` it emits is asserted in
 * `ItemInventoryPage.spec.ts`; what the sheet *offers* is asserted here.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import BulkTagSheet from '../BulkTagSheet.vue'
import { t } from '@/i18n'
import type { Tag } from '@/types/domain'

const tags: Tag[] = [
  { id: 't-div', name: 'Diverses', sort_order: 0 },
  { id: 't-sonne', name: 'Sonnenschutz', sort_order: 1 },
  { id: 't-zubehoer', name: 'Elektronisches Zubehör', sort_order: 2 },
]

function mountSheet(props: Partial<InstanceType<typeof BulkTagSheet>['$props']> = {}) {
  return mount(BulkTagSheet, {
    props: {
      isOpen: true,
      mode: 'give' as const,
      tags,
      counts: new Map([['t-div', 4]]),
      selected: 4,
      ...props,
    },
    global: { stubs: { SheetModal: { template: '<div><slot /></div>' }, SheetHead: true } },
  })
}

describe('BulkTagSheet — what it offers (FR-24.9)', () => {
  it('names the act and how many items it would touch', () => {
    expect(mountSheet().findComponent({ name: 'SheetHead' }).props('title')).toBe(
      t('items.bulkGiveTitle'),
    )
    expect(mountSheet({ mode: 'take' }).findComponent({ name: 'SheetHead' }).props('title')).toBe(
      t('items.bulkTakeTitle'),
    )
    expect(mountSheet().findComponent({ name: 'SheetHead' }).props('meta')).toBe(
      t('items.bulkSelected', { n: 4 }),
    )
  })

  it('offers the switch that refiles only where something is being given', () => {
    // Taking a tag away cannot make it primary; a control that decides
    // nothing is not rendered.
    expect(mountSheet().find('[data-testid="m9-bulk-primary"]').exists()).toBe(true)
    expect(mountSheet({ mode: 'take' }).find('[data-testid="m9-bulk-primary"]').exists()).toBe(
      false,
    )
  })

  it('has the switch on by default, because labelling 49 items moves none of them', async () => {
    const sheet = mountSheet()

    await sheet.find('[data-testid="m9-bulk-tag-Sonnenschutz"]').trigger('click')

    expect(sheet.emitted('pick')?.[0]).toEqual([{ tagId: 't-sonne', primary: true }])
  })

  it('reports the switch as the caller set it, and never for a take', async () => {
    const give = mountSheet()
    await give.find('[data-testid="m9-bulk-primary"]').setValue(false)
    await give.find('[data-testid="m9-bulk-tag-Sonnenschutz"]').trigger('click')
    expect(give.emitted('pick')?.[0]).toEqual([{ tagId: 't-sonne', primary: false }])

    const take = mountSheet({ mode: 'take' })
    await take.find('[data-testid="m9-bulk-tag-Diverses"]').trigger('click')
    expect(take.emitted('pick')?.[0]).toEqual([{ tagId: 't-div', primary: false }])
  })

  it('says how many of the selected items already carry a tag', () => {
    const sheet = mountSheet()

    expect(sheet.find('[data-testid="m9-bulk-tag-Diverses"]').text()).toContain(
      t('items.bulkAlreadyOn', { n: 4 }),
    )
    // Nothing to say for a tag none of them carries — a zero beside a name
    // is noise, not information.
    expect(sheet.find('[data-testid="m9-bulk-tag-Sonnenschutz"]').text()).not.toContain('0')
  })

  it('searches the offered tags under the app’s fold', async () => {
    const sheet = mountSheet()

    await sheet.find('[data-testid="m9-bulk-tag-search"]').setValue('zubehoer')
    expect(sheet.find('[data-testid="m9-bulk-tag-Elektronisches Zubehör"]').exists()).toBe(true)
    expect(sheet.find('[data-testid="m9-bulk-tag-Diverses"]').exists()).toBe(false)
  })

  it('says why the list is empty, differently for the two acts', async () => {
    const give = mountSheet()
    await give.find('[data-testid="m9-bulk-tag-search"]').setValue('zzz')
    expect(give.find('[data-testid="m9-bulk-tag-none"]').text()).toBe(t('items.filterNoTag'))

    // A take with nothing offered is a selection with no tag in common, which
    // is a different sentence from „your search matched nothing".
    const take = mountSheet({ mode: 'take', tags: [] })
    expect(take.find('[data-testid="m9-bulk-tag-none"]').text()).toBe(t('items.bulkNoSharedTag'))
  })

  it('offers to create the typed tag when no tag has that name (FR-24.9, FR-24.11)', async () => {
    const sheet = mountSheet()
    await sheet.find('[data-testid="m9-bulk-tag-search"]').setValue('  Wasser ')

    const offer = sheet.get('[data-testid="m9-bulk-tag-create"]')
    expect(offer.text()).toContain('Wasser')
    await offer.trigger('click')
    // Trimmed, and with the refiling switch as it stands.
    expect(sheet.emitted('create')?.[0]).toEqual([{ name: 'Wasser', primary: true }])
    expect(sheet.emitted('pick')).toBeUndefined()
  })

  it('offers the create row beside partial hits, and withdraws it for an exact name', async () => {
    const sheet = mountSheet()

    // „Sonne" is part of „Sonnenschutz" but names no tag: both are offered.
    await sheet.find('[data-testid="m9-bulk-tag-search"]').setValue('Sonne')
    expect(sheet.find('[data-testid="m9-bulk-tag-create"]').exists()).toBe(true)
    expect(sheet.find('[data-testid="m9-bulk-tag-Sonnenschutz"]').exists()).toBe(true)

    // Under the uniqueness fold a different capitalisation is the same tag —
    // creating it would be refused as a duplicate, so it is not offered.
    await sheet.find('[data-testid="m9-bulk-tag-search"]').setValue('diverses')
    expect(sheet.find('[data-testid="m9-bulk-tag-create"]').exists()).toBe(false)
  })

  it('never offers to create while taking, nor without a query', async () => {
    expect(mountSheet().find('[data-testid="m9-bulk-tag-create"]').exists()).toBe(false)

    const take = mountSheet({ mode: 'take' })
    await take.find('[data-testid="m9-bulk-tag-search"]').setValue('Wasser')
    expect(take.find('[data-testid="m9-bulk-tag-create"]').exists()).toBe(false)
  })

  it('shows a tag’s mark beside its name (FR-24.13)', () => {
    const sheet = mountSheet({ tags: [{ ...tags[0]!, icon: '📦' }, tags[1]!] })
    expect(sheet.get('[data-testid="m9-bulk-tag-Diverses"]').text()).toContain('📦')
  })

  it('forgets the query and re-arms the switch when it closes', async () => {
    const sheet = mountSheet()
    await sheet.find('[data-testid="m9-bulk-tag-search"]').setValue('sonne')
    await sheet.find('[data-testid="m9-bulk-primary"]').setValue(false)

    await sheet.setProps({ isOpen: false })
    await sheet.setProps({ isOpen: true })

    expect(sheet.find('[data-testid="m9-bulk-tag-Diverses"]').exists()).toBe(true)
    await sheet.find('[data-testid="m9-bulk-tag-Diverses"]').trigger('click')
    expect(sheet.emitted('pick')?.at(-1)).toEqual([{ tagId: 't-div', primary: true }])
  })
})
