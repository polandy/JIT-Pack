/**
 * FR-25.13h write path — the browse-sheet's per-traveler assignment on a free
 * line: the avatar button (≤3 travelers) and the long-press menu (>3) both
 * end here. Unlike FR-25.13g's „für alle" this never fans a row out — it is
 * `domain/membership.ts`'s planner called with a target of exactly one
 * traveler, so what is asserted here is that the write lands on the one row
 * the add made and that a traveler id the trip does not have is dropped
 * rather than written (invariant 3).
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import type { PullChange } from '@/api/types'
import { installHarness } from '@/__tests__/harness'

const TRIP_ID = 'trip-1'
const SHORTS = 'item-hosen'
const NAME = 'Kurze Hosen'

let harness: ReturnType<typeof installHarness>

beforeEach(() => {
  harness = installHarness()
  harness.mockDrain()
})

function change(table: string, id: string, row: Record<string, unknown>): PullChange {
  return { seq: 0, table, id, deleted: false, row }
}

function seedTrip(extra: PullChange[] = []) {
  useTripStore().applyChanges([
    change(TABLE.trips, TRIP_ID, { name: 'Elba', year: 2026, status: 'planning' }),
    change(TABLE.travelers, 'tr-a', { trip_id: TRIP_ID, name: 'Andy' }),
    change(TABLE.travelers, 'tr-b', { trip_id: TRIP_ID, name: 'Nina' }),
    change(TABLE.travelers, 'tr-c', { trip_id: TRIP_ID, name: 'Mila' }),
    ...extra,
  ])
}

function orchestrator() {
  return useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
}

function rowsOf() {
  return useTripStore()
    .getItems(TRIP_ID)
    .filter((row) => row.name === NAME)
}

describe('addItemForOneTraveler (FR-25.13h — the free line)', () => {
  it('adds one row, assigned to exactly the traveler that was tapped', () => {
    seedTrip()

    const result = orchestrator().addItemForOneTraveler(
      TRIP_ID,
      NAME,
      { sourceItemId: SHORTS, weightGrams: 180, valueCents: null, categoryName: 'Kleidung' },
      true,
      'tr-b',
    )

    expect(rowsOf()).toHaveLength(1)
    expect(rowsOf()[0]).toMatchObject({
      id: result.id,
      assigned_traveler_id: 'tr-b',
      quantity: 1,
      source_item_id: SHORTS,
      flag_missing: true,
    })
  })

  it('never touches another traveler — a second tap for somebody else is a second row', () => {
    seedTrip()
    const orch = orchestrator()

    orch.addItemForOneTraveler(
      TRIP_ID,
      NAME,
      { sourceItemId: SHORTS, weightGrams: null, valueCents: null, categoryName: null },
      false,
      'tr-a',
    )
    orch.addItemForOneTraveler(
      TRIP_ID,
      NAME,
      { sourceItemId: SHORTS, weightGrams: null, valueCents: null, categoryName: null },
      false,
      'tr-b',
    )

    expect(
      rowsOf()
        .map((row) => row.assigned_traveler_id)
        .sort(),
    ).toEqual(['tr-a', 'tr-b'])
  })

  it('drops a traveler id the trip does not have, rather than writing a dangling one', () => {
    seedTrip()

    const result = orchestrator().addItemForOneTraveler(
      TRIP_ID,
      NAME,
      { sourceItemId: SHORTS, weightGrams: null, valueCents: null, categoryName: null },
      false,
      'tr-not-on-this-trip',
    )

    // The add itself still lands — only the membership write is refused — so
    // the tap leaves an ordinary shared row rather than nothing at all.
    expect(rowsOf()).toHaveLength(1)
    expect(rowsOf()[0]).toMatchObject({ id: result.id, assigned_traveler_id: null })
  })

  it('its undo is the same delete every free-line add uses — there is no spread to take back', () => {
    seedTrip()
    const orch = orchestrator()

    const result = orch.addItemForOneTraveler(
      TRIP_ID,
      NAME,
      { sourceItemId: SHORTS, weightGrams: null, valueCents: null, categoryName: null },
      false,
      'tr-c',
    )
    orch.removeAddedItem(TRIP_ID, result.id)

    expect(rowsOf()).toHaveLength(0)
  })
})
