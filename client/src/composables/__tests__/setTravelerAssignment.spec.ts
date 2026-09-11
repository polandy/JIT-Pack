/**
 * FR-25.13h write path — the browse-sheet's per-traveler assignment on a free
 * line: the avatar buttons (≤3 travelers) and the long-press menu (>3) both
 * end here. Multi-select: the caller always passes the *whole* desired set of
 * traveler ids, not one at a time, which is what lets a second tap add a
 * second traveler to the row the first tap wrote instead of starting a
 * second, unrelated one — the bug a live tap-through-two-avatars found in the
 * single-traveler version of this call, reproduced in the second test below
 * as the regression it would be if `existingRows` were ignored.
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

const OPTS = { sourceItemId: SHORTS, weightGrams: null, valueCents: null, categoryName: null }

describe('setTravelerAssignment (FR-25.13h — the free line)', () => {
  it('adds one row, assigned to exactly the traveler set it was given', () => {
    seedTrip()

    const result = orchestrator().setTravelerAssignment(TRIP_ID, NAME, OPTS, true, [], ['tr-b'])

    expect(rowsOf()).toHaveLength(1)
    expect(rowsOf()[0]).toMatchObject({
      id: result.id,
      assigned_traveler_id: 'tr-b',
      quantity: 1,
      source_item_id: SHORTS,
      flag_missing: true,
    })
  })

  it('a second tap adds a second traveler to the same row — never a second, unrelated one', () => {
    seedTrip()
    const orch = orchestrator()

    orch.setTravelerAssignment(TRIP_ID, NAME, OPTS, false, [], ['tr-a'])
    // The sheet re-reads the item's own rows before the second tap, the way
    // `rowsOfMasterItem` does, and hands back the *whole* desired set.
    orch.setTravelerAssignment(TRIP_ID, NAME, OPTS, false, rowsOf(), ['tr-a', 'tr-b'])

    expect(
      rowsOf()
        .map((row) => row.assigned_traveler_id)
        .sort(),
    ).toEqual(['tr-a', 'tr-b'])
  })

  it('tapping a selected traveler again removes just that one row, keeping the rest', () => {
    seedTrip()
    const orch = orchestrator()

    orch.setTravelerAssignment(TRIP_ID, NAME, OPTS, false, [], ['tr-a'])
    orch.setTravelerAssignment(TRIP_ID, NAME, OPTS, false, rowsOf(), ['tr-a', 'tr-b'])
    orch.setTravelerAssignment(TRIP_ID, NAME, OPTS, false, rowsOf(), ['tr-b'])

    expect(rowsOf().map((row) => row.assigned_traveler_id)).toEqual(['tr-b'])
  })

  it('emptying the set removes the row entirely — the same outcome „Rückgängig" reaches', () => {
    seedTrip()
    const orch = orchestrator()

    orch.setTravelerAssignment(TRIP_ID, NAME, OPTS, false, [], ['tr-c'])
    orch.setTravelerAssignment(TRIP_ID, NAME, OPTS, false, rowsOf(), [])

    expect(rowsOf()).toHaveLength(0)
  })

  it('drops a traveler id the trip does not have, rather than writing a dangling one', () => {
    seedTrip()

    const result = orchestrator().setTravelerAssignment(
      TRIP_ID,
      NAME,
      OPTS,
      false,
      [],
      ['tr-not-on-this-trip'],
    )

    // The add itself still lands — only the membership write is refused — so
    // the tap leaves an ordinary shared row rather than nothing at all.
    expect(rowsOf()).toHaveLength(1)
    expect(rowsOf()[0]).toMatchObject({ id: result.id, assigned_traveler_id: null })
  })

  it('its undo is the same delete every free-line add uses when only one traveler was ever picked', () => {
    seedTrip()
    const orch = orchestrator()

    const result = orch.setTravelerAssignment(TRIP_ID, NAME, OPTS, false, [], ['tr-c'])
    orch.removeAddedItem(TRIP_ID, result.id)

    expect(rowsOf()).toHaveLength(0)
  })
})
