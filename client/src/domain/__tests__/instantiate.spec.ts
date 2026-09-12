/**
 * Template instantiation (FR-2.2/FR-2.3a/FR-1.4/FR-15.2): aggregate
 * selected templates into trip items with evaluated quantities,
 * conditional inclusion, per-person expansion, and deduplication.
 */
import { describe, expect, it } from 'vitest'

import {
  applyReviewOverrides,
  reviewKeyOf,
  companionAsGenerated,
  durationDays,
  generateTripItems,
  generatedFrom,
  withCompanions,
  type GeneratedItem,
  type GenerationInput,
} from '../instantiate'
import type { DependencyResolution } from '../dependencies'
import type {
  CategorisedMasterItem,
  Template,
  TemplateInclude,
  TemplateItem,
  TemplateItemTask,
  TripItem,
} from '@/types/domain'
import { ITEM_MODE_PACK } from '@/types/domain'

function template(id: string, name: string): Template {
  return { id, owner_id: 'user-a', name, kind: 'template' }
}

function group(id: string, name: string): Template {
  return { id, owner_id: 'user-a', name, kind: 'group' }
}

function include(templateId: string, includedTemplateId: string): TemplateInclude {
  return {
    id: `inc-${templateId}-${includedTemplateId}`,
    template_id: templateId,
    included_template_id: includedTemplateId,
  }
}

function masterItem(
  id: string,
  name: string,
  extra: Partial<CategorisedMasterItem> = {},
): CategorisedMasterItem {
  return {
    id,
    name,
    weight_grams: 100,
    value_cents: null,
    category_name: null,
    ...extra,
  }
}

function templateItem(
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

function task(id: string, templateItemId: string, text: string): TemplateItemTask {
  return { id, template_item_id: templateItemId, task: text }
}

const twoAdults = [{ name: 'Andy' }, { name: 'Sarah' }]

/** Selecting everything passed is the common case; a test that cares overrides it. */
function input(overrides: Partial<GenerationInput>): GenerationInput {
  return {
    templates: [],
    selectedTemplateIds: (overrides.templates ?? []).map((t) => t.id),
    includes: [],
    templateItemTasks: [],
    templateItems: [],
    masterItems: [],
    trip: { duration_days: 10, attributes: null, travelers: twoAdults },
    ...overrides,
  }
}

describe('generateTripItems', () => {
  it('copies the plain quantity and master metadata', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [
          masterItem('i1', 'Sonnencreme', {
            weight_grams: 250,
            value_cents: 1200,
            category_name: 'Pflege',
          }),
        ],
        templateItems: [templateItem('ti1', 't1', 'i1', { quantity: 2 })],
      }),
    )

    expect(res.items).toHaveLength(1)
    const item = res.items[0]
    expect(item).toMatchObject({
      source_item_id: 'i1',
      source_template_id: 't1',
      name: 'Sonnencreme',
      category_name: 'Pflege',
      weight_grams: 250,
      value_cents: 1200,
      quantity: 2,
      mode: 'pack',
      traveler_index: null,
    })
  })

  it('expands per_person items to one row per traveler (FR-1.4)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Unterhosen')],
        templateItems: [
          templateItem('ti1', 't1', 'i1', {
            assignment: 'per_person',
            quantity: 5,
          }),
        ],
      }),
    )

    expect(res.items).toHaveLength(2)
    expect(res.items.map((i) => i.traveler_index)).toEqual([0, 1])
    expect(res.items.every((i) => i.quantity === 5)).toBe(true)
  })

  it('a missing quantity falls back to 1', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Sonnencreme')],
        templateItems: [
          { ...templateItem('ti1', 't1', 'i1'), quantity: undefined as unknown as number },
        ],
        trip: { duration_days: null, attributes: null, travelers: twoAdults },
      }),
    )

    expect(res.items[0]!.quantity).toBe(1)
  })

  it('excludes items whose conditions do not match, with reason (FR-15.2)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Winter')],
        masterItems: [masterItem('i1', 'Lange Unterwäsche'), masterItem('i2', 'Sonnenhut')],
        templateItems: [
          templateItem('ti1', 't1', 'i1', { conditions: { season: ['winter'] } }),
          templateItem('ti2', 't1', 'i2', { conditions: { season: ['summer'] } }),
        ],
        trip: { duration_days: 5, attributes: { season: 'winter' }, travelers: twoAdults },
      }),
    )

    expect(res.items.map((i) => i.name)).toEqual(['Lange Unterwäsche'])
    expect(res.excluded).toHaveLength(1)
    expect(res.excluded[0]).toMatchObject({ item_name: 'Sonnenhut' })
    expect(res.excluded[0]!.reason).toContain('season')
  })

  it('matches tag conditions against the trip tag list', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Velo')],
        masterItems: [masterItem('i1', 'Flickzeug')],
        templateItems: [templateItem('ti1', 't1', 'i1', { conditions: { tags: ['bike'] } })],
        trip: { duration_days: 5, attributes: { tags: ['bike', 'lake'] }, travelers: twoAdults },
      }),
    )

    expect(res.items).toHaveLength(1)
  })

  it('deduplicates overlaps across templates with max by default (FR-2.3a)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis'), template('t2', 'Strand')],
        masterItems: [masterItem('i1', 'Handtuch')],
        templateItems: [
          templateItem('ti1', 't1', 'i1', { quantity: 2 }),
          templateItem('ti2', 't2', 'i1', { quantity: 3 }),
        ],
      }),
    )

    expect(res.items).toHaveLength(1)
    expect(res.items[0]!.quantity).toBe(3)
    expect(res.merged).toHaveLength(1)
    expect(res.merged[0]).toMatchObject({
      item_name: 'Handtuch',
      strategy: 'max',
      quantities: [2, 3],
      quantity: 3,
    })
  })

  it('sums overlaps when any side requests sum (consumables, FR-2.3a)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis'), template('t2', 'Strand')],
        masterItems: [masterItem('i1', 'Sonnencreme')],
        templateItems: [
          templateItem('ti1', 't1', 'i1', { quantity: 1 }),
          templateItem('ti2', 't2', 'i1', { quantity: 2, dedup: 'sum' }),
        ],
      }),
    )

    expect(res.items[0]!.quantity).toBe(3)
    expect(res.merged[0]!.strategy).toBe('sum')
  })

  it('dedupes per traveler, not across travelers', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'A'), template('t2', 'B')],
        masterItems: [masterItem('i1', 'Socken')],
        templateItems: [
          templateItem('ti1', 't1', 'i1', { assignment: 'per_person', quantity: 2 }),
          templateItem('ti2', 't2', 'i1', { assignment: 'per_person', quantity: 4 }),
        ],
      }),
    )

    expect(res.items).toHaveLength(2)
    expect(res.items.every((i) => i.quantity === 4)).toBe(true)
  })

  it('carries default_mode and late_packer into generated items', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Zahnbürste')],
        templateItems: [
          templateItem('ti1', 't1', 'i1', { default_mode: 'buy_before', late_packer: true }),
        ],
      }),
    )

    expect(res.items[0]).toMatchObject({ mode: 'buy_before', late_packer: true })
  })

  it('drops quantity-zero results as considered-and-skipped input (FR-5.5)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Kindersitz')],
        templateItems: [templateItem('ti1', 't1', 'i1', { quantity: 0 })],
      }),
    )

    // Quantity 0 → generated as skipped item.
    expect(res.items).toHaveLength(1)
    expect(res.items[0]!.quantity).toBe(0)
  })
})

/**
 * §3.27: a Ferien-Vorlage is composed of Gruppen, so generation has to resolve
 * the composition before it merges. Without this the M8 editor happily attaches
 * groups that never reach a packing list.
 */
describe('generateTripItems with composed templates (§3.27)', () => {
  it('generates the positions of an included group (FR-27.2)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Ferien'), group('g1', 'Makro Fotografie')],
        selectedTemplateIds: ['t1'],
        includes: [include('t1', 'g1')],
        masterItems: [masterItem('i1', 'Kamera'), masterItem('i2', 'Makro-Objektiv')],
        templateItems: [templateItem('ti1', 't1', 'i1'), templateItem('ti2', 'g1', 'i2')],
      }),
    )

    expect(res.items.map((i) => i.name)).toEqual(['Kamera', 'Makro-Objektiv'])
  })

  it('a row generated from a group carries the group as provenance, not the Vorlage (FR-27.5/FR-27.11)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Ferien'), group('g1', 'Makro Fotografie')],
        selectedTemplateIds: ['t1'],
        includes: [include('t1', 'g1')],
        masterItems: [masterItem('i2', 'Makro-Objektiv')],
        templateItems: [templateItem('ti2', 'g1', 'i2')],
      }),
    )

    expect(res.items[0]).toMatchObject({ name: 'Makro-Objektiv', source_template_id: 'g1' })
  })

  it('merges an item shared by two included groups once and names both (FR-27.2)', () => {
    const res = generateTripItems(
      input({
        templates: [
          template('t1', 'Ferien'),
          group('g1', 'Makro Fotografie'),
          group('g2', 'Wildlife Fotografie'),
        ],
        selectedTemplateIds: ['t1'],
        includes: [include('t1', 'g1'), include('t1', 'g2')],
        masterItems: [masterItem('i1', 'Kamera')],
        templateItems: [
          templateItem('ti1', 'g1', 'i1', { quantity: 1 }),
          templateItem('ti2', 'g2', 'i1', { quantity: 1 }),
        ],
      }),
    )

    expect(res.items).toHaveLength(1)
    expect(res.merged).toHaveLength(1)
    expect(res.merged[0]!.sources.map((t) => t.name)).toEqual([
      'Makro Fotografie',
      'Wildlife Fotografie',
    ])
  })

  it('expands includes one level only — a group inside a group is not followed (FR-27.1)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Ferien'), group('g1', 'Foto'), group('g2', 'Stativ')],
        selectedTemplateIds: ['t1'],
        includes: [include('t1', 'g1'), include('g1', 'g2')],
        masterItems: [masterItem('i1', 'Kamera'), masterItem('i2', 'Stativ')],
        templateItems: [templateItem('ti1', 'g1', 'i1'), templateItem('ti2', 'g2', 'i2')],
      }),
    )

    expect(res.items.map((i) => i.name)).toEqual(['Kamera'])
  })

  it('a group both selected directly and included contributes once, not twice (FR-27.3)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Ferien'), group('g1', 'Makro Fotografie')],
        selectedTemplateIds: ['t1', 'g1'],
        includes: [include('t1', 'g1')],
        masterItems: [masterItem('i1', 'Kamera')],
        templateItems: [templateItem('ti1', 'g1', 'i1', { quantity: 1, dedup: 'sum' })],
      }),
    )

    expect(res.items).toHaveLength(1)
    // Not a merge: one contribution, so `sum` has nothing to add to itself.
    expect(res.items[0]!.quantity).toBe(1)
    expect(res.merged).toHaveLength(0)
  })

  it('skips an include whose group has not synced to this device', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Ferien')],
        selectedTemplateIds: ['t1'],
        includes: [include('t1', 'g-unknown')],
        masterItems: [masterItem('i1', 'Kamera')],
        templateItems: [templateItem('ti1', 't1', 'i1')],
      }),
    )

    expect(res.items.map((i) => i.name)).toEqual(['Kamera'])
  })

  it('conditions and per-person fan-out apply to group positions too (FR-15.2/FR-1.4)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Ferien'), group('g1', 'Winter')],
        selectedTemplateIds: ['t1'],
        includes: [include('t1', 'g1')],
        masterItems: [masterItem('i1', 'Handschuhe'), masterItem('i2', 'Sonnenhut')],
        templateItems: [
          templateItem('ti1', 'g1', 'i1', { assignment: 'per_person' }),
          templateItem('ti2', 'g1', 'i2', { conditions: { season: ['summer'] } }),
        ],
        trip: { duration_days: 5, attributes: { season: 'winter' }, travelers: twoAdults },
      }),
    )

    expect(res.items.map((i) => i.traveler_index)).toEqual([0, 1])
    expect(res.excluded).toHaveLength(1)
    expect(res.excluded[0]).toMatchObject({ item_name: 'Sonnenhut', template_id: 'g1' })
  })
})

/**
 * FR-1.4/FR-2.5: a per-person position needs somebody to belong to, and an
 * empty roster is a state M3 lets the user reach — step 2 accepts it, and the
 * screen even says per-person items need a traveler. What it did not do was
 * say which ones went missing afterwards, so the preview counted fewer rows
 * than the groups contain and named none of the difference.
 *
 * The report is a category of its own rather than an exclusion: no condition
 * kept these out, nothing about the trip says they do not belong, and the
 * remedy is a traveler rather than a different trip.
 */
describe('generateTripItems reports what an empty roster cannot place (FR-1.4)', () => {
  const noTravelers = { duration_days: 5, attributes: null, travelers: [] }

  it('names a per-person position it could not place instead of dropping it', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Unterhosen')],
        templateItems: [templateItem('ti1', 't1', 'i1', { assignment: 'per_person' })],
        trip: noTravelers,
      }),
    )

    expect(res.items).toEqual([])
    expect(res.unassignable).toEqual([
      { item_id: 'i1', item_name: 'Unterhosen', template_id: 't1' },
    ])
  })

  it('keeps it out of the exclusion report, which is about conditions', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Unterhosen')],
        templateItems: [templateItem('ti1', 't1', 'i1', { assignment: 'per_person' })],
        trip: noTravelers,
      }),
    )

    expect(res.excluded).toEqual([])
  })

  it('reports nothing once a traveler exists — the roster is what decides', () => {
    // The falsifier for the two above: an unconditional report would pass them
    // both and this one is the only thing that says the roster was read.
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Unterhosen')],
        templateItems: [templateItem('ti1', 't1', 'i1', { assignment: 'per_person' })],
        trip: { duration_days: 5, attributes: null, travelers: [{ name: 'Andy' }] },
      }),
    )

    expect(res.items.map((i) => i.traveler_index)).toEqual([0])
    expect(res.unassignable).toEqual([])
  })

  it('stays quiet about an item another position placed trip-global', () => {
    // Same rule the exclusion report follows: the item is on the list, so
    // saying it could not be placed states something false about it.
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Ferien'), group('g1', 'Wandern')],
        selectedTemplateIds: ['t1'],
        includes: [include('t1', 'g1')],
        masterItems: [masterItem('i1', 'Trinkflasche')],
        templateItems: [
          templateItem('ti1', 't1', 'i1', { assignment: 'per_person' }),
          templateItem('ti2', 'g1', 'i1'),
        ],
        trip: noTravelers,
      }),
    )

    expect(res.items.map((i) => i.name)).toEqual(['Trinkflasche'])
    expect(res.unassignable).toEqual([])
  })

  it('asks once for an item two contributors both carry per person', () => {
    // The Vorlage and the Gruppe under it both want a sleeping bag per head.
    // Two entries would read as two problems with two remedies; there is one.
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Ferien'), group('g1', 'Camping')],
        selectedTemplateIds: ['t1'],
        includes: [include('t1', 'g1')],
        masterItems: [masterItem('i1', 'Schlafsack')],
        templateItems: [
          templateItem('ti1', 't1', 'i1', { assignment: 'per_person' }),
          templateItem('ti2', 'g1', 'i1', { assignment: 'per_person' }),
        ],
        trip: noTravelers,
      }),
    )

    expect(res.items).toEqual([])
    // Named by its first contributor, the same rule the merge report follows.
    expect(res.unassignable).toEqual([
      { item_id: 'i1', item_name: 'Schlafsack', template_id: 't1' },
    ])
  })

  it('leaves a trip-global position alone — it needs nobody', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Zelt')],
        templateItems: [templateItem('ti1', 't1', 'i1')],
        trip: noTravelers,
      }),
    )

    expect(res.items.map((i) => i.name)).toEqual(['Zelt'])
    expect(res.unassignable).toEqual([])
  })
})

/**
 * FR-27.7: a template position can carry preparation tasks, and generation
 * hands each one to the trip item as an ordinary FR-7.3 todo. No new flag is
 * involved — the open todo is what keeps the row from counting as done.
 */
describe('generateTripItems carries preparation tasks (FR-27.7)', () => {
  it('carries a position task onto the generated item', () => {
    const res = generateTripItems(
      input({
        templates: [group('g1', 'Foto')],
        masterItems: [masterItem('i1', 'Ladegerät für Kamera')],
        templateItems: [templateItem('ti1', 'g1', 'i1')],
        templateItemTasks: [task('tk1', 'ti1', 'Akkus laden')],
      }),
    )

    expect(res.items[0]!.tasks).toEqual(['Akkus laden'])
  })

  it('gives every traveler row of a per-person position its own task (FR-1.4)', () => {
    const res = generateTripItems(
      input({
        templates: [group('g1', 'Reise')],
        masterItems: [masterItem('i1', 'Pass')],
        templateItems: [templateItem('ti1', 'g1', 'i1', { assignment: 'per_person' })],
        templateItemTasks: [task('tk1', 'ti1', 'Gültigkeit prüfen')],
      }),
    )

    expect(res.items).toHaveLength(2)
    expect(res.items.map((i) => i.tasks)).toEqual([['Gültigkeit prüfen'], ['Gültigkeit prüfen']])
  })

  it('an item without tasks carries an empty list, never undefined', () => {
    const res = generateTripItems(
      input({
        templates: [group('g1', 'Foto')],
        masterItems: [masterItem('i1', 'Kamera')],
        templateItems: [templateItem('ti1', 'g1', 'i1')],
        templateItemTasks: [task('tk1', 'ti-other', 'Akkus laden')],
      }),
    )

    expect(res.items[0]!.tasks).toEqual([])
  })

  it('a position excluded by its conditions contributes no task (FR-15.2)', () => {
    const res = generateTripItems(
      input({
        templates: [group('g1', 'Winter')],
        masterItems: [masterItem('i1', 'Schneeketten')],
        templateItems: [templateItem('ti1', 'g1', 'i1', { conditions: { season: ['winter'] } })],
        templateItemTasks: [task('tk1', 'ti1', 'Montage üben')],
        trip: { duration_days: 5, attributes: { season: 'summer' }, travelers: twoAdults },
      }),
    )

    expect(res.items).toHaveLength(0)
    expect(res.excluded).toHaveLength(1)
  })

  it('a merged item unions the tasks of every contributor, first contributor first', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Ferien'), group('g1', 'Makro'), group('g2', 'Wildlife')],
        selectedTemplateIds: ['t1'],
        includes: [include('t1', 'g1'), include('t1', 'g2')],
        masterItems: [masterItem('i1', 'Kamera')],
        templateItems: [templateItem('ti1', 'g1', 'i1'), templateItem('ti2', 'g2', 'i1')],
        templateItemTasks: [
          task('tk1', 'ti1', 'Akkus laden'),
          task('tk2', 'ti2', 'Sensor reinigen'),
        ],
      }),
    )

    expect(res.items).toHaveLength(1)
    expect(res.items[0]!.tasks).toEqual(['Akkus laden', 'Sensor reinigen'])
  })

  it('the same task text from two groups becomes one todo, not two', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Ferien'), group('g1', 'Makro'), group('g2', 'Wildlife')],
        selectedTemplateIds: ['t1'],
        includes: [include('t1', 'g1'), include('t1', 'g2')],
        masterItems: [masterItem('i1', 'Kamera')],
        templateItems: [templateItem('ti1', 'g1', 'i1'), templateItem('ti2', 'g2', 'i1')],
        templateItemTasks: [task('tk1', 'ti1', 'Akkus laden'), task('tk2', 'ti2', 'Akkus laden')],
      }),
    )

    expect(res.items[0]!.tasks).toEqual(['Akkus laden'])
  })
})

/**
 * `template_includes` has no sort order and the rows arrive in whatever order
 * storage hands back, which is not the same on two devices. The order decides
 * the first contributor of a merged item — its attributes and its provenance —
 * so it has to be derived, not inherited.
 */
describe('generateTripItems orders includes deterministically', () => {
  function composed(includeOrder: 'ab' | 'ba') {
    const incA = include('t1', 'g1')
    const incB = include('t1', 'g2')
    return input({
      templates: [template('t1', 'Ferien'), group('g1', 'Makro'), group('g2', 'Wildlife')],
      selectedTemplateIds: ['t1'],
      includes: includeOrder === 'ab' ? [incA, incB] : [incB, incA],
      masterItems: [masterItem('i1', 'Kamera')],
      templateItems: [templateItem('ti1', 'g1', 'i1'), templateItem('ti2', 'g2', 'i1')],
    })
  }

  it('names the merge sources by group name, whatever order the rows arrived in', () => {
    const forwards = generateTripItems(composed('ab'))
    const backwards = generateTripItems(composed('ba'))

    const names = (res: ReturnType<typeof generateTripItems>) =>
      res.merged[0]!.sources.map((s) => s.name)
    expect(names(forwards)).toEqual(['Makro', 'Wildlife'])
    expect(names(backwards)).toEqual(['Makro', 'Wildlife'])
  })

  it('keeps the provenance of a merged row stable across that order', () => {
    expect(generateTripItems(composed('ab')).items[0]!.source_template_id).toBe('g1')
    expect(generateTripItems(composed('ba')).items[0]!.source_template_id).toBe('g1')
  })
})

/**
 * Two ways the composition made an existing report dishonest. Both surface in
 * M3's preview and on the generated trip, and both come from the same cause:
 * §3.27 makes one master item routinely reachable through several positions.
 */
describe('generateTripItems keeps its reports honest across contributors', () => {
  it('a consciously skipped row carries no preparation task (FR-5.5/FR-27.7)', () => {
    const res = generateTripItems(
      input({
        templates: [group('g1', 'Foto')],
        masterItems: [masterItem('i1', 'Drohne')],
        templateItems: [templateItem('p1', 'g1', 'i1', { quantity: 0 })],
        templateItemTasks: [task('tk1', 'p1', 'Akkus laden')],
      }),
    )

    // Quantity 0 is "considered and left behind". A todo on it would count as
    // open preparation on a row FR-25.2 hides — an open task nobody can reach.
    expect(res.items[0]!.quantity).toBe(0)
    expect(res.items[0]!.tasks).toEqual([])
  })

  it('keeps the task when another contributor lifts the quantity above 0', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Ferien'), group('g1', 'Foto'), group('g2', 'Wildlife')],
        selectedTemplateIds: ['t1'],
        includes: [include('t1', 'g1'), include('t1', 'g2')],
        masterItems: [masterItem('i1', 'Kamera')],
        templateItems: [
          templateItem('p1', 'g1', 'i1', { quantity: 0 }),
          templateItem('p2', 'g2', 'i1', { quantity: 1 }),
        ],
        templateItemTasks: [task('tk1', 'p1', 'Akkus laden')],
      }),
    )

    // The row is coming after all, so the preparation applies — which is why
    // the decision belongs after the merge, not to a single contribution.
    expect(res.items[0]!.quantity).toBe(1)
    expect(res.items[0]!.tasks).toEqual(['Akkus laden'])
  })

  it('does not report an item as excluded when another group put it on the list', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Ferien'), group('g1', 'Sommer'), group('g2', 'Immer dabei')],
        selectedTemplateIds: ['t1'],
        includes: [include('t1', 'g1'), include('t1', 'g2')],
        masterItems: [masterItem('i1', 'Sonnenhut')],
        templateItems: [
          templateItem('p1', 'g1', 'i1', { conditions: { season: ['summer'] } }),
          templateItem('p2', 'g2', 'i1'),
        ],
        trip: { duration_days: 5, attributes: { season: 'winter' }, travelers: twoAdults },
      }),
    )

    expect(res.items.map((i) => i.name)).toEqual(['Sonnenhut'])
    // „Sonnenhut — übersprungen: season ≠ summer" beside a Sonnenhut on the
    // list is a false statement about the same item.
    expect(res.excluded).toEqual([])
  })

  it('still reports an item no contributor could place', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Ferien'), group('g1', 'Sommer'), group('g2', 'Strand')],
        selectedTemplateIds: ['t1'],
        includes: [include('t1', 'g1'), include('t1', 'g2')],
        masterItems: [masterItem('i1', 'Sonnenhut')],
        templateItems: [
          templateItem('p1', 'g1', 'i1', { conditions: { season: ['summer'] } }),
          templateItem('p2', 'g2', 'i1', { conditions: { season: ['summer'] } }),
        ],
        trip: { duration_days: 5, attributes: { season: 'winter' }, travelers: twoAdults },
      }),
    )

    expect(res.items).toEqual([])
    expect(res.excluded).toHaveLength(2)
    expect(res.excluded[0]!.reason).toContain('season')
  })
})

describe('generateTripItems takes single items too (FR-27.3)', () => {
  it('places a picked master item as an ordinary trip-global row', () => {
    // A trip is not always a template: "diesmal noch die Drohne mit" is one
    // item, and building a group for it would be filing, not packing.
    const res = generateTripItems(
      input({
        masterItems: [masterItem('i-drohne', 'Drohne', { weight_grams: 900 })],
        singleItemIds: ['i-drohne'],
      }),
    )

    expect(res.items).toHaveLength(1)
    expect(res.items[0]).toMatchObject({
      source_item_id: 'i-drohne',
      // No template said this, so nothing may claim it did — the provenance
      // is what FR-27.4 and FR-27.5 read later.
      source_template_id: null,
      name: 'Drohne',
      weight_grams: 900,
      quantity: 1,
      mode: 'pack',
      traveler_index: null,
      tasks: [],
    })
  })

  it('reports an item a template already brought instead of adding it twice', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Sonnencreme')],
        templateItems: [templateItem('ti1', 't1', 'i1')],
        singleItemIds: ['i1'],
      }),
    )

    expect(res.items).toHaveLength(1)
    expect(res.alreadyIncluded).toEqual([{ item_id: 'i1', item_name: 'Sonnencreme' }])
  })

  it('counts a per-person row as present — one is enough to make it a duplicate', () => {
    // The item is on the trip twice already, once per traveler. Adding a
    // trip-global third row would read as a third sunscreen.
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Sonnencreme')],
        templateItems: [templateItem('ti1', 't1', 'i1', { assignment: 'per_person' })],
        singleItemIds: ['i1'],
      }),
    )

    expect(res.items).toHaveLength(2)
    expect(res.alreadyIncluded.map((d) => d.item_name)).toEqual(['Sonnencreme'])
  })

  it('places an item a condition kept out — the user asked for it by name', () => {
    // FR-15.2 excluded it because the trip is not cold; picking it by hand
    // afterwards is an explicit override, not a mistake to be corrected.
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Handschuhe')],
        templateItems: [templateItem('ti1', 't1', 'i1', { conditions: { season: 'winter' } })],
        trip: { duration_days: 5, attributes: { season: 'summer' }, travelers: twoAdults },
        singleItemIds: ['i1'],
      }),
    )

    expect(res.items.map((i) => i.name)).toEqual(['Handschuhe'])
    expect(res.alreadyIncluded).toEqual([])
    // …and the exclusion report no longer claims it is off the list.
    expect(res.excluded).toEqual([])
  })

  it('adds the same item once however often it was picked', () => {
    const res = generateTripItems(
      input({
        masterItems: [masterItem('i1', 'Drohne')],
        singleItemIds: ['i1', 'i1'],
      }),
    )

    expect(res.items).toHaveLength(1)
    // Picking the same thing twice is not "already included" — it is one pick.
    expect(res.alreadyIncluded).toEqual([])
  })

  it('ignores an id no master item answers to', () => {
    const res = generateTripItems(input({ masterItems: [], singleItemIds: ['ghost'] }))

    expect(res.items).toEqual([])
    expect(res.alreadyIncluded).toEqual([])
  })
})

describe('durationDays — the trip’s length, or none (FR-2.1b)', () => {
  it('counts both end days, so a single-day trip is one day', () => {
    expect(durationDays('2026-08-22', '2026-08-22')).toBe(1)
    expect(durationDays('2026-08-22', '2026-09-05')).toBe(15)
  })

  it('has no length without both dates', () => {
    expect(durationDays(null, '2026-09-05')).toBeNull()
    expect(durationDays('2026-08-22', null)).toBeNull()
    expect(durationDays(null, null)).toBeNull()
  })

  it('has no length when the end precedes the start', () => {
    // The pickers make this unreachable in the app (FR-2.1d), but a row can
    // still arrive inverted — synced from a device that predates the bound,
    // or imported. A negative length is not a length: it would reach
    // generation as a quantity input and multiply every per-day position by
    // a negative number.
    expect(durationDays('2026-09-26', '2026-09-05')).toBeNull()
  })

  it('has no length for an unparseable date', () => {
    expect(durationDays('not-a-date', '2026-09-05')).toBeNull()
  })
})

/**
 * C-13: the fields an insert of a generated row states, rendered from the two
 * things besides a `GeneratedItem` that can become one — a row already on the
 * list (ADR-036's per-person split) and an FR-20.4 required companion.
 */
describe('generatedFrom / companionAsGenerated', () => {
  function onList(overrides: Partial<TripItem> = {}): TripItem {
    return {
      id: 'ti-1',
      trip_id: 'trip-1',
      source_item_id: 'item-1',
      source_template_id: 'tpl-1',
      name: 'Zahnbürste',
      weight_grams: 20,
      value_cents: 500,
      category_name: 'Bad',
      quantity: 1,
      packed_count: 1,
      state: 'packed',
      mode: ITEM_MODE_PACK,
      late_packer: true,
      assigned_traveler_id: 'trav-1',
      packer_user_id: 'user-a',
      packed_by_user_id: 'user-a',
      packed_at: '2026-09-05T10:00:00.000Z',
      container_id: 'cont-1',
      packing_now_by: null,
      packing_now_at: null,
      flag_unused: false,
      flag_missing: false,
      bought_from: null,
      updated_hlc: '1',
      ...overrides,
    }
  }

  it('generatedFrom carries the item facts of the row it copies', () => {
    expect(generatedFrom(onList())).toEqual({
      source_item_id: 'item-1',
      source_template_id: 'tpl-1',
      name: 'Zahnbürste',
      category_name: 'Bad',
      weight_grams: 20,
      value_cents: 500,
      quantity: 1,
      mode: ITEM_MODE_PACK,
      late_packer: true,
    })
  })

  /**
   * The falsifiable half of the rule: a copy inherits what the *item* is and
   * none of the decisions made about the row it came from. `Object.keys`
   * rather than an equality against the nine — a key whose value happens to
   * be null or false is still a key, and `toEqual` would not say so.
   */
  it('generatedFrom carries no decision made about the source row', () => {
    const fields = generatedFrom(onList())
    expect(Object.keys(fields).sort()).toEqual([
      'category_name',
      'late_packer',
      'mode',
      'name',
      'quantity',
      'source_item_id',
      'source_template_id',
      'value_cents',
      'weight_grams',
    ])
  })

  it('generatedFrom takes the caller quantity over the row it copies', () => {
    expect(generatedFrom(onList({ quantity: 1 }), { quantity: 3 }).quantity).toBe(3)
  })

  it('companionAsGenerated claims no template, packs, and is no late packer', () => {
    expect(
      companionAsGenerated({
        item_id: 'item-2',
        name: 'Zahnpasta',
        category_name: 'Bad',
        weight_grams: 90,
        value_cents: 300,
        quantity: 2,
        via_item_name: 'Zahnbürste',
      }),
    ).toEqual({
      source_item_id: 'item-2',
      source_template_id: null,
      name: 'Zahnpasta',
      category_name: 'Bad',
      weight_grams: 90,
      value_cents: 300,
      quantity: 2,
      mode: ITEM_MODE_PACK,
      late_packer: false,
    })
  })
})

/**
 * FR-20.2/20.4 and FR-2.6 as the M3 wizard assembles its draft. Both were
 * written inside the view and reachable only through a mount (U-11).
 */
describe('the rows a wizard draft is made of', () => {
  function generated(over: Partial<GeneratedItem> = {}): GeneratedItem {
    return {
      source_item_id: 'item-cam',
      source_template_id: 'tpl-1',
      name: 'Kamera',
      category_name: 'Technik',
      weight_grams: 800,
      value_cents: 120000,
      quantity: 1,
      mode: ITEM_MODE_PACK,
      late_packer: false,
      traveler_index: null,
      tasks: ['Akku laden'],
      ...over,
    }
  }

  function resolution(over: Partial<DependencyResolution> = {}): DependencyResolution {
    return { required: [], deduped: [], suggested: [], ...over }
  }

  const REQUIRED = {
    item_id: 'item-akku',
    name: 'Ersatzakku',
    category_name: 'Technik',
    weight_grams: 90,
    value_cents: 4500,
    quantity: 2,
    via_item_name: 'Kamera',
  }

  const SUGGESTED = {
    dependency_id: 'dep-1',
    item_id: 'item-drone',
    name: 'Drohne',
    category_name: 'Technik',
    weight_grams: 900,
    value_cents: 80000,
    quantity: 1,
    via_item_name: 'Kamera',
  }

  describe('withCompanions', () => {
    it('leaves a list with nothing to pull in exactly as it was', () => {
      const items = [generated()]

      expect(withCompanions(items, resolution(), new Set())).toEqual(items)
    })

    it('appends a required companion as a row of its own (FR-20.2)', () => {
      const rows = withCompanions([generated()], resolution({ required: [REQUIRED] }), new Set())

      expect(rows).toHaveLength(2)
      expect(rows[1]).toEqual({
        source_item_id: 'item-akku',
        // No template asked for it, so none may claim it, and a dependency
        // carries no FR-27.7 task.
        source_template_id: null,
        name: 'Ersatzakku',
        category_name: 'Technik',
        weight_grams: 90,
        value_cents: 4500,
        quantity: 2,
        mode: ITEM_MODE_PACK,
        late_packer: false,
        traveler_index: null,
        tasks: [],
      })
    })

    it('leaves a suggestion out until it is accepted (FR-20.4)', () => {
      const rows = withCompanions([generated()], resolution({ suggested: [SUGGESTED] }), new Set())

      expect(rows).toHaveLength(1)
    })

    it('adds an accepted suggestion with the item facts the suggestion carries', () => {
      const rows = withCompanions(
        [generated()],
        resolution({ suggested: [SUGGESTED] }),
        new Set(['item-drone']),
      )

      expect(rows).toHaveLength(2)
      expect(rows[1]).toMatchObject({
        source_item_id: 'item-drone',
        source_template_id: null,
        name: 'Drohne',
        category_name: 'Technik',
        weight_grams: 900,
        value_cents: 80000,
        quantity: 1,
        tasks: [],
      })
    })

    it('accepts a suggestion whose item the inventory no longer holds', () => {
      // The tap and the master row can disagree — another device may have
      // retired the item since the resolution ran. The row is written from
      // the resolution, which is also the list the user was reading, so it
      // is still writable and still says what the review said.
      const rows = withCompanions(
        [generated()],
        resolution({ suggested: [SUGGESTED] }),
        new Set(['item-drone']),
      )

      expect(rows[1]).toMatchObject({
        name: 'Drohne',
        category_name: 'Technik',
        weight_grams: 900,
        value_cents: 80000,
      })
    })

    it('keeps the generated rows first, then required, then accepted', () => {
      // The FR-2.6 review addresses rows by position, so anything appended
      // after them must stay after them.
      const rows = withCompanions(
        [generated()],
        resolution({ required: [REQUIRED], suggested: [SUGGESTED] }),
        new Set(['item-drone']),
      )

      expect(rows.map((r) => r.name)).toEqual(['Kamera', 'Ersatzakku', 'Drohne'])
    })
  })

  describe('applyReviewOverrides', () => {
    const CAM = generated({ quantity: 1 })
    const STATIV = generated({ source_item_id: 'item-stativ', name: 'Stativ', quantity: 4 })
    const camKey = reviewKeyOf(CAM)
    const stativKey = reviewKeyOf(STATIV)

    const cases: [string, Record<string, number>, number[]][] = [
      ['no override leaves every quantity alone', {}, [1, 4]],
      ['an override replaces one quantity', { [stativKey]: 2 }, [1, 2]],
      ['a zero is kept, because it is the FR-5.5 skip', { [camKey]: 0 }, [0, 4]],
      ['every row can be overridden at once', { [camKey]: 3, [stativKey]: 3 }, [3, 3]],
      ['an override for an unknown row changes nothing', { 'item-missing:group': 9 }, [1, 4]],
    ]

    for (const [name, overrides, expected] of cases) {
      it(`${name}`, () => {
        const items = [CAM, STATIV]

        expect(applyReviewOverrides(items, overrides).map((i) => i.quantity)).toEqual(expected)
      })
    }

    // FR-2.6: the review list can reorder while a user is editing it — a row
    // is dropped, a history suggestion is accepted, or a step-2 change
    // upstream reshuffles the generation. Keying by position would then move
    // the override onto whichever row now sits in that slot instead of the
    // one the user actually touched (the bug this test guards against).
    it('an override follows the item across reordering, not the slot it was made in', () => {
      const overrides = { [stativKey]: 2 }
      const reordered = [STATIV, CAM]

      expect(applyReviewOverrides(reordered, overrides).map((i) => i.quantity)).toEqual([2, 1])
    })

    it('changes nothing else about the row it rewrites', () => {
      const row = generated({ tasks: ['Akku laden'] })
      const [result] = applyReviewOverrides([row], { [reviewKeyOf(row)]: 0 })

      expect(result).toEqual({ ...generated(), quantity: 0 })
    })

    it('leaves the rows it was given untouched', () => {
      // The generation is a computed the screen re-reads; rewriting it in
      // place would make the review's own preview follow the draft.
      const items = [generated({ quantity: 1 })]

      applyReviewOverrides(items, { [reviewKeyOf(items[0]!)]: 0 })

      expect(items[0]!.quantity).toBe(1)
    })
  })
})
