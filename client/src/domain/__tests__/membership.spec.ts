/**
 * FR-25.21 — who needs an item, and how many each. The planner turns the
 * membership somebody picked into the rows that express it (ADR-036).
 */
import { describe, expect, it } from 'vitest'

import {
  membershipRows,
  planMembership,
  type MembershipInput,
  type MembershipTarget,
} from '../membership'
import { propagatedItemId } from '../refresh'
import type { Traveler, TripItem } from '@/types/domain'

const TRIP = 'trip-1'
const SOURCE = 'item-shorts'

const ANDY: Traveler = { id: 'tr-andy', trip_id: TRIP, name: 'Andy', linked_user_id: null }
const LEO: Traveler = { id: 'tr-leo', trip_id: TRIP, name: 'Leonardo', linked_user_id: null }
const MIA: Traveler = { id: 'tr-mia', trip_id: TRIP, name: 'Mia', linked_user_id: null }
const TRAVELERS = [ANDY, LEO, MIA]

function row(id: string, extra: Partial<TripItem> = {}): TripItem {
  return {
    id,
    trip_id: TRIP,
    source_item_id: SOURCE,
    source_template_id: null,
    name: 'Kurze Hosen',
    weight_grams: 180,
    value_cents: null,
    category_name: 'Kleidung',
    quantity: 4,
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
    flag_unused: false,
    flag_missing: false,
    bought_from: null,
    updated_hlc: '',
    ...extra,
  }
}

function input(rows: TripItem[], target: MembershipTarget, extra: Partial<MembershipInput> = {}) {
  return {
    tripId: TRIP,
    rows,
    travelers: TRAVELERS,
    rowsWithContent: [],
    target,
    ...extra,
  } satisfies MembershipInput
}

const perPerson = (...pairs: [string, number][]): MembershipTarget => ({
  kind: 'perPerson',
  members: pairs.map(([traveler_id, quantity]) => ({ traveler_id, quantity })),
})

describe('planMembership', () => {
  describe('shared → per person (FR-25.21, ADR-036 keep-and-repoint)', () => {
    it('KeepsTheExistingRow_ForTheFirstSelectedTraveler_SoItsThreadSurvives', () => {
      const shared = row('row-shared', { quantity: 4, packed_count: 2 })

      const plan = planMembership(input([shared], perPerson([LEO.id, 3], [ANDY.id, 2])))

      // Trip order decides, not the order the picker handed them over: Andy is
      // first in the roster even though Leonardo was named first.
      // packed_count is absent because it does not change — the plan writes only
      // the fields that differ, so a repoint never restates what it kept.
      expect(plan.update).toEqual([
        { id: 'row-shared', fields: { assigned_traveler_id: ANDY.id, quantity: 2 } },
      ])
      expect(plan.delete).toEqual([])
      expect(plan.insert).toHaveLength(1)
      expect(plan.insert[0]).toMatchObject({ traveler_id: LEO.id, quantity: 3 })
    })

    it('DerivesTheInsertedRowIds_SoTwoDevicesConvergeOnOneRowPerTraveler', () => {
      const shared = row('row-shared')

      const a = planMembership(input([shared], perPerson([ANDY.id, 1], [LEO.id, 1])))
      const b = planMembership(input([shared], perPerson([ANDY.id, 1], [LEO.id, 1])))

      expect(a.insert[0]?.id).toBe(b.insert[0]?.id)
      // The same derivation FR-27.4 uses, so a later refresh adopts this row
      // instead of adding a second one beside it.
      expect(a.insert[0]?.id).toBe(propagatedItemId(TRIP, SOURCE, LEO.id))
    })

    it('FallsBackToTheFoldedName_WhenTheRowHasNoSourceItem', () => {
      const adhoc = row('row-adhoc', { source_item_id: null, name: '  Kurze Hosen  ' })

      const plan = planMembership(input([adhoc], perPerson([ANDY.id, 1], [LEO.id, 1])))

      expect(plan.insert[0]?.id).toBe(propagatedItemId(TRIP, 'name:kurze hosen', LEO.id))
    })

    it('CapsThePackedCount_WhenTheKeptRowsAmountShrinksBelowIt', () => {
      const shared = row('row-shared', { quantity: 6, packed_count: 5 })

      const plan = planMembership(input([shared], perPerson([ANDY.id, 2])))

      expect(plan.update[0]?.fields).toMatchObject({ quantity: 2, packed_count: 2 })
    })
  })

  describe('per person → shared (FR-25.21b)', () => {
    const rows = [
      row('row-andy', { assigned_traveler_id: ANDY.id, quantity: 2, packed_count: 0 }),
      row('row-leo', { assigned_traveler_id: LEO.id, quantity: 3, packed_count: 1 }),
      row('row-mia', { assigned_traveler_id: MIA.id, quantity: 1, packed_count: 1 }),
    ]

    it('SumsTheAmounts_NeverKeepsTheLargest', () => {
      const plan = planMembership(input(rows, { kind: 'shared' }))

      expect(plan.update).toHaveLength(1)
      expect(plan.update[0]?.fields).toMatchObject({
        assigned_traveler_id: null,
        quantity: 6,
        packed_count: 2,
      })
    })

    it('KeepsTheRowCarryingContent_OverTheOneWithMorePacked', () => {
      // Andy's row has the comments; Leonardo's and Mia's have more packed.
      const plan = planMembership(input(rows, { kind: 'shared' }, { rowsWithContent: ['row-andy'] }))

      expect(plan.update[0]?.id).toBe('row-andy')
      expect(plan.delete.sort()).toEqual(['row-leo', 'row-mia'])
    })

    it('FallsBackToTheMostPackedRow_WhenNoRowCarriesContent', () => {
      const plan = planMembership(input(rows, { kind: 'shared' }))

      expect(plan.update[0]?.id).toBe('row-leo')
      expect(plan.delete.sort()).toEqual(['row-andy', 'row-mia'])
    })

    it('FallsBackToTripOrder_WhenNothingSeparatesTheRows', () => {
      const flat = [
        row('row-mia', { assigned_traveler_id: MIA.id, quantity: 1 }),
        row('row-andy', { assigned_traveler_id: ANDY.id, quantity: 1 }),
      ]

      const plan = planMembership(input(flat, { kind: 'shared' }))

      expect(plan.update[0]?.id).toBe('row-andy')
    })
  })

  describe('editing an existing per-person set', () => {
    const rows = [
      row('row-andy', { assigned_traveler_id: ANDY.id, quantity: 2 }),
      row('row-leo', { assigned_traveler_id: LEO.id, quantity: 3 }),
    ]

    it('AddsOneRow_ForANewlyCheckedTraveler_AndTouchesNothingElse', () => {
      const plan = planMembership(input(rows, perPerson([ANDY.id, 2], [LEO.id, 3], [MIA.id, 1])))

      expect(plan.update).toEqual([])
      expect(plan.delete).toEqual([])
      expect(plan.insert).toHaveLength(1)
      expect(plan.insert[0]).toMatchObject({ traveler_id: MIA.id, quantity: 1 })
    })

    it('DeletesOneRow_ForAnUncheckedTraveler', () => {
      const plan = planMembership(input(rows, perPerson([ANDY.id, 2])))

      expect(plan.delete).toEqual(['row-leo'])
      expect(plan.insert).toEqual([])
      expect(plan.update).toEqual([])
    })

    it('WritesOnlyTheAmountThatChanged', () => {
      const plan = planMembership(input(rows, perPerson([ANDY.id, 5], [LEO.id, 3])))

      expect(plan.update).toEqual([{ id: 'row-andy', fields: { quantity: 5 } }])
    })
  })

  describe('what a confirm has to be able to say', () => {
    it('NamesEveryRemovedRowThatWouldLoseProgressOrContent', () => {
      const rows = [
        row('row-andy', { assigned_traveler_id: ANDY.id, quantity: 2, packed_count: 0 }),
        row('row-leo', { assigned_traveler_id: LEO.id, quantity: 3, packed_count: 2 }),
        row('row-mia', { assigned_traveler_id: MIA.id, quantity: 1, packed_count: 0 }),
      ]

      const plan = planMembership(
        input(rows, perPerson([ANDY.id, 2]), { rowsWithContent: ['row-mia'] }),
      )

      expect(plan.destructive).toEqual([
        { rowId: 'row-leo', travelerName: 'Leonardo', packedCount: 2, quantity: 3, hasContent: false },
        { rowId: 'row-mia', travelerName: 'Mia', packedCount: 0, quantity: 1, hasContent: true },
      ])
    })

    it('SaysNothingIsDestroyed_WhenTheRemovedRowIsUntouched', () => {
      const rows = [
        row('row-andy', { assigned_traveler_id: ANDY.id, quantity: 2 }),
        row('row-leo', { assigned_traveler_id: LEO.id, quantity: 3 }),
      ]

      const plan = planMembership(input(rows, perPerson([ANDY.id, 2])))

      expect(plan.destructive).toEqual([])
      // The positive signal: the row really is being removed, silently.
      expect(plan.delete).toEqual(['row-leo'])
    })

    it('NamesTheSurvivingRow_SoTheCollapseConfirmCanStateTheOutcome', () => {
      const rows = [
        row('row-andy', { assigned_traveler_id: ANDY.id, quantity: 2 }),
        row('row-leo', { assigned_traveler_id: LEO.id, quantity: 3, packed_count: 1 }),
      ]

      const plan = planMembership(input(rows, { kind: 'shared' }))

      expect(plan.survivor).toEqual({ rowId: 'row-leo', travelerName: 'Leonardo' })
      expect(plan.totals).toEqual({ quantity: 5, packed: 1 })
    })
  })

  describe('the rules the planner refuses to bend', () => {
    it('ClampsAnAmountBelowOne_Because0IsSkippedAndNotAbsence', () => {
      const shared = row('row-shared')

      const plan = planMembership(input([shared], perPerson([ANDY.id, 0])))

      expect(plan.update[0]?.fields).toMatchObject({ quantity: 1 })
    })

    it('IsANoOp_WhenTheTargetAlreadyMatchesTheRows', () => {
      const rows = [
        row('row-andy', { assigned_traveler_id: ANDY.id, quantity: 2 }),
        row('row-leo', { assigned_traveler_id: LEO.id, quantity: 3 }),
      ]

      const plan = planMembership(input(rows, perPerson([ANDY.id, 2], [LEO.id, 3])))

      expect(plan).toMatchObject({ update: [], insert: [], delete: [], destructive: [] })
      expect(plan.empty).toBe(true)
    })

    it('DropsATravelerNotOnTheTrip_RatherThanWritingADanglingForeignKey', () => {
      const shared = row('row-shared')

      const plan = planMembership(input([shared], perPerson([ANDY.id, 1], ['tr-ghost', 2])))

      expect(plan.insert).toEqual([])
      expect(plan.update[0]?.fields).toMatchObject({ assigned_traveler_id: ANDY.id })
    })
  })
})

describe('membershipRows', () => {
  it('CollectsEveryInstanceOfTheItem_IncludingTheOneOpened', () => {
    const all = [
      row('row-andy', { assigned_traveler_id: ANDY.id }),
      row('row-leo', { assigned_traveler_id: LEO.id }),
      row('row-other', { source_item_id: 'item-socks', name: 'Socken' }),
    ]

    const picked = membershipRows(all, all[0]!)

    expect(picked.map((r) => r.id)).toEqual(['row-andy', 'row-leo'])
  })

  it('GroupsAdHocRowsByFoldedName_TheSameWayTheM4ClusterDoes', () => {
    const all = [
      row('row-a', { source_item_id: null, name: 'Jacke', assigned_traveler_id: ANDY.id }),
      row('row-b', { source_item_id: null, name: ' jacke ', assigned_traveler_id: LEO.id }),
      row('row-c', { source_item_id: null, name: 'Mütze' }),
    ]

    expect(membershipRows(all, all[0]!).map((r) => r.id)).toEqual(['row-a', 'row-b'])
  })
})
