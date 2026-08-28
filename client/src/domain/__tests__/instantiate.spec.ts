/**
 * Template instantiation (FR-2.2/FR-2.3a/FR-1.4/FR-15.2): aggregate
 * selected templates into trip items with evaluated quantities,
 * conditional inclusion, per-person expansion, and deduplication.
 */
import { describe, expect, it } from 'vitest'

import { durationDays, generateTripItems, type GenerationInput } from '../instantiate'
import type {
  MasterItem,
  Template,
  TemplateInclude,
  TemplateItem,
  TemplateItemTask,
} from '@/types/domain'

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

function masterItem(id: string, name: string, extra: Partial<MasterItem> = {}): MasterItem {
  return {
    id,
    name,
    weight_grams: 100,
    value_cents: null,
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
