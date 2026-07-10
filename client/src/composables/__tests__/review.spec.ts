/**
 * M14 review write-backs (FR-9.2): archiving flips the trip status on
 * the master partition, applying a proposal writes to the user's own
 * templates — or to a fresh fork when the source is foreign (FR-1.6).
 * "Never ask again" persists device-locally.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { dismissProposal, isDismissed } from '@/local/reviewDismissals'
import type { ReviewProposal } from '@/domain/review'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [],
          pull_hint: { next_cursor: 1 },
          changes: [],
          next_cursor: 1,
          has_more: false,
        }),
        { status: 200 },
      ),
    )
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('WebSocket', vi.fn())
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

function newOrch() {
  return useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
}

function proposal(over: Partial<ReviewProposal> = {}): ReviewProposal {
  return {
    key: 'item1::tpl1',
    kind: 'reduce_quantity',
    itemName: 'Lonely Planet',
    itemId: 'item1',
    templateId: 'tpl1',
    templateName: 'Base Travel',
    templateItemId: 'tpl-item-1',
    flagCount: 1,
    requiresFork: false,
    ...over,
  }
}

function seedTemplate(master: ReturnType<typeof useMasterStore>) {
  master.applyChange({
    seq: 0,
    table: 'templates',
    id: 'tpl1',
    deleted: false,
    row: { owner_id: 'me', name: 'Base Travel', is_published: 0 },
  })
  master.applyChange({
    seq: 0,
    table: 'template_items',
    id: 'tpl-item-1',
    deleted: false,
    row: {
      template_id: 'tpl1',
      item_id: 'item1',
      quantity_formula: '2',
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

describe('applyReviewProposal', () => {
  it('reduce_quantity zeroes the template item formula', () => {
    const orch = newOrch()
    const master = useMasterStore()
    seedTemplate(master)

    const target = orch.applyReviewProposal(proposal())

    expect(target).toBe('tpl1')
    expect(master.getTemplateItems('tpl1')[0]!.quantity_formula).toBe('0')
  })

  it('add_item adds an existing master item to the template', () => {
    const orch = newOrch()
    const master = useMasterStore()
    seedTemplate(master)
    master.applyChange({
      seq: 0,
      table: 'items',
      id: 'item9',
      deleted: false,
      row: { name: 'Sonnencreme', unit: 'pieces', is_consumable: 0 },
    })

    orch.applyReviewProposal(
      proposal({
        kind: 'add_item',
        itemId: 'item9',
        itemName: 'Sonnencreme',
        templateItemId: null,
      }),
    )

    const added = master.getTemplateItems('tpl1').find((ti) => ti.item_id === 'item9')
    expect(added).toBeDefined()
    expect(added?.quantity_formula).toBe('1')
  })

  it('add_item creates the master item first for an ad-hoc name', () => {
    const orch = newOrch()
    const master = useMasterStore()
    seedTemplate(master)

    orch.applyReviewProposal(
      proposal({ kind: 'add_item', itemId: null, itemName: 'Moskitonetz', templateItemId: null }),
    )

    const created = master.itemList.find((i) => i.name === 'Moskitonetz')
    expect(created).toBeDefined()
    expect(master.getTemplateItems('tpl1').some((ti) => ti.item_id === created!.id)).toBe(true)
  })

  it('fork copies the template and applies the change to the copy (FR-1.6)', () => {
    const orch = newOrch()
    const master = useMasterStore()
    master.applyChange({
      seq: 0,
      table: 'templates',
      id: 'tpl1',
      deleted: false,
      row: { owner_id: 'someone-else', name: 'Base Travel', is_published: 1 },
    })
    master.applyChange({
      seq: 0,
      table: 'template_items',
      id: 'tpl-item-1',
      deleted: false,
      row: {
        template_id: 'tpl1',
        item_id: 'item1',
        quantity_formula: '2',
        assignment: 'per_person',
        dedup: 'max',
        default_mode: 'pack',
        late_packer: 0,
      },
    })
    master.applyChange({
      seq: 0,
      table: 'template_items',
      id: 'tpl-item-2',
      deleted: false,
      row: {
        template_id: 'tpl1',
        item_id: 'item2',
        quantity_formula: 'num_travelers',
        assignment: 'trip_global',
        dedup: 'sum',
        default_mode: 'buy_before',
        late_packer: 1,
      },
    })

    const forkId = orch.applyReviewProposal(proposal({ requiresFork: true }), { fork: true })

    expect(forkId).not.toBe('tpl1')
    const fork = master.getTemplate(forkId)
    expect(fork?.name).toBe('Base Travel (fork)')
    expect(fork?.is_published).toBe(false)
    // Original untouched, fork carries the zeroed item plus the copy.
    expect(
      master.getTemplateItems('tpl1').find((ti) => ti.item_id === 'item1')?.quantity_formula,
    ).toBe('2')
    const forkItems = master.getTemplateItems(forkId)
    expect(forkItems).toHaveLength(2)
    expect(forkItems.find((ti) => ti.item_id === 'item1')?.quantity_formula).toBe('0')
    const copied = forkItems.find((ti) => ti.item_id === 'item2')
    expect(copied).toMatchObject({
      quantity_formula: 'num_travelers',
      assignment: 'trip_global',
      dedup: 'sum',
      default_mode: 'buy_before',
      late_packer: true,
    })
  })
})

describe('review dismissals ("Never ask again", device-local)', () => {
  it('persists dismissed item–template pairs across module calls', () => {
    expect(isDismissed('item1::tpl1')).toBe(false)
    dismissProposal('item1::tpl1')
    expect(isDismissed('item1::tpl1')).toBe(true)
    expect(isDismissed('item1::tpl2')).toBe(false)
  })
})
