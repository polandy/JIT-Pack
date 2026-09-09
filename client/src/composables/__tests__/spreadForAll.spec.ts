/**
 * FR-25.13g write path — the browse-sheet's „für alle".
 *
 * The membership itself is `domain/membership.ts`'s and specified there; what
 * is asserted here is what only the write path can answer: that the spread
 * **only ever adds**, that its undo puts the trip back exactly as it was, and
 * that a row belonging to somebody who has left the trip is neither reached
 * nor removed by it — the one case that could make a one-tap verb destructive.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useTripStore } from '@/stores/tripStore'
import { SPREAD } from '../sync/actions/packing'
import { TABLE } from '@/types/tables'
import type { PullChange } from '@/api/types'
import { installHarness } from '@/__tests__/harness'

const TRIP_ID = 'trip-1'
const SHORTS = 'item-hosen'
const NAME = 'Kurze Hosen'
const SHARED_ROW = 'ti-hosen'

let harness: ReturnType<typeof installHarness>

beforeEach(() => {
  harness = installHarness()
  harness.mockDrain()
})

function change(table: string, id: string, row: Record<string, unknown>): PullChange {
  return { seq: 0, table, id, deleted: false, row }
}

/** One trip, three travelers — the roster a „für alle" distributes over. */
function seedTrip(extra: PullChange[] = []) {
  useTripStore().applyChanges([
    change(TABLE.trips, TRIP_ID, { name: 'Elba', year: 2026, status: 'planning' }),
    change(TABLE.travelers, 'tr-a', { trip_id: TRIP_ID, name: 'Andy' }),
    change(TABLE.travelers, 'tr-b', { trip_id: TRIP_ID, name: 'Nina' }),
    change(TABLE.travelers, 'tr-c', { trip_id: TRIP_ID, name: 'Mila' }),
    ...extra,
  ])
}

function sharedRow(overrides: Record<string, unknown> = {}): PullChange {
  return change(TABLE.tripItems, SHARED_ROW, {
    trip_id: TRIP_ID,
    name: NAME,
    source_item_id: SHORTS,
    quantity: 1,
    packed_count: 0,
    state: 'open',
    mode: 'pack',
    assigned_traveler_id: null,
    ...overrides,
  })
}

function orchestrator() {
  return useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
}

function rowsOf() {
  return useTripStore()
    .getItems(TRIP_ID)
    .filter((row) => row.name === NAME)
}

function membership() {
  return rowsOf()
    .map((row) => [row.assigned_traveler_id, row.quantity] as const)
    .sort()
}

describe('spreadOverEveryTraveler (FR-25.13g)', () => {
  it('gives every traveler a row, re-pointing the shared one rather than replacing it', () => {
    seedTrip([sharedRow()])

    const result = orchestrator().spreadOverEveryTraveler(TRIP_ID, rowsOf(), [])

    expect(result.outcome).toBe(SPREAD.done)
    expect(membership()).toEqual([
      ['tr-a', 1],
      ['tr-b', 1],
      ['tr-c', 1],
    ])
    // ADR-036: the row that was there is still there, so its comments, todos
    // and packing progress came through the spread with it.
    expect(rowsOf().map((row) => row.id)).toContain(SHARED_ROW)
  })

  it('keeps an amount somebody already chose and only fills in who has none', () => {
    seedTrip([
      change(TABLE.tripItems, 'ti-nina', {
        trip_id: TRIP_ID,
        name: NAME,
        source_item_id: SHORTS,
        quantity: 4,
        packed_count: 0,
        state: 'open',
        mode: 'pack',
        assigned_traveler_id: 'tr-b',
      }),
    ])

    orchestrator().spreadOverEveryTraveler(TRIP_ID, rowsOf(), [])

    expect(membership()).toEqual([
      ['tr-a', 1],
      ['tr-b', 4],
      ['tr-c', 1],
    ])
  })

  it('leaves a row of somebody who no longer travels alone — it adds, it never sweeps up', () => {
    seedTrip([
      sharedRow(),
      change(TABLE.tripItems, 'ti-gone', {
        trip_id: TRIP_ID,
        name: NAME,
        source_item_id: SHORTS,
        quantity: 2,
        packed_count: 2,
        state: 'packed',
        mode: 'pack',
        assigned_traveler_id: 'tr-left-the-trip',
      }),
    ])

    const result = orchestrator().spreadOverEveryTraveler(TRIP_ID, rowsOf(), [])

    expect(result.outcome).toBe(SPREAD.done)
    // The packed row of the departed traveler is untouched: still there, still
    // packed, still theirs. Deleting such a row is a decision ADR-036 puts a
    // confirm on, and a one-tap verb may not take it.
    const stale = rowsOf().find((row) => row.id === 'ti-gone')
    expect(stale).toMatchObject({ assigned_traveler_id: 'tr-left-the-trip', packed_count: 2 })
    expect(membership()).toEqual([
      ['tr-a', 1],
      ['tr-b', 1],
      ['tr-c', 1],
      ['tr-left-the-trip', 2],
    ])
  })

  it('reports that it wrote nothing when every traveler already has a row', () => {
    seedTrip(
      ['tr-a', 'tr-b', 'tr-c'].map((travelerId) =>
        change(TABLE.tripItems, `ti-${travelerId}`, {
          trip_id: TRIP_ID,
          name: NAME,
          source_item_id: SHORTS,
          quantity: 1,
          packed_count: 0,
          state: 'open',
          mode: 'pack',
          assigned_traveler_id: travelerId,
        }),
      ),
    )

    const result = orchestrator().spreadOverEveryTraveler(TRIP_ID, rowsOf(), [])

    expect(result.outcome).toBe(SPREAD.nothing)
    expect(result.restore).toBeNull()
    expect(harness.fetch).not.toHaveBeenCalled()
  })

  it('refuses a plan that would delete a row, because its undo could not put one back', () => {
    // Every traveler has a row *and* a shared row is still there: the planner
    // reads the leftover shared row as a member nobody asked for and plans a
    // delete for it. The undo restores fields and removes inserts — a deleted
    // row is not something it can bring back, so nothing is written at all.
    seedTrip([
      sharedRow(),
      ...['tr-a', 'tr-b', 'tr-c'].map((travelerId) =>
        change(TABLE.tripItems, `ti-${travelerId}`, {
          trip_id: TRIP_ID,
          name: NAME,
          source_item_id: SHORTS,
          quantity: 1,
          packed_count: 0,
          state: 'open',
          mode: 'pack',
          assigned_traveler_id: travelerId,
        }),
      ),
    ])

    const result = orchestrator().spreadOverEveryTraveler(TRIP_ID, rowsOf(), [])

    expect(result.outcome).toBe(SPREAD.wouldDelete)
    expect(rowsOf()).toHaveLength(4)
    expect(harness.fetch).not.toHaveBeenCalled()
  })

  it('reaches the outbox as one push, so a disconnect cannot strand half a fan-out', async () => {
    seedTrip([sharedRow()])

    orchestrator().spreadOverEveryTraveler(TRIP_ID, rowsOf(), [])

    await vi.waitFor(() => expect(harness.fetch).toHaveBeenCalled())
    expect(harness.fetch.mock.calls.filter((call) => call[1]?.body)).toHaveLength(1)
    expect(harness.pushedMutations()).toHaveLength(3)
  })
})

describe('restoreMembership (FR-25.13g — the way back out of a spread)', () => {
  it('puts the trip back exactly as it was: the created rows go, the kept row returns', () => {
    seedTrip([sharedRow({ quantity: 3, packed_count: 2, state: 'partial' })])
    const orch = orchestrator()
    const before = rowsOf().map((row) => ({
      id: row.id,
      traveler: row.assigned_traveler_id,
      quantity: row.quantity,
      packed: row.packed_count,
      state: row.state,
    }))

    const result = orch.spreadOverEveryTraveler(TRIP_ID, rowsOf(), [])
    expect(rowsOf()).toHaveLength(3)

    orch.restoreMembership(TRIP_ID, result.restore!)

    expect(
      rowsOf().map((row) => ({
        id: row.id,
        traveler: row.assigned_traveler_id,
        quantity: row.quantity,
        packed: row.packed_count,
        state: row.state,
      })),
    ).toEqual(before)
  })

  it('leaves a row another device has deleted in the meantime alone', () => {
    seedTrip([sharedRow()])
    const orch = orchestrator()
    const result = orch.spreadOverEveryTraveler(TRIP_ID, rowsOf(), [])
    const created = result.restore!.inserted[0]!

    useTripStore().applyChanges([
      { seq: 1, table: TABLE.tripItems, id: created, deleted: true, row: null },
    ])
    orch.restoreMembership(TRIP_ID, result.restore!)

    // The undo took out the row it could still see and did not resurrect the
    // other by deleting it a second time — the rule removeAddedItem holds.
    expect(rowsOf().map((row) => row.id)).toEqual([SHARED_ROW])
  })
})

describe('addItemForEveryTraveler (FR-25.13g — the free line)', () => {
  it('adds the row and hands it to everybody in one tap', () => {
    seedTrip()

    const result = orchestrator().addItemForEveryTraveler(
      TRIP_ID,
      NAME,
      { sourceItemId: SHORTS, weightGrams: 180, valueCents: null, categoryName: 'Kleidung' },
      true,
    )

    expect(result.outcome).toBe(SPREAD.done)
    expect(membership()).toEqual([
      ['tr-a', 1],
      ['tr-b', 1],
      ['tr-c', 1],
    ])
    expect(rowsOf().every((row) => row.source_item_id === SHORTS)).toBe(true)
    // FR-9.1 flags what the plan forgot, and the tap is one add: the row the
    // add wrote carries the flag, and the rows the spread cut from it are
    // generated rows, which carry the item's facts and none of its decisions
    // (C-13). Asserted rather than assumed, because "all three" and "one of
    // three" are both defensible and only one of them is what runs.
    expect(
      rowsOf()
        .filter((row) => row.flag_missing)
        .map((row) => row.id),
    ).toEqual([result.id])
  })

  it('names every row it left behind, which is what its undo takes out', () => {
    seedTrip()
    const orch = orchestrator()

    const result = orch.addItemForEveryTraveler(
      TRIP_ID,
      NAME,
      { sourceItemId: SHORTS, weightGrams: null, valueCents: null, categoryName: null },
      false,
    )

    expect(result.ids).toHaveLength(3)
    expect(result.ids.slice().sort()).toEqual(
      rowsOf()
        .map((row) => row.id)
        .sort(),
    )

    for (const id of result.ids) orch.removeAddedItem(TRIP_ID, id)
    expect(rowsOf()).toHaveLength(0)
  })
})
