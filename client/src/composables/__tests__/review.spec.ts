/**
 * M14 review write-backs (FR-9.2, group-aware per FR-27.11): archiving
 * flips the trip status on the master partition, applying a proposal
 * writes to its target *group* — shared instance-wide, no fork step
 * (FR-1.6 MVP). "Never ask again" persists device-locally.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { dismissProposal, isDismissed } from '@/local/reviewDismissals'
import type { ReviewProposal } from '@/domain/review'
import { installHarness } from '@/__tests__/harness'

beforeEach(() => {
  installHarness().mockDrain()
})

function newOrch() {
  return useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
}

function proposal(over: Partial<ReviewProposal> = {}): ReviewProposal {
  return {
    itemRef: 'item1',
    kind: 'unused',
    itemName: 'Lonely Planet',
    itemId: 'item1',
    groupId: 'g1',
    groupName: 'Basis',
    flagCount: 1,
    ...over,
  }
}

function seedGroup(master: ReturnType<typeof useMasterStore>, owner = 'me') {
  master.applyChange({
    seq: 0,
    table: 'templates',
    id: 'g1',
    deleted: false,
    row: { owner_id: owner, name: 'Basis', kind: 'group' },
  })
  master.applyChange({
    seq: 0,
    table: 'template_items',
    id: 'g1-item-1',
    deleted: false,
    row: {
      template_id: 'g1',
      item_id: 'item1',
      quantity: 2,
      assignment: 'per_person',
      dedup: 'max',
      default_mode: 'pack',
      late_packer: 0,
    },
  })
}

describe('archiveTrip (FR-9.2 trigger)', () => {
  it('sets the trip status to archived via the master partition', () => {
    const orch = newOrch()
    const trips = useTripStore()
    trips.applyChange({
      seq: 0,
      table: 'trips',
      id: 't1',
      deleted: false,
      row: { name: 'Engadin', status: 'active', end_date: '2026-08-10' },
    })

    orch.archiveTrip('t1')

    expect(trips.getTrip('t1')?.status).toBe('archived')
  })
})

describe('deleteTrip (M2, Owner-only)', () => {
  it('tombstones the trip locally and removes it from the store', () => {
    const orch = newOrch()
    const trips = useTripStore()
    trips.applyChange({
      seq: 0,
      table: 'trips',
      id: 't1',
      deleted: false,
      row: { name: 'Engadin', status: 'planning', end_date: '2026-08-10' },
    })
    trips.applyChange({
      seq: 0,
      table: 'trip_items',
      id: 'ti1',
      deleted: false,
      row: { trip_id: 't1', name: 'Socken', quantity: 1 },
    })

    orch.deleteTrip('t1')

    expect(trips.getTrip('t1')).toBeUndefined()
    // Child rows go with it (local cascade mirrors the server FK cascade).
    expect(trips.getItems('t1')).toHaveLength(0)
  })
})

describe('applyReviewProposal (FR-27.11: the target is a group)', () => {
  it('unused zeroes the position in the target group', () => {
    const orch = newOrch()
    const master = useMasterStore()
    seedGroup(master)

    const target = orch.applyReviewProposal(proposal(), 'g1')

    expect(target).toBe('g1')
    expect(master.getTemplateItems('g1')[0]!.quantity).toBe(0)
  })

  it('missing adds an existing master item to the target group', () => {
    const orch = newOrch()
    const master = useMasterStore()
    seedGroup(master)
    master.applyChange({
      seq: 0,
      table: 'items',
      id: 'item9',
      deleted: false,
      row: { name: 'Sonnencreme' },
    })

    orch.applyReviewProposal(
      proposal({ kind: 'missing', itemRef: 'item9', itemId: 'item9', itemName: 'Sonnencreme' }),
      'g1',
    )

    const added = master.getTemplateItems('g1').find((ti) => ti.item_id === 'item9')
    expect(added).toBeDefined()
    expect(added?.quantity).toBe(1)
  })

  it('missing creates the master item first for an ad-hoc name', () => {
    const orch = newOrch()
    const master = useMasterStore()
    seedGroup(master)

    orch.applyReviewProposal(
      proposal({
        kind: 'missing',
        itemRef: 'name:moskitonetz',
        itemId: null,
        itemName: 'Moskitonetz',
      }),
      'g1',
    )

    const created = master.itemList.find((i) => i.name === 'Moskitonetz')
    expect(created).toBeDefined()
    expect(master.getTemplateItems('g1').some((ti) => ti.item_id === created!.id)).toBe(true)
  })

  // The row's picker may retarget (FR-27.11); the write follows the
  // picker, not the proposal's default.
  it('writes to the retargeted group, not the default one', () => {
    const orch = newOrch()
    const master = useMasterStore()
    seedGroup(master)
    master.applyChange({
      seq: 0,
      table: 'templates',
      id: 'g2',
      deleted: false,
      row: { owner_id: 'me', name: 'Extras', kind: 'group' },
    })

    orch.applyReviewProposal(
      proposal({
        kind: 'missing',
        itemRef: 'name:moskitonetz',
        itemId: null,
        itemName: 'Moskitonetz',
      }),
      'g2',
    )

    expect(master.getTemplateItems('g2')).toHaveLength(1)
    expect(master.getTemplateItems('g1')).toHaveLength(1)
  })

  // FR-1.6 MVP simplification (2026-08-08): no copy is made for a group
  // someone else created — templates are shared, so the optimisation lands
  // where the item actually came from and everyone gets it.
  it('writes to a foreign group in place, without forking (FR-1.6 MVP)', () => {
    const orch = newOrch()
    const master = useMasterStore()
    seedGroup(master, 'someone-else')

    const targetId = orch.applyReviewProposal(proposal(), 'g1')

    expect(targetId).toBe('g1')
    expect(master.templateList).toHaveLength(1)
    expect(master.getTemplateItems('g1').find((ti) => ti.item_id === 'item1')?.quantity).toBe(0)
  })
})

describe('review dismissals ("Never ask again", device-local)', () => {
  it('persists dismissed item–group pairs across module calls', () => {
    expect(isDismissed('item1::g1')).toBe(false)
    dismissProposal('item1::g1')
    expect(isDismissed('item1::g1')).toBe(true)
    expect(isDismissed('item1::g2')).toBe(false)
  })
})
