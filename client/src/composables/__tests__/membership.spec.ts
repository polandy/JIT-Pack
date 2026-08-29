/**
 * FR-25.21 write path. The decision itself is specified in
 * `domain/__tests__/membership.spec.ts`; what is asserted here is the part
 * the planner cannot see — that a conversion reaches the outbox as **one**
 * unit, and that the optimistic stores show the result before any server does.
 *
 * The batching matters beyond tidiness: a conversion is a repoint plus N
 * inserts plus M deletes, and splitting it means a device that goes offline
 * mid-drain can leave an item belonging to nobody.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import type { PullChange } from '@/api/types'
import { installHarness } from '@/__tests__/harness'

const TRIP_ID = 'trip-1'
const ITEM_ID = 'ti-hosen'

let harness: ReturnType<typeof installHarness>

beforeEach(() => {
  harness = installHarness()
  harness.mockDrain()
})

function change(table: string, id: string, row: Record<string, unknown>): PullChange {
  return { seq: 0, table, id, deleted: false, row }
}

/** One trip, three travelers, one shared ad-hoc row — the E2E-M5-18 world. */
function seedWorld() {
  useTripStore().applyChanges([
    change(TABLE.trips, TRIP_ID, { name: 'Elba', year: 2026, status: 'planning' }),
    change(TABLE.travelers, 'tr-a', { trip_id: TRIP_ID, name: 'Andy' }),
    change(TABLE.travelers, 'tr-b', { trip_id: TRIP_ID, name: 'Leonardo' }),
    change(TABLE.travelers, 'tr-c', { trip_id: TRIP_ID, name: 'Mia' }),
    change(TABLE.tripItems, ITEM_ID, {
      trip_id: TRIP_ID,
      name: 'Kurze Hosen',
      quantity: 1,
      packed_count: 0,
      state: 'open',
      mode: 'pack',
      assigned_traveler_id: null,
    }),
  ])
}

function orchestrator() {
  return useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
}

function rowsOf(store = useTripStore()) {
  return store.getItems(TRIP_ID).filter((i) => i.name === 'Kurze Hosen')
}

describe('setMembership (FR-25.21)', () => {
  it('converts a shared row into one row per traveler in a single push', async () => {
    seedWorld()
    const orch = orchestrator()
    const store = useTripStore()

    orch.setMembership(TRIP_ID, rowsOf(store), {
      kind: 'perPerson',
      members: [
        { traveler_id: 'tr-a', quantity: 2 },
        { traveler_id: 'tr-b', quantity: 3 },
      ],
    }, [])

    const rows = rowsOf(store)
    expect(rows).toHaveLength(2)
    expect(
      rows.map((r) => [r.assigned_traveler_id, r.quantity]).sort(),
    ).toEqual([['tr-a', 2], ['tr-b', 3]])

    // ADR-036: the existing row is re-pointed, never recreated — so anything
    // hanging off it survives. Its id is still among the rows.
    expect(rows.map((r) => r.id)).toContain(ITEM_ID)

    // One push carrying every mutation. Two pushes would let a disconnect
    // between them strand the item — repointed onto one traveler, with the
    // other traveler's row still only a local intention.
    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalled())
    expect(harness.fetch.mock.calls.filter((c) => c[1]?.body)).toHaveLength(1)
    expect(harness.pushedMutations()).toHaveLength(2)
  })

  it('collapsing back sums the quantities onto one surviving row and deletes the rest', () => {
    seedWorld()
    const orch = orchestrator()
    const store = useTripStore()

    orch.setMembership(TRIP_ID, rowsOf(store), {
      kind: 'perPerson',
      members: [
        { traveler_id: 'tr-a', quantity: 2 },
        { traveler_id: 'tr-b', quantity: 3 },
      ],
    }, [])
    orch.setMembership(TRIP_ID, rowsOf(store), { kind: 'shared' }, [])

    const rows = rowsOf(store)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.assigned_traveler_id).toBeNull()
    expect(rows[0]?.quantity).toBe(5)
  })

  it('writes nothing when the rows already express the membership', () => {
    seedWorld()
    const orch = orchestrator()
    orch.setMembership(TRIP_ID, rowsOf(), { kind: 'shared' }, [])

    expect(harness.fetch).not.toHaveBeenCalled()
  })
})
