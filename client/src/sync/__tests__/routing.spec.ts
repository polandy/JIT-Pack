/**
 * Pull routing has one failure mode and it is silent: a table in neither set
 * is dropped, so its rows simply never reach a store and nothing turns red.
 * These are the assertions that would have to fail instead.
 */
import { describe, it, expect } from 'vitest'
import { ALL_SYNC_TABLES, MASTER_STORE_TABLES, TRIP_STORE_TABLES, storeFor } from '../routing'

describe('pull routing', () => {
  it('routes every syncable table to exactly one store', () => {
    const unrouted = ALL_SYNC_TABLES.filter((t) => storeFor(t) === null)
    expect(unrouted).toEqual([])

    const both = ALL_SYNC_TABLES.filter(
      (t) => TRIP_STORE_TABLES.has(t) && MASTER_STORE_TABLES.has(t),
    )
    expect(both).toEqual([])
  })

  it('names no table that is not syncable', () => {
    const known = new Set<string>(ALL_SYNC_TABLES)
    const strays = [...TRIP_STORE_TABLES, ...MASTER_STORE_TABLES].filter((t) => !known.has(t))
    expect(strays).toEqual([])
  })

  it('routes the master partition per-trip tables to the trip store (spec P-3)', () => {
    expect(storeFor('trip_members')).toBe('trip')
    expect(storeFor('trip_template_sources')).toBe('trip')
    expect(storeFor('trip_applied_changes')).toBe('trip')
  })

  it('routes nothing for a table that travels no feed', () => {
    expect(storeFor('notifications')).toBeNull()
  })
})
