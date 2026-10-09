/**
 * The tables, specified once each across the kernel and the feature modules
 * (FR-30.3, ADR-066 amendment 2). The kernel's registry names only its own
 * tables, so the build no longer refuses a `TABLE.*` without a spec — this
 * does, by composing both as the running app does: a table no store carries a
 * spec for is dropped on every pull.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { MODULE_ROW_SPECS } from './rowSpecs'
import { TABLE } from '@/api/tables'
import { mealFeatureStore } from '@/meals'
import { plannerFeatureStore } from '@/planner'
import { shoppingFeatureStore } from '@/shopping'
import { FEATURE_STORE_TABLES } from '@/sync/routing'
import { KERNEL_TABLE_SPECS } from '@/sync/tableRegistry'

const kernelTables = Object.keys(KERNEL_TABLE_SPECS)
const moduleTables = Object.values(MODULE_ROW_SPECS).flatMap((specs) => Object.keys(specs))

beforeEach(() => setActivePinia(createPinia()))

describe('the composed table specs (ADR-066 amendment 2)', () => {
  it('specify every table in TABLE exactly once, kernel and modules together', () => {
    const specified = [...kernelTables, ...moduleTables]
    expect(new Set(specified).size).toBe(specified.length)
    expect(specified.sort()).toEqual(Object.values(TABLE).sort())
  })

  it('route to a feature store exactly the tables a module specifies', () => {
    expect(new Set(moduleTables)).toEqual(FEATURE_STORE_TABLES)
  })

  it.each([
    ['shopping', shoppingFeatureStore],
    ['planner', plannerFeatureStore],
    ['meals', mealFeatureStore],
  ] as const)('give %s’s store a sink for each table it specifies, with that spec', (name, of) => {
    const specs: Record<string, unknown> = MODULE_ROW_SPECS[name]
    const { sinks } = of()
    expect(Object.keys(sinks).sort()).toEqual(Object.keys(specs).sort())
    for (const [table, sink] of Object.entries(sinks)) expect(sink?.spec).toEqual(specs[table])
  })
})
