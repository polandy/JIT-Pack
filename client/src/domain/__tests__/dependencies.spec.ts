import { describe, it, expect } from 'vitest'
import {
  resolveDependencies,
  dependentsOf,
  coSkipTargets,
  skippedVia,
  dependencyCycleError,
  type DependencyResolutionInput,
} from '../dependencies'
import type { ItemDependency, MasterItem } from '@/types/domain'

function master(id: string, name: string, extra: Partial<MasterItem> = {}): MasterItem {
  return {
    id,
    name,
    weight_grams: null,
    value_cents: null,
    ...extra,
  }
}

function dep(
  id: string,
  itemId: string,
  dependsOn: string,
  mode: ItemDependency['mode'] = 'required',
  quantity: number | null = null,
): ItemDependency {
  return { id, item_id: itemId, depends_on_item_id: dependsOn, mode, quantity }
}

const camera = master('camera', 'Kamera')
const battery = master('battery', 'Ersatzakku')
const charger = master('charger', 'Ladegerät')
const plate = master('plate', 'Arca-Swiss-Platte')

function input(partial: Partial<DependencyResolutionInput>): DependencyResolutionInput {
  return {
    onList: [{ source_item_id: 'camera', quantity: 1 }],
    dependencies: [],
    masterItems: [camera, battery, charger, plate],
    ...partial,
  }
}

describe('resolveDependencies', () => {
  it('pulls in a required companion with its own quantity', () => {
    const res = resolveDependencies(
      input({ dependencies: [dep('d1', 'battery', 'camera', 'required', 2)] }),
    )
    expect(res.required).toEqual([
      {
        item_id: 'battery',
        name: 'Ersatzakku',
        category_name: null,
        weight_grams: null,
        value_cents: null,
        quantity: 2,
        via_item_name: 'Kamera',
      },
    ])
    expect(res.suggested).toEqual([])
    expect(res.deduped).toEqual([])
  })

  it('defaults the quantity to 1 without a formula', () => {
    const res = resolveDependencies(input({ dependencies: [dep('d1', 'battery', 'camera')] }))
    expect(res.required[0]!.quantity).toBe(1)
  })

  it('resolves transitively: a companion of a companion joins too', () => {
    const res = resolveDependencies(
      input({
        dependencies: [dep('d1', 'battery', 'camera'), dep('d2', 'charger', 'battery')],
      }),
    )
    expect(res.required.map((c) => c.item_id).sort()).toEqual(['battery', 'charger'])
    expect(res.required.find((c) => c.item_id === 'charger')!.via_item_name).toBe('Ersatzakku')
  })

  it('surfaces suggested companions without adding them (FR-20.4)', () => {
    const res = resolveDependencies(
      input({ dependencies: [dep('d1', 'plate', 'camera', 'suggested')] }),
    )
    expect(res.required).toEqual([])
    expect(res.suggested).toEqual([
      {
        dependency_id: 'd1',
        item_id: 'plate',
        name: 'Arca-Swiss-Platte',
        quantity: 1,
        via_item_name: 'Kamera',
      },
    ])
  })

  it('dedups against items already explicit on the list (FR-20.3)', () => {
    const res = resolveDependencies(
      input({
        onList: [
          { source_item_id: 'camera', quantity: 1 },
          { source_item_id: 'battery', quantity: 3 },
        ],
        dependencies: [dep('d1', 'battery', 'camera', 'required', 2)],
      }),
    )
    expect(res.required).toEqual([])
    expect(res.deduped).toEqual([
      { item_id: 'battery', name: 'Ersatzakku', via_item_name: 'Kamera' },
    ])
  })

  it('does not suggest what is already on the list', () => {
    const res = resolveDependencies(
      input({
        onList: [
          { source_item_id: 'camera', quantity: 1 },
          { source_item_id: 'plate', quantity: 1 },
        ],
        dependencies: [dep('d1', 'plate', 'camera', 'suggested')],
      }),
    )
    expect(res.suggested).toEqual([])
  })

  it('merges two mains requiring the same companion into one row at max quantity (FR-2.3a)', () => {
    const drone = master('drone', 'Drohne')
    const res = resolveDependencies(
      input({
        onList: [
          { source_item_id: 'camera', quantity: 1 },
          { source_item_id: 'drone', quantity: 1 },
        ],
        masterItems: [camera, battery, drone],
        dependencies: [
          dep('d1', 'battery', 'camera', 'required', 2),
          dep('d2', 'battery', 'drone', 'required', 4),
        ],
      }),
    )
    expect(res.required).toHaveLength(1)
    expect(res.required[0]!.quantity).toBe(4)
  })

  it('survives a dependency cycle in synced data without looping', () => {
    const res = resolveDependencies(
      input({
        dependencies: [dep('d1', 'battery', 'camera'), dep('d2', 'camera', 'battery')],
      }),
    )
    expect(res.required.map((c) => c.item_id)).toEqual(['battery'])
  })

  it('ignores dependencies whose companion item is unknown', () => {
    const res = resolveDependencies(input({ dependencies: [dep('d1', 'ghost', 'camera')] }))
    expect(res.required).toEqual([])
  })
})

describe('dependentsOf', () => {
  it('collects transitive dependents for the co-skip cascade (FR-20.2)', () => {
    const deps = [
      dep('d1', 'battery', 'camera'),
      dep('d2', 'charger', 'battery'),
      dep('d3', 'plate', 'camera', 'suggested'),
    ]
    expect(dependentsOf('camera', deps)).toEqual(new Set(['battery', 'charger', 'plate']))
    expect(dependentsOf('battery', deps)).toEqual(new Set(['charger']))
    expect(dependentsOf('plate', deps)).toEqual(new Set())
  })

  it('terminates on cyclic data', () => {
    const deps = [dep('d1', 'battery', 'camera'), dep('d2', 'camera', 'battery')]
    expect(dependentsOf('camera', deps)).toEqual(new Set(['battery', 'camera']))
  })
})

describe('coSkipTargets (FR-20.2)', () => {
  const deps = [dep('d1', 'battery', 'camera'), dep('d2', 'charger', 'battery')]
  const row = (id: string, sourceItemId: string | null, state = 'open') => ({
    id,
    source_item_id: sourceItemId,
    state,
  })

  it('names the companions that follow the main item out of the list', () => {
    // The names matter, not just the effect: the snackbar reports them and
    // the undo puts back exactly these rows.
    const main = row('r1', 'camera')
    const rows = [main, row('r2', 'battery'), row('r3', 'charger'), row('r4', 'socks')]

    expect(coSkipTargets(main, rows, deps).map((r) => r.id)).toEqual(['r2', 'r3'])
  })

  it('leaves an already-skipped companion alone, so undo cannot un-skip it', () => {
    const main = row('r1', 'camera')
    const rows = [main, row('r2', 'battery', 'skipped'), row('r3', 'charger')]

    expect(coSkipTargets(main, rows, deps).map((r) => r.id)).toEqual(['r3'])
  })

  it('takes nothing along for a quick-added row, which has no master item', () => {
    const main = row('r1', null)
    expect(coSkipTargets(main, [main, row('r2', 'battery')], deps)).toEqual([])
  })
})

describe('skippedVia (FR-20.2)', () => {
  const deps = [dep('d1', 'battery', 'camera'), dep('d2', 'charger', 'battery')]
  const row = (id: string, sourceItemId: string | null, state = 'skipped') => ({
    id,
    source_item_id: sourceItemId,
    state,
  })

  it('names the skipped row a co-skipped one came along with', () => {
    const rows = [row('r1', 'camera'), row('r2', 'battery'), row('r3', 'charger')]
    expect(skippedVia(rows[1]!, rows, deps)?.id).toBe('r1')
    // Transitive: the charger hangs off the battery, which hangs off the camera.
    expect(skippedVia(rows[2]!, rows, deps)).not.toBeNull()
  })

  it('says nothing for a row skipped on its own account', () => {
    const rows = [row('r1', 'camera'), row('r2', 'battery', 'open')]
    expect(skippedVia(rows[0]!, rows, deps)).toBeNull()
    // Not skipped at all: no mark to explain.
    expect(skippedVia(rows[1]!, rows, deps)).toBeNull()
  })

  it('says nothing while the main item is still coming', () => {
    // The user skipped the battery alone. Reporting "because of the camera"
    // would invent a cascade that never ran.
    const rows = [row('r1', 'camera', 'open'), row('r2', 'battery')]
    expect(skippedVia(rows[1]!, rows, deps)).toBeNull()
  })
})

describe('dependencyCycleError', () => {
  const names = new Map([
    ['camera', 'Kamera'],
    ['battery', 'Ersatzakku'],
    ['charger', 'Ladegerät'],
  ])
  const nameOf = (id: string) => names.get(id) ?? id

  it('accepts an acyclic edge', () => {
    expect(
      dependencyCycleError([], { item_id: 'battery', depends_on_item_id: 'camera' }, nameOf),
    ).toBeNull()
  })

  it('rejects a direct cycle', () => {
    const existing = [dep('d1', 'battery', 'camera')]
    expect(
      dependencyCycleError(existing, { item_id: 'camera', depends_on_item_id: 'battery' }, nameOf),
    ).toMatch(/Kamera.*Ersatzakku.*Kamera/)
  })

  it('rejects a transitive cycle', () => {
    const existing = [dep('d1', 'battery', 'camera'), dep('d2', 'charger', 'battery')]
    expect(
      dependencyCycleError(
        [...existing],
        { item_id: 'camera', depends_on_item_id: 'charger' },
        nameOf,
      ),
    ).toMatch(/cycle/i)
  })

  it('rejects a self dependency', () => {
    expect(
      dependencyCycleError([], { item_id: 'camera', depends_on_item_id: 'camera' }, nameOf),
    ).toMatch(/itself/)
  })
})
