/**
 * FR-27.16: which trip names the inventory has moved on from, and what taking
 * them over writes.
 */
import { describe, expect, it } from 'vitest'

import { inventoryRenames, planNameAdoption, planNameRestore } from '../inventoryNames'
import type { GeneratedPosition, TripItem } from '@/types/domain'

const TRIP_ID = 'trip-1'
const NO_PROPOSAL: ReadonlySet<string> = new Set()

function row(id: string, name: string, extra: Partial<TripItem> = {}): TripItem {
  return {
    id,
    trip_id: TRIP_ID,
    source_item_id: null,
    source_template_id: null,
    name,
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
    bought_from: null,
    bought_at: null,
    bought_by_user_id: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '1',
    ...extra,
  }
}

function entry(tripItemId: string, name: string, extra: Partial<GeneratedPosition> = {}) {
  return {
    id: `gen-${tripItemId}`,
    trip_id: TRIP_ID,
    trip_item_id: tripItemId,
    source_template_id: 'grp-1',
    source_item_id: 'item-kamera',
    traveler_id: '',
    name,
    quantity: 1,
    mode: 'pack',
    late_packer: false,
    weight_grams: null,
    value_cents: null,
    category_name: null,
    tasks: [],
    ...extra,
  } satisfies GeneratedPosition
}

const KAMERA = { id: 'item-kamera', name: 'Kamera (Vollformat)' }
const LADER = { id: 'item-lader', name: 'USB-C-Ladegerät 65 W' }

describe('inventoryRenames (FR-27.16)', () => {
  it('offers a row whose inventory item is now called something else', () => {
    const renames = inventoryRenames({
      items: [row('r1', 'Kamera', { source_item_id: KAMERA.id })],
      masterItems: [KAMERA],
      ledger: [],
      proposedRowIds: NO_PROPOSAL,
    })
    expect(renames).toEqual([
      expect.objectContaining({ from: 'Kamera', to: 'Kamera (Vollformat)', deliberate: false }),
    ])
  })

  it('offers a packed, a skipped and an archived-trip row alike — a name counts nothing', () => {
    const renames = inventoryRenames({
      items: [
        row('packed', 'Kamera', { source_item_id: KAMERA.id, packed_count: 1, state: 'packed' }),
        row('skipped', 'Ladegerät', { source_item_id: LADER.id, quantity: 0, state: 'skipped' }),
      ],
      masterItems: [KAMERA, LADER],
      ledger: [],
      proposedRowIds: NO_PROPOSAL,
    })
    expect(renames.map((r) => r.rows[0]!.id)).toEqual(['packed', 'skipped'])
  })

  it('leaves out a row that already carries the name, and one without an inventory item', () => {
    const renames = inventoryRenames({
      items: [
        row('same', 'Kamera (Vollformat)', { source_item_id: KAMERA.id }),
        row('free', 'Kamera'),
        row('unsynced', 'Kamera', { source_item_id: 'item-not-here' }),
      ],
      masterItems: [KAMERA],
      ledger: [],
      proposedRowIds: NO_PROPOSAL,
    })
    expect(renames).toEqual([])
  })

  it('leaves a rename FR-27.4 is already asking about to that card', () => {
    const renames = inventoryRenames({
      items: [row('r1', 'Kamera', { source_item_id: KAMERA.id })],
      masterItems: [KAMERA],
      ledger: [],
      proposedRowIds: new Set(['r1']),
    })
    expect(renames).toEqual([])
  })

  it('makes one choice of the per-person rows of one item (FR-25.21)', () => {
    const renames = inventoryRenames({
      items: [
        row('andy', 'Kamera', { source_item_id: KAMERA.id, assigned_traveler_id: 't-andy' }),
        row('mia', 'Kamera', { source_item_id: KAMERA.id, assigned_traveler_id: 't-mia' }),
      ],
      masterItems: [KAMERA],
      ledger: [],
      proposedRowIds: NO_PROPOSAL,
    })
    expect(renames).toHaveLength(1)
    expect(renames[0]!.rows.map((r) => r.id)).toEqual(['andy', 'mia'])
  })

  it('marks a generated row whose name differs from what generation produced as deliberate', () => {
    const renames = inventoryRenames({
      items: [
        row('renamed', 'Kamera von Opa', { source_item_id: KAMERA.id }),
        row('plain', 'Ladegerät', { source_item_id: LADER.id }),
      ],
      masterItems: [KAMERA, LADER],
      ledger: [
        entry('renamed', 'Kamera'),
        entry('plain', 'Ladegerät', { source_item_id: LADER.id }),
      ],
      proposedRowIds: NO_PROPOSAL,
    })
    expect(renames.map((r) => [r.from, r.deliberate])).toEqual([
      ['Kamera von Opa', true],
      ['Ladegerät', false],
    ])
  })

  it('orders by the new name, so two devices list the same choices alike', () => {
    const renames = inventoryRenames({
      items: [
        row('r2', 'Ladegerät', { source_item_id: LADER.id }),
        row('r1', 'Kamera', { source_item_id: KAMERA.id }),
      ],
      masterItems: [LADER, KAMERA],
      ledger: [],
      proposedRowIds: NO_PROPOSAL,
    })
    expect(renames.map((r) => r.to)).toEqual(['Kamera (Vollformat)', 'USB-C-Ladegerät 65 W'])
  })
})

describe('planNameAdoption (FR-27.16)', () => {
  it('renames every row of the choice and moves the ledger with it', () => {
    const items = [row('r1', 'Kamera', { source_item_id: KAMERA.id })]
    const ledger = [entry('r1', 'Kamera')]
    const renames = inventoryRenames({
      items,
      masterItems: [KAMERA],
      ledger,
      proposedRowIds: NO_PROPOSAL,
    })

    const adoption = planNameAdoption(renames, ledger)

    expect(adoption.rows.map((r) => [r.item.id, r.name])).toEqual([['r1', 'Kamera (Vollformat)']])
    // Without the ledger half, FR-27.4 would read the new name as a hand edit.
    expect(adoption.ledger).toEqual([{ ...ledger[0], name: 'Kamera (Vollformat)' }])
  })

  it('leaves a ledger entry alone that already holds the new name (a refused group rename)', () => {
    const items = [row('r1', 'Kamera', { source_item_id: KAMERA.id })]
    const ledger = [entry('r1', 'Kamera (Vollformat)')]
    const renames = inventoryRenames({
      items,
      masterItems: [KAMERA],
      ledger,
      proposedRowIds: NO_PROPOSAL,
    })

    const adoption = planNameAdoption(renames, ledger)

    expect(adoption.rows).toHaveLength(1)
    expect(adoption.ledger).toEqual([])
  })

  it('writes no ledger entry for a row added straight from the inventory', () => {
    const items = [row('r1', 'Ladegerät', { source_item_id: LADER.id })]
    const renames = inventoryRenames({
      items,
      masterItems: [LADER],
      ledger: [],
      proposedRowIds: NO_PROPOSAL,
    })
    expect(planNameAdoption(renames, []).ledger).toEqual([])
  })
})

describe('planNameRestore (FR-27.16 undo)', () => {
  it('puts back the old names and the ledger as it was', () => {
    const items = [
      row('r1', 'Kamera von Opa', { source_item_id: KAMERA.id }),
      row('r2', 'Ladegerät', { source_item_id: LADER.id }),
    ]
    const ledger = [entry('r1', 'Kamera')]
    const renames = inventoryRenames({
      items,
      masterItems: [KAMERA, LADER],
      ledger,
      proposedRowIds: NO_PROPOSAL,
    })
    const adoption = planNameAdoption(renames, ledger)

    const restore = planNameRestore(adoption, ledger)

    expect(restore.rows.map((r) => [r.item.id, r.name])).toEqual([
      ['r1', 'Kamera von Opa'],
      ['r2', 'Ladegerät'],
    ])
    expect(restore.ledger).toEqual(ledger)
  })
})
