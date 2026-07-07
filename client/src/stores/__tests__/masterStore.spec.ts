import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMasterStore } from '../masterStore'
import type { PullChange } from '@/api/types'

describe('masterStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts empty', () => {
    const store = useMasterStore()
    expect(store.itemList).toEqual([])
    expect(store.templateList).toEqual([])
    expect(store.categoryList).toEqual([])
  })

  it('applies category changes', () => {
    const store = useMasterStore()
    store.applyChange({
      seq: 1, table: 'categories', id: 'c1', deleted: false,
      row: { name: 'Clothes', sort_order: 1 },
    })
    store.applyChange({
      seq: 2, table: 'categories', id: 'c2', deleted: false,
      row: { name: 'Tech', sort_order: 0 },
    })

    expect(store.categoryList).toHaveLength(2)
    expect(store.categoryList[0].name).toBe('Tech')
    expect(store.categoryList[1].name).toBe('Clothes')
  })

  it('applies item changes', () => {
    const store = useMasterStore()
    store.applyChange({
      seq: 1, table: 'items', id: 'i1', deleted: false,
      row: { name: 'T-Shirt', category_id: 'c1', weight_grams: 200, unit: 'pieces', is_consumable: 0 },
    })

    const item = store.getItem('i1')
    expect(item?.name).toBe('T-Shirt')
    expect(item?.weight_grams).toBe(200)
    expect(item?.is_consumable).toBe(false)
  })

  it('deletes items', () => {
    const store = useMasterStore()
    store.applyChange({
      seq: 1, table: 'items', id: 'i1', deleted: false,
      row: { name: 'Soap', unit: 'pieces' },
    })
    store.applyChange({ seq: 2, table: 'items', id: 'i1', deleted: true, row: null })
    expect(store.getItem('i1')).toBeUndefined()
  })

  it('applies template changes', () => {
    const store = useMasterStore()
    store.applyChange({
      seq: 1, table: 'templates', id: 't1', deleted: false,
      row: { owner_id: 'u1', name: 'Beach Essentials', is_published: 1 },
    })

    const tpl = store.getTemplate('t1')
    expect(tpl?.name).toBe('Beach Essentials')
    expect(tpl?.is_published).toBe(true)
  })

  it('deletes template and its items', () => {
    const store = useMasterStore()
    store.applyChange({
      seq: 1, table: 'templates', id: 't1', deleted: false,
      row: { owner_id: 'u1', name: 'T', is_published: 0 },
    })
    store.applyChange({
      seq: 2, table: 'template_items', id: 'ti1', deleted: false,
      row: { template_id: 't1', item_id: 'i1', quantity_formula: '2', assignment: 'per_person', dedup: 'max', default_mode: 'pack' },
    })
    expect(store.getTemplateItems('t1')).toHaveLength(1)

    store.applyChange({ seq: 3, table: 'templates', id: 't1', deleted: true, row: null })
    expect(store.getTemplate('t1')).toBeUndefined()
    expect(store.getTemplateItems('t1')).toEqual([])
  })

  it('upserts template items', () => {
    const store = useMasterStore()
    store.applyChange({
      seq: 1, table: 'template_items', id: 'ti1', deleted: false,
      row: { template_id: 't1', item_id: 'i1', quantity_formula: '1', assignment: 'per_person', dedup: 'max', default_mode: 'pack' },
    })
    store.applyChange({
      seq: 2, table: 'template_items', id: 'ti1', deleted: false,
      row: { template_id: 't1', item_id: 'i1', quantity_formula: '3', assignment: 'trip_global', dedup: 'sum', default_mode: 'buy_before' },
    })

    const tis = store.getTemplateItems('t1')
    expect(tis).toHaveLength(1)
    expect(tis[0].quantity_formula).toBe('3')
    expect(tis[0].assignment).toBe('trip_global')
  })

  it('groups items by category', () => {
    const store = useMasterStore()
    store.applyChanges([
      { seq: 1, table: 'categories', id: 'c1', deleted: false, row: { name: 'Clothes', sort_order: 0 } },
      { seq: 2, table: 'items', id: 'i1', deleted: false, row: { name: 'Shirt', category_id: 'c1', unit: 'pieces' } },
      { seq: 3, table: 'items', id: 'i2', deleted: false, row: { name: 'Pants', category_id: 'c1', unit: 'pieces' } },
      { seq: 4, table: 'items', id: 'i3', deleted: false, row: { name: 'Charger', unit: 'pieces' } },
    ])

    const groups = store.itemsByCategory()
    expect(groups.get('Clothes')).toHaveLength(2)
    expect(groups.get('Uncategorized')).toHaveLength(1)
  })

  it('searches items by name', () => {
    const store = useMasterStore()
    store.applyChanges([
      { seq: 1, table: 'items', id: 'i1', deleted: false, row: { name: 'Sunscreen', unit: 'pieces' } },
      { seq: 2, table: 'items', id: 'i2', deleted: false, row: { name: 'Sunglasses', unit: 'pieces' } },
      { seq: 3, table: 'items', id: 'i3', deleted: false, row: { name: 'Towel', unit: 'pieces' } },
    ])

    expect(store.searchItems('sun')).toHaveLength(2)
    expect(store.searchItems('towel')).toHaveLength(1)
    expect(store.searchItems('')).toHaveLength(3)
  })

  it('returns template item count', () => {
    const store = useMasterStore()
    store.applyChanges([
      { seq: 1, table: 'template_items', id: 'ti1', deleted: false, row: { template_id: 't1', item_id: 'i1', quantity_formula: '1', assignment: 'per_person', dedup: 'max', default_mode: 'pack' } },
      { seq: 2, table: 'template_items', id: 'ti2', deleted: false, row: { template_id: 't1', item_id: 'i2', quantity_formula: '2', assignment: 'per_person', dedup: 'max', default_mode: 'pack' } },
    ])

    expect(store.templateItemCount('t1')).toBe(2)
    expect(store.templateItemCount('nonexistent')).toBe(0)
  })
})
