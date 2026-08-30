/**
 * M6 shopping view model (FR-25.6).
 *
 * The rule this file pins is the one the screen did not have for three
 * weeks: buying is a *single act*, so a per-person item is one buy row —
 * the summed quantity and the recipients' names — and not one row per
 * traveler. The instances travel *with* the row, because the check-off has
 * to settle every one of them (FR-3.3) and a row that names three people
 * while settling one is worse than three honest rows.
 */
import { describe, it, expect } from 'vitest'

import { buildShoppingList, type ShoppingGroup, type ShoppingRow } from '../shoppingView'
import type { TripItem, Traveler } from '@/types/domain'

let seq = 0

function item(over: Partial<TripItem> = {}): TripItem {
  seq += 1
  return {
    id: `i${seq}`,
    trip_id: 't1',
    source_item_id: null,
    source_template_id: null,
    name: `Item ${seq}`,
    weight_grams: null,
    value_cents: null,
    category_name: 'Kleidung',
    quantity: 1,
    packed_count: 0,
    state: 'open',
    mode: 'buy_before',
    late_packer: false,
    assigned_traveler_id: null,
    packer_user_id: null,
    packed_by_user_id: null,
    packed_at: null,
    container_id: null,
    packing_now_by: null,
    packing_now_at: null,
    bought_from: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '1',
    ...over,
  }
}

const andy: Traveler = { id: 'tr1', trip_id: 't1', name: 'Andy', linked_user_id: null }
const leonardo: Traveler = { id: 'tr2', trip_id: 't1', name: 'Leonardo', linked_user_id: null }
const mia: Traveler = { id: 'tr3', trip_id: 't1', name: 'Mia', linked_user_id: null }
const roster = [andy, leonardo, mia]

/** The rows of one group, so the assertions read as rows rather than as indexing. */
function rowsOf(groups: ShoppingGroup[], index = 0): ShoppingRow[] {
  return groups[index]?.rows ?? []
}

describe('buildShoppingList', () => {
  it('groups by category, keeping the order the rows arrive in (FR-3.2)', () => {
    const groups = buildShoppingList(
      [
        item({ name: 'Sonnencreme', category_name: 'Pflege' }),
        item({ name: 'Kurze Hosen', category_name: 'Kleidung' }),
        item({ name: 'Duschgel', category_name: 'Pflege' }),
      ],
      roster,
    )
    expect(groups.map((g) => g.name)).toEqual(['Pflege', 'Kleidung'])
    expect((groups[0]?.rows ?? []).map((r) => r.name)).toEqual(['Sonnencreme', 'Duschgel'])
  })

  it('leaves the uncategorised bucket unnamed for the caller to word', () => {
    const groups = buildShoppingList([item({ category_name: null })], roster)
    expect(groups[0]?.name).toBeNull()
  })

  it('a shared row is one row with no recipients and its own quantity', () => {
    const shared = item({ name: 'Zelt', quantity: 2 })
    const rows = rowsOf(buildShoppingList([shared], roster))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.recipients).toEqual([])
    expect(rows[0]?.quantity).toBe(2)
    expect(rows[0]?.instances).toEqual([shared])
  })

  it('aggregates a per-person item into one row summing the amounts (FR-25.6)', () => {
    const instances = [
      item({
        name: 'Kurze Hosen',
        source_item_id: 'm1',
        assigned_traveler_id: andy.id,
        quantity: 2,
      }),
      item({
        name: 'Kurze Hosen',
        source_item_id: 'm1',
        assigned_traveler_id: leonardo.id,
        quantity: 3,
      }),
      item({
        name: 'Kurze Hosen',
        source_item_id: 'm1',
        assigned_traveler_id: mia.id,
        quantity: 1,
      }),
    ]
    const rows = rowsOf(buildShoppingList(instances, roster))
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row?.name).toBe('Kurze Hosen')
    expect(row?.quantity).toBe(6)
    expect(row?.recipients.map((t) => t.name)).toEqual(['Andy', 'Leonardo', 'Mia'])
    expect(row?.instances).toHaveLength(3)
  })

  it('names the recipients in roster order, whatever order the rows arrive in', () => {
    const instances = [
      item({ name: 'Hut', source_item_id: 'm2', assigned_traveler_id: mia.id }),
      item({ name: 'Hut', source_item_id: 'm2', assigned_traveler_id: andy.id }),
    ]
    const rows = rowsOf(buildShoppingList(instances, roster))
    expect(rows[0]?.recipients.map((t) => t.name)).toEqual(['Andy', 'Mia'])
    expect(rows[0]?.instances.map((i) => i.assigned_traveler_id)).toEqual([andy.id, mia.id])
  })

  it('aggregates an ad-hoc per-person item by its folded name (FR-5.6)', () => {
    const instances = [
      item({ name: 'Sonnenhut', assigned_traveler_id: andy.id }),
      item({ name: 'sonnenhut', assigned_traveler_id: leonardo.id }),
    ]
    const rows = rowsOf(buildShoppingList(instances, roster))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.recipients.map((t) => t.name)).toEqual(['Andy', 'Leonardo'])
  })

  it('keeps two different items apart even when both are per-person', () => {
    const instances = [
      item({ name: 'Hut', source_item_id: 'm2', assigned_traveler_id: andy.id }),
      item({ name: 'Schal', source_item_id: 'm3', assigned_traveler_id: andy.id }),
    ]
    const rows = rowsOf(buildShoppingList(instances, roster))
    expect(rows.map((r) => r.name)).toEqual(['Hut', 'Schal'])
  })

  it('does not aggregate a per-person item across categories', () => {
    const instances = [
      item({ name: 'Hut', source_item_id: 'm2', assigned_traveler_id: andy.id }),
      item({
        name: 'Hut',
        source_item_id: 'm2',
        assigned_traveler_id: leonardo.id,
        category_name: 'Pflege',
      }),
    ]
    const groups = buildShoppingList(instances, roster)
    expect(groups.map((g) => g.rows.length)).toEqual([1, 1])
  })

  it('a single recipient still names them, because the row is that person’s', () => {
    const rows = rowsOf(
      buildShoppingList(
        [item({ name: 'Hut', source_item_id: 'm2', assigned_traveler_id: mia.id, quantity: 2 })],
        roster,
      ),
    )
    expect(rows[0]?.recipients.map((t) => t.name)).toEqual(['Mia'])
    expect(rows[0]?.quantity).toBe(2)
  })

  it('an instance whose traveler left the roster still counts, unnamed', () => {
    const instances = [
      item({ name: 'Hut', source_item_id: 'm2', assigned_traveler_id: andy.id, quantity: 2 }),
      item({ name: 'Hut', source_item_id: 'm2', assigned_traveler_id: 'gone', quantity: 3 }),
    ]
    const rows = rowsOf(buildShoppingList(instances, roster))
    expect(rows[0]?.quantity).toBe(5)
    expect(rows[0]?.recipients.map((t) => t.name)).toEqual(['Andy'])
    expect(rows[0]?.instances).toHaveLength(2)
  })

  it('gives every row a key that is stable and unique within its group', () => {
    const groups = buildShoppingList(
      [
        item({ name: 'Zelt' }),
        item({ name: 'Zelt' }),
        item({ name: 'Hut', source_item_id: 'm2', assigned_traveler_id: andy.id }),
      ],
      roster,
    )
    const keys = (groups[0]?.rows ?? []).map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
