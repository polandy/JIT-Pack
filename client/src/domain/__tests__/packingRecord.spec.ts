import { describe, expect, it } from 'vitest'
import { planClone } from '@/domain/clone'
import type { CloneLookup, CloneOptions, CloneSource } from '@/domain/clone'
import type { Trip, TripItem } from '@/types/domain'

/**
 * FR-25.19 on the client side of the split.
 *
 * `packer_user_id` is the assignment — a deliberate choice that a clone
 * may carry over (FR-12.2). The packing *record* is not a choice at all;
 * it is written server-side when a row is checked, so it must never
 * appear on a row that has not been packed in this trip.
 */

const sourceItem: TripItem = {
  id: 'src-1',
  trip_id: 'trip-old',
  source_item_id: null,
  source_template_id: null,
  name: 'Wanderschuhe',
  weight_grams: 900,
  value_cents: null,
  category_name: 'Schuhe',
  quantity: 1,
  packed_count: 1,
  state: 'packed',
  mode: 'pack',
  late_packer: false,
  assigned_traveler_id: null,
  packer_user_id: 'user-sia',
  packed_by_user_id: 'user-andy',
  packed_at: '2026-08-01T10:00:00Z',
  container_id: null,
  packing_now_by: null,
  packing_now_at: null,
  bought_from: null,
  flag_unused: false,
  flag_missing: false,
  updated_hlc: '0001',
}

const sourceTrip: Trip = {
  id: 'trip-old',
  series_id: null,
  name: 'Samedan 2025',
  year: 2025,
  start_date: '2025-09-01',
  end_date: '2025-09-21',
  duration_days: 21,
  status: 'archived',
  attributes: null,
  imported: false,
}

const source: CloneSource = {
  trip: sourceTrip,
  travelers: [],
  containers: [],
  items: [sourceItem],
}

const lookup: CloneLookup = {
  templateItem: () => undefined,
  masterItem: () => undefined,
}

const options: CloneOptions = {
  travelerAssignments: true,
  containerAssignments: true,
  packerDelegations: true,
}

describe('planClone and the packing record (FR-25.19)', () => {
  it('never carries the packing record into a new trip', () => {
    const plan = planClone(source, options, lookup, null)

    // Positive signal: the cloned row exists and is un-packed, and the
    // record key is absent rather than merely null — a stray spread of
    // the source item would put it back.
    expect(plan.items).toHaveLength(1)
    expect(plan.items[0]!.state).toBe('open')
    expect(Object.keys(plan.items[0]!)).not.toContain('packed_by_user_id')
    // The record's time travels with it (FR-25.17) — a clone that kept it
    // would date an unpacked row to last summer.
    expect(Object.keys(plan.items[0]!)).not.toContain('packed_at')
  })

  it('still carries the assignment, which is a deliberate choice', () => {
    const plan = planClone(source, options, lookup, null)

    expect(plan.items[0]!.packer_user_id).toBe('user-sia')
  })

  it('drops the assignment when delegations are switched off', () => {
    const plan = planClone(source, { ...options, packerDelegations: false }, lookup, null)

    expect(plan.items[0]!.packer_user_id).toBeNull()
  })
})
