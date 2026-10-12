/**
 * M10's fields (FR-24.1, FR-24.5): the same port stages a draft while the
 * item does not exist yet and writes the live row once it does.
 */
import { describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'

import type { MasterItem, Tag } from '@/types/domain'
import { useItemFields, type ItemFieldSource } from '../useItemFields'

const tag = (id: string): Tag => ({ id, name: id }) as Tag
const TAGS = [tag('a'), tag('b'), tag('c')]

function setup(itemId: string | undefined) {
  const id = ref(itemId)
  const rows = reactive<Record<string, MasterItem>>({
    i1: {
      id: 'i1',
      name: 'Stirnlampe',
      weight_grams: 85,
      value_cents: 2450,
      icon: '🔦',
      default_assignee_id: 'u1',
    } as MasterItem,
  })
  const source = {
    item: (rowId: string) => rows[rowId],
    allTags: () => TAGS,
    itemTags: () => [tag('b')],
    assignTag: vi.fn(),
    unassignTag: vi.fn(),
    setPrimaryTag: vi.fn(),
    update: vi.fn(),
  } satisfies ItemFieldSource
  const { fields, draft } = useItemFields(() => id.value, source)
  return { id, fields, draft, source }
}

describe('useItemFields — creating stages a draft (FR-24.5)', () => {
  it('stages each typed field and parses it into the draft', () => {
    const { fields, draft } = setup(undefined)
    fields.value.type('name', '  Zelt ')
    fields.value.type('weight', '2100')
    fields.value.type('price', '199.9')
    expect(fields.value.text('name')).toBe('  Zelt ')
    expect(draft()).toMatchObject({ name: 'Zelt', weightGrams: 2100, valueCents: 19990 })
  })

  it('leaves an empty or unreadable number as none', () => {
    const { fields, draft } = setup(undefined)
    fields.value.type('weight', 'viel')
    expect(draft()).toMatchObject({ weightGrams: null, valueCents: null })
  })

  it('keeps tags in assignment order, primary first, without duplicates', () => {
    const { fields, draft } = setup(undefined)
    fields.value.assignTag('a')
    fields.value.assignTag('b')
    fields.value.assignTag('a')
    fields.value.makePrimary('b')
    expect(fields.value.tags.map((t) => t.id)).toEqual(['b', 'a'])
    fields.value.unassignTag('b')
    expect(draft().tagIds).toEqual(['a'])
  })

  it('stages the mark and the assignee and writes nothing', () => {
    const { fields, draft, source } = setup(undefined)
    fields.value.setMark('⛺')
    fields.value.setAssignee('u2')
    expect(fields.value.mark).toBe('⛺')
    expect(fields.value.assignee).toBe('u2')
    expect(draft()).toMatchObject({ icon: '⛺', defaultAssigneeId: 'u2' })
    expect(source.update).not.toHaveBeenCalled()
    expect(source.assignTag).not.toHaveBeenCalled()
  })
})

describe('useItemFields — editing writes the live row (G-5)', () => {
  it('shows the saved row', () => {
    const { fields } = setup('i1')
    expect(['name', 'weight', 'price'].map((f) => fields.value.text(f as 'name'))).toEqual([
      'Stirnlampe',
      '85',
      '24.50',
    ])
    expect(fields.value.mark).toBe('🔦')
    expect(fields.value.assignee).toBe('u1')
    expect(fields.value.tags.map((t) => t.id)).toEqual(['b'])
  })

  it('writes on blur, not per keystroke', () => {
    const { fields, source } = setup('i1')
    fields.value.type('weight', '9')
    expect(source.update).not.toHaveBeenCalled()
    fields.value.settle('weight', '90')
    fields.value.settle('price', '')
    fields.value.settle('name', ' Lampe ')
    expect(source.update.mock.calls.map(([, edit]) => edit)).toEqual([
      { weight_grams: 90 },
      { value_cents: null },
      { name: 'Lampe' },
    ])
  })

  it('does not rename to an emptied name', () => {
    const { fields, source } = setup('i1')
    fields.value.settle('name', '   ')
    expect(source.update).not.toHaveBeenCalled()
  })

  it('routes tags, mark and assignee to the item', () => {
    const { fields, source } = setup('i1')
    fields.value.assignTag('a')
    fields.value.unassignTag('b')
    fields.value.makePrimary('a')
    fields.value.setMark(null)
    fields.value.setAssignee(null)
    expect(source.assignTag).toHaveBeenCalledWith('i1', 'a')
    expect(source.unassignTag).toHaveBeenCalledWith('i1', 'b')
    expect(source.setPrimaryTag).toHaveBeenCalledWith('i1', 'a')
    expect(source.update.mock.calls.map(([, edit]) => edit)).toEqual([
      { icon: null },
      { default_assignee_id: null },
    ])
  })

  it('turns from draft to live when the item comes to exist', () => {
    const { id, fields } = setup(undefined)
    fields.value.type('name', 'Zelt')
    id.value = 'i1'
    expect(fields.value.text('name')).toBe('Stirnlampe')
  })
})
