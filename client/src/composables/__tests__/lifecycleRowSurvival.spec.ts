/**
 * FR-24.3 in Local Mode: what a retire and a restore leave behind.
 *
 * All four paths write one or two fields onto a row that has to survive
 * whole. The stores apply a change by *replacing* the row, so a retire that
 * drops `name`, or a restore that drops the columns beside `retired_at`,
 * loses them — and in Local Mode there is no pull to put them back, so the
 * loss is permanent rather than a repaint away.
 *
 * The existing FR-24.3 specs assert the marker and the mutation; these
 * assert the columns nobody touched, on the mode where losing one is final.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'

beforeEach(() => {
  setActivePinia(createPinia())
  globalThis.indexedDB = new IDBFactory()
  vi.stubGlobal('fetch', vi.fn())
  vi.stubGlobal('WebSocket', vi.fn())
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

function newLocalOrch() {
  return useSyncOrchestrator({ baseUrl: '', getToken: () => null, local: new IndexedDBPersistence() })
}

const RETIRED = '2026-08-25T09:00:00Z'

/** An item and a group that hold each other — the "ever referenced" case. */
function seedReferenced(itemRow: Record<string, unknown>, templateRow: Record<string, unknown>) {
  const master = useMasterStore()
  master.applyChange({ seq: 0, table: 'items', id: 'it-1', deleted: false, row: itemRow })
  master.applyChange({ seq: 0, table: 'templates', id: 'tpl-1', deleted: false, row: templateRow })
  master.applyChange({
    seq: 0,
    table: 'template_items',
    id: 'pos-1',
    deleted: false,
    row: { template_id: 'tpl-1', item_id: 'it-1', quantity: 1 },
  })
  return master
}

describe('a retire keeps the row it marks', () => {
  it('leaves every column of the item alone but the marker', () => {
    const orch = newLocalOrch()
    const master = seedReferenced(
      { name: 'Kamera', icon: '📷', image_hash: 'abc123', notes: 'im Rucksack' },
      { name: 'Fotografie', kind: 'group', owner_id: 'u' },
    )

    orch.deleteMasterItem('it-1')

    const item = master.getItem('it-1')
    expect(item?.retired_at).toBeTruthy()
    expect(item?.name).toBe('Kamera')
    expect(item?.icon).toBe('📷')
    expect(item?.image_hash).toBe('abc123')
  })

  it('leaves every column of the group alone but the marker', () => {
    const orch = newLocalOrch()
    const master = seedReferenced(
      { name: 'Kamera' },
      { name: 'Fotografie', kind: 'group', owner_id: 'u', icon: '🎞️' },
    )
    // A group is retire-eligible once a trip was generated from it, not
    // merely because it holds positions.
    const trips = useTripStore()
    trips.applyChange({
      seq: 0,
      table: 'trips',
      id: 'trip-1',
      deleted: false,
      row: { name: 'Engadin', year: 2026, status: 'archived' },
    })
    trips.applyChange({
      seq: 0,
      table: 'trip_items',
      id: 'ti-1',
      deleted: false,
      row: { trip_id: 'trip-1', name: 'Kamera', quantity: 1, source_template_id: 'tpl-1' },
    })

    orch.deleteTemplate('tpl-1')

    const template = master.getTemplate('tpl-1')
    expect(template?.retired_at).toBeTruthy()
    expect(template?.name).toBe('Fotografie')
    expect(template?.kind).toBe('group')
    expect(template?.icon).toBe('🎞️')
  })
})

describe('a restore keeps the row it clears the marker on', () => {
  it('leaves every column of the item alone but the marker', () => {
    const orch = newLocalOrch()
    const master = useMasterStore()
    master.applyChange({
      seq: 0,
      table: 'items',
      id: 'it-1',
      deleted: false,
      row: { name: 'Sonnencreme', icon: '🧴', image_hash: 'def456', retired_at: RETIRED },
    })

    expect(orch.restoreMasterItem('it-1')).toBe(true)

    const item = master.getItem('it-1')
    expect(item?.retired_at).toBeNull()
    expect(item?.name).toBe('Sonnencreme')
    expect(item?.icon).toBe('🧴')
    expect(item?.image_hash).toBe('def456')
  })

  it('leaves every column of the group alone but the marker', () => {
    const orch = newLocalOrch()
    const master = useMasterStore()
    master.applyChange({
      seq: 0,
      table: 'templates',
      id: 'tpl-1',
      deleted: false,
      row: { name: 'Fotografie', kind: 'group', owner_id: 'u', icon: '🎞️', retired_at: RETIRED },
    })

    expect(orch.restoreTemplate('tpl-1')).toBe(true)

    const template = master.getTemplate('tpl-1')
    expect(template?.retired_at).toBeNull()
    expect(template?.name).toBe('Fotografie')
    expect(template?.kind).toBe('group')
    expect(template?.icon).toBe('🎞️')
  })
})
