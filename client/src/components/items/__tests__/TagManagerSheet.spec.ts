// @vitest-environment jsdom
/**
 * M9's tag manager (FR-24.10) — where a tag itself is fixed.
 *
 * Mounted directly, for TagFilterSheet's reason: Ionic renders an overlay's
 * content only once it has presented, and under jsdom it never does. What
 * the page does with the four intents is asserted in
 * `ItemInventoryPage.spec.ts`; what the sheet *offers* is asserted here.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import TagManagerSheet from '../TagManagerSheet.vue'
import type { Tag } from '@/types/domain'

const tags: Tag[] = [
  { id: 't-div', name: 'Diverses', sort_order: 0 },
  { id: 't-hyg', name: 'Hygiene', sort_order: 1 },
  { id: 't-zubehoer', name: 'Elektronisches Zubehör', sort_order: 2 },
]

const counts = new Map([
  ['t-div', 49],
  ['t-hyg', 9],
  ['t-zubehoer', 24],
])

function mountSheet(props: Partial<InstanceType<typeof TagManagerSheet>['$props']> = {}) {
  return mount(TagManagerSheet, {
    props: { isOpen: true, tags, counts, ...props },
    global: { stubs: { SheetModal: { template: '<div><slot /></div>' }, SheetHead: true } },
  })
}

describe('TagManagerSheet (FR-24.10)', () => {
  it('lists every tag with the number of assignments it has', () => {
    const sheet = mountSheet()

    expect(sheet.findAll('[data-testid^="m9-tag-row-"]')).toHaveLength(3)
    expect(sheet.get('[data-testid="m9-tag-row-Diverses"]').text()).toContain('49')
  })

  it('emits rename, merge and remove for the row they were pressed on', async () => {
    const sheet = mountSheet()

    await sheet.get('[data-testid="m9-tag-rename-Hygiene"]').trigger('click')
    await sheet.get('[data-testid="m9-tag-merge-Hygiene"]').trigger('click')
    await sheet.get('[data-testid="m9-tag-delete-Hygiene"]').trigger('click')

    expect(sheet.emitted('rename')?.[0]).toEqual([tags[1]])
    expect(sheet.emitted('merge')?.[0]).toEqual([tags[1]])
    expect(sheet.emitted('remove')?.[0]).toEqual([tags[1]])
  })

  it('moves a tag by its index on the axis, not by its place in the list', async () => {
    const sheet = mountSheet()

    await sheet.get('[data-testid="m9-tag-up-Elektronisches Zubehör"]').trigger('click')

    expect(sheet.emitted('move')?.[0]).toEqual([2, 1])
  })

  it('does not offer to move the first tag up or the last one down', () => {
    const sheet = mountSheet()

    expect(sheet.get('[data-testid="m9-tag-up-Diverses"]').attributes('disabled')).toBeDefined()
    expect(
      sheet.get('[data-testid="m9-tag-down-Elektronisches Zubehör"]').attributes('disabled'),
    ).toBeDefined()
    // And the ones in between are live — otherwise the assertion above would
    // pass against a sheet that disabled every arrow it has.
    expect(sheet.get('[data-testid="m9-tag-up-Hygiene"]').attributes('disabled')).toBeUndefined()
  })

  it('withdraws the order controls while a search is narrowing the list', async () => {
    const sheet = mountSheet()
    expect(sheet.find('[data-testid="m9-tag-up-Hygiene"]').exists()).toBe(true)

    await sheet.get('[data-testid="m9-tags-search"]').setValue('hyg')

    // Two rows eleven apart on the axis would make „up" mean nothing.
    expect(sheet.findAll('[data-testid^="m9-tag-row-"]')).toHaveLength(1)
    expect(sheet.find('[data-testid="m9-tag-up-Hygiene"]').exists()).toBe(false)
  })

  it('finds a tag typed without its umlaut', async () => {
    const sheet = mountSheet()

    await sheet.get('[data-testid="m9-tags-search"]').setValue('zubehoer')

    expect(sheet.find('[data-testid="m9-tag-row-Elektronisches Zubehör"]').exists()).toBe(true)
  })

  it('says so when the search matches nothing, and when there is no tag at all', async () => {
    const sheet = mountSheet()
    await sheet.get('[data-testid="m9-tags-search"]').setValue('nichts dergleichen')
    expect(sheet.find('[data-testid="m9-tags-no-match"]').exists()).toBe(true)

    const empty = mountSheet({ tags: [], counts: new Map() })
    expect(empty.find('[data-testid="m9-tags-empty"]').exists()).toBe(true)
    // No search field either: there is nothing to search.
    expect(empty.find('[data-testid="m9-tags-search"]').exists()).toBe(false)
  })
})
