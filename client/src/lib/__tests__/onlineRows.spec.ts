import { describe, expect, it } from 'vitest'

import { onlineRows } from '../onlineRows'
import type { Trip } from '@/types/domain'

const trips: Record<string, Trip> = { t1: { id: 't1', name: 'Vercors' } as Trip }
const getTrip = (id: string) => trips[id]
const directory = [{ user_id: 'u-bob', display_name: 'Bob' }]

describe('onlineRows (FR-4.9)', () => {
  it('names each person on each trip they have open', () => {
    const rows = onlineRows([{ user_id: 'u-bob', trip_ids: ['t1'] }], directory, getTrip)
    expect(rows).toEqual([{ key: 'u-bob:t1', name: 'Bob', tripId: 't1', tripName: 'Vercors' }])
  })

  it('leaves out a trip this device does not hold', () => {
    expect(onlineRows([{ user_id: 'u-bob', trip_ids: ['gone'] }], directory, getTrip)).toEqual([])
  })

  it('falls back to the account id for somebody the directory has not listed', () => {
    const rows = onlineRows([{ user_id: 'u-new', trip_ids: ['t1'] }], directory, getTrip)
    expect(rows[0]?.name).toBe('u-new')
  })

  it('is empty for an empty roster', () => {
    expect(onlineRows([], directory, getTrip)).toEqual([])
  })
})
