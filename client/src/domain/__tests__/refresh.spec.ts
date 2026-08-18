/**
 * The planning-trip refresh (FR-27.4): a *planning* trip follows the
 * templates it was generated from — added positions appear, removed ones
 * disappear, quantity and attribute changes land — while manual edits on the
 * trip always win, and active/archived trips never move at all.
 */
import { describe, expect, it } from 'vitest'

import {
  isEmptyPlan,
  ledgerId,
  planRefresh,
  propagatedItemId,
  type RefreshInput,
} from '../refresh'
import type {
  GeneratedPosition,
  ItemTodo,
  MasterItem,
  Template,
  TemplateInclude,
  TemplateItem,
  TemplateItemTask,
  Traveler,
  Trip,
  TripItem,
  TripTemplateSource,
} from '@/types/domain'

const TRIP_ID = 'trip-1'
const GROUP_ID = 'grp-makro'

function trip(extra: Partial<Trip> = {}): Trip {
  return {
    id: TRIP_ID,
    name: 'Samedan 2026',
    status: 'planning',
    year: 2026,
    start_date: '2026-02-01',
    end_date: '2026-02-08',
    duration_days: 8,
    series_id: null,
    series_name: null,
    attributes: null,
    imported: false,
    ...extra,
  }
}

function template(id: string, name: string, kind: Template['kind'] = 'group'): Template {
  return { id, owner_id: 'user-a', name, kind }
}

function masterItem(id: string, name: string, extra: Partial<MasterItem> = {}): MasterItem {
  return { id, name, weight_grams: null, value_cents: null, ...extra }
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

function tripItem(id: string, extra: Partial<TripItem> = {}): TripItem {
  return {
    id,
    trip_id: TRIP_ID,
    source_item_id: null,
    source_template_id: null,
    name: 'Etwas',
    weight_grams: null,
    value_cents: null,
    category_name: null,
    quantity: 1,
    packed_count: 0,
    state: 'open',
    mode: 'pack',
    late_packer: false,
    assigned_traveler_id: null,
    packer_user_id: null,
    packed_by_user_id: null,
    packed_at: null,
    container_id: null,
    packing_now_by: null,
    packing_now_at: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '1',
    ...extra,
  }
}

function traveler(id: string, name: string): Traveler {
  return { id, trip_id: TRIP_ID, name, linked_user_id: null }
}

function todo(id: string, tripItemId: string, body: string, extra: Partial<ItemTodo> = {}): ItemTodo {
  return {
    id,
    trip_id: TRIP_ID,
    trip_item_id: tripItemId,
    author_id: 'user-a',
    body,
    task_state: 'open',
    ...extra,
  }
}

function source(templateId: string): TripTemplateSource {
  return { id: `src-${templateId}`, trip_id: TRIP_ID, template_id: templateId }
}

/** A ledger entry that matches what generation would produce for `itemId`. */
function ledgerEntry(
  itemId: string,
  extra: Partial<GeneratedPosition> = {},
): GeneratedPosition {
  const travelerId = extra.traveler_id ?? ''
  return {
    id: ledgerId(TRIP_ID, itemId, travelerId),
    trip_id: TRIP_ID,
    trip_item_id: propagatedItemId(TRIP_ID, itemId, travelerId),
    source_template_id: GROUP_ID,
    source_item_id: itemId,
    traveler_id: travelerId,
    name: 'Kamera',
    quantity: 1,
    mode: 'pack',
    late_packer: false,
    weight_grams: null,
    value_cents: null,
    category_name: null,
    tasks: [],
    ...extra,
  }
}

/**
 * The baseline world: one group with one position ("Kamera"), registered as
 * the trip's source. Each test bends exactly one thing away from it.
 */
function input(extra: Partial<RefreshInput> = {}): RefreshInput {
  return {
    trip: trip(),
    sources: [source(GROUP_ID)],
    templates: [template(GROUP_ID, 'Makro Fotografie')],
    includes: [],
    templateItems: [position('pos-1', GROUP_ID, 'item-kamera')],
    templateItemTasks: [],
    masterItems: [masterItem('item-kamera', 'Kamera')],
    travelers: [],
    items: [],
    todos: [],
    ledger: [],
    ...extra,
  }
}

describe('planRefresh — the freeze (FR-27.4)', () => {
  it('moves nothing on an active trip, however far the group has drifted', () => {
    const plan = planRefresh(input({ trip: trip({ status: 'active' }) }))
    expect(isEmptyPlan(plan)).toBe(true)
    expect(plan.log).toEqual([])
  })

  it('moves nothing on an archived trip', () => {
    const plan = planRefresh(input({ trip: trip({ status: 'archived' }) }))
    expect(isEmptyPlan(plan)).toBe(true)
  })

  it('moves nothing on a trip with no registered sources — never guesses at provenance', () => {
    // A trip created before the FR-27.4 registry existed. Its rows carry
    // `source_template_id`, which would be tempting to derive from, and the
    // derivation would re-add whatever the user deleted.
    const plan = planRefresh(
      input({
        sources: [],
        items: [tripItem('row-1', { source_item_id: 'item-kamera', source_template_id: GROUP_ID })],
      }),
    )
    expect(isEmptyPlan(plan)).toBe(true)
  })
})

describe('planRefresh — positions the group gained (FR-27.4)', () => {
  it('adds a position the group gained, and logs it with the group name', () => {
    const plan = planRefresh(input())

    expect(plan.add).toHaveLength(1)
    expect(plan.add[0]?.generated.name).toBe('Kamera')
    expect(plan.add[0]?.traveler_id).toBeNull()
    expect(plan.log).toEqual([
      {
        trip_id: TRIP_ID,
        source_template_id: GROUP_ID,
        source_template_name: 'Makro Fotografie',
        kind: 'added',
        item_name: 'Kamera',
        detail: null,
      },
    ])
  })

  it('writes a ledger entry for every added row, so the next refresh knows it produced it', () => {
    const plan = planRefresh(input())
    expect(plan.ledgerUpsert).toHaveLength(1)
    expect(plan.ledgerUpsert[0]?.trip_item_id).toBe(plan.add[0]?.trip_item_id)
    expect(plan.ledgerUpsert[0]?.quantity).toBe(1)
  })

  it('is idempotent: the same world twice adds nothing the second time', () => {
    const first = planRefresh(input())
    const added = first.add[0]!
    const settled = planRefresh(
      input({
        items: [
          tripItem(added.trip_item_id, {
            source_item_id: 'item-kamera',
            source_template_id: GROUP_ID,
            name: 'Kamera',
          }),
        ],
        ledger: [added.ledger],
      }),
    )
    expect(isEmptyPlan(settled)).toBe(true)
    expect(settled.log).toEqual([])
  })

  it('adopts a row the user already added by hand instead of adding a second one', () => {
    const plan = planRefresh(
      input({
        items: [
          tripItem('hand-1', {
            source_item_id: 'item-kamera',
            name: 'Kamera',
            quantity: 2,
          }),
        ],
      }),
    )
    expect(plan.add).toEqual([])
    expect(plan.log).toEqual([])
    // Adopted, not overwritten: the ledger now points at the user's row, and
    // its snapshot (quantity 1) deviates from the row (quantity 2), which is
    // exactly what marks the row as theirs from here on.
    expect(plan.ledgerUpsert[0]?.trip_item_id).toBe('hand-1')
    expect(plan.update).toEqual([])
  })

  it('fans a per-person position out over the trip travelers (FR-25.8)', () => {
    const plan = planRefresh(
      input({
        templateItems: [position('pos-1', GROUP_ID, 'item-kamera', { assignment: 'per_person' })],
        travelers: [traveler('trv-a', 'Andy'), traveler('trv-b', 'Sia')],
      }),
    )
    expect(plan.add.map((a) => a.traveler_id)).toEqual(['trv-a', 'trv-b'])
    // Two rows, two ledger entries, two distinct ids.
    expect(new Set(plan.add.map((a) => a.trip_item_id)).size).toBe(2)
  })
})

describe('planRefresh — positions the group lost (FR-27.4)', () => {
  it('removes an untouched row whose position the group dropped, and logs it', () => {
    const entry = ledgerEntry('item-kamera')
    const plan = planRefresh(
      input({
        templateItems: [],
        items: [tripItem(entry.trip_item_id, { source_item_id: 'item-kamera', name: 'Kamera' })],
        ledger: [entry],
      }),
    )
    expect(plan.remove.map((r) => r.item.id)).toEqual([entry.trip_item_id])
    expect(plan.ledgerDelete).toEqual([entry.id])
    expect(plan.log[0]).toMatchObject({ kind: 'removed', item_name: 'Kamera' })
  })

  it('drops the ledger entry silently when the row is already gone', () => {
    const entry = ledgerEntry('item-kamera')
    const plan = planRefresh(input({ templateItems: [], items: [], ledger: [entry] }))
    expect(plan.remove).toEqual([])
    expect(plan.ledgerDelete).toEqual([entry.id])
    expect(plan.log).toEqual([])
  })

  it('removes the rows of a traveler who left the trip, but not the others', () => {
    const forA = ledgerEntry('item-kamera', { traveler_id: 'trv-a' })
    const forB = ledgerEntry('item-kamera', { traveler_id: 'trv-b' })
    const plan = planRefresh(
      input({
        templateItems: [position('pos-1', GROUP_ID, 'item-kamera', { assignment: 'per_person' })],
        travelers: [traveler('trv-a', 'Andy')],
        items: [
          tripItem(forA.trip_item_id, {
            source_item_id: 'item-kamera',
            name: 'Kamera',
            assigned_traveler_id: 'trv-a',
          }),
          tripItem(forB.trip_item_id, {
            source_item_id: 'item-kamera',
            name: 'Kamera',
            assigned_traveler_id: 'trv-b',
          }),
        ],
        ledger: [forA, forB],
      }),
    )
    expect(plan.remove.map((r) => r.item.id)).toEqual([forB.trip_item_id])
  })
})

describe('planRefresh — changes that land (FR-27.4)', () => {
  it('applies a quantity change to an untouched row and logs from → to', () => {
    const entry = ledgerEntry('item-kamera', { quantity: 1 })
    const plan = planRefresh(
      input({
        templateItems: [position('pos-1', GROUP_ID, 'item-kamera', { quantity: 3 })],
        items: [tripItem(entry.trip_item_id, { source_item_id: 'item-kamera', name: 'Kamera' })],
        ledger: [entry],
      }),
    )
    expect(plan.update).toHaveLength(1)
    expect(plan.update[0]?.fields).toEqual({ quantity: 3 })
    expect(plan.log[0]).toMatchObject({
      kind: 'changed',
      item_name: 'Kamera',
      detail: { field: 'quantity', from: 1, to: 3 },
    })
  })

  it('applies a master-item rename and its weight, not only the amount', () => {
    const entry = ledgerEntry('item-kamera', { name: 'Kamera', weight_grams: null })
    const plan = planRefresh(
      input({
        masterItems: [masterItem('item-kamera', 'Kamera (Vollformat)', { weight_grams: 780 })],
        items: [tripItem(entry.trip_item_id, { source_item_id: 'item-kamera', name: 'Kamera' })],
        ledger: [entry],
      }),
    )
    expect(plan.update[0]?.fields).toEqual({ name: 'Kamera (Vollformat)', weight_grams: 780 })
    expect(plan.log.map((l) => l.detail?.field)).toEqual(['name', 'weight_grams'])
  })

  it('writes nothing when the group did not change — an open trip must not write on every render', () => {
    const entry = ledgerEntry('item-kamera')
    const plan = planRefresh(
      input({
        items: [tripItem(entry.trip_item_id, { source_item_id: 'item-kamera', name: 'Kamera' })],
        ledger: [entry],
      }),
    )
    expect(isEmptyPlan(plan)).toBe(true)
  })
})

describe('planRefresh — manual edits always win (FR-27.4)', () => {
  it('leaves a row the user changed by hand, and does not log a change either', () => {
    const entry = ledgerEntry('item-kamera', { quantity: 1 })
    const plan = planRefresh(
      input({
        templateItems: [position('pos-1', GROUP_ID, 'item-kamera', { quantity: 3 })],
        items: [
          tripItem(entry.trip_item_id, {
            source_item_id: 'item-kamera',
            name: 'Kamera',
            quantity: 5, // the user set this
          }),
        ],
        ledger: [entry],
      }),
    )
    expect(plan.update).toEqual([])
    expect(plan.log).toEqual([])
    // And the ledger keeps the old snapshot: refreshing it would hand the row
    // back to the template the moment the user reverted their own edit.
    expect(plan.ledgerUpsert).toEqual([])
  })

  it('never re-adds a row the user deleted, however often the trip is opened', () => {
    const entry = ledgerEntry('item-kamera')
    const world = input({ items: [], ledger: [entry] })
    expect(planRefresh(world).add).toEqual([])
    expect(planRefresh(world).add).toEqual([])
    // The entry stays: it is the only record that the row ever existed.
    expect(planRefresh(world).ledgerDelete).toEqual([])
  })

  it('leaves a row that was skipped (FR-5.5) — "deliberately not coming" is a decision', () => {
    const entry = ledgerEntry('item-kamera', { quantity: 1 })
    const plan = planRefresh(
      input({
        templateItems: [],
        items: [
          tripItem(entry.trip_item_id, {
            source_item_id: 'item-kamera',
            name: 'Kamera',
            state: 'skipped',
          }),
        ],
        ledger: [entry],
      }),
    )
    expect(plan.remove).toEqual([])
    expect(plan.ledgerDelete).toEqual([])
  })

  it('leaves a row packing has begun on — a count someone verified is not the template’s to rewrite', () => {
    const entry = ledgerEntry('item-kamera', { quantity: 2 })
    const plan = planRefresh(
      input({
        templateItems: [position('pos-1', GROUP_ID, 'item-kamera', { quantity: 4 })],
        items: [
          tripItem(entry.trip_item_id, {
            source_item_id: 'item-kamera',
            name: 'Kamera',
            quantity: 2,
            packed_count: 1,
            state: 'partial',
          }),
        ],
        ledger: [entry],
      }),
    )
    expect(plan.update).toEqual([])
    expect(plan.log).toEqual([])
  })
})

describe('planRefresh — preparation tasks (FR-27.7 through FR-27.4)', () => {
  function withTask(tasks: TemplateItemTask[], ledger: GeneratedPosition[], todos: ItemTodo[] = []) {
    const entry = ledger[0]!
    return input({
      templateItemTasks: tasks,
      items: [tripItem(entry.trip_item_id, { source_item_id: 'item-kamera', name: 'Kamera' })],
      ledger,
      todos,
    })
  }

  it('materialises a task the group gained as an FR-7.3 todo on the row', () => {
    const plan = planRefresh(
      withTask(
        [{ id: 'task-1', template_item_id: 'pos-1', task: 'Akkus laden' }],
        [ledgerEntry('item-kamera', { tasks: [] })],
      ),
    )
    expect(plan.update[0]?.addTasks).toEqual(['Akkus laden'])
    expect(plan.log[0]).toMatchObject({ kind: 'changed', detail: { field: 'tasks' } })
  })

  it('removes the open todo of a task the group dropped', () => {
    const entry = ledgerEntry('item-kamera', { tasks: ['Akkus laden'] })
    const plan = planRefresh(
      withTask([], [entry], [todo('todo-1', entry.trip_item_id, 'Akkus laden')]),
    )
    expect(plan.update[0]?.removeTodos.map((t) => t.id)).toEqual(['todo-1'])
  })

  it('keeps a resolved todo when the group drops its task — a done thing is a record', () => {
    const entry = ledgerEntry('item-kamera', { tasks: ['Akkus laden'] })
    const plan = planRefresh(
      withTask(
        [],
        [entry],
        [todo('todo-1', entry.trip_item_id, 'Akkus laden', { task_state: 'resolved' })],
      ),
    )
    expect(plan.update[0]?.removeTodos ?? []).toEqual([])
  })
})

describe('planRefresh — composition (FR-27.2)', () => {
  it('follows a group reached through the Vorlage the trip was generated from', () => {
    const vorlage = template('tpl-ferien', 'Ferien', 'template')
    const plan = planRefresh(
      input({
        sources: [source('tpl-ferien')],
        templates: [vorlage, template(GROUP_ID, 'Makro Fotografie')],
        includes: [
          { id: 'inc-1', template_id: 'tpl-ferien', included_template_id: GROUP_ID } as
            TemplateInclude,
        ],
      }),
    )
    expect(plan.add).toHaveLength(1)
    expect(plan.log[0]?.source_template_name).toBe('Makro Fotografie')
  })

  it('makes one row of an item two groups both carry, not two competing ones', () => {
    const second = template('grp-wildlife', 'Wildlife')
    const plan = planRefresh(
      input({
        sources: [source(GROUP_ID), source('grp-wildlife')],
        templates: [template(GROUP_ID, 'Makro Fotografie'), second],
        templateItems: [
          position('pos-1', GROUP_ID, 'item-kamera'),
          position('pos-2', 'grp-wildlife', 'item-kamera'),
        ],
      }),
    )
    expect(plan.add).toHaveLength(1)
    expect(plan.ledgerUpsert).toHaveLength(1)
  })
})

describe('derived ids (ADR-016)', () => {
  it('gives two devices the same row id for the same position, so the merge yields one row', () => {
    expect(propagatedItemId('trip-1', 'item-a', '')).toBe(propagatedItemId('trip-1', 'item-a', ''))
  })

  it('separates trips, items and travelers', () => {
    const ids = new Set([
      propagatedItemId('trip-1', 'item-a', ''),
      propagatedItemId('trip-2', 'item-a', ''),
      propagatedItemId('trip-1', 'item-b', ''),
      propagatedItemId('trip-1', 'item-a', 'trv-1'),
      ledgerId('trip-1', 'item-a', ''),
    ])
    expect(ids.size).toBe(5)
  })

  it('has the shape of the ids the schema generates — 32 lowercase hex characters', () => {
    expect(propagatedItemId('trip-1', 'item-a', '')).toMatch(/^[0-9a-f]{32}$/)
  })
})
