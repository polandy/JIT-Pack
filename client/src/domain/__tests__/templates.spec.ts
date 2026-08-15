/**
 * Template composition (§3.27, FR-27.1/27.2/27.6): a Ferien-Vorlage includes
 * groups by reference; resolving it expands those includes and merges the
 * result by master item under the FR-2.3a rule.
 */
import { describe, expect, it } from 'vitest'

import { expandIncludes, resolveTemplate } from '../templates'
import type { Template, TemplateInclude, TemplateItem } from '@/types/domain'

function template(id: string, name: string, kind: Template['kind'] = 'template'): Template {
  return { id, owner_id: 'user-a', name, kind }
}

function include(templateId: string, includedTemplateId: string): TemplateInclude {
  return {
    id: `inc-${templateId}-${includedTemplateId}`,
    template_id: templateId,
    included_template_id: includedTemplateId,
  }
}

function position(
  id: string,
  templateId: string,
  itemId: string,
  extra: Partial<TemplateItem> = {},
): TemplateItem {
  return {
    id,
    template_id: templateId,
    item_id: itemId,
    quantity: 1,
    assignment: 'trip_global',
    dedup: 'max',
    conditions: null,
    default_mode: 'pack',
    late_packer: false,
    ...extra,
  }
}

describe('expandIncludes (FR-27.1)', () => {
  it('adds the included groups to the selection', () => {
    const result = expandIncludes(
      ['vacation'],
      [include('vacation', 'macro'), include('vacation', 'wildlife')],
    )
    expect([...result]).toEqual(['vacation', 'macro', 'wildlife'])
  })

  it('ignores includes belonging to templates that were not selected', () => {
    const result = expandIncludes(['vacation'], [include('other', 'macro')])
    expect([...result]).toEqual(['vacation'])
  })

  it('stops after one level, because the hierarchy is two levels (FR-27.1)', () => {
    // A group including a group cannot exist through the UI; if a stale row
    // ever arrived, expansion must not follow it — that is what makes cycles
    // structurally impossible rather than merely validated against.
    const result = expandIncludes(
      ['vacation'],
      [include('vacation', 'macro'), include('macro', 'lenses')],
    )
    expect([...result]).toEqual(['vacation', 'macro'])
  })

  it('never yields the same template twice', () => {
    const result = expandIncludes(['vacation', 'macro'], [include('vacation', 'macro')])
    expect([...result]).toEqual(['vacation', 'macro'])
  })
})

describe('resolveTemplate (FR-27.2)', () => {
  const macro = template('macro', 'Makro', 'group')
  const wildlife = template('wildlife', 'Wildlife', 'group')
  const vacation = template('vacation', 'Fotoreise')

  it('counts own positions and included group positions once each', () => {
    const resolution = resolveTemplate('vacation', {
      templates: [vacation, macro, wildlife],
      includes: [include('vacation', 'macro'), include('vacation', 'wildlife')],
      positions: [
        position('p1', 'vacation', 'tripod'),
        position('p2', 'macro', 'ringlight'),
        position('p3', 'wildlife', 'teleconverter'),
      ],
    })
    expect(resolution.positions).toHaveLength(3)
    expect(resolution.positions.map((p) => p.item_id).sort()).toEqual([
      'ringlight',
      'teleconverter',
      'tripod',
    ])
  })

  it('merges a master item contributed by two groups into one position', () => {
    const resolution = resolveTemplate('vacation', {
      templates: [vacation, macro, wildlife],
      includes: [include('vacation', 'macro'), include('vacation', 'wildlife')],
      positions: [position('p1', 'macro', 'camera'), position('p2', 'wildlife', 'camera')],
    })
    expect(resolution.positions).toHaveLength(1)
    expect(resolution.merges).toHaveLength(1)
    expect(resolution.merges[0]!.item_id).toBe('camera')
    // FR-27.2: the merge names its contributing groups, because the merge is
    // the user-visible point of the whole feature — not an anonymous count.
    expect(resolution.merges[0]!.sources.map((s) => s.name)).toEqual(['Makro', 'Wildlife'])
  })

  it('names the Vorlage before its groups when both contributed', () => {
    // The composed template is what the user opened; its own position is the
    // one they can edit here, so it leads the merge report and owns the
    // non-quantity attributes.
    const resolution = resolveTemplate('vacation', {
      templates: [vacation, macro],
      includes: [include('vacation', 'macro')],
      positions: [position('p-group', 'macro', 'camera'), position('p-own', 'vacation', 'camera')],
    })
    expect(resolution.merges[0]!.sources.map((s) => s.name)).toEqual(['Fotoreise', 'Makro'])
    expect(resolution.merges[0]!.position.id).toBe('p-own')
  })

  it('takes the maximum quantity by default (FR-2.3a)', () => {
    const resolution = resolveTemplate('vacation', {
      templates: [vacation, macro, wildlife],
      includes: [include('vacation', 'macro'), include('vacation', 'wildlife')],
      positions: [
        position('p1', 'macro', 'battery', { quantity: 2 }),
        position('p2', 'wildlife', 'battery', { quantity: 3 }),
      ],
    })
    expect(resolution.merges[0]!.strategy).toBe('max')
    expect(resolution.merges[0]!.quantity).toBe(3)
  })

  it('sums when any contributing position asks for sum (FR-2.3a)', () => {
    const resolution = resolveTemplate('vacation', {
      templates: [vacation, macro, wildlife],
      includes: [include('vacation', 'macro'), include('vacation', 'wildlife')],
      positions: [
        position('p1', 'macro', 'battery', { quantity: 2 }),
        position('p2', 'wildlife', 'battery', { quantity: 3, dedup: 'sum' }),
      ],
    })
    expect(resolution.merges[0]!.strategy).toBe('sum')
    expect(resolution.merges[0]!.quantity).toBe(5)
  })

  it('reports no merges when nothing overlaps', () => {
    const resolution = resolveTemplate('vacation', {
      templates: [vacation, macro],
      includes: [include('vacation', 'macro')],
      positions: [position('p1', 'vacation', 'tripod'), position('p2', 'macro', 'ringlight')],
    })
    expect(resolution.merges).toEqual([])
  })

  it('resolves a group to its own positions — a group includes nothing', () => {
    const resolution = resolveTemplate('macro', {
      templates: [vacation, macro],
      includes: [include('vacation', 'macro')],
      positions: [position('p1', 'vacation', 'tripod'), position('p2', 'macro', 'ringlight')],
    })
    expect(resolution.positions.map((p) => p.item_id)).toEqual(['ringlight'])
    expect(resolution.includedTemplates).toEqual([])
  })

  it('lists the included groups in the order they were included', () => {
    const resolution = resolveTemplate('vacation', {
      templates: [vacation, macro, wildlife],
      includes: [include('vacation', 'wildlife'), include('vacation', 'macro')],
      positions: [],
    })
    expect(resolution.includedTemplates.map((t) => t.name)).toEqual(['Wildlife', 'Makro'])
  })

  it('drops an include pointing at a template that is not on this device', () => {
    // A pull can deliver the include row before the group row; the count must
    // stay honest rather than crash or invent a phantom group.
    const resolution = resolveTemplate('vacation', {
      templates: [vacation],
      includes: [include('vacation', 'macro')],
      positions: [position('p1', 'vacation', 'tripod')],
    })
    expect(resolution.includedTemplates).toEqual([])
    expect(resolution.positions).toHaveLength(1)
  })

  it('is empty for a template that is not on this device', () => {
    const resolution = resolveTemplate('ghost', {
      templates: [vacation],
      includes: [],
      positions: [],
    })
    expect(resolution.positions).toEqual([])
    expect(resolution.includedTemplates).toEqual([])
  })
})
