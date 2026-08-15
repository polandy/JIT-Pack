/**
 * Template composition (§3.27, FR-27.1/27.2/27.6): a Ferien-Vorlage includes
 * groups by reference; resolving it expands those includes and merges the
 * result by master item under the FR-2.3a rule.
 */
import { describe, expect, it } from 'vitest'

import { planningTripsUsing, resolveTemplate, scopeSwitchBlock } from '../templates'
import type { Template, TemplateInclude, TemplateItem, Trip, TripItem } from '@/types/domain'

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

  it('stops after one level, because the hierarchy is two levels (FR-27.1)', () => {
    // A group including a group cannot exist through the UI; if a stale row
    // ever arrived, expansion must not follow it — that is what makes cycles
    // structurally impossible rather than merely validated against.
    const lenses = template('lenses', 'Objektive', 'group')
    const resolution = resolveTemplate('vacation', {
      templates: [vacation, macro, lenses],
      includes: [include('vacation', 'macro'), include('macro', 'lenses')],
      positions: [position('p1', 'macro', 'ringlight'), position('p2', 'lenses', 'macro-lens')],
    })
    expect(resolution.includedTemplates.map((t) => t.name)).toEqual(['Makro'])
    expect(resolution.positions.map((p) => p.item_id)).toEqual(['ringlight'])
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

describe('scopeSwitchBlock (FR-27.6)', () => {
  const vacation = template('vacation', 'Fotoreise')

  it('blocks demoting a Vorlage that still includes groups', () => {
    expect(scopeSwitchBlock('group', [include('vacation', 'macro')], [])).toBe('has-includes')
  })

  it('blocks promoting a Gruppe that is included somewhere', () => {
    expect(scopeSwitchBlock('template', [], [vacation])).toBe('included-by')
  })

  it('allows the switch when nothing constrains it', () => {
    expect(scopeSwitchBlock('group', [], [])).toBeNull()
    expect(scopeSwitchBlock('template', [], [])).toBeNull()
  })

  it('does not block demotion for being included — a group stays includable', () => {
    // The two guards are directional: consumers block *promotion* only,
    // includes block *demotion* only (FR-27.6).
    expect(scopeSwitchBlock('group', [], [vacation])).toBeNull()
  })
})

describe('planningTripsUsing (FR-27.4 blast radius)', () => {
  function trip(id: string, name: string, status: Trip['status']): Trip {
    return {
      id,
      name,
      status,
      year: 2026,
      start_date: null,
      end_date: null,
      duration_days: null,
      series_id: null,
      series_name: null,
      attributes: null,
      imported: false,
    }
  }

  function sourced(tripId: string, sourceTemplateId: string | null): Pick<
    TripItem,
    'trip_id' | 'source_template_id'
  > {
    return { trip_id: tripId, source_template_id: sourceTemplateId }
  }

  it('names only planning trips generated from the template', () => {
    const planning = trip('t1', 'Samedan', 'planning')
    const active = trip('t2', 'Davos', 'active')
    const archived = trip('t3', 'Wien', 'archived')
    const result = planningTripsUsing('vacation', {
      trips: [planning, active, archived],
      items: [sourced('t1', 'vacation'), sourced('t2', 'vacation'), sourced('t3', 'vacation')],
      includes: [],
    })
    // Active and archived trips are frozen (FR-27.4) — never in the radius.
    expect(result.map((t) => t.name)).toEqual(['Samedan'])
  })

  it('reaches a group through the Vorlage that includes it', () => {
    // The trip's rows carry the Vorlage as provenance; editing the group
    // still lands on that trip when the refresh re-resolves the composition.
    const planning = trip('t1', 'Samedan', 'planning')
    const result = planningTripsUsing('macro', {
      trips: [planning],
      items: [sourced('t1', 'vacation')],
      includes: [include('vacation', 'macro')],
    })
    expect(result.map((t) => t.name)).toEqual(['Samedan'])
  })

  it('ignores ad-hoc rows and unrelated templates', () => {
    const planning = trip('t1', 'Samedan', 'planning')
    const result = planningTripsUsing('macro', {
      trips: [planning],
      items: [sourced('t1', null), sourced('t1', 'vacation')],
      includes: [],
    })
    expect(result).toEqual([])
  })

  it('lists each trip once even when several rows point at the template', () => {
    const planning = trip('t1', 'Samedan', 'planning')
    const result = planningTripsUsing('vacation', {
      trips: [planning],
      items: [sourced('t1', 'vacation'), sourced('t1', 'vacation')],
      includes: [],
    })
    expect(result).toHaveLength(1)
  })
})
