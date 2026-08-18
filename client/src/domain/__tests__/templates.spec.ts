/**
 * Template composition (§3.27, FR-27.1/27.2/27.6): a Ferien-Vorlage includes
 * groups by reference; resolving it expands those includes and merges the
 * result by master item under the FR-2.3a rule.
 */
import { describe, expect, it } from 'vitest'

import {
  tripsReachedBy,
  scopeForNewTemplate,
  previewLines,
  resolvedLines,
  resolveTemplate,
  scopeSwitchBlock,
} from '../templates'
import type {
  MasterItem,
  Template,
  TemplateInclude,
  TemplateItem,
  Trip,
  TripItem,
} from '@/types/domain'

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

  /*
   * This case used to expect "the order they were included" — an order the
   * data does not carry: `template_includes` has no sort column, so the rows
   * arrive in whatever order the sync or IndexedDB produced. An e2e run made
   * that concrete, reporting the same merge as „in Wildlife & Makro" on WebKit
   * and „in Makro & Wildlife" on Chromium.
   */
  it('lists the included groups by name, so two devices agree', () => {
    const resolution = resolveTemplate('vacation', {
      templates: [vacation, macro, wildlife],
      includes: [include('vacation', 'wildlife'), include('vacation', 'macro')],
      positions: [],
    })
    expect(resolution.includedTemplates.map((t) => t.name)).toEqual(['Makro', 'Wildlife'])
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

const TODAY = '2026-01-15'

describe('tripsReachedBy (FR-27.4 blast radius)', () => {
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

  function sourced(
    tripId: string,
    sourceTemplateId: string | null,
  ): Pick<TripItem, 'trip_id' | 'source_template_id'> {
    return { trip_id: tripId, source_template_id: sourceTemplateId }
  }

  it('names every trip that still follows the template, running ones included', () => {
    // Owner rule 2026-08-18: only the past is out of reach. A running trip is
    // asked like any other, so a warning that left it out would understate
    // what the edit touches.
    const planning = trip('t1', 'Samedan', 'planning')
    const active = trip('t2', 'Davos', 'active')
    const archived = trip('t3', 'Wien', 'archived')
    const result = tripsReachedBy(
      'vacation',
      {
        trips: [planning, active, archived],
        items: [sourced('t1', 'vacation'), sourced('t2', 'vacation'), sourced('t3', 'vacation')],
        includes: [],
      },
      TODAY,
    )
    expect(result.map((t) => t.name)).toEqual(['Samedan', 'Davos'])
  })

  it('drops a trip whose end date has passed, whatever its status says', () => {
    const over = { ...trip('t1', 'Samedan', 'planning'), end_date: '2026-01-14' }
    const result = tripsReachedBy(
      'vacation',
      { trips: [over], items: [sourced('t1', 'vacation')], includes: [] },
      TODAY,
    )
    expect(result).toEqual([])
  })

  it('reaches a group through the Vorlage that includes it', () => {
    // The trip's rows carry the Vorlage as provenance; editing the group
    // still lands on that trip when the refresh re-resolves the composition.
    const planning = trip('t1', 'Samedan', 'planning')
    const result = tripsReachedBy(
      'macro',
      {
        trips: [planning],
        items: [sourced('t1', 'vacation')],
        includes: [include('vacation', 'macro')],
      },
      TODAY,
    )
    expect(result.map((t) => t.name)).toEqual(['Samedan'])
  })

  it('ignores ad-hoc rows and unrelated templates', () => {
    const planning = trip('t1', 'Samedan', 'planning')
    const result = tripsReachedBy(
      'macro',
      {
        trips: [planning],
        items: [sourced('t1', null), sourced('t1', 'vacation')],
        includes: [],
      },
      TODAY,
    )
    expect(result).toEqual([])
  })

  it('lists each trip once even when several rows point at the template', () => {
    const planning = trip('t1', 'Samedan', 'planning')
    const result = tripsReachedBy(
      'vacation',
      {
        trips: [planning],
        items: [sourced('t1', 'vacation'), sourced('t1', 'vacation')],
        includes: [],
      },
      TODAY,
    )
    expect(result).toHaveLength(1)
  })
})

/**
 * FR-27.12: looking inside a group. Both the peek sheet and the row's own
 * summary read the same resolved lines, so the two can never disagree about
 * what a group contains.
 */
describe('resolvedLines / previewLines (FR-27.12)', () => {
  const macro = template('macro', 'Makro', 'group')
  const items: MasterItem[] = [
    { id: 'cam', name: 'Kamera', weight_grams: 600, value_cents: null },
    { id: 'ring', name: 'Ringlicht', weight_grams: 200, value_cents: null },
    { id: 'lens', name: 'Makro-Objektiv', weight_grams: 300, value_cents: null },
  ]

  function resolutionOf() {
    return resolveTemplate('macro', {
      templates: [macro],
      includes: [],
      positions: [
        position('p1', 'macro', 'ring'),
        position('p2', 'macro', 'cam', { quantity: 2 }),
        position('p3', 'macro', 'lens'),
      ],
    })
  }

  it('names each resolved position with its quantity, ordered by name', () => {
    // Position order follows the sync; a list a human reads gets its own order,
    // the same reasoning as includedTemplatesOf.
    // toMatchObject, not toEqual: FR-27.14 added marks to the line, and this
    // case is about the order and the amounts.
    expect(resolvedLines(resolutionOf(), items)).toMatchObject([
      { name: 'Kamera', quantity: 2 },
      { name: 'Makro-Objektiv', quantity: 1 },
      { name: 'Ringlicht', quantity: 1 },
    ])
  })

  it('drops a position whose master item has not synced to this device', () => {
    const lines = resolvedLines(resolutionOf(), [items[0]!])
    expect(lines).toMatchObject([{ name: 'Kamera', quantity: 2 }])
    expect(lines).toHaveLength(1)
  })

  it('previews the first names and counts the rest (FR-27.12 row summary)', () => {
    expect(previewLines(resolvedLines(resolutionOf(), items), 2)).toEqual({
      names: ['Kamera', 'Makro-Objektiv'],
      rest: 1,
    })
  })

  it('reports no rest when everything fits', () => {
    expect(previewLines(resolvedLines(resolutionOf(), items), 5)).toEqual({
      names: ['Kamera', 'Makro-Objektiv', 'Ringlicht'],
      rest: 0,
    })
  })

  it('an empty group previews as nothing at all, not as an empty sentence', () => {
    const empty = resolveTemplate('macro', { templates: [macro], includes: [], positions: [] })
    expect(previewLines(resolvedLines(empty, items), 3)).toEqual({ names: [], rest: 0 })
  })
})

/**
 * FR-27.14: what a Ferien-Vorlage would actually produce. The list carries
 * three things a bare count cannot say — where a line came from, that a merge
 * collapsed it, and where the quantity is not the whole story (per person, or
 * conditional on the trip).
 */
describe('resolvedLines carries provenance and marks (FR-27.14)', () => {
  const macro = template('macro', 'Makro', 'group')
  const wildlife = template('wildlife', 'Wildlife', 'group')
  const vacation = template('vacation', 'Fotoreise')
  const items: MasterItem[] = [
    { id: 'cam', name: 'Kamera', weight_grams: 600, value_cents: null },
    { id: 'tele', name: 'Teleobjektiv', weight_grams: 900, value_cents: null },
    { id: 'jacket', name: 'Regenjacke', weight_grams: 300, value_cents: null },
    { id: 'cream', name: 'Sonnencreme', weight_grams: 100, value_cents: null },
  ]

  function composed() {
    return resolveTemplate('vacation', {
      templates: [vacation, macro, wildlife],
      includes: [include('vacation', 'macro'), include('vacation', 'wildlife')],
      positions: [
        position('p1', 'macro', 'cam'),
        position('p2', 'wildlife', 'cam'),
        position('p3', 'wildlife', 'tele'),
        position('p4', 'vacation', 'jacket', { assignment: 'per_person' }),
        position('p5', 'vacation', 'cream', { default_mode: 'buy_before' }),
      ],
    })
  }

  const lineFor = (name: string) => resolvedLines(composed(), items).find((l) => l.name === name)!

  it('names every template that contributed a line', () => {
    expect(lineFor('Kamera').sources).toEqual(['Makro', 'Wildlife'])
    expect(lineFor('Teleobjektiv').sources).toEqual(['Wildlife'])
  })

  it('names the Vorlage itself for its own positions', () => {
    // The view decides how to word it; the domain says which template it was,
    // so "eigene Position" stays a wording rather than a hidden rule.
    expect(lineFor('Regenjacke').sources).toEqual(['Fotoreise'])
  })

  it('marks a line more than one template contributed', () => {
    expect(lineFor('Kamera').merged).toBe(true)
    expect(lineFor('Teleobjektiv').merged).toBe(false)
  })

  it('marks a per-person position instead of inventing a traveler count', () => {
    // The traveler count belongs to the trip (FR-25.8); a template that
    // printed "3×" would be guessing.
    expect(lineFor('Regenjacke').perPerson).toBe(true)
    expect(lineFor('Regenjacke').quantity).toBe(1)
    expect(lineFor('Kamera').perPerson).toBe(false)
  })

  it('carries the procurement mode, which the trip has not decided yet', () => {
    expect(lineFor('Sonnencreme').mode).toBe('buy_before')
    expect(lineFor('Kamera').mode).toBe('pack')
  })

  it('carries the conditions a line depends on (FR-15.2)', () => {
    const resolution = resolveTemplate('macro', {
      templates: [macro],
      includes: [],
      positions: [position('p1', 'macro', 'cam', { conditions: { season: ['winter'] } })],
    })

    // Nothing is excluded at template level — the trip decides — so the line
    // must state the condition rather than quietly appearing or vanishing.
    expect(resolvedLines(resolution, items)[0]!.conditions).toEqual({ season: ['winter'] })
  })
})

/**
 * FR-27.6, amended 2026-08-17: what the M7 ＋ should create.
 *
 * The chooser used to ask on every tap, including while standing on the
 * *Gruppen* tab — where the question has exactly one possible answer. The
 * segment already states the scope, so the ＋ follows it and only *Alle* has
 * something left to ask.
 */
describe('scopeForNewTemplate (FR-27.6)', () => {
  it('takes the scope from a single-scope tab', () => {
    expect(scopeForNewTemplate('group')).toBe('group')
    expect(scopeForNewTemplate('template')).toBe('template')
  })

  it('asks when the view shows both scopes', () => {
    // Null is "ask", not a default: guessing here would create the wrong kind
    // silently, and the kinds are not interchangeable (FR-27.1).
    expect(scopeForNewTemplate('all')).toBeNull()
  })
})
