import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useMasterStore } from '../masterStore'
import { generateTripItems } from '@/domain/instantiate'
import { UNTAGGED_KEY } from '@/domain/tags'

/**
 * FR-24.2 — a generated trip row carries the item's primary tag as its
 * grouping key.
 *
 * The rule was written once, in the quick-add, and nowhere else: generation
 * read `MasterItem.category_name`, an optional field that `items` has no
 * column for and that nothing in the client ever wrote. So every row a
 * Vorlage produced arrived with `category_name: null` and fell into the
 * leftover bucket of M4's grouping, M6's shopping groups and M12's
 * analytics — while the same item added by hand got its tag. The unit tests
 * of generation could not see it: each one sets `category_name` in its own
 * fixture, which is the answer the store never supplied.
 *
 * This case therefore starts at the store and ends at the generated row.
 */
describe('a generated row is filed under the item’s primary tag (FR-24.2)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const master = useMasterStore()
    let seq = 0
    const apply = (table: string, id: string, row: Record<string, unknown>) =>
      master.applyChange({ seq: ++seq, table, id, deleted: false, row })

    apply('tags', 'tag-kleidung', { name: 'Kleidung', sort_order: 1 })
    apply('tags', 'tag-sommer', { name: 'Sommer', sort_order: 2 })
    apply('items', 'item-badehose', { name: 'Badehose' })
    apply('items', 'item-schluessel', { name: 'Schlüssel' })
    // Primary by position, and deliberately not the tag that sorts first on
    // the axis — the row is filed under the item's own first tag.
    apply('item_tags', 'it-1', { item_id: 'item-badehose', tag_id: 'tag-sommer', position: 1 })
    apply('item_tags', 'it-2', { item_id: 'item-badehose', tag_id: 'tag-kleidung', position: 0 })

    apply('templates', 'tpl-strand', { name: 'Strand', kind: 'group' })
    apply('template_items', 'ti-1', {
      template_id: 'tpl-strand',
      item_id: 'item-badehose',
      quantity: 1,
      assignment: 'trip',
      dedup: 'sum',
      default_mode: 'pack',
    })
    apply('template_items', 'ti-2', {
      template_id: 'tpl-strand',
      item_id: 'item-schluessel',
      quantity: 1,
      assignment: 'trip',
      dedup: 'sum',
      default_mode: 'pack',
    })
    return master
  }

  function generate() {
    const master = useMasterStore()
    return generateTripItems({
      templates: master.templateList,
      selectedTemplateIds: ['tpl-strand'],
      includes: master.includeList,
      templateItemTasks: master.templateItemTaskList,
      templateItems: master.getTemplateItems('tpl-strand'),
      masterItems: master.categorisedItemList,
      trip: { duration_days: 3, attributes: {}, travelers: [] },
    }).items
  }

  it('gives the generated row the tag the inventory files the item under', () => {
    seed()

    const row = generate().find((i) => i.source_item_id === 'item-badehose')

    expect(row?.category_name).toBe('Kleidung')
  })

  it('agrees with the heading M9 puts the item under', () => {
    const master = seed()

    const row = generate().find((i) => i.source_item_id === 'item-badehose')
    const heading = [...master.itemsByPrimaryTag().entries()].find(([, items]) =>
      items.some((i) => i.id === 'item-badehose'),
    )?.[0]

    expect(row?.category_name).toBe(heading)
  })

  it('leaves an untagged item without one rather than inventing a name', () => {
    const master = seed()

    const row = generate().find((i) => i.source_item_id === 'item-schluessel')

    expect(row?.category_name).toBeNull()
    expect(row?.category_name).not.toBe(UNTAGGED_KEY)
    expect(master.categoryOf('item-schluessel')).toBeNull()
  })

  it('follows a retag, because the list is derived and not a snapshot', () => {
    const master = seed()
    expect(generate().find((i) => i.source_item_id === 'item-badehose')?.category_name).toBe(
      'Kleidung',
    )

    master.applyChange({
      seq: 99,
      table: 'item_tags',
      id: 'it-2',
      deleted: false,
      row: { item_id: 'item-badehose', tag_id: 'tag-kleidung', position: 5 },
    })

    expect(generate().find((i) => i.source_item_id === 'item-badehose')?.category_name).toBe(
      'Sommer',
    )
  })
})
