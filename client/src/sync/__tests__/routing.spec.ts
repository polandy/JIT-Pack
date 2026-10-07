/**
 * Pull routing has one failure mode and it is silent: a table in neither set
 * is dropped, so its rows simply never reach a store and nothing turns red.
 * These are the assertions that would have to fail instead.
 */
import { describe, it, expect } from 'vitest'
import {
  ALL_SYNC_TABLES,
  FEATURE_STORE_TABLES,
  MASTER_STORE_TABLES,
  TRIP_STORE_TABLES,
  partitionOf,
  storeFor,
} from '../routing'
import { TABLE, type SyncTable } from '@/types/tables'

describe('pull routing', () => {
  it('routes every syncable table to exactly one store', () => {
    const unrouted = ALL_SYNC_TABLES.filter((t) => storeFor(t) === null)
    expect(unrouted).toEqual([])

    const sets = [TRIP_STORE_TABLES, MASTER_STORE_TABLES, FEATURE_STORE_TABLES]
    const twice = ALL_SYNC_TABLES.filter((t) => sets.filter((set) => set.has(t)).length > 1)
    expect(twice).toEqual([])
  })

  it('names no table that is not syncable', () => {
    const known = new Set<string>(ALL_SYNC_TABLES)
    const strays = [...TRIP_STORE_TABLES, ...MASTER_STORE_TABLES, ...FEATURE_STORE_TABLES].filter(
      (t) => !known.has(t),
    )
    expect(strays).toEqual([])
  })

  it('routes the master partition per-trip tables to the trip store (spec P-3)', () => {
    expect(storeFor('trip_members')).toBe('trip')
    expect(storeFor('trip_template_sources')).toBe('trip')
    expect(storeFor('trip_applied_changes')).toBe('trip')
  })

  // FR-30.3: a module's table goes to the module's store, which the
  // orchestrator is handed rather than imports — so the packing store never
  // holds a shopping entry.
  it('routes the shopping entries to a feature store, not the trip store (ADR-066)', () => {
    expect(storeFor('shopping_entries')).toBe('feature')
  })

  it('routes nothing for a table that travels no feed', () => {
    expect(storeFor('notifications')).toBeNull()
  })
})

describe('write partitions (Sync-API P-3)', () => {
  // The master half of `tableSpecs` in internal/store/tables.go, by hand
  // until wiregen emits it: the server refuses a mutation pushed to any
  // other partition's endpoint.
  const MASTER_FEED: readonly SyncTable[] = [
    TABLE.tags,
    TABLE.taskTags,
    TABLE.itemTags,
    TABLE.items,
    TABLE.itemDependencies,
    TABLE.templates,
    TABLE.templateItems,
    TABLE.templateIncludes,
    TABLE.templateItemTasks,
    TABLE.templateTasks,
    TABLE.tripSeries,
    TABLE.destinationProfiles,
    TABLE.destinationChecklistItems,
    TABLE.trips,
    TABLE.tripMembers,
    TABLE.tripTemplateSources,
    TABLE.tripAppliedChanges,
  ]

  it('pushes the master data, the trips and their P-3 companions on the master feed', () => {
    const onMaster = ALL_SYNC_TABLES.filter((t) => partitionOf(t) === 'master')
    expect(onMaster.sort()).toEqual([...MASTER_FEED].sort())
  })

  it('pushes every other table on its trip feed, the feature modules’ included', () => {
    const elsewhere = ALL_SYNC_TABLES.filter(
      (t) => !MASTER_FEED.includes(t) && partitionOf(t) !== 'trip',
    )
    expect(elsewhere).toEqual([])
    expect(partitionOf(TABLE.meals)).toBe('trip')
  })

  it('names no partition for a table that travels no feed', () => {
    expect(partitionOf('notifications')).toBeNull()
  })
})
