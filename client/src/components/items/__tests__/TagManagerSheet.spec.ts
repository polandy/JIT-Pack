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
    global: {
      stubs: {
        SheetModal: { template: '<div><slot /></div>' },
        SheetHead: { template: '<div><slot name="trail" /></div>' },
      },
    },
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

  it('offers each tag’s mark as a control, and emits mark for its row (FR-24.13)', async () => {
    const sheet = mountSheet({
      tags: [{ ...tags[0]!, icon: '📦' }, tags[1]!, tags[2]!],
    })

    // A tag with a mark shows it in the control; one without offers the slot.
    expect(sheet.get('[data-testid="m9-tag-mark-Diverses"]').text()).toContain('📦')
    expect(sheet.get('[data-testid="m9-tag-mark-Hygiene"]').attributes('data-empty')).toBe('true')

    await sheet.get('[data-testid="m9-tag-mark-Hygiene"]').trigger('click')
    expect(sheet.emitted('mark')?.[0]).toEqual([tags[1]])
  })

  it('offers a grip on every row, dashed while a search is narrowing the list (ADR-075)', async () => {
    const sheet = mountSheet()
    expect(sheet.findAll('[data-testid^="m9-tag-grip-"]')).toHaveLength(3)
    expect(sheet.get('[data-testid="m9-tag-grip-Hygiene"]').classes()).not.toContain('off')
    // The rows number the axis, which is what the drag reports a gap in.
    expect(sheet.get('[data-testid="m9-tag-row-Hygiene"]').attributes('data-drop-index')).toBe('1')

    await sheet.get('[data-testid="m9-tags-search"]').setValue('hyg')

    // Two rows eleven apart on the axis would make a drop between them mean nothing.
    expect(sheet.findAll('[data-testid^="m9-tag-row-"]')).toHaveLength(1)
    expect(sheet.get('[data-testid="m9-tag-grip-Hygiene"]').classes()).toContain('off')
    expect(
      sheet.get('[data-testid="m9-tag-row-Hygiene"]').attributes('data-drop-index'),
    ).toBeUndefined()
    expect(sheet.get('ul.tags').attributes('data-drop-target')).toBeUndefined()
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

describe('TagManagerSheet — merging several tags at once (FR-24.14)', () => {
  it('offers no checkboxes until the mode is on, and keeps the per-row acts until then', () => {
    const sheet = mountSheet()

    expect(sheet.find('[data-testid="m9-tag-pick-Hygiene"]').exists()).toBe(false)
    expect(sheet.find('[data-testid="m9-tag-merge-Hygiene"]').exists()).toBe(true)
  })

  it('merges the tags that were picked, in one act', async () => {
    const sheet = mountSheet()

    await sheet.get('[data-testid="m9-tags-select"]').trigger('click')
    await sheet.get('[data-testid="m9-tag-pick-Diverses"]').trigger('click')
    await sheet.get('[data-testid="m9-tag-pick-Hygiene"]').trigger('click')
    await sheet.get('[data-testid="m9-tags-merge-many"]').trigger('click')

    expect(sheet.emitted('mergeMany')?.[0]).toEqual([[tags[0], tags[1]]])
  })

  it('asks the question once per row: no rename, no arrows, no single merge while picking', async () => {
    const sheet = mountSheet()

    await sheet.get('[data-testid="m9-tags-select"]').trigger('click')

    expect(sheet.find('[data-testid="m9-tag-merge-Hygiene"]').exists()).toBe(false)
    expect(sheet.find('[data-testid="m9-tag-delete-Hygiene"]').exists()).toBe(false)
    expect(sheet.find('[data-testid="m9-tag-grip-Hygiene"]').exists()).toBe(false)
    // The name stops being a button: a tap picks the row now.
    expect(sheet.find('[data-testid="m9-tag-rename-Hygiene"]').exists()).toBe(false)
  })

  it('refuses to merge a selection that names only one tag', async () => {
    const sheet = mountSheet()

    await sheet.get('[data-testid="m9-tags-select"]').trigger('click')
    await sheet.get('[data-testid="m9-tag-pick-Hygiene"]').trigger('click')

    expect(sheet.get('[data-testid="m9-tags-merge-many"]').attributes('disabled')).toBeDefined()
    await sheet.get('[data-testid="m9-tag-pick-Diverses"]').trigger('click')
    expect(sheet.get('[data-testid="m9-tags-merge-many"]').attributes('disabled')).toBeUndefined()
  })

  it('keeps a picked tag the search has narrowed away — the two spellings are rarely one query', async () => {
    const sheet = mountSheet()

    await sheet.get('[data-testid="m9-tags-select"]').trigger('click')
    await sheet.get('[data-testid="m9-tag-pick-Diverses"]').trigger('click')
    await sheet.get('[data-testid="m9-tags-search"]').setValue('hyg')
    await sheet.get('[data-testid="m9-tag-pick-Hygiene"]').trigger('click')

    expect(sheet.get('[data-testid="m9-tags-select-count"]').text()).toContain('2')
    await sheet.get('[data-testid="m9-tags-merge-many"]').trigger('click')
    expect(sheet.emitted('mergeMany')?.[0]).toEqual([[tags[0], tags[1]]])
  })

  it('leaving the mode drops what was picked', async () => {
    const sheet = mountSheet()

    await sheet.get('[data-testid="m9-tags-select"]').trigger('click')
    await sheet.get('[data-testid="m9-tag-pick-Hygiene"]').trigger('click')
    await sheet.get('[data-testid="m9-tags-select-exit"]').trigger('click')
    await sheet.get('[data-testid="m9-tags-select"]').trigger('click')

    expect(sheet.get('[data-testid="m9-tags-select-count"]').text()).not.toMatch(/\d/)
  })

  it('a hold (its right-click twin) starts picking with that row, and its ghost click is spent (ADR-075)', async () => {
    const sheet = mountSheet()

    await sheet.get('[data-testid="m9-tag-row-Hygiene"]').trigger('contextmenu')
    expect(sheet.find('[data-testid="m9-tags-selbar"]').exists()).toBe(true)
    expect(sheet.get('[data-testid="m9-tag-row-Hygiene"]').attributes('data-picked')).toBe('true')

    // The click the release sends lands on the row it picked: it neither
    // un-picks it nor reaches a control underneath.
    await sheet.get('[data-testid="m9-tag-name-Hygiene"]').trigger('click')
    expect(sheet.get('[data-testid="m9-tag-row-Hygiene"]').attributes('data-picked')).toBe('true')

    // The next deliberate tap picks.
    await sheet.get('[data-testid="m9-tag-row-Diverses"]').trigger('pointerdown')
    await sheet.get('[data-testid="m9-tag-name-Diverses"]').trigger('click')
    expect(sheet.get('[data-testid="m9-tags-select-count"]').text()).toContain('2')
  })

  it('a hold that lands on the name does not also rename the tag', async () => {
    const sheet = mountSheet()

    await sheet.get('[data-testid="m9-tag-row-Hygiene"]').trigger('contextmenu')
    await sheet.get('[data-testid="m9-tag-row-Hygiene"]').trigger('click')

    expect(sheet.emitted('rename')).toBeUndefined()
  })

  it('„Alle" takes the rows the search leaves, and the merge bar appears once one is picked', async () => {
    const sheet = mountSheet()

    await sheet.get('[data-testid="m9-tags-select"]').trigger('click')
    expect(sheet.find('[data-testid="m9-tags-bulkbar"]').exists()).toBe(false)
    await sheet.get('[data-testid="m9-tags-search"]').setValue('e')
    const shown = sheet.findAll('[data-testid^="m9-tag-row-"]').length
    await sheet.get('[data-testid="m9-tags-select-all"]').trigger('click')

    expect(sheet.findAll('[data-picked="true"]')).toHaveLength(shown)
    expect(sheet.find('[data-testid="m9-tags-bulkbar"]').exists()).toBe(true)
  })
})
